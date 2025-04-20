// client/js/PlayerMesh.js

// Assumes THREE is global
import { Constants } from './constants.js';

/**
 * Manages the Three.js visual representation for a player.
 * Includes placeholder animations for movement, jumping, shooting, and sprinting.
 */
export class PlayerMesh extends THREE.Group {
    constructor(playerData, isLocalPlayer = false) {
        super();
        // Ensure THREE is loaded
        if (typeof THREE === 'undefined') {
            console.error("FATAL: THREE not loaded before PlayerMesh constructor!");
            // Return an empty group or throw an error to prevent further issues
            return this; // Or throw new Error("THREE library not available.");
        }

        this.playerId = playerData.id;
        this.playerColor = new THREE.Color(playerData.color || 0xffffff);
        this.isLocalPlayer = isLocalPlayer;
        this.isAlive = playerData.isAlive !== undefined ? playerData.isAlive : true;

        // Animation/State Tracking
        this.isMoving = false;
        this.isSprinting = playerData.isSprinting || false; // Sync initial sprint state
        this.isShooting = playerData.isShooting || false;
        this.isJumping = playerData.isJumping || false;
        this.isGrounded = playerData.isGrounded !== undefined ? playerData.isGrounded : true;
        this.currentWeapon = playerData.currentWeapon || 'default';
        this.hitEffectTimer = null;
        this.animationTime = Math.random() * Math.PI * 2; // Start animation at random phase

        // --- Geometry & Materials ---
        const bodyHeight = 1.0; const bodyWidth = 0.6; const bodyDepth = 0.3;
        const headSize = 0.4; const limbRadius = 0.1;
        const armLength = 0.6; const legLength = 0.7;

        // Use MeshLambertMaterial for softer, less shiny appearance suitable for low-poly
        const bodyMaterial = new THREE.MeshLambertMaterial({ color: this.playerColor });
        const limbMaterial = new THREE.MeshLambertMaterial({ color: this.playerColor.clone().multiplyScalar(0.8) }); // Slightly darker limbs
        const headMaterial = new THREE.MeshLambertMaterial({ color: this.playerColor.clone().multiplyScalar(1.1) }); // Slightly lighter head

        this.originalMaterials = { body: bodyMaterial, limbs: limbMaterial, head: headMaterial };
        // Basic red material for hit feedback
        this.hitMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.8 });

        // --- Create Meshes ---
        try {
            // Body
            const bodyGeometry = new THREE.BoxGeometry(bodyWidth, bodyHeight, bodyDepth);
            this.body = new THREE.Mesh(bodyGeometry, bodyMaterial);
            // Position origin at the bottom center of the legs for easier ground alignment
            this.body.position.y = legLength + bodyHeight / 2;
            this.body.castShadow = true; this.add(this.body);

            // Head
            const headGeometry = new THREE.IcosahedronGeometry(headSize / 1.8, 0); // Low-poly sphere-like head
            this.head = new THREE.Mesh(headGeometry, headMaterial);
            this.head.position.y = this.body.position.y + bodyHeight / 2 + headSize / 2.2; // Position above body
            this.head.castShadow = true; this.add(this.head);

            // Arms
            const armGeometry = new THREE.CylinderGeometry(limbRadius, limbRadius, armLength, 6); // 6 sides for low-poly cylinder
            this.leftArm = new THREE.Mesh(armGeometry, limbMaterial); this.leftArm.castShadow = true;
            // Position relative to body center, slightly forward/out
            this.leftArm.position.set(-(bodyWidth / 2 + limbRadius), this.body.position.y + bodyHeight / 2 - limbRadius * 2, 0.1);
            this.leftArm.rotation.z = Math.PI / 12; // Slight outward angle
            this.add(this.leftArm);

            this.rightArm = new THREE.Mesh(armGeometry, limbMaterial); this.rightArm.castShadow = true;
            this.rightArm.position.set(bodyWidth / 2 + limbRadius, this.leftArm.position.y, 0.1);
            this.rightArm.rotation.z = -Math.PI / 12;
            this.add(this.rightArm);

            // Legs
            const legGeometry = new THREE.CylinderGeometry(limbRadius * 1.1, limbRadius * 1.1, legLength, 6); // Slightly thicker legs
            this.leftLeg = new THREE.Mesh(legGeometry, limbMaterial); this.leftLeg.castShadow = true;
            // Position origin at the top of the leg, pivot from hip
            this.leftLeg.geometry.translate(0, -legLength / 2, 0); // Move geometry origin
            this.leftLeg.position.set(-(bodyWidth / 4), legLength, 0); // Position hip joint
            this.add(this.leftLeg);

            this.rightLeg = new THREE.Mesh(legGeometry, limbMaterial); this.rightLeg.castShadow = true;
            this.rightLeg.geometry.translate(0, -legLength / 2, 0);
            this.rightLeg.position.set(bodyWidth / 4, legLength, 0);
            this.add(this.rightLeg);

        } catch (e) {
            console.error("[PlayerMesh] Error creating geometry/meshes:", e);
            // Handle error, maybe add a fallback placeholder
        }


        // -- Local Player Indicator --
        this.localPlayerIndicator = null;
        if (this.isLocalPlayer) {
            try {
                const indicatorGeometry = new THREE.ConeGeometry(0.2, 0.4, 8);
                const indicatorMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, depthTest: false, transparent: true, opacity: 0.8 });
                this.localPlayerIndicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial);
                // Ensure head exists before positioning relative to it
                this.localPlayerIndicator.position.y = (this.head?.position.y || (legLength + bodyHeight + headSize / 2)) + headSize / 2 + 0.4;
                this.localPlayerIndicator.renderOrder = 1; // Render on top
                this.add(this.localPlayerIndicator);
            } catch (e) {
                console.error("[PlayerMesh] Error creating local player indicator:", e);
            }
        }

        // Set initial pose and visibility
        this.position.set(playerData.position.x, playerData.position.y, playerData.position.z);
        this.rotation.y = playerData.rotation?.y || 0; // Use y rotation
        this.visible = this.isAlive;

        // Interpolation targets
        this.targetPosition = new THREE.Vector3().copy(this.position);
        this.targetQuaternion = new THREE.Quaternion().copy(this.quaternion);
        this.lastUpdateTime = 0;
    }

    /** Updates state from network data. */
    updateFromNetwork(networkState) {
        if (!networkState) return; // Safety check

        this.isAlive = networkState.isAlive;
        this.visible = this.isAlive;

        // Update animation states from server data for remote players
        if (!this.isLocalPlayer) {
             this.isShooting = networkState.isShooting;
             this.isJumping = networkState.isJumping;
             this.isGrounded = networkState.isGrounded;
             this.isSprinting = networkState.isSprinting; // Sync sprint state
             this.currentWeapon = networkState.currentWeapon;
             // Determine movement based on position change
             const posChanged = this.targetPosition && networkState.position &&
                                this.targetPosition.distanceToSquared(networkState.position) > 0.001;
             this.isMoving = posChanged;
        }

        if (!this.isAlive) return; // Don't update further if dead

        // Update color if changed
        if (networkState.color && this.playerColor.getHexString() !== new THREE.Color(networkState.color).getHexString()) {
            this.setColor(networkState.color);
        }

        // Update interpolation targets only for remote players
        if (!this.isLocalPlayer && networkState.position && networkState.rotation) {
            this.targetPosition.set(networkState.position.x, networkState.position.y, networkState.position.z);
            // Assuming networkState.rotation = { y: value }
            this.targetQuaternion.setFromEuler(new THREE.Euler(0, networkState.rotation.y, 0, 'YXZ'));
            this.lastUpdateTime = Date.now();
        }
    }

    /** Interpolates remote players and updates animations. */
    interpolate(interpolationAlpha, deltaTime) {
        if (this.isLocalPlayer || !this.isAlive || !deltaTime) return;

        this.position.lerp(this.targetPosition, interpolationAlpha);
        this.quaternion.slerp(this.targetQuaternion, interpolationAlpha);

        this._updateAnimations(deltaTime); // Pass deltaTime
    }

     /** Updates local player pose from client prediction. */
    updateLocalPlayerPose(newPosition, newRotation, inputFlags, isGrounded, deltaTime) {
        if (!this.isLocalPlayer || !this.isAlive || !deltaTime) return;

        // Update animation states based on input flags for local player
        this.isMoving = inputFlags.movingForward || inputFlags.movingBackward || inputFlags.turningLeft || inputFlags.turningRight;
        this.isSprinting = inputFlags.isSprinting;
        this.isShooting = inputFlags.isShooting;
        this.isJumping = inputFlags.isJumping;
        this.isGrounded = isGrounded;

        // Update mesh pose directly from predicted state
        this.position.set(newPosition.x, newPosition.y, newPosition.z);
        // Assuming newRotation = { y: value }
        this.rotation.y = newRotation.y;

        this._updateAnimations(deltaTime); // Pass deltaTime
    }

    /** Placeholder procedural animation logic */
    _updateAnimations(deltaTime) {
        // Ensure required components exist and deltaTime is valid
        if (!this.isAlive || typeof THREE === 'undefined' || !deltaTime || deltaTime <= 0 || !this.body || !this.leftLeg || !this.rightLeg || !this.leftArm || !this.rightArm) return;

        this.animationTime += deltaTime;

        // --- Bobbing ---
        // Bob faster and higher when sprinting
        const bobSpeed = this.isMoving ? (this.isSprinting ? 12 : 7) : 2;
        const bobAmount = this.isMoving ? (this.isSprinting ? 0.08 : 0.05) : 0.02;
        // Calculate base Y position assuming leg origin is at the hip (top)
        const baseBodyY = this.leftLeg.position.y + this.body.geometry.parameters.height / 2; // Y position of body center relative to hip
        this.body.position.y = baseBodyY + Math.sin(this.animationTime * bobSpeed) * bobAmount;

        // --- Arm/Leg Swing ---
        // Swing faster and wider when sprinting
        const swingSpeed = this.isMoving ? (this.isSprinting ? 10 : 6) : 0;
        const swingAmount = this.isMoving ? (this.isSprinting ? 0.9 : 0.7) : 0; // Radians
        const armSwing = Math.sin(this.animationTime * swingSpeed) * swingAmount;
        const legSwing = -armSwing; // Legs swing opposite to arms

        // Recalculate base arm Y relative to potentially bobbing body
        const baseArmY = this.body.position.y + this.body.geometry.parameters.height / 2 - 0.1 * 2; // Adjust offset as needed

        // --- Apply Poses (Prioritize Jump/Shoot) ---
        if (this.isJumping && !this.isGrounded) {
             // Jump Pose
             this.leftArm.position.y = baseArmY - 0.1; this.rightArm.position.y = baseArmY - 0.1;
             this.leftArm.rotation.x = Math.PI / 6; this.rightArm.rotation.x = Math.PI / 6;
             this.leftLeg.rotation.x = -Math.PI / 8; this.rightLeg.rotation.x = -Math.PI / 8;
        } else if (this.isShooting) {
             // Shoot Pose
             this.leftArm.position.y = baseArmY; this.rightArm.position.y = baseArmY;
             this.leftArm.rotation.x = -Math.PI / 4; this.rightArm.rotation.x = -Math.PI / 4;
             // Legs swing if moving while shooting
             this.leftLeg.rotation.x = legSwing / 2; this.rightLeg.rotation.x = -legSwing / 2;
        } else {
             // Walk/Sprint/Idle Pose
             this.leftArm.position.y = baseArmY; this.rightArm.position.y = baseArmY;
             this.leftArm.rotation.x = armSwing; this.rightArm.rotation.x = -armSwing;
             this.leftLeg.rotation.x = legSwing; this.rightLeg.rotation.x = -legSwing;
        }

        // --- Head Position --- (Relative to body)
        if (this.head && this.body) {
             this.head.position.y = this.body.position.y + this.body.geometry.parameters.height / 2 + 0.1; // Adjust head offset
        }

        // --- Local Indicator ---
        if (this.localPlayerIndicator) {
            this.localPlayerIndicator.rotation.y += deltaTime * 2;
            // Position indicator above head
            if(this.head) this.localPlayerIndicator.position.y = this.head.position.y + 0.5;
        }
    }

     /** Triggers visual hit effect */
     triggerHitEffect() {
         if (!this.isAlive || this.hitEffectTimer) return;
         console.log("SOUND: player_hit_feedback"); // Placeholder
         this.traverse((child) => {
             if (child instanceof THREE.Mesh && child !== this.localPlayerIndicator) {
                 // Store original material if not already stored (safer)
                 if (!child.userData.originalMaterial) {
                     child.userData.originalMaterial = child.material;
                 }
                 child.material = this.hitMaterial;
             }
         });
         const hitDuration = 150;
         if (this.hitEffectTimer) clearTimeout(this.hitEffectTimer); // Clear previous timer
         this.hitEffectTimer = setTimeout(() => {
             this.revertMaterials();
             this.hitEffectTimer = null;
         }, hitDuration);
     }

     /** Reverts materials after hit effect */
     revertMaterials() {
         this.traverse((child) => {
              if (child instanceof THREE.Mesh && child.userData.originalMaterial) {
                  child.material = child.userData.originalMaterial;
                  // delete child.userData.originalMaterial; // Optionally clear stored material
              } else if (child instanceof THREE.Mesh && child !== this.localPlayerIndicator) {
                  // Fallback if original wasn't stored (less safe)
                  if (child === this.body && this.originalMaterials?.body) child.material = this.originalMaterials.body;
                  else if (child === this.head && this.originalMaterials?.head) child.material = this.originalMaterials.head;
                  else if ((child === this.leftArm || child === this.rightArm || child === this.leftLeg || child === this.rightLeg) && this.originalMaterials?.limbs) {
                      child.material = this.originalMaterials.limbs;
                  }
              }
         });
     }

    /** Changes base color */
    setColor(newColor) {
        if (!this.originalMaterials) return;
        try {
            this.playerColor.set(newColor);
            if(this.originalMaterials.body) this.originalMaterials.body.color.set(this.playerColor);
            if(this.originalMaterials.head) this.originalMaterials.head.color.set(this.playerColor.clone().multiplyScalar(1.1));
            if(this.originalMaterials.limbs) this.originalMaterials.limbs.color.set(this.playerColor.clone().multiplyScalar(0.8));
            // Apply new original materials if not currently flashing red
            if (!this.hitEffectTimer) this.revertMaterials();
        } catch(e) {
            console.error(`[PlayerMesh ${this.playerId}] Error setting color:`, e);
        }
    }

    /** Cleans up resources */
    dispose() {
         if (this.hitEffectTimer) clearTimeout(this.hitEffectTimer);
         this.traverse((child) => {
             if (child instanceof THREE.Mesh) {
                child.geometry?.dispose();
                // Check if material is an array or single object
                if (child.material) {
                     if (Array.isArray(child.material)) {
                         child.material.forEach(m => m?.dispose());
                     } else {
                         child.material?.dispose();
                     }
                }
                // Clear stored original material
                delete child.userData.originalMaterial;
            }
         });
         // Dispose hit material if it exists
         this.hitMaterial?.dispose();
         // Dispose original materials if they exist
         this.originalMaterials?.body?.dispose();
         this.originalMaterials?.head?.dispose();
         this.originalMaterials?.limbs?.dispose();
         this.originalMaterials = null; // Clear references
    }
}
