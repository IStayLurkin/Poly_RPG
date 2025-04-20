// server/projectile.js

const { v4: uuidv4 } = require('uuid');
const ConstantsServer = require('./constants_server'); // Import constants

// Simple Axis-Aligned Bounding Box collision check
function checkCollision(posA, sizeA, posB, sizeB) {
    // Ensure inputs are valid objects with expected properties
    if (!posA || !sizeA || !posB || !sizeB ||
        typeof posA.x !== 'number' || typeof posA.y !== 'number' || typeof posA.z !== 'number' ||
        typeof sizeA.x !== 'number' || typeof sizeA.y !== 'number' || typeof sizeA.z !== 'number' ||
        typeof posB.x !== 'number' || typeof posB.y !== 'number' || typeof posB.z !== 'number' ||
        typeof sizeB.x !== 'number' || typeof sizeB.y !== 'number' || typeof sizeB.z !== 'number') {
        // console.warn("Invalid input to checkCollision:", posA, sizeA, posB, sizeB);
        return false; // Avoid NaN calculations
    }

    const minAx = posA.x - sizeA.x / 2; const maxAx = posA.x + sizeA.x / 2;
    const minAy = posA.y - sizeA.y / 2; const maxAy = posA.y + sizeA.y / 2;
    const minAz = posA.z - sizeA.z / 2; const maxAz = posA.z + sizeA.z / 2;

    const minBx = posB.x - sizeB.x / 2; const maxBx = posB.x + sizeB.x / 2;
    const minBy = posB.y - sizeB.y / 2; const maxBy = posB.y + sizeB.y / 2;
    const minBz = posB.z - sizeB.z / 2; const maxBz = posB.z + sizeB.z / 2;

    return (minAx <= maxBx && maxAx >= minBx) &&
           (minAy <= maxBy && maxAy >= minBy) &&
           (minAz <= maxBz && maxAz >= minBz);
}

/** Represents a projectile. */
class Projectile {
    /**
     * @param {string} ownerId - Player ID.
     * @param {object} startPosition - { x, y, z }.
     * @param {object} direction - Normalized { x, y, z }.
     * @param {object} config - Weapon config { type, speed, lifetime, damage, radius }.
     */
    constructor(ownerId, startPosition, direction, config = {}) {
        this.id = uuidv4();
        this.ownerId = ownerId;

        // Use config provided by weapon, fallback to default if needed
        const weaponConfig = config || ConstantsServer.WEAPON_CONFIGS['default'];
        this.type = weaponConfig.type || 'default';
        this.speed = weaponConfig.speed;
        this.lifetime = weaponConfig.lifetime;
        this.damage = weaponConfig.damage;
        this.radius = weaponConfig.radius;
        this.size = { x: this.radius * 2, y: this.radius * 2, z: this.radius * 2 };

        // State
        this.position = { ...startPosition };
        this.velocity = {
            x: direction.x * this.speed,
            y: direction.y * this.speed,
            z: direction.z * this.speed
        };
        this.creationTime = Date.now();
        this.isActive = true;
    }

    /** Update position, check lifetime/bounds */
    update(deltaTime) {
        if (!this.isActive) return;

        this.position.x += this.velocity.x * deltaTime;
        this.position.y += this.velocity.y * deltaTime;
        this.position.z += this.velocity.z * deltaTime;

        if (Date.now() - this.creationTime > this.lifetime) {
            this.isActive = false;
        }

        // Boundary check using constants
        if (Math.abs(this.position.x) > ConstantsServer.WORLD_BOUNDS_X ||
            Math.abs(this.position.z) > ConstantsServer.WORLD_BOUNDS_Z ||
            this.position.y < ConstantsServer.WORLD_MIN_Y) {
            this.isActive = false;
        }
    }

    /** Check collisions with players, NPCs, obstacles */
    checkCollisions(players, npcs, obstacles) {
        if (!this.isActive) return null;

        // Check players
        for (const player of players.values()) {
            if (player.id === this.ownerId || !player.isAlive) continue;
            const playerSize = { x: 0.6, y: 1.7, z: 0.6 }; // Approx size
            // Center the player box vertically based on their actual Y + half height
            const playerCenterPos = { ...player.position, y: player.position.y + playerSize.y / 2 };
            if (checkCollision(this.position, this.size, playerCenterPos, playerSize)) {
                // console.log(`[Collision] Projectile ${this.id} hit player ${player.id}`);
                this.isActive = false;
                return { type: 'player', id: player.id, hitPlayer: player };
            }
        }

        // Check NPCs
        for (const npc of npcs.values()) {
             if (!npc.isAlive) continue;
             // Use NPC's defined size for collision
             const npcSize = npc.size || { x: 1, y: 1.8, z: 1 };
             // Center the NPC box vertically
             const npcCenterPos = { ...npc.position, y: npc.position.y + npcSize.y / 2 };
             if (checkCollision(this.position, this.size, npcCenterPos, npcSize)) {
                 // console.log(`[Collision] Projectile ${this.id} hit NPC ${npc.id}`);
                 this.isActive = false;
                 return { type: 'npc', id: npc.id, hitNpc: npc }; // Return NPC object
             }
        }


        // Check obstacles
        for (const obstacle of obstacles) {
             // Obstacle position is usually center, size is full dimensions
             if (checkCollision(this.position, this.size, obstacle.position, obstacle.size)) {
                // console.log(`[Collision] Projectile ${this.id} hit obstacle ${obstacle.id}`);
                this.isActive = false;
                return { type: 'obstacle', id: obstacle.id };
             }
        }
        return null;
    }

    /** Network state */
    getNetworkState() {
        return {
            id: this.id,
            ownerId: this.ownerId,
            position: this.position,
            radius: this.radius,
            type: this.type
        };
    }
}

module.exports = Projectile;