// client/js/constants.js

/** Shared constants */
export const Constants = Object.freeze({
    // Network Message Types
    MSG_INIT: 'init',
    MSG_PLAYER_UPDATE: 'player_update',
    MSG_GAME_STATE_UPDATE: 'game_state_update',
    MSG_PLAYER_JOIN: 'player_join',
    MSG_PLAYER_LEAVE: 'player_leave',
    MSG_PING: 'ping',
    MSG_PONG: 'pong',
    MSG_SHOOT_REQUEST: 'shoot_request',
    MSG_PLAYER_SHOOT: 'player_shoot',
    MSG_PLAYER_HIT: 'player_hit',
    MSG_PLAYER_DIED: 'player_died',
    MSG_PLAYER_RESPAWN: 'player_respawn',
    MSG_CHAT_MESSAGE: 'chat_message',
    MSG_CHAT_BROADCAST: 'chat_broadcast',
    MSG_JUMP_REQUEST: 'jump_request',
    MSG_PLAYER_JUMP: 'player_jump',
    MSG_WEAPON_SWITCH_REQUEST: 'weapon_switch_request',
    MSG_WEAPON_SWITCH_CONFIRM: 'weapon_switch_confirm', // Server confirms weapon switch
    MSG_SET_NAME: 'set_name',
    // MSG_SET_KEYBINDS: 'set_keybinds', // Optional: Client could send updates, but saving locally is simpler for now

    // <<< Default Input Keys >>> (Can be overridden by settings)
    DEFAULT_KEYBINDS: {
        MOVE_FORWARD: 'w',
        MOVE_BACKWARD: 's',
        TURN_LEFT: 'a',
        TURN_RIGHT: 'd',
        SHOOT: ' ', // Spacebar
        JUMP: 'shift', // Use Shift for jump
        SPRINT: 'control', // Use Control for sprint
        WEAPON_SWITCH: 'q',
        TOGGLE_MENU: 'escape', // Use Escape to toggle menu
    },
    KEYBIND_ACTION_ORDER: [ // Define order for settings display
        'MOVE_FORWARD', 'MOVE_BACKWARD', 'TURN_LEFT', 'TURN_RIGHT',
        'JUMP', 'SPRINT', 'SHOOT', 'WEAPON_SWITCH', 'TOGGLE_MENU'
    ],

    // Player movement/physics
    PLAYER_MOVE_SPEED: 7.0, // Base speed units per second
    PLAYER_SPRINT_MULTIPLIER: 1.6, // Sprint speed = base * multiplier
    PLAYER_TURN_SPEED: 3.0, // Radians per second
    PLAYER_JUMP_VELOCITY: 8.0,
    PLAYER_GRAVITY: -19.6, // Affects client prediction if implemented fully

    // Weapon parameters
    WEAPON_DISPLAY_NAMES: {
        'default': 'Blaster',
        'fast': 'Repeater',
        'burst': 'Scattergun'
    },

    // Projectile visuals
    PROJECTILE_RADIUS: 0.15,
    PROJECTILE_COLORS: {
        'default': 0xff8c00, // Dark Orange
        'fast': 0xadd8e6,    // Light Blue
        'burst': 0x90ee90,    // Light Green
    },

    // Network settings
    STATE_UPDATE_INTERVAL: 1000 / 20, // ms (20 Hz) - How often client sends updates
    PING_INTERVAL: 2000, // ms
    SERVER_BROADCAST_RATE_HZ: 20, // Expected server update rate for interpolation

    // Graphics settings
    CAMERA_FOLLOW_DISTANCE: 13,
    CAMERA_FOLLOW_HEIGHT: 7,

    // UI
    DEFAULT_PLAYER_NAME: 'Player',
    LOCAL_STORAGE_SETTINGS_KEY: 'polyCombatSettings_v1', // Key for saving settings (name, gfx, audio, keybinds)
});

// Note: Object.freeze prevents accidental modification. If you need mutable constants (rarely), remove it.
