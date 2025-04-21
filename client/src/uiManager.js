// client/js/uiManager.js

import { Constants } from './constants.js';

/**
 * Manages UI interactions, HUD updates, menus, settings persistence, and keybinding.
 */
export class UIManager {
    constructor(gameClientCallbacks) {
        // Ensure callbacks are provided or default to no-op functions
        this.callbacks = {
            onStartGame: gameClientCallbacks.onStartGame || (() => console.warn("onStartGame callback missing")),
            onSaveSettings: gameClientCallbacks.onSaveSettings || ((settingsData) => console.warn("onSaveSettings callback missing", settingsData)),
            onLoadSettings: gameClientCallbacks.onLoadSettings || (() => { console.warn("onLoadSettings callback missing"); return {}; }),
            onSavePlayerName: gameClientCallbacks.onSavePlayerName || ((name) => console.warn("onSavePlayerName callback missing", name)),
            onLoadPlayerName: gameClientCallbacks.onLoadPlayerName || (() => { console.warn("onLoadPlayerName callback missing"); return ''; }),
            onSendChatMessage: gameClientCallbacks.onSendChatMessage || ((message) => console.warn("onSendChatMessage callback missing", message)),
            onKeybindsUpdated: gameClientCallbacks.onKeybindsUpdated || ((keybinds) => console.warn("onKeybindsUpdated callback missing", keybinds)),
            isGameRunning: gameClientCallbacks.isGameRunning || (() => { console.warn("isGameRunning callback missing"); return false; }),
            // Callback to notify GameClient/InputManager about pause state changes
            onSetPaused: gameClientCallbacks.onSetPaused || ((isPaused) => console.warn("onSetPaused callback missing", isPaused)),
        };

        // Initialize settings structure
        this.settings = {
            graphics: 'medium',
            audio: 'medium',
            playerName: '',
            keybinds: { ...Constants.DEFAULT_KEYBINDS } // Start with defaults
        };

        // UI State
        this.isMenuVisible = true; // Start with menu visible
        this.isGamePaused = true; // Game is paused when menu is visible initially
        this.isBindingKey = false;
        this.currentBindingAction = null;
        this.currentBindingButton = null;

        // Cache DOM elements
        this.dom = this._cacheDomElements();
        if (!this.dom.menuContainer || !this.dom.mainMenu || !this.dom.settingsPanel || !this.dom.gameUiContainer) {
             console.error("[UIManager] Critical UI containers not found! UI will not function correctly.");
             // Optionally throw an error or display a message to the user
        }

        // Setup
        this._addEventListeners();
        this.loadUISettings(); // Load saved settings (incl. keybinds)
        this.showMenuContainer(); // Show the main overlay
        this.showMainMenu(); // Show the main menu within the overlay
        this.hideGameUI(); // Ensure game UI is hidden initially

        console.log("[UIManager] Initialized.");
    }

    /** Caches frequently accessed DOM elements */
    _cacheDomElements() {
       // Use || null to prevent errors if elements don't exist, check later
       return {
            menuContainer: document.getElementById('menu-container') || null,
            mainMenu: document.getElementById('main-menu') || null,
            settingsPanel: document.getElementById('settings-panel') || null,
            gameUiContainer: document.getElementById('game-ui-container') || null,
            gameCanvas: document.getElementById('game-canvas') || null,
            startButton: document.getElementById('start-button') || null,
            // HUD
            healthBar: document.getElementById('health-bar') || null,
            healthText: document.getElementById('health-text') || null,
            scoreValue: document.getElementById('score-value') || null,
            weaponValue: document.getElementById('weapon-value') || null,
            // Status
            connectionStatus: document.getElementById('connection-status') || null,
            playerCount: document.getElementById('player-count') || null,
            latency: document.getElementById('latency') || null,
            // Respawn
            respawnOverlay: document.getElementById('respawn-overlay') || null,
            killerInfo: document.getElementById('killer-info') || null,
            // Chat
            chatOutput: document.getElementById('chat-output') || null,
            chatInput: document.getElementById('chat-input') || null,
            // Name Input
            playerNameInput: document.getElementById('player-name-input') || null,
       };
    }


    /** Add event listeners to UI elements. */
    _addEventListeners() {
        // Use cached startButton if available, otherwise find it
        const startBtn = this.dom.startButton || document.getElementById('start-button');
        if (startBtn) startBtn.addEventListener('click', this._handleStartResumeClick.bind(this));
        else console.warn("[UIManager] Start button not found.");

        const settingsBtn = document.getElementById('settings-button');
        if (settingsBtn) settingsBtn.addEventListener('click', this._handleSettingsClick.bind(this));
        else console.warn("[UIManager] Settings button not found.");

        const settingsBackBtn = document.getElementById('settings-back-button');
        if (settingsBackBtn) settingsBackBtn.addEventListener('click', this._handleSettingsBackClick.bind(this));
        else console.warn("[UIManager] Settings back button not found.");

        const saveNameBtn = document.getElementById('save-name-button');
        if (saveNameBtn && this.dom.playerNameInput) {
            saveNameBtn.addEventListener('click', this._handleSaveNameClick.bind(this));
        } else { console.warn("[UIManager] Save name button or input not found."); }

        // Settings Preset Buttons
        this._addSettingButtonListener('graphics-low', 'graphics', 'low');
        this._addSettingButtonListener('graphics-medium', 'graphics', 'medium');
        this._addSettingButtonListener('graphics-high', 'graphics', 'high');
        this._addSettingButtonListener('audio-low', 'audio', 'low');
        this._addSettingButtonListener('audio-medium', 'audio', 'medium');
        this._addSettingButtonListener('audio-high', 'audio', 'high');

        // Keybind Buttons
        document.querySelectorAll('button.keybind-input').forEach(button => {
            button.addEventListener('click', (event) => this._handleKeybindButtonClick(event.target));
        });
        // Global listener for capturing keys during binding
        document.addEventListener('keydown', this._handleGlobalKeyDownForBinding.bind(this), true); // Use capture phase

        // Chat Input
        if (this.dom.chatInput) {
             this.dom.chatInput.addEventListener('keydown', this._handleChatKeyDown.bind(this));
        } else { console.warn("[UIManager] Chat input element not found."); }

        // Global Listener for Menu Toggle Key
        window.addEventListener('keydown', (event) => {
            const toggleMenuKey = this.settings.keybinds?.TOGGLE_MENU?.toLowerCase();
            if (toggleMenuKey && event.key.toLowerCase() === toggleMenuKey) {
                // Only toggle if not currently binding another key AND not typing in chat
                if (!this.isBindingKey && document.activeElement !== this.dom.chatInput) {
                    event.preventDefault();
                    this.toggleMenuVisibility();
                } else if (this.isBindingKey) {
                    // If binding and Escape is pressed, cancel the bind
                    this._cancelKeyBinding();
                }
            }
        });
    }

    // --- Event Handlers ---

    _handleStartResumeClick() {
        console.log("Start/Resume button clicked");
        this.hideMenuContainer();
        this.showGameUI();
        this.isGamePaused = false;
        this.callbacks.onSetPaused(false); // Notify GameClient/InputManager
        if (!this.callbacks.isGameRunning()) {
             this.callbacks.onStartGame();
        } else {
            console.log("Resuming game...");
            if (this.dom.gameCanvas) this.dom.gameCanvas.focus();
        }
    }

    _handleSettingsClick() {
        console.log("Settings button clicked");
        if (this.dom.mainMenu) this.dom.mainMenu.classList.add('hidden');
        if (this.dom.settingsPanel) this.dom.settingsPanel.classList.remove('hidden');
        this._displayCurrentKeybinds();
    }

    _handleSettingsBackClick() {
        console.log("Settings back button clicked");
        if (this.isBindingKey) this._cancelKeyBinding();
        if (this.dom.settingsPanel) this.dom.settingsPanel.classList.add('hidden');
        if (this.dom.mainMenu) this.dom.mainMenu.classList.remove('hidden');
    }

    _handleSaveNameClick() {
        if (!this.dom.playerNameInput) return;
        const newName = this.dom.playerNameInput.value;
        this.settings.playerName = newName;
        this.saveUISettings(); // Saves the whole settings object
        this.callbacks.onSavePlayerName(newName); // Still useful to notify GameClient immediately
        console.log(`Player name saved: ${newName}`);
        const saveNameBtn = document.getElementById('save-name-button');
        if (saveNameBtn) {
            saveNameBtn.textContent = "Saved!";
            setTimeout(() => { if(saveNameBtn) saveNameBtn.textContent = "Save Name"; }, 1500);
        }
    }

    _handleChatKeyDown(event) {
         if (event.key === 'Enter') {
             if (!this.dom.chatInput) return;
             const message = this.dom.chatInput.value;
             if (message.trim().length > 0) {
                 this.callbacks.onSendChatMessage(message);
             }
             this.dom.chatInput.value = '';
             this.dom.chatInput.blur(); // Remove focus from chat input
         }
    }

    _handleKeybindButtonClick(buttonElement) {
        if (!buttonElement || this.isGamePaused === false) return; // Only allow binding when menu is open

        if (this.isBindingKey) this._cancelKeyBinding();

        const action = buttonElement.dataset.action;
        if (!action) { console.warn("Keybind button missing data-action attribute."); return; }

        console.log(`Attempting to bind key for action: ${action}`);
        this.isBindingKey = true;
        this.currentBindingAction = action;
        this.currentBindingButton = buttonElement;

        buttonElement.textContent = 'Press key...';
        buttonElement.classList.add('waiting');
        // No need to manually set focus state, the global listener handles it
    }

    _handleGlobalKeyDownForBinding(event) {
        if (!this.isBindingKey || !this.currentBindingAction || !this.currentBindingButton) {
            return; // Only act if waiting for a keybind
        }

        event.preventDefault();
        event.stopPropagation();

        let key = event.key.toLowerCase();
        // Use Escape key to cancel binding
        if (key === 'escape') {
            this._cancelKeyBinding();
            return;
        }
        // Ignore modifier keys if pressed alone
        if (['shift', 'control', 'alt', 'meta'].includes(key)) return;

        // Prevent binding the menu toggle key to other actions
        const toggleMenuKey = this.settings.keybinds.TOGGLE_MENU?.toLowerCase();
        if (toggleMenuKey && this.currentBindingAction !== 'TOGGLE_MENU' && key === toggleMenuKey) {
            console.warn("Cannot bind the menu toggle key to other actions.");
            this.currentBindingButton.textContent = 'Cannot Bind!';
            this.currentBindingButton.classList.remove('waiting');
            setTimeout(() => this._displayCurrentKeybinds(), 1000); // Revert text
            this.isBindingKey = false; this.currentBindingAction = null; this.currentBindingButton = null;
            return;
        }

        let displayKey = this._formatKeyForDisplay(key);
        console.log(`Binding ${this.currentBindingAction} to key: ${key} (Display: ${displayKey})`);

        // Check for conflicts and unbind previous action if necessary
        for (const action in this.settings.keybinds) {
            if (this.settings.keybinds[action]?.toLowerCase() === key && action !== this.currentBindingAction) {
                console.warn(`Key "${key}" was bound to "${action}". Unbinding previous.`);
                this.settings.keybinds[action] = null; // Unbind conflicting action
                const conflictingButton = document.querySelector(`.keybind-input[data-action="${action}"]`);
                if (conflictingButton) conflictingButton.textContent = 'Unset';
            }
        }

        // Update the settings and button text
        this.settings.keybinds[this.currentBindingAction] = key;
        this.currentBindingButton.textContent = displayKey;
        this.currentBindingButton.classList.remove('waiting');

        // Save settings and notify GameClient/InputManager
        this.saveUISettings();
        this.callbacks.onKeybindsUpdated(this.settings.keybinds);

        // Reset binding state
        this.isBindingKey = false;
        this.currentBindingAction = null;
        this.currentBindingButton = null;
    }

     _cancelKeyBinding() {
        if (this.currentBindingButton) {
            this.currentBindingButton.classList.remove('waiting');
            const action = this.currentBindingButton.dataset.action;
            const currentKey = this.settings.keybinds[action]; // Get current key from potentially updated settings
            this.currentBindingButton.textContent = this._formatKeyForDisplay(currentKey);
        }
        this.isBindingKey = false;
        this.currentBindingAction = null;
        this.currentBindingButton = null;
        console.log("Keybinding cancelled.");
    }

    /** Helper to add listeners to settings preset buttons */
    _addSettingButtonListener(buttonId, settingKey, settingValue) {
         const button = document.getElementById(buttonId);
         if (button) {
             button.addEventListener('click', () => {
                 if (this.isBindingKey) this._cancelKeyBinding();
                 console.log(`${settingKey} setting set to: ${settingValue}`);
                 if (this?.settings) {
                    this.settings[settingKey] = settingValue;
                    this._updateSettingsButtonStyles();
                    this.saveUISettings(); // Saves the whole settings object
                    if (this.callbacks?.onSaveSettings) { this.callbacks.onSaveSettings(this.settings); }
                    else { console.warn("[UIManager] onSaveSettings callback missing!"); }
                 } else { console.error("[UIManager] 'this' or 'this.settings' is undefined in button listener for", buttonId); }
             });
         } else { console.warn(`[UIManager] Settings button element not found: ${buttonId}`); }
    }

    // --- Settings Load/Save/Update ---

    loadUISettings() {
         const loadedData = this.callbacks.onLoadSettings(); // Expects { settings:{graphics,audio}, playerName, keybinds }
         // Merge settings, providing defaults
         this.settings.graphics = loadedData.settings?.graphics || 'medium';
         this.settings.audio = loadedData.settings?.audio || 'medium';
         this.settings.playerName = loadedData.playerName || `Guest_${Math.floor(Math.random() * 1000)}`;
         // Merge keybinds carefully
         const defaultBinds = Constants.DEFAULT_KEYBINDS;
         const loadedBinds = loadedData.keybinds || {};
         this.settings.keybinds = {};
         for (const action in defaultBinds) {
             // Use loaded key if valid, otherwise use default
             this.settings.keybinds[action] = loadedBinds[action] || defaultBinds[action];
         }

         if (this.dom.playerNameInput) this.dom.playerNameInput.value = this.settings.playerName;
         this._updateSettingsButtonStyles();
         this._displayCurrentKeybinds();

         console.log("Loaded settings:", this.settings);
         // Notify GameClient immediately about loaded keybinds
         this.callbacks.onKeybindsUpdated(this.settings.keybinds);
    }

    saveUISettings() {
         // Pass the whole structured settings object for saving
         this.callbacks.onSaveSettings({
             settings: { graphics: this.settings.graphics, audio: this.settings.audio },
             playerName: this.settings.playerName,
             keybinds: this.settings.keybinds
         });
         console.log("Saved settings:", this.settings);
    }

    _updateSettingsButtonStyles() {
         const updateGroup = (key) => {
             ['low', 'medium', 'high'].forEach(level => {
                 const button = document.getElementById(`${key}-${level}`);
                 if (button) {
                     if (this.settings[key] === level) { button.classList.add('active'); }
                     else { button.classList.remove('active'); }
                 }
             });
         };
         updateGroup('graphics');
         updateGroup('audio');
     }

     _displayCurrentKeybinds() {
        // Use the defined order for consistency
        Constants.KEYBIND_ACTION_ORDER.forEach(action => {
            const button = document.querySelector(`button.keybind-input[data-action="${action}"]`);
            if (button) {
                const key = this.settings.keybinds[action];
                button.textContent = this._formatKeyForDisplay(key);
            }
        });
     }

     _formatKeyForDisplay(key) {
        if (!key) return 'Unset';
        key = key.toLowerCase();
        if (key === ' ') return 'SPACE';
        if (key === 'control') return 'CTRL';
        if (key === 'shift') return 'SHIFT';
        if (key === 'escape') return 'ESC';
        if (key === 'arrowup') return 'UP';
        if (key === 'arrowdown') return 'DOWN';
        if (key === 'arrowleft') return 'LEFT';
        if (key === 'arrowright') return 'RIGHT';
        if (key === 'enter') return 'ENTER';
        if (key === 'tab') return 'TAB';
        if (key === 'backspace') return 'BKSP';
        if (key === 'delete') return 'DEL';
        if (key === 'insert') return 'INS';
        if (key === 'home') return 'HOME';
        if (key === 'end') return 'END';
        if (key === 'pageup') return 'PGUP';
        if (key === 'pagedown') return 'PGDN';
        if (key.startsWith('digit')) return key.substring(5); // Handle "digit1" -> "1"
        if (key.startsWith('numpad')) return `NUM ${key.substring(6)}`; // Handle "numpad1" -> "NUM 1"
        if (key.length === 1) return key.toUpperCase();
        // Capitalize first letter for others
        return key.charAt(0).toUpperCase() + key.slice(1);
     }


    // --- UI Visibility Control ---

    toggleMenuVisibility() {
        if (!this.dom.menuContainer) return;

        this.isMenuVisible = !this.isMenuVisible;
        this.isGamePaused = this.isMenuVisible;
        this.callbacks.onSetPaused(this.isGamePaused); // Notify GameClient/InputManager

        if (this.isMenuVisible) {
            console.log("Showing menu, pausing game input.");
            if (this.isBindingKey) this._cancelKeyBinding();
            // Update start button text
            if (this.dom.startButton) this.dom.startButton.textContent = this.callbacks.isGameRunning() ? "Resume Game" : "Start Game";
            // Ensure settings panel is hidden, main menu is shown
            if (this.dom.settingsPanel) this.dom.settingsPanel.classList.add('hidden');
            if (this.dom.mainMenu) this.dom.mainMenu.classList.remove('hidden');
            this.showMenuContainer();
            this.hideGameUI();
        } else {
            console.log("Hiding menu, resuming game input.");
            this.hideMenuContainer();
            this.showGameUI();
            if (this.dom.gameCanvas) this.dom.gameCanvas.focus();
        }
    }

    showMainMenu() { if (this.dom.mainMenu) this.dom.mainMenu.classList.remove('hidden'); }
    hideMainMenu() { if (this.dom.mainMenu) this.dom.mainMenu.classList.add('hidden'); }
    showSettingsPanel() { if (this.dom.settingsPanel) this.dom.settingsPanel.classList.remove('hidden'); }
    hideSettingsPanel() { if (this.dom.settingsPanel) this.dom.settingsPanel.classList.add('hidden'); }
    showMenuContainer() { if (this.dom.menuContainer) this.dom.menuContainer.classList.remove('hidden'); }
    hideMenuContainer() { if (this.dom.menuContainer) this.dom.menuContainer.classList.add('hidden'); }
    showGameUI() { if (this.dom.gameUiContainer) this.dom.gameUiContainer.classList.remove('hidden'); }
    hideGameUI() { if (this.dom.gameUiContainer) this.dom.gameUiContainer.classList.add('hidden'); }

    // --- HUD Update Methods ---
    updateHUD(localPlayerState) {
        if (!localPlayerState || !this.dom) return;
       // Health Bar
       if (this.dom.healthBar && this.dom.healthText && localPlayerState.maxHealth > 0) {
           const hp = Math.max(0, Math.round(localPlayerState.health)); const maxHp = localPlayerState.maxHealth;
           const healthPercent = (hp / maxHp) * 100;
           this.dom.healthBar.style.width = `${healthPercent}%`;
           const healthColor = healthPercent < 25 ? '#f14668' : (healthPercent < 50 ? '#ffdd57' : '#48c774');
           this.dom.healthBar.style.backgroundColor = healthColor;
           this.dom.healthText.textContent = `${hp} / ${maxHp}`;
       }
       // Score
       if (this.dom.scoreValue) this.dom.scoreValue.textContent = localPlayerState.score;
        // Weapon Display
        if (this.dom.weaponValue) {
            const weaponKey = localPlayerState.currentWeapon || 'default';
            // Use display names from Constants
            this.dom.weaponValue.textContent = Constants.WEAPON_DISPLAY_NAMES[weaponKey] || weaponKey;
        }
    }

    updateStatusOverlay(playerCount, latency) {
         if (this.dom.playerCount) this.dom.playerCount.textContent = playerCount;
         if (this.dom.latency) this.dom.latency.textContent = latency > 0 ? latency : 'N/A';
    }

     updateConnectionStatus(text, statusClass) {
         if (this.dom.connectionStatus) {
            this.dom.connectionStatus.textContent = text;
            // Ensure className is set correctly, removing old ones might require classList
            this.dom.connectionStatus.className = ''; // Clear previous classes
            this.dom.connectionStatus.classList.add(statusClass); // Add the new class
         }
     }

    showRespawnOverlay(show, killerId, playerDataCache) {
        if (!this.dom.respawnOverlay) return;
        if (show) {
            let killerText = "Environment / Unknown";
            if (killerId) {
                 const killerData = playerDataCache?.get(killerId);
                 killerText = killerData?.name || `Player ${killerId.substring(0, 4)}`;
            }
             if (this.dom.killerInfo) this.dom.killerInfo.textContent = killerText;
            this.dom.respawnOverlay.classList.remove('hidden');
        } else {
            this.dom.respawnOverlay.classList.add('hidden');
        }
    }

    addChatMessage(senderId, senderName, senderColor, messageText) {
        if (!this.dom.chatOutput) return;
        const msg = document.createElement('p'); msg.classList.add('player-message');
        const nameSpan = document.createElement('span'); nameSpan.classList.add('sender');
        nameSpan.style.color = senderColor || '#FFFFFF'; nameSpan.textContent = `${senderName || `Player ${senderId.substring(0,4)}`}: `;
        const textSpan = document.createElement('span'); textSpan.classList.add('text');
        textSpan.textContent = messageText.replace(/</g, "&lt;").replace(/>/g, "&gt;"); // Basic sanitize
        msg.appendChild(nameSpan); msg.appendChild(textSpan); this.dom.chatOutput.appendChild(msg);
        const isScrolledToBottom = this.dom.chatOutput.scrollHeight - this.dom.chatOutput.clientHeight <= this.dom.chatOutput.scrollTop + 5;
        if(isScrolledToBottom) { this.dom.chatOutput.scrollTop = this.dom.chatOutput.scrollHeight; }
    }

    addSystemChatMessage(messageText) {
         if (!this.dom.chatOutput) return;
        const msg = document.createElement('p'); msg.classList.add('system-message');
        msg.textContent = messageText; this.dom.chatOutput.appendChild(msg);
         const isScrolledToBottom = this.dom.chatOutput.scrollHeight - this.dom.chatOutput.clientHeight <= this.dom.chatOutput.scrollTop + 5;
        if(isScrolledToBottom) { this.dom.chatOutput.scrollTop = this.dom.chatOutput.scrollHeight; }
    }

     getPlayerName() { return this.settings.playerName || `Guest_${Math.floor(Math.random() * 1000)}`; }
     getKeybinds() { return { ...this.settings.keybinds }; } // Return a copy

} // End UIManager Class
