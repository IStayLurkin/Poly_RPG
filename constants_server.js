// server/constants_server.js

const ConstantsServer = {
    // Physics
    GRAVITY: -19.6,
    PLAYER_JUMP_VELOCITY: 8.0,
    PLAYER_GROUND_Y: 0.5, // Base height of player pivot

    // NPC Config
    NPC_DEFAULT_HEALTH: 50,
    NPC_PATROL_SPEED: 2.0, // Units per second
    NPC_PATROL_WAIT_TIME: 3000, // ms to wait at waypoint

    // Scoring
    SCORE_PER_PLAYER_KILL: 1,
    SCORE_PER_NPC_KILL: 5,

    // Respawn / Timeout
    PLAYER_RESPAWN_DELAY: 3000, // ms
    PLAYER_INACTIVITY_TIMEOUT: 180000, // ms (3 minutes)
    NPC_RESPAWN_DELAY: 10000, // ms (Example, not implemented yet)

    // Weapon Configs (Server authoritative source)
    WEAPON_CONFIGS: {
        'default': { type: 'default', speed: 25.0, lifetime: 2500, damage: 20, radius: 0.15, cooldown: 500 },
        'fast':    { type: 'fast',    speed: 40.0, lifetime: 1500, damage: 8,  radius: 0.1,  cooldown: 150 },
        'burst':   { type: 'burst',   speed: 30.0, lifetime: 1800, damage: 12, radius: 0.12, cooldown: 800, burstCount: 3, burstDelay: 60, burstSpread: Math.PI / 36 }, // Added burst config
    },

    // World Boundaries (adjust as needed)
    WORLD_BOUNDS_X: 125,
    WORLD_BOUNDS_Z: 125,
    WORLD_MIN_Y: -10, // Despawn projectiles below this
};

// Freeze the object to prevent accidental modification
Object.freeze(ConstantsServer);

module.exports = ConstantsServer; // Use CommonJS for Node.js server