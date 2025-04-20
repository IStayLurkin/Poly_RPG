// client/js/ProjectileMesh.js

// Assumes THREE is global
import { Constants } from './constants.js'; // Make sure this import is present and correct

/**
 * Creates and manages the Three.js visual representation for a projectile.
 */
export class ProjectileMesh extends THREE.Group {
    /**
     * Creates a new ProjectileMesh instance.
     * @param {object} projectileData - Initial data { id, ownerId, position, radius, type }.
     */
    constructor(projectileData) {
        super(); // Initialize as a THREE.Group
        if (typeof THREE === 'undefined') {
            console.error("FATAL: THREE object not loaded before ProjectileMesh constructor!");
            return; // Prevent errors if THREE isn't loaded
        }

        this.projectileId = projectileData.id;
        this.ownerId = projectileData.ownerId;
        this.projectileType = projectileData.type || 'default'; // Store type if needed

        // Geometry and Material
        const radius = projectileData.radius || Constants.PROJECTILE_RADIUS; // Use constant as fallback
        const geometry = new THREE.SphereGeometry(radius, 8, 6); // Low-poly sphere

        // *** FIX: Add default value for color ***
        // Use optional chaining and nullish coalescing for safety.
        // Provides default orange color if Constants or PROJECTILE_COLOR is undefined.
        const projectileColorValue = Constants?.PROJECTILE_COLOR ?? 0xff8c00;
        let materialColor = projectileColorValue;

        // Optional: Adjust color based on type (Example)
        if (this.projectileType === 'fast') {
            materialColor = 0xadd8e6; // Light Blue for 'fast' type
        } else if (this.projectileType === 'burst') {
             materialColor = 0x90ee90; // Light Green for 'burst' type
        }


        const material = new THREE.MeshBasicMaterial({ color: materialColor }); // Use validated/adjusted color

        this.mesh = new THREE.Mesh(geometry, material);
        // Validate position before copying
        if (projectileData.position && !isNaN(projectileData.position.x) && !isNaN(projectileData.position.y) && !isNaN(projectileData.position.z)) {
            this.mesh.position.copy(projectileData.position);
        } else {
             console.warn(`[ProjectileMesh ${this.projectileId}] Received invalid initial position:`, projectileData.position);
             this.mesh.position.set(0, 1, 0); // Default position
        }
        this.add(this.mesh);

        // Interpolation targets
        this.targetPosition = new THREE.Vector3().copy(this.mesh.position); // Initialize with validated position
        this.lastUpdateTime = 0;

        // console.log(`[ProjectileMesh Created] ID: ${this.projectileId}`);
    }

    /**
     * Updates the projectile's state based on new network data.
     * Sets the target for interpolation.
     * @param {object} networkState - The state received from the server { id, ownerId, position, radius, type }.
     */
    updateFromNetwork(networkState) {
        // Validate incoming position before setting target
        if (networkState.position && !isNaN(networkState.position.x) && !isNaN(networkState.position.y) && !isNaN(networkState.position.z)) {
            this.targetPosition.set(networkState.position.x, networkState.position.y, networkState.position.z);
            this.lastUpdateTime = Date.now();
        } else {
            console.warn(`[ProjectileMesh ${this.projectileId}] Received invalid position in update:`, networkState.position);
            // Don't update target if position is invalid? Or set to last known good? For now, do nothing.
        }


        // Optional: Update radius or color if they can change dynamically (unlikely for this projectile)
        // const radius = networkState.radius || Constants.PROJECTILE_RADIUS;
        // if (this.mesh.geometry.parameters.radius !== radius) { ... update geometry ... }
    }

    /**
     * Performs interpolation towards the target state. Called each render frame.
     * @param {number} interpolationAlpha - The factor for lerping (0 to 1).
     */
    interpolate(interpolationAlpha) {
        // Check if targetPosition is valid before lerping
        if (!isNaN(this.targetPosition.x) && !isNaN(this.targetPosition.y) && !isNaN(this.targetPosition.z)) {
            this.position.lerp(this.targetPosition, interpolationAlpha);
        }
    }

     /** Placeholder for triggering effects when the projectile is destroyed */
     onDestroy() {
         // console.log(`[ProjectileMesh ${this.projectileId}] Destroyed.`);
         console.log("SOUND: projectile_impact"); // Placeholder
         // Add particle effects or other visuals here
         this.visible = false; // Hide it immediately
         // Actual removal from scene and disposal is handled by GraphicsManager
     }

    /** Cleans up resources used by the mesh. */
    dispose() {
        // console.log(`[ProjectileMesh ${this.projectileId}] Disposing mesh resources...`);
        try {
            if (this.mesh) {
                this.mesh.geometry?.dispose?.();
                this.mesh.material?.dispose?.();
            }
        } catch (e) {
             console.error(`[ProjectileMesh ${this.projectileId}] Error during disposal:`, e);
        }
    }
} // End of ProjectileMesh class