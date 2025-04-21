// client/js/input.js

import { Constants } from './constants.js';

/**
 * Manages user input based on configurable keybinds.
 * Handles blocking input when UI elements (chat, menu, keybind inputs) are active or game is paused.
 */
export class InputManager {
    constructor() {
        this.keys = {}; // Tracks currently pressed keys (lowercase)
        this.keybinds = { ...Constants.DEFAULT_KEYBINDS }; // Load defaults initially

        // Movement/Action state
        this.moveForward = false;
        this.moveBackward = false;
        this.turnLeft = false;
        this.turnRight = false;
        this.isSprinting = false;

        // Single frame flags (reset after read)
        this.shootRequested = false;
        this.jumpRequested = false;
        this.weaponSwitchRequested = false;
        // menuToggleRequested is handled by UIManager's global listener

        // Focus/Pause state tracking
        this.isInputFocused = false; // True if chat or keybind input is focused
        this.isGamePaused = true; // <<< Controlled externally (by UIManager) - Start paused
        this.chatInputElement = document.getElementById('chat-input');

        // Binding context
        this._onKeyDown = this._onKeyDown.bind(this);
        this._onKeyUp = this._onKeyUp.bind(this);
        this._onFocusChange = this._onFocusChange.bind(this);
        this._onWindowBlur = this._onWindowBlur.bind(this);

        // Listeners
        window.addEventListener('keydown', this._onKeyDown);
        window.addEventListener('keyup', this._onKeyUp);
        window.addEventListener('blur', this._onWindowBlur);

        this.addFocusListeners(); // Add focus listeners initially

        console.log("[InputManager] Initialized.");
    }

    /** Adds focus listeners to relevant input elements */
    addFocusListeners() {
        if (this.chatInputElement) {
            this.chatInputElement.removeEventListener('focus', this._onFocusChange);
            this.chatInputElement.removeEventListener('blur', this._onFocusChange);
            this.chatInputElement.addEventListener('focus', this._onFocusChange);
            this.chatInputElement.addEventListener('blur', this._onFocusChange);
        }
        // Keybind inputs are buttons, focus handled via activeElement check
    }

    /** Updates the keybinds used by the manager */
    updateKeybinds(newKeybinds) {
        if (newKeybinds && typeof newKeybinds === 'object') {
            this.keybinds = { ...Constants.DEFAULT_KEYBINDS };
            for (const action in newKeybinds) {
                if (this.keybinds.hasOwnProperty(action)) {
                    this.keybinds[action] = newKeybinds[action];
                }
            }
            console.log("[InputManager] Keybinds updated:", this.keybinds);
        } else {
            console.warn("[InputManager] Invalid keybinds received, using defaults.");
            this.keybinds = { ...Constants.DEFAULT_KEYBINDS };
        }
    }

    // *** FIX: Add the missing setPaused method ***
    /**
     * Sets the paused state of the game input.
     * @param {boolean} isPaused - Whether the game input should be paused.
     */
    setPaused(isPaused) {
        if (this.isGamePaused !== isPaused) {
            this.isGamePaused = isPaused;
            console.log(`[InputManager] Game paused state set to: ${isPaused}`);
            if (this.isGamePaused) {
                this.resetAllInputs(); // Reset inputs when pausing
            }
        }
    }

    /** Checks if a relevant input element currently has focus */
    _checkFocus() {
        const activeElement = document.activeElement;
        // Check if chat input or any element with 'keybind-input' class (used for buttons during binding) is active
        this.isInputFocused = (
            activeElement === this.chatInputElement ||
            (activeElement && activeElement.classList.contains('keybind-input') && activeElement.classList.contains('waiting')) // Only block if *waiting* for keybind input
        );
        return this.isInputFocused;
    }

    /** Handles focus change on relevant input elements */
     _onFocusChange(event) {
         // Use timeout to allow activeElement to update after focus/blur
         setTimeout(() => {
             const wasFocused = this.isInputFocused;
             this._checkFocus(); // Update focus state
             if (this.isInputFocused && !wasFocused) {
                 console.log("[InputManager] Input focused, game input disabled.");
                 this.resetAllInputs();
             } else if (!this.isInputFocused && wasFocused) {
                 console.log("[InputManager] Input blurred, game input enabled.");
             }
         }, 0);
     }

     /** Resets all movement and action states */
     resetAllInputs() {
        this.moveForward = false; this.moveBackward = false;
        this.turnLeft = false; this.turnRight = false;
        this.isSprinting = false;
        this.shootRequested = false; this.jumpRequested = false;
        this.weaponSwitchRequested = false;
        this.keys = {}; // Clear all pressed keys state
     }

     /** Handle window losing focus */
     _onWindowBlur() {
        console.log("[InputManager] Window lost focus, resetting inputs.");
        this.resetAllInputs();
        // Also ensure pause state is potentially updated if menu relies on focus
        // this.setPaused(true); // Optionally pause if window loses focus? Might be annoying.
     }

    /** Handles keydown event */
    _onKeyDown(event) {
        // Ignore all game input if paused or an input field has focus
        if (this.isGamePaused || this._checkFocus()) return;

        const key = event.key.toLowerCase();
        if (this.keys[key]) return; // Key already held down
        this.keys[key] = true;

        // --- Single Press Actions ---
        if (key === this.keybinds.SHOOT?.toLowerCase()) this.shootRequested = true;
        if (key === this.keybinds.JUMP?.toLowerCase()) this.jumpRequested = true;
        if (key === this.keybinds.WEAPON_SWITCH?.toLowerCase()) this.weaponSwitchRequested = true;

        // --- Held Actions ---
        this._updateHeldActions();

        // Prevent default browser behavior
        const boundKeys = Object.values(this.keybinds).map(k => k?.toLowerCase()).filter(Boolean);
        if (boundKeys.includes(key) || ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) {
             if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
                 event.preventDefault();
             }
        }
    }

    /** Handles keyup event */
    _onKeyUp(event) {
        const key = event.key.toLowerCase();
        this.keys[key] = false;

        // Update held actions only if not paused/focused
        if (!this.isGamePaused && !this._checkFocus()) {
            this._updateHeldActions();
        }
    }

    /** Updates state for actions that depend on keys being held down */
    _updateHeldActions() {
        // If paused or focused, ensure all held actions are false
        if (this.isGamePaused || this.isInputFocused) {
            this.moveForward = false; this.moveBackward = false;
            this.turnLeft = false; this.turnRight = false;
            this.isSprinting = false;
            return;
        }
        this.moveForward = this.keys[this.keybinds.MOVE_FORWARD?.toLowerCase()] || this.keys['arrowup'];
        this.moveBackward = this.keys[this.keybinds.MOVE_BACKWARD?.toLowerCase()] || this.keys['arrowdown'];
        this.turnLeft = this.keys[this.keybinds.TURN_LEFT?.toLowerCase()] || this.keys['arrowleft'];
        this.turnRight = this.keys[this.keybinds.TURN_RIGHT?.toLowerCase()] || this.keys['arrowright'];
        this.isSprinting = this.keys[this.keybinds.SPRINT?.toLowerCase()];
    }

    /** Checks if any movement key is active */
    isMoving() { return this.moveForward || this.moveBackward || this.turnLeft || this.turnRight; }

    /** Generates current input state and resets single-frame flags */
    getCurrentInput() {
        // If paused or input focused, return no actions
        if (this.isGamePaused || this.isInputFocused) {
            return {
                movingForward: false, movingBackward: false, turningLeft: false, turningRight: false,
                isSprinting: false, shootRequested: false, jumpRequested: false,
                weaponSwitchRequested: false, menuToggleRequested: false
            };
        }

        const input = {
            movingForward: this.moveForward,
            movingBackward: this.moveBackward,
            turningLeft: this.turnLeft,
            turningRight: this.turnRight,
            isSprinting: this.isSprinting,
            shootRequested: this.shootRequested,
            jumpRequested: this.jumpRequested,
            weaponSwitchRequested: this.weaponSwitchRequested,
            menuToggleRequested: false, // Handled globally
        };

        // Reset single-frame flags after reading
        this.shootRequested = false;
        this.jumpRequested = false;
        this.weaponSwitchRequested = false;

        return input;
    }

    /** Cleans up event listeners */
    dispose() {
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);
        window.removeEventListener('blur', this._onWindowBlur);
        if (this.chatInputElement) {
            this.chatInputElement.removeEventListener('focus', this._onFocusChange);
            this.chatInputElement.removeEventListener('blur', this._onFocusChange);
        }
        this.keys = {};
        console.log("[InputManager] Disposed.");
    }
}
