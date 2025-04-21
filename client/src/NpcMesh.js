// client/js/NpcMesh.js

// Ensure THREE is accessed globally
// import THREE from '...'; // No import needed
import { Constants } from './constants.js'; // Assuming constants might be useful later

// Helper for UUID generation if needed within validation (though server usually provides ID)
const fallbackUuid = () => {
    try {
        return crypto.randomUUID(); // Modern browser standard
    } catch (e) {
        // Basic fallback for older environments/edge cases
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
};


/**
 * Creates and manages the Three.js visual representation for an NPC.
 * Includes validation for incoming data to prevent NaN errors.
 */
export class NpcMesh extends THREE.Group {
    /**
     * Creates a new NpcMesh instance.
     * @param {object} npcData - Initial data { id, type, position, size, color, health, maxHealth, isAlive }.
     */
    constructor(npcData) {
        super(); // Initialize as a THREE.Group
        if (typeof THREE === 'undefined') {
            console.error("FATAL: THREE object not loaded before NpcMesh constructor!");
            // Optionally throw an error or handle gracefully
            // throw new Error("THREE library not available.");
            return; // Prevent further execution
        }

        // --- Validate Incoming Data ---
        const safeData = this._validateNpcData(npcData);

        this.npcId = safeData.id;
        this.npcType = safeData.type;
        this.npcColor = new THREE.Color(safeData.color);
        this.isAlive = safeData.isAlive;
        this.maxHealth = safeData.maxHealth; // Store max health for updates

        // --- Create Geometry based on type ---
        const size = safeData.size; // Use validated size
        let geometry;
        if (this.npcType === 'target_dummy' || this.npcType === 'patroller') {
             geometry = new THREE.CylinderGeometry(size.x / 2, size.x / 2, size.y, 8);
             geometry.translate(0, size.y / 2, 0); // Move pivot to base
        } else {
             geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
             geometry.translate(0, size.y / 2, 0);
        }

        // --- Material ---
        const material = new THREE.MeshStandardMaterial({
             color: this.npcColor,
             roughness: 0.8,
             metalness: 0.1
        });
        this.originalMaterial = material;
        this.hitMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.7 });
        this.hitEffectTimer = null;


        // --- Mesh ---
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(safeData.position); // Use validated position
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.add(this.mesh);

        // --- Health Bar ---
        // Pass validated health/maxHealth/size to health bar creation
        this.healthBar = this.createHealthBar(safeData.health, safeData.maxHealth, safeData.size.y);
        this.add(this.healthBar);

        // Set initial visibility
        this.visible = this.isAlive;

        // Interpolation targets
        this.targetPosition = new THREE.Vector3().copy(safeData.position); // Use validated position
        this.lastUpdateTime = 0;

        // console.log(`[NpcMesh Created] ID: ${this.npcId}`);
    }

    /** Validates incoming NPC data, providing defaults for invalid values */
    _validateNpcData(data) {
        const defaults = {
            // Use fallback UUID function if crypto isn't available or ID is missing
            id: data?.id || fallbackUuid(),
            type: data?.type || 'unknown',
            position: { x: 0, y: 0.5, z: 0 },
            size: { x: 1, y: 1.8, z: 1 },
            color: data?.color || '#FFFF00', // Yellow default
            health: 100,
            maxHealth: 100,
            isAlive: data?.isAlive !== undefined ? data.isAlive : true,
        };

        const validated = { ...defaults };

        // Validate Position
        if (data?.position && typeof data.position === 'object' &&
            !isNaN(parseFloat(data.position.x)) && isFinite(data.position.x) &&
            !isNaN(parseFloat(data.position.y)) && isFinite(data.position.y) &&
            !isNaN(parseFloat(data.position.z)) && isFinite(data.position.z))
        {
            validated.position = { x: data.position.x, y: data.position.y, z: data.position.z };
        } else if (data?.position) {
            console.warn(`[NpcMesh] Invalid position data received for ${validated.id}, using default. Received:`, data.position);
        }

        // Validate Size
        if (data?.size && typeof data.size === 'object' &&
            !isNaN(parseFloat(data.size.x)) && data.size.x > 0 &&
            !isNaN(parseFloat(data.size.y)) && data.size.y > 0 &&
            !isNaN(parseFloat(data.size.z)) && data.size.z > 0)
        {
            validated.size = { x: data.size.x, y: data.size.y, z: data.size.z };
        } else if (data?.size) {
             console.warn(`[NpcMesh] Invalid size data received for ${validated.id}, using default. Received:`, data.size);
        }

        // Validate Health/MaxHealth
        validated.maxHealth = (!isNaN(parseFloat(data?.maxHealth)) && data.maxHealth > 0) ? parseFloat(data.maxHealth) : defaults.maxHealth;
        validated.health = (!isNaN(parseFloat(data?.health))) ? Math.min(parseFloat(data.health), validated.maxHealth) : defaults.health;

        return validated;
    }

    /** Creates a simple 3D health bar mesh above the NPC */
    createHealthBar(health, maxHealth, npcHeight) {
        // Ensure THREE is available
        if (typeof THREE === 'undefined') return new THREE.Group();

        // Validate inputs for health bar creation itself
        const safeHealth = isNaN(health) ? 0 : health;
        // Ensure maxHealth is positive and numeric for division
        const safeMaxHealth = (!isNaN(maxHealth) && maxHealth > 0) ? maxHealth : 1;
        const safeNpcHeight = isNaN(npcHeight) ? 1.8 : npcHeight; // Default height if size was invalid

        const barHeight = 0.15;
        const barWidth = 1.0;
        const healthPercent = Math.max(0, safeHealth / safeMaxHealth);

        const group = new THREE.Group();

        const bgGeometry = new THREE.PlaneGeometry(barWidth, barHeight);
        const bgMaterial = new THREE.MeshBasicMaterial({ color: 0x555555, side: THREE.DoubleSide });
        const bgMesh = new THREE.Mesh(bgGeometry, bgMaterial);
        group.add(bgMesh);

        // Check if healthPercent is valid before creating geometry
        const fgWidth = isNaN(healthPercent) ? 0 : barWidth * healthPercent;
        const fgGeometry = new THREE.PlaneGeometry(fgWidth, barHeight);
        const fgMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide }); // Green
        this.healthBarMesh = new THREE.Mesh(fgGeometry, fgMaterial);
        // Position fg bar slightly left-aligned within bg bar
        this.healthBarMesh.position.x = isNaN(healthPercent) ? -barWidth / 2 : - (barWidth * (1 - healthPercent) / 2);
        this.healthBarMesh.position.z = 0.01; // Slightly in front
        group.add(this.healthBarMesh);

        // Position the whole health bar above the NPC
        group.position.y = safeNpcHeight + 0.3; // Use validated height

        // Initial alignment might be needed if added after parent rotation
        group.quaternion.copy(this.parent?.quaternion || new THREE.Quaternion());

        return group;
    }

    /** Updates the health bar visual */
    updateHealthBar(health, maxHealth) {
        if (!this.healthBar || !this.healthBarMesh || typeof THREE === 'undefined') return;

        // Validate inputs
        const safeHealth = isNaN(health) ? 0 : health;
        const safeMaxHealth = (!isNaN(maxHealth) && maxHealth > 0) ? maxHealth : 1;
        const healthPercent = Math.max(0, safeHealth / safeMaxHealth);
        const barWidth = 1.0; // Must match creation width
        const barHeight = 0.15; // Must match creation height

        // Prevent NaN width
        const fgWidth = isNaN(healthPercent) ? 0 : barWidth * healthPercent;

        // Recreate geometry for width change - dispose old one
        this.healthBarMesh.geometry.dispose();
        this.healthBarMesh.geometry = new THREE.PlaneGeometry(fgWidth, barHeight);
        // Adjust position based on new width
        this.healthBarMesh.position.x = isNaN(healthPercent) ? -barWidth / 2 : - (barWidth * (1 - healthPercent) / 2);

        // Update color
        if (healthPercent < 0.25) this.healthBarMesh.material.color.setHex(0xff0000); // Red
        else if (healthPercent < 0.5) this.healthBarMesh.material.color.setHex(0xffff00); // Yellow
        else this.healthBarMesh.material.color.setHex(0x00ff00); // Green
    }


    /** Updates the NPC's state based on new network data. */
    updateFromNetwork(networkState) {
        // Validate incoming state first
        const safeState = this._validateNpcData(networkState);

        this.isAlive = safeState.isAlive;
        this.visible = this.isAlive;

        if (!this.isAlive) {
            // Optional: Play death effect/animation here before hiding?
            return; // Don't update position/healthbar if dead
        }

        // Update target position for interpolation using validated data
        this.targetPosition.set(safeState.position.x, safeState.position.y, safeState.position.z);
        this.lastUpdateTime = Date.now();

        // Update health bar using validated data
        // Use stored maxHealth unless server sends a new valid one
        this.updateHealthBar(safeState.health, safeState.maxHealth);

        // Update color if changed
        if (safeState.color && this.npcColor.getHexString() !== new THREE.Color(safeState.color).getHexString()) {
            this.setColor(safeState.color);
        }
    }

    /** Performs interpolation and billboard effect for health bar. */
    interpolate(interpolationAlpha, camera) {
        if (!this.isAlive) return;

        // Interpolate position towards target
        this.position.lerp(this.targetPosition, interpolationAlpha);

        // Billboard health bar (make it face the camera)
        if (this.healthBar && camera) {
            this.healthBar.lookAt(camera.position);
        }
    }

    /** Triggers a visual hit effect */
     triggerHitEffect() {
         if (!this.isAlive || this.hitEffectTimer) return;
         // console.log(`[NpcMesh ${this.npcId}] Triggering hit effect.`);
         console.log("SOUND: npc_hit_feedback"); // Placeholder

         // Ensure materials exist before trying to assign
         if (this.mesh && this.hitMaterial && this.originalMaterial) {
             this.mesh.material = this.hitMaterial;
             const hitDuration = 120; // ms
             // Clear any existing timer before setting a new one
             if (this.hitEffectTimer) clearTimeout(this.hitEffectTimer);
             this.hitEffectTimer = setTimeout(() => {
                 if (this.mesh) { // Check if mesh still exists
                     this.mesh.material = this.originalMaterial; // Revert material
                 }
                 this.hitEffectTimer = null;
             }, hitDuration);
         }
     }

    /** Changes the base color of the NPC mesh. */
    setColor(newColor) {
        try {
            this.npcColor.set(newColor);
            // Check material type before setting color
            if (this.originalMaterial && typeof this.originalMaterial.color?.set === 'function') {
                 this.originalMaterial.color.set(this.npcColor);
            }
            // Only apply if not currently flashing
            if (!this.hitEffectTimer && this.mesh && this.originalMaterial) {
                 this.mesh.material = this.originalMaterial;
            }
        } catch (e) {
             console.error(`[NpcMesh ${this.npcId}] Error setting color:`, e);
        }
    }


    /** Cleans up resources used by the mesh. */
    dispose() {
        console.log(`[NpcMesh ${this.npcId}] Disposing mesh resources...`);
         if (this.hitEffectTimer) {
             clearTimeout(this.hitEffectTimer);
             this.hitEffectTimer = null;
         }
        // Safely dispose materials and geometry
        try {
            this.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.geometry?.dispose(); // Optional chaining for safety
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            // Ensure dispose method exists before calling
                            child.material.forEach(mat => mat?.dispose?.());
                        } else {
                            child.material?.dispose?.(); // Optional chaining with function check
                        }
                    }
                }
            });
            // Check if dispose method exists before calling
            this.hitMaterial?.dispose?.();
            this.originalMaterial?.dispose?.();
        } catch (e) {
            console.error(`[NpcMesh ${this.npcId}] Error during disposal:`, e);
        }
    } // <<< Closing brace for dispose() method

} // <<< Corrected: Added closing brace for class NpcMesh