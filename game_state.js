// server/game_state.js

const Player = require('./player');
const Projectile = require('./projectile');
const Npc = require('./npc'); // Import NPC class
const ConstantsServer = require('./constants_server'); // Import server constants
const { v4: uuidv4 } = require('uuid');

// --- World Configuration ---
// Add more varied obstacles
const OBSTACLES = [
    // Original
    { id: 'obs1', type: 'cube', position: { x: 10, y: 1, z: 5 }, size: { x: 2, y: 2, z: 4 }, color: '#8B4513' },
    { id: 'obs2', type: 'cube', position: { x: -8, y: 1.5, z: -12 }, size: { x: 6, y: 3, z: 2 }, color: '#A9A9A9' },
    { id: 'obs3', type: 'cube', position: { x: 0, y: 1, z: -20 }, size: { x: 10, y: 2, z: 2 }, color: '#A9A9A9' },
    { id: 'obs4', type: 'cube', position: { x: 15, y: 2, z: 18 }, size: { x: 4, y: 4, z: 4 }, color: '#8B4513' },
    // Added
    { id: 'obs5', type: 'cube', position: { x: -18, y: 1, z: 8 }, size: { x: 3, y: 2, z: 3 }, color: '#A9A9A9' },
    { id: 'obs6', type: 'cube', position: { x: 20, y: 2.5, z: -8 }, size: { x: 2, y: 5, z: 2 }, color: '#8B4513' },
    { id: 'obs7', type: 'cube', position: { x: 0, y: 0.5, z: 15 }, size: { x: 12, y: 1, z: 2 }, color: '#A9A9A9' },
    { id: 'obs8', type: 'cube', position: { x: -5, y: 1, z: 22 }, size: { x: 2, y: 2, z: 6 }, color: '#8B4513' },
    { id: 'obs9', type: 'cube', position: { x: 22, y: 1.5, z: 0 }, size: { x: 4, y: 3, z: 4 }, color: '#A9A9A9' },
     // Add some cylinders
     { id: 'obs10', type: 'cylinder', position: { x: -20, y: 2, z: -20 }, size: { x: 3, y: 4, z: 3 }, color: '#696969' }, // Diameter X/Z, Height Y
     { id: 'obs11', type: 'cylinder', position: { x: 20, y: 3, z: 20 }, size: { x: 4, y: 6, z: 4 }, color: '#696969' },
];
Object.freeze(OBSTACLES);

// Spawn points (more added)
const SPAWN_POINTS = [
    { x: 0, y: ConstantsServer.PLAYER_GROUND_Y, z: 0 }, { x: 15, y: ConstantsServer.PLAYER_GROUND_Y, z: 15 }, { x: -15, y: ConstantsServer.PLAYER_GROUND_Y, z: -15 },
    { x: -15, y: ConstantsServer.PLAYER_GROUND_Y, z: 15 }, { x: 15, y: ConstantsServer.PLAYER_GROUND_Y, z: -15 }, { x: 0, y: ConstantsServer.PLAYER_GROUND_Y, z: 25 },
    { x: 0, y: ConstantsServer.PLAYER_GROUND_Y, z: -25 }, { x: 25, y: ConstantsServer.PLAYER_GROUND_Y, z: 0 }, { x: -25, y: ConstantsServer.PLAYER_GROUND_Y, z: 0 },
    { x: 20, y: ConstantsServer.PLAYER_GROUND_Y, z: 20 }, { x: -20, y: ConstantsServer.PLAYER_GROUND_Y, z: -20 }, { x: -20, y: ConstantsServer.PLAYER_GROUND_Y, z: 20 },
    { x: 20, y: ConstantsServer.PLAYER_GROUND_Y, z: -20 },
];
Object.freeze(SPAWN_POINTS);
let nextSpawnPointIndex = 0;

// NPC Waypoints (Example)
const patrolPath1 = [ { x: -10, z: 10 }, { x: -10, z: -10 }, { x: -5, z: -10 }, { x: -5, z: 10 } ];
const patrolPath2 = [ { x: 10, z: -10 }, { x: 15, z: -5 }, { x: 10, z: 0 }, { x: 5, z: -5 } ];


/** Manages the overall game state. */
class GameState {
    constructor(broadcastCallback) {
        this.players = new Map();
        this.projectiles = new Map();
        this.npcs = new Map();
        this.obstacles = OBSTACLES;
        this.broadcast = broadcastCallback;
        this.getSpawnPosition = this.getSpawnPosition.bind(this);

        this._initializeNpcs();
        console.log("[GameState Initialized]");
    }

    /** Creates the initial set of NPCs. */
    _initializeNpcs() {
        const npcConfigs = [
            { id: 'npc_patroller_1', position: { x: -10, y: ConstantsServer.PLAYER_GROUND_Y, z: 10 }, config: { type: 'patroller', health: 75, size: { x: 0.7, y: 1.7, z: 0.7 }, color: '#FF6347', waypoints: patrolPath1 } }, // Tomato
            { id: 'npc_patroller_2', position: { x: 10, y: ConstantsServer.PLAYER_GROUND_Y, z: -10 }, config: { type: 'patroller', health: 75, size: { x: 0.7, y: 1.7, z: 0.7 }, color: '#4682B4', waypoints: patrolPath2 } }, // Steel Blue
            { id: 'npc_dummy_1', position: { x: 0, y: ConstantsServer.PLAYER_GROUND_Y, z: 20 }, config: { type: 'target_dummy', health: 200, size: { x: 1, y: 1.8, z: 1 }, color: '#FFA500' } }, // Orange
        ];

        npcConfigs.forEach(cfg => {
             const npc = new Npc(cfg.id, cfg.position, cfg.config);
             this.npcs.set(npc.id, npc);
        });
        console.log(`[GameState] Initialized ${this.npcs.size} NPCs.`);
    }

    /** Selects the next spawn point. */
    getSpawnPosition() {
        const spawnPoint = SPAWN_POINTS[nextSpawnPointIndex];
        nextSpawnPointIndex = (nextSpawnPointIndex + 1) % SPAWN_POINTS.length;
        return { ...spawnPoint };
    }

    /** Adds a new player. */
    addPlayer(playerId, ws) {
        const newPlayer = new Player(playerId, ws, this.broadcast, this.getSpawnPosition);
        newPlayer.position = this.getSpawnPosition(); // Assign spawn position
        // Load saved name if available (implement loading logic if needed)
        // newPlayer.setName(loadedName || defaultName);
        this.players.set(playerId, newPlayer);
        console.log(`[GameState] Player added: ${newPlayer.playerName} (${playerId}). Total: ${this.players.size}`);
        return newPlayer;
    }

    /** Removes a player. */
    removePlayer(playerId) {
        const player = this.players.get(playerId);
        if (player) {
            const name = player.playerName;
            player.dispose();
            this.players.delete(playerId);
            console.log(`[GameState] Player removed: ${name} (${playerId}). Total: ${this.players.size}`);
        }
    }

    /** Gets a player by ID. */
    getPlayer(playerId) {
        return this.players.get(playerId);
    }

    /** Updates a specific player's state from client data. */
    updatePlayerState(playerId, updateData) {
        const player = this.getPlayer(playerId);
        if (player) player.updateState(updateData);
    }

    /** Handles a shoot request from a player. */
    handleShootRequest(playerId, shootData) {
        const player = this.getPlayer(playerId);
        if (!player || !player.isAlive) return;

        if (player.attemptShoot()) {
            console.log("SOUND: fire_weapon_" + player.currentWeapon); // Placeholder

            const projectileConfig = player.getProjectileConfig();
            const baseDirection = { ...shootData.direction };
            // Normalize (ensure client sends normalized or normalize here)
            const len = Math.sqrt(baseDirection.x**2 + baseDirection.y**2 + baseDirection.z**2);
            if (len > 0.1) { // Check for non-zero length
                 baseDirection.x /= len; baseDirection.y /= len; baseDirection.z /= len;
            } else {
                 // Use player's forward direction if client sent bad data
                 const angle = player.rotation.y;
                 baseDirection.x = Math.sin(angle); baseDirection.y = 0; baseDirection.z = Math.cos(angle);
                 console.warn(`[GameState] Player ${playerId} sent near-zero direction vector, using facing direction.`);
            }

            const startOffset = 0.6;
            const startHeight = player.position.y + 1.0; // Approx gun height
            const baseStartPosition = {
                x: player.position.x + baseDirection.x * startOffset,
                y: startHeight,
                z: player.position.z + baseDirection.z * startOffset
            };

            // Handle different fire modes
            if (player.currentWeapon === 'burst' && projectileConfig.burstCount > 1) {
                const burstCount = projectileConfig.burstCount;
                const burstDelay = projectileConfig.burstDelay || 60;
                const spread = projectileConfig.burstSpread || 0;

                for (let i = 0; i < burstCount; i++) {
                    setTimeout(() => {
                        let burstDirection = { ...baseDirection };
                        if (spread > 0) {
                             // Apply random spread (simple horizontal example)
                             const angleOffset = (Math.random() - 0.5) * spread;
                             const cosA = Math.cos(angleOffset); const sinA = Math.sin(angleOffset);
                             const dx = burstDirection.x; const dz = burstDirection.z;
                             burstDirection.x = dx * cosA - dz * sinA;
                             burstDirection.z = dx * sinA + dz * cosA;
                             // Normalize again after rotation? Usually minor effect for small angles.
                        }
                        const proj = new Projectile(playerId, baseStartPosition, burstDirection, projectileConfig);
                        this.projectiles.set(proj.id, proj);
                    }, i * burstDelay);
                }
            } else {
                // Single shot
                const proj = new Projectile(playerId, baseStartPosition, baseDirection, projectileConfig);
                this.projectiles.set(proj.id, proj);
            }

            // Broadcast shoot event (optional)
            const shootEvent = { type: 'player_shoot', payload: { playerId: playerId, weaponType: player.currentWeapon }};
            this.broadcast(JSON.stringify(shootEvent));
        }
    }

    /** Handles weapon switch request */
    handleWeaponSwitch(playerId) {
        const player = this.getPlayer(playerId);
        if (player?.isAlive) {
            player.cycleWeapon();
            // State update will broadcast the change
        }
    }

    /** Handles player name change request */
    handleNameChange(playerId, nameData) {
        const player = this.getPlayer(playerId);
        if (player && nameData && typeof nameData.name === 'string') {
             player.setName(nameData.name); // Player class handles cleaning
             // State update will broadcast the change
        }
    }

    /** Handles jump request */
    handleJumpRequest(playerId) {
         const player = this.getPlayer(playerId);
         if (player?.isAlive) {
             player.jump(); // Player class handles ground check
             // State update will broadcast the change
         }
    }


    /** Main game state update loop. */
    update(deltaTime) {
        // 1. Update Player Physics
        this.players.forEach(player => player.updatePhysics(deltaTime));

        // 2. Update NPCs
        this.npcs.forEach(npc => npc.update(deltaTime, this));

        // 3. Update Projectiles
        const projectilesToRemove = new Set();
        this.projectiles.forEach(proj => {
            proj.update(deltaTime);
            if (!proj.isActive) projectilesToRemove.add(proj.id);
        });

        // 4. Check Projectile Collisions
        const playersToAwardScore = new Map();
        this.projectiles.forEach(proj => {
            if (!proj.isActive) return;
            const hitResult = proj.checkCollisions(this.players, this.npcs, this.obstacles);
            if (hitResult) {
                projectilesToRemove.add(proj.id);
                if (hitResult.type === 'player') {
                    console.log("SOUND: impact_player");
                    const died = hitResult.hitPlayer?.takeDamage(proj.damage, proj.ownerId);
                    if (died && hitResult.hitPlayer) { // Check hitPlayer exists
                        const killer = this.getPlayer(proj.ownerId);
                        if (killer && proj.ownerId !== hitResult.hitPlayer.id) {
                            const currentScore = playersToAwardScore.get(proj.ownerId) || 0;
                            playersToAwardScore.set(proj.ownerId, currentScore + ConstantsServer.SCORE_PER_PLAYER_KILL);
                        }
                    }
                } else if (hitResult.type === 'npc') {
                    console.log("SOUND: impact_npc");
                    const destroyed = hitResult.hitNpc?.takeDamage(proj.damage, proj.ownerId);
                    if (destroyed && hitResult.hitNpc) { // Check hitNpc exists
                        const killer = this.getPlayer(proj.ownerId);
                        if (killer) {
                            const currentScore = playersToAwardScore.get(proj.ownerId) || 0;
                            playersToAwardScore.set(proj.ownerId, currentScore + ConstantsServer.SCORE_PER_NPC_KILL);
                        }
                        // Handle NPC destruction (e.g., mark for respawn or removal)
                        // For now, NPC just becomes !isAlive, state update handles visuals
                    }
                } else if (hitResult.type === 'obstacle') {
                     console.log("SOUND: impact_obstacle");
                }
            }
        });

        // 5. Award Scores
        playersToAwardScore.forEach((points, playerId) => {
             this.getPlayer(playerId)?.addScore(points);
        });

        // 6. Remove Inactive Projectiles
        projectilesToRemove.forEach(projId => this.projectiles.delete(projId));

        // 7. Player Inactivity Timeout Check
        const now = Date.now();
        const playersToRemoveTimeout = [];
        this.players.forEach(player => {
            if (now - player.lastUpdateTime > ConstantsServer.PLAYER_INACTIVITY_TIMEOUT) {
                console.log(`[GameState] Removing inactive player: ${player.playerName}`);
                if (player.ws) player.ws.terminate();
                playersToRemoveTimeout.push(player.id);
            }
        });
        playersToRemoveTimeout.forEach(playerId => this.removePlayer(playerId));
    }

    /** Retrieves combined network state including NPCs. */
    getCombinedNetworkState() {
        const playerStates = []; this.players.forEach(p => playerStates.push(p.getNetworkState()));
        const projectileStates = []; this.projectiles.forEach(p => projectileStates.push(p.getNetworkState()));
        const npcStates = []; this.npcs.forEach(n => npcStates.push(n.getNetworkState()));
        return { players: playerStates, projectiles: projectileStates, npcs: npcStates };
    }

    /** Gets static world data. */
     getStaticWorldData() {
         return { obstacles: this.obstacles };
     }

    /** Gets initialization data including NPCs. */
    getInitializationData(newPlayerId) {
        const selfPlayer = this.getPlayer(newPlayerId);
        if (!selfPlayer) return null;

        const otherPlayerStates = []; this.players.forEach(p => { if (p.id !== newPlayerId) otherPlayerStates.push(p.getNetworkState()); });
        const projectileStates = []; this.projectiles.forEach(p => projectileStates.push(p.getNetworkState()));
        const npcStates = []; this.npcs.forEach(n => npcStates.push(n.getNetworkState()));

        return {
            self: selfPlayer.getNetworkState(),
            others: { players: otherPlayerStates, projectiles: projectileStates, npcs: npcStates },
            world: this.getStaticWorldData()
        };
    }
}

module.exports = GameState;