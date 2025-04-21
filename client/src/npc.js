// server/npc.js

const { v4: uuidv4 } = require('uuid');
const ConstantsServer = require('./constants_server'); // Import server constants

/**
 * Represents a Non-Player Character (NPC) on the server.
 * Includes basic state, health, and simple patrol AI.
 */
class Npc {
    /**
     * Creates a new NPC instance.
     * @param {string} id - Unique ID.
     * @param {object} position - Starting position { x, y, z }.
     * @param {object} config - Configuration { type, health, size, color, waypoints?, patrolSpeed? }.
     */
    constructor(id, position, config) {
        this.id = id || uuidv4();
        this.position = { ...position }; // Ensure we have a copy
        this.velocity = { x: 0, y: 0, z: 0 }; // NPCs don't jump/fall yet

        // Configurable properties
        this.type = config.type || 'unknown_npc';
        this.maxHealth = config.health || ConstantsServer.NPC_DEFAULT_HEALTH;
        this.health = this.maxHealth;
        this.size = config.size || { x: 0.8, y: 1.8, z: 0.8 }; // Default size
        this.color = config.color || '#808080'; // Default Gray
        this.isAlive = true;
        this.lastAttackerId = null; // Track who last hit this NPC

        // AI State (Simple Patrol)
        this.aiState = 'idle'; // 'idle', 'patrolling'
        this.waypoints = config.waypoints || []; // Array of {x, z} points
        this.currentWaypointIndex = 0;
        this.patrolSpeed = config.patrolSpeed || ConstantsServer.NPC_PATROL_SPEED;
        this.waypointWaitTimer = 0; // Timer for waiting at waypoints
        this.rotationY = Math.random() * Math.PI * 2; // Initial random rotation

        if (this.waypoints.length > 1) {
            this.aiState = 'patrolling'; // Start patrolling if waypoints exist
        }

        console.log(`[NPC Created] ID: ${this.id}, Type: ${this.type}, Pos: (${this.position.x.toFixed(1)}, ${this.position.z.toFixed(1)})`);
    }

    /**
     * Updates NPC state, including basic AI.
     * @param {number} deltaTime - Time since last update in seconds.
     * @param {GameState} gameState - Reference to the main game state (for potential interactions).
     */
    update(deltaTime, gameState) {
        if (!this.isAlive) return;

        if (this.aiState === 'patrolling') {
            this.updatePatrol(deltaTime);
        } else {
            // Idle behavior (e.g., slight rotation?) - Not implemented yet
        }

        // Basic check (can be moved to takeDamage if preferred)
        if (this.health <= 0 && this.isAlive) {
            this.die(); // Ensure death state is triggered if health drops below zero externally
        }
    }

    /** Handles simple waypoint patrolling logic */
    updatePatrol(deltaTime) {
        if (this.waypoints.length < 2) { // Need at least 2 points to patrol
            this.aiState = 'idle';
            return;
        }

        // Check if waiting at waypoint
        if (this.waypointWaitTimer > 0) {
            this.waypointWaitTimer -= deltaTime * 1000; // Decrease timer (ms)
            if (this.waypointWaitTimer <= 0) {
                // Finished waiting, move to next waypoint
                this.currentWaypointIndex = (this.currentWaypointIndex + 1) % this.waypoints.length;
                 console.log(`[NPC ${this.id}] Moving to waypoint ${this.currentWaypointIndex}`);
            } else {
                return; // Still waiting
            }
        }

        const targetWaypoint = this.waypoints[this.currentWaypointIndex];
        const targetPos = { x: targetWaypoint.x, y: this.position.y, z: targetWaypoint.z }; // Keep Y constant

        const dx = targetPos.x - this.position.x;
        const dz = targetPos.z - this.position.z;
        const distanceSq = dx * dx + dz * dz;
        const closeEnoughSq = (this.patrolSpeed * deltaTime) * (this.patrolSpeed * deltaTime) * 1.5; // Square of distance moved in one frame * 1.5

        if (distanceSq < closeEnoughSq || distanceSq === 0) {
            // Reached waypoint (or very close)
            this.position.x = targetPos.x;
            this.position.z = targetPos.z;
            this.waypointWaitTimer = ConstantsServer.NPC_PATROL_WAIT_TIME; // Start waiting
            console.log(`[NPC ${this.id}] Reached waypoint ${this.currentWaypointIndex}, waiting...`);
        } else {
            // Move towards waypoint
            const distance = Math.sqrt(distanceSq);
            const moveX = (dx / distance) * this.patrolSpeed * deltaTime;
            const moveZ = (dz / distance) * this.patrolSpeed * deltaTime;

            this.position.x += moveX;
            this.position.z += moveZ;

            // Update rotation to face movement direction
            this.rotationY = Math.atan2(dx, dz); // atan2 gives angle in radians
        }
    }


    /** Applies damage to the NPC */
    takeDamage(amount, attackerId) {
        if (!this.isAlive) return false; // Cannot damage dead NPC
        this.health -= amount;
        this.lastAttackerId = attackerId;
        console.log(`[NPC ${this.id}] Took ${amount} damage from ${attackerId}. Health: ${this.health}`);

        if (this.health <= 0) {
            this.die();
            return true; // NPC destroyed
        }
        return false;
    }

    /** Handles NPC death */
    die() {
        if (!this.isAlive) return;
        console.log(`[NPC ${this.id}] Destroyed by ${this.lastAttackerId || 'Unknown'}.`);
        this.isAlive = false;
        // Let GameState handle removal or respawn timing
        // Optional: Trigger death effect message? Included in state update.
    }

    /** Gets network state */
    getNetworkState() {
        return {
            id: this.id,
            type: this.type,
            position: this.position,
            rotationY: this.rotationY, // Send rotation for client rendering
            size: this.size,
            color: this.color,
            health: this.health,
            maxHealth: this.maxHealth, // Send max health for UI
            isAlive: this.isAlive,
            // Add AI state if needed for client visuals? e.g., isPatrolling
        };
    }

     /** Placeholder for cleanup */
     dispose() {
         console.log(`[NPC ${this.id}] Disposed.`);
         // Clear any timers if added later
     }
}

module.exports = Npc;