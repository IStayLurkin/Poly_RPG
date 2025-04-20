// server/player.js

const { v4: uuidv4 } = require('uuid');
const ConstantsServer = require('./constants_server');
const { Constants } = require('../client/js/constants'); // Shared constants for keys/types

/**
 * Represents a player connected to the server.
 */
class Player {
    constructor(id, ws, broadcastCallback, getSpawnPositionCallback) {
        this.id = id;
        this.ws = ws;
        this.broadcast = broadcastCallback;
        this.getSpawnPosition = getSpawnPositionCallback;

        // Attributes
        this.playerName = `Player_${id.substring(0, 4)}`;
        this.maxHealth = 100;
        this.health = this.maxHealth;
        this.score = 0;
        this.isAlive = true;
        this.lastShooterId = null;
        this.color = this.getRandomHexColor();

        // State
        this.position = { x: 0, y: ConstantsServer.PLAYER_GROUND_Y, z: 0 };
        this.rotation = { y: 0 }; // Only sync Y rotation usually
        this.velocity = { x: 0, y: 0, z: 0 };
        this.isJumping = false;
        this.isGrounded = true;
        this.isSprinting = false; // <<< Add sprint state

        // Input Flags (synced from client for animation/state hints)
        this.isMovingForward = false;
        this.isMovingBackward = false;
        this.isTurningLeft = false;
        this.isTurningRight = false;
        this.isShooting = false;

        // Weapon State
        this.weaponTypes = Object.keys(ConstantsServer.WEAPON_CONFIGS);
        this.currentWeaponIndex = 0;
        this.currentWeapon = this.weaponTypes[this.currentWeaponIndex];
        this.lastShotTime = 0;

        // Timestamps & Timers
        this.lastUpdateTime = Date.now();
        this.lastInputSeq = -1;
        this.respawnTimer = null;

        console.log(`[Player Created] ID: ${this.id}, Name: ${this.playerName}, Color: ${this.color}`);
    }

    /** Updates state based on client input. */
    updateState(updateData) { // Expects simplified state object from main.js
        if (!this.isAlive) return;

        // Validate and update position/rotation
        if (updateData.position) {
            this.position.x = Math.max(-ConstantsServer.WORLD_BOUNDS_X, Math.min(ConstantsServer.WORLD_BOUNDS_X, updateData.position.x));
            // Server controls Y based on physics
            this.position.z = Math.max(-ConstantsServer.WORLD_BOUNDS_Z, Math.min(ConstantsServer.WORLD_BOUNDS_Z, updateData.position.z));
        }
        if (updateData.rotation) {
            this.rotation.y = updateData.rotation.y;
        }

        // Update input flags only if sequence number is newer
        if (updateData.inputSeq !== undefined && updateData.inputSeq > this.lastInputSeq) {
            this.lastInputSeq = updateData.inputSeq;
            this.isMovingForward = updateData.movingForward ?? this.isMovingForward;
            this.isMovingBackward = updateData.movingBackward ?? this.isMovingBackward;
            this.isTurningLeft = updateData.turningLeft ?? this.isTurningLeft;
            this.isTurningRight = updateData.turningRight ?? this.isTurningRight;
            this.isShooting = updateData.isShooting ?? this.isShooting;
            this.isSprinting = updateData.isSprinting ?? this.isSprinting; // <<< Update sprint state
        } else if (updateData.inputSeq !== undefined) {
             // console.warn(`[Player ${this.id}] Out-of-order input: ${updateData.inputSeq} <= ${this.lastInputSeq}`);
        }

        this.lastUpdateTime = Date.now();
        // Note: Jump request is handled separately by server.js calling player.jump()
    }

    /** Server-side physics update (mainly for jumping). */
    updatePhysics(deltaTime) {
        if (!this.isAlive) return;
        if (!this.isGrounded) {
            this.velocity.y += ConstantsServer.GRAVITY * deltaTime;
            this.position.y += this.velocity.y * deltaTime;
            if (this.position.y <= ConstantsServer.PLAYER_GROUND_Y) {
                this.position.y = ConstantsServer.PLAYER_GROUND_Y;
                this.velocity.y = 0;
                this.isGrounded = true;
                this.isJumping = false;
            }
        } else {
             this.velocity.y = 0;
             if (this.position.y !== ConstantsServer.PLAYER_GROUND_Y) {
                 this.position.y = ConstantsServer.PLAYER_GROUND_Y;
             }
        }
    }

    /** Initiates a jump. */
    jump() {
        if (this.isAlive && this.isGrounded) {
            this.isGrounded = false;
            this.isJumping = true;
            this.velocity.y = ConstantsServer.PLAYER_JUMP_VELOCITY;
            console.log(`[Player ${this.playerName}] Jumped!`);
            console.log("SOUND: jump"); // Placeholder
            if (typeof this.broadcast === 'function') {
                // Send specific jump event for immediate client feedback
                this.broadcast(JSON.stringify({ type: Constants.MSG_PLAYER_JUMP, payload: { playerId: this.id } }));
            }
        }
    }

    /** Cycles to the next weapon. */
    cycleWeapon() {
        if (!this.isAlive) return;
        this.currentWeaponIndex = (this.currentWeaponIndex + 1) % this.weaponTypes.length;
        this.currentWeapon = this.weaponTypes[this.currentWeaponIndex];
        console.log(`[Player ${this.playerName}] Switched weapon to: ${this.currentWeapon}`);
        console.log("SOUND: weapon_switch"); // Placeholder
        // Send confirmation back to client
        if (this.ws?.readyState === 1) { // Check WebSocket state (1 is OPEN)
             this.ws.send(JSON.stringify({ type: Constants.MSG_WEAPON_SWITCH_CONFIRM, payload: { currentWeapon: this.currentWeapon } }));
        }
    }

    /** Attempts to fire based on current weapon and cooldown. */
    attemptShoot() {
        const now = Date.now();
        const weaponConfig = ConstantsServer.WEAPON_CONFIGS[this.currentWeapon] || ConstantsServer.WEAPON_CONFIGS['default'];
        const cooldown = weaponConfig.cooldown;
        if (this.isAlive && (now - this.lastShotTime >= cooldown)) {
            this.lastShotTime = now;
            // Don't set isShooting here, rely on client input flag sync for animation hint
            // this.isShooting = true;
            // setTimeout(() => { this.isShooting = false; }, 150);
            return true;
        }
        return false;
    }

    /** Gets projectile config based on current weapon. */
    getProjectileConfig() {
        return ConstantsServer.WEAPON_CONFIGS[this.currentWeapon] || ConstantsServer.WEAPON_CONFIGS['default'];
    }

    /** Network state, includes new properties. */
    getNetworkState() {
        return {
            id: this.id,
            name: this.playerName,
            position: this.position,
            rotation: this.rotation, // Send {y: value}
            color: this.color,
            health: this.health,
            maxHealth: this.maxHealth,
            score: this.score,
            isAlive: this.isAlive,
            isShooting: this.isShooting, // Synced from client input
            isJumping: this.isJumping, // Server authoritative
            isGrounded: this.isGrounded, // Server authoritative
            isSprinting: this.isSprinting, // <<< Synced from client input
            currentWeapon: this.currentWeapon, // Server authoritative
        };
    }

    /** Applies damage. */
    takeDamage(amount, shooterId) {
        if (!this.isAlive) return false;
        this.health -= amount;
        this.lastShooterId = shooterId;
        if (typeof this.broadcast === 'function') {
            const hitMessage = { type: Constants.MSG_PLAYER_HIT, payload: { playerId: this.id, shooterId: shooterId, damage: amount, remainingHealth: this.health } };
            this.broadcast(JSON.stringify(hitMessage));
        }
        if (this.health <= 0) {
            this.health = 0; this.die(); return true;
        }
        return false;
    }

    /** Handles death. Returns killer ID. */
    die() {
        if (!this.isAlive) return null;
        const killerId = this.lastShooterId;
        console.log(`[Player ${this.playerName}] Died. Killed by ${killerId || 'Unknown'}.`);
        console.log("SOUND: player_death");
        this.isAlive = false; this.isJumping = false; this.isGrounded = true;
        this.isSprinting = false; // Reset sprint on death
        this.velocity = { x: 0, y: 0, z: 0 };
        if (this.ws?.readyState === 1) {
            this.ws.send(JSON.stringify({ type: Constants.MSG_PLAYER_DIED, payload: { killerId: killerId } }));
        }
        if (this.respawnTimer) clearTimeout(this.respawnTimer);
        this.respawnTimer = setTimeout(() => {
            const spawnPos = typeof this.getSpawnPosition === 'function' ? this.getSpawnPosition() : { x: 0, y: ConstantsServer.PLAYER_GROUND_Y, z: 0 };
            this.respawn(spawnPos);
        }, ConstantsServer.PLAYER_RESPAWN_DELAY);
        return killerId;
    }

    /** Handles respawn. */
    respawn(spawnPosition) {
        console.log(`[Player ${this.playerName}] Respawning at`, spawnPosition);
        console.log("SOUND: player_respawn");
        this.isAlive = true; this.health = this.maxHealth;
        this.position = { ...spawnPosition }; this.rotation = { y: Math.random() * Math.PI * 2 };
        this.velocity = { x: 0, y: 0, z: 0 }; this.isGrounded = true; this.isJumping = false;
        this.isSprinting = false; // Reset sprint
        this.lastShooterId = null; this.lastUpdateTime = Date.now();
        this.isMovingForward = false; this.isMovingBackward = false;
        this.isTurningLeft = false; this.isTurningRight = false;
        this.isShooting = false;
        if (this.ws?.readyState === 1) {
            this.ws.send(JSON.stringify({ type: Constants.MSG_PLAYER_RESPAWN, payload: this.getNetworkState() }));
        }
    }

    /** Increases score. */
    addScore(amount) { this.score += amount; console.log(`[Player ${this.playerName}] Score: ${this.score} (+${amount})`); }

    /** Sets player name. */
    setName(newName) {
        const cleanName = (newName || '').trim().substring(0, 16) || `Player_${this.id.substring(0, 4)}`;
        if (this.playerName !== cleanName) {
             console.log(`[Player ${this.id}] Name changed from ${this.playerName} to: ${cleanName}`);
             this.playerName = cleanName;
        }
    }

    /** Gets random color. */
    getRandomHexColor() { const l='0123456789ABCDEF';let c='#';for(let i=0;i<6;i++)c+=l[Math.floor(Math.random()*16)];return c; }

    /** Cleans up timers. */
    dispose() { if (this.respawnTimer) clearTimeout(this.respawnTimer); console.log(`[Player ${this.playerName}] Disposed.`); }
}

module.exports = Player;
