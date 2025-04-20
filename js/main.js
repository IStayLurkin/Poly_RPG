// client/js/main.js

import { NetworkManager } from './network.js';
import { InputManager } from './input.js';
import { GraphicsManager } from './graphics.js';
import { UIManager } from './uiManager.js';
import { Constants } from './constants.js';

// Ensure THREE is loaded globally before use
if (typeof THREE === 'undefined') {
    console.error("FATAL: THREE library not loaded!");
    // Display error to user?
    document.body.innerHTML = '<div style="color:red; padding: 20px;"><h1>Fatal Error</h1><p>Required 3D library (THREE) failed to load. Cannot start game.</p></div>';
    // Prevent further execution by throwing an error
    throw new Error("THREE library failed to load.");
}


/**
 * Main game client class. Orchestrates managers and client-side game logic.
 */
 class GameClient {
  _determineServerUrl() {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const serverHost = window.location.hostname || 'localhost';
      const defaultPorts = ['80', '443', ''];
      const serverPort = defaultPorts.includes(window.location.port) ? '3000' : window.location.port;
      const url = `${wsProtocol}//${serverHost}:${serverPort}`;
      console.log(`[GameClient] Determined WebSocket URL: ${url}`);
      return url;
  }
class GameClient {
    constructor() {
        this.graphicsManager = null;
        this.inputManager = null;
        this.networkManager = null;
        this.uiManager = null;

        this.clientId = null;
        // Initialize with more complete state, including isSprinting
        this.localPlayerState = {
            id: null, name: Constants.DEFAULT_PLAYER_NAME,
            position: { x: 0, y: 0.5, z: 0 }, rotation: { y: 0 }, // Only store Y rotation
            health: 100, maxHealth: 100, score: 0,
            isAlive: false, currentWeapon: 'default',
            isJumping: false, isGrounded: true, isSprinting: false, // Add isSprinting
            color: '#ffffff', isShooting: false
        };
        this.lastSentStateTime = 0;
        this.inputSequence = 0;
        this.lastUpdateTime = performance.now();
        this.playerDataCache = new Map(); // Cache other players' data {id, name, color, etc.}
        this.isGameRunningState = false; // Tracks if actively connected and initialized
        this.isDisposed = false; // Flag to prevent errors during cleanup

        // Initialize managers
        if (!this._initializeManagers()) {
             console.error("GameClient initialization failed. Stopping.");
             this.dispose(); return;
        }
        console.log("[GameClient] Initialization complete. Showing main menu.");
    }

    /** Initializes all manager classes */
    _initializeManagers() {
        console.log("[GameClient] Initializing managers...");
        try {
            // --- Init UI Manager FIRST ---
            const uiManagerCallbacks = {
                onStartGame: this.startGame.bind(this),
                onSaveSettings: this.saveSettings.bind(this), // Saves combined settings object
                onLoadSettings: this.loadSettings.bind(this), // Loads combined settings object
                onSavePlayerName: this.savePlayerName.bind(this), // Saves name within settings object
                onLoadPlayerName: this.loadPlayerName.bind(this), // Loads name from settings object
                onSendChatMessage: (message) => {
                    if (this.networkManager?.isConnected) this.networkManager.sendChatMessage(message);
                    else this.uiManager?.addSystemChatMessage("Cannot send chat: Not connected.");
                },
                // <<< Pass keybind updates to InputManager >>>
                onKeybindsUpdated: (keybinds) => {
                    this.inputManager?.updateKeybinds(keybinds);
                },
                 // <<< Pass pause state updates to InputManager >>>
                 onSetPaused: (isPaused) => {
                    this.inputManager?.setPaused(isPaused);
                },
                // <<< Provide game running state to UIManager >>>
                isGameRunning: () => this.isGameRunningState,
            };
            this.uiManager = new UIManager(uiManagerCallbacks); // UIManager loads settings internally

            // --- Init Graphics ---
            const canvas = this.uiManager.dom.gameCanvas; // Get canvas ref from UIManager cache
            if (!canvas) throw new Error("Canvas element not found via UIManager!");
            this.graphicsManager = new GraphicsManager(canvas);

            // Apply loaded graphics settings AFTER graphicsManager is created
            const initialSettings = this.uiManager.settings || { graphics: 'medium' };
            this.graphicsManager.applyGraphicsSetting(initialSettings.graphics);

            // --- Init Input ---
            this.inputManager = new InputManager();
            // Pass initial keybinds and pause state
            this.inputManager.updateKeybinds(this.uiManager.settings.keybinds);
            this.inputManager.setPaused(this.uiManager.isGamePaused); // Sync initial pause state

            // --- Init Network ---
            const serverUrl = this._determineServerUrl();
            const networkCallbacks = {
                onConnect: this._onConnect.bind(this), onDisconnect: this._onDisconnect.bind(this),
                onError: this._onError.bind(this), onInit: this._onInit.bind(this),
                onStateUpdate: this._onStateUpdate.bind(this), onPlayerJoin: this._onPlayerJoin.bind(this),
                onPlayerLeave: this._onPlayerLeave.bind(this), onPlayerHit: this._onPlayerHit.bind(this),
                onPlayerDied: this._onPlayerDied.bind(this), onPlayerRespawn: this._onPlayerRespawn.bind(this),
                onPlayerShoot: this._onPlayerShoot.bind(this), onChatMessage: this._onChatMessage.bind(this),
                onWeaponSwitchConfirm: this._onWeaponSwitchConfirm.bind(this),
                // Add callback for player jump event from server
                onPlayerJump: this._onPlayerJump.bind(this),
            };
            this.networkManager = new NetworkManager(serverUrl, networkCallbacks);

        } catch (error) {
            this._initializationError(`Manager initialization failed: ${error.message}`, error);
            return false;
        }
        return true;
    }

    /** Called by UIManager when Start Game button is clicked */
    startGame() {
        if (this.isGameRunningState || this.isDisposed) { // Prevent multiple starts if already connected
             console.log("[GameClient] Game already running or starting.");
             // If menu was just hidden, ensure game loop continues
             this.uiManager.hideMenuContainer();
             this.uiManager.showGameUI();
             this.uiManager.isGamePaused = false;
             this.callbacks.onSetPaused(false);
             if (this.uiManager.dom.gameCanvas) this.uiManager.dom.gameCanvas.focus();
             return;
        }
        console.log("[GameClient] Starting game connection...");

        // UIManager handles hiding menu/showing game UI via toggleMenuVisibility
        this.uiManager.updateConnectionStatus("Connecting...", "connecting");
        this.networkManager.connect(); // Connect will trigger _onConnect -> _onInit
        this.graphicsManager?.startRendering(); // Ensure rendering is active

        // Start client game loop (will run logic once isGameRunningState is true)
        this.lastUpdateTime = performance.now();
        requestAnimationFrame(this._clientLoop.bind(this));
    }

    /** Determines the WebSocket server URL. */
    _determineServerUrl() {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const serverHost = window.location.hostname;
        const defaultPorts = ['80', '443', ''];
        const serverPort = defaultPorts.includes(window.location.port) ? '3000' : window.location.port;
        const url = `${wsProtocol}//${serverHost}:${serverPort}`;
        console.log(`[GameClient] Determined WebSocket URL: ${url}`);
        return url;
    }

    /** Main client-side update loop */
    _clientLoop() {
        if (this.isDisposed) return; // Stop if disposed

        // Request next frame regardless of pause state to keep rendering going
        // GraphicsManager internal loop handles rendering
        requestAnimationFrame(this._clientLoop.bind(this));

        // Get deltaTime from graphics manager's clock
        const deltaTime = this.graphicsManager?.clock?.getDelta() ?? (1/60); // Use fallback if clock missing
        if (deltaTime <= 0) return; // Skip if delta time is invalid

        // --- Run Game Logic Only if Active ---
        if (!this.isGameRunningState || this.uiManager.isGamePaused) {
            return; // Don't run game logic if not connected/initialized, or if paused by menu
        }

        // Ensure managers are available
        if (!this.inputManager || !this.graphicsManager || !this.networkManager) {
            console.error("Client loop aborted: Manager missing."); return;
        }

        const now = performance.now();
        this.lastUpdateTime = now;

        const inputState = this.inputManager.getCurrentInput(); // Gets state respecting pause/focus
        let stateUpdateNeeded = false;

        if (this.clientId && this.localPlayerState.isAlive) {
            this.inputSequence++;

            // --- Handle Actions ---
            if (inputState.jumpRequested) {
                this.networkManager.sendJumpRequest();
                // Optional client-side prediction:
                if (this.localPlayerState.isGrounded) {
                    this.localPlayerState.isJumping = true;
                    this.localPlayerState.isGrounded = false;
                    // Add vertical velocity for prediction if needed
                }
            }
            if (inputState.weaponSwitchRequested) this.networkManager.sendWeaponSwitchRequest();
            if (inputState.shootRequested) {
                 if (typeof THREE !== 'undefined') {
                     const shootDirection = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.localPlayerState.rotation.y).normalize();
                     this.networkManager.sendShootRequest(shootDirection);
                     console.log("SOUND: shoot_request_sent"); // Placeholder
                 } else { console.error("THREE missing for shoot request!"); }
            }

            // --- Update Local Prediction (Movement/Rotation) ---
            let moved = false;
            const currentSpeed = inputState.isSprinting ? (Constants.PLAYER_MOVE_SPEED * Constants.PLAYER_SPRINT_MULTIPLIER) : Constants.PLAYER_MOVE_SPEED;
            const turnSpeed = Constants.PLAYER_TURN_SPEED;
            const currentPosition = this.localPlayerState.position;
            let newRotationY = this.localPlayerState.rotation.y;

            // Apply rotation delta
            let rotationDelta = 0;
            if (inputState.turningLeft) rotationDelta -= turnSpeed * deltaTime;
            if (inputState.turningRight) rotationDelta += turnSpeed * deltaTime;
            newRotationY += rotationDelta;
            if (rotationDelta !== 0) moved = true; // Rotation counts as movement for updates

            // Apply translation delta
            if (typeof THREE !== 'undefined') {
                const moveDirection = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), newRotationY); // Use new rotation for direction
                let moveX = 0; let moveZ = 0;
                if (inputState.movingForward) { moveX += moveDirection.x; moveZ += moveDirection.z; moved = true; }
                if (inputState.movingBackward) { moveX -= moveDirection.x; moveZ -= moveDirection.z; moved = true; }

                // Normalize if moving diagonally
                const moveLength = Math.sqrt(moveX * moveX + moveZ * moveZ);
                if (moveLength > 0.01) {
                    const scale = (currentSpeed * deltaTime) / moveLength;
                    currentPosition.x += moveX * scale;
                    currentPosition.z += moveZ * scale;
                }

                // Basic ground clamp prediction (server is authoritative for Y)
                currentPosition.y = 0.5; // TODO: Add proper physics prediction if needed
                this.localPlayerState.isGrounded = true; // Assume grounded unless jumping

            } else if (moved) { console.error("THREE missing in client loop!"); }

            // --- Update Local State & Graphics ---
            this.localPlayerState.rotation.y = newRotationY;
            const oldSprintState = this.localPlayerState.isSprinting;
            this.localPlayerState.isSprinting = inputState.isSprinting;

            const currentInputFlags = { // Flags for animation system
                movingForward: inputState.movingForward, movingBackward: inputState.movingBackward,
                turningLeft: inputState.turningLeft, turningRight: inputState.turningRight,
                isShooting: inputState.shootRequested, isJumping: this.localPlayerState.isJumping,
                isSprinting: this.localPlayerState.isSprinting
            };
            // Pass necessary states to graphics update
            this.graphicsManager.updateLocalPlayerPose(
                this.localPlayerState.position,
                this.localPlayerState.rotation, // Pass {y: value}
                currentInputFlags,
                this.localPlayerState.isGrounded,
                deltaTime
            );
            // Determine if state needs to be sent to server
            stateUpdateNeeded = moved || inputState.shootRequested || (oldSprintState !== this.localPlayerState.isSprinting);

            // --- Send State Update ---
            const updateInterval = stateUpdateNeeded ? (Constants.STATE_UPDATE_INTERVAL / 1.5) : Constants.STATE_UPDATE_INTERVAL;
            if (stateUpdateNeeded && (now - this.lastSentStateTime >= updateInterval)) {
                 if (this.networkManager.isConnected) {
                     // Send only necessary data for update
                     const stateToSend = {
                         position: this.localPlayerState.position, // Send full position {x,y,z}
                         rotation: this.localPlayerState.rotation, // Send rotation {y: value}
                         movingForward: inputState.movingForward,
                         movingBackward: inputState.movingBackward,
                         turningLeft: inputState.turningLeft, // Send turn flags for server-side animation/logic?
                         turningRight: inputState.turningRight,
                         isShooting: inputState.shootRequested, // Send shooting intent
                         isSprinting: this.localPlayerState.isSprinting, // Send sprint state
                         inputSeq: this.inputSequence
                     };
                     this.networkManager.sendPlayerUpdate(stateToSend);
                     this.lastSentStateTime = now;
                 }
            }
        } // End if (player alive and game not paused)

        // --- Update UI --- (Always update UI elements like status)
        this.uiManager.updateStatusOverlay(this.graphicsManager.getPlayerCount(), this.networkManager.getLatency());
        // Only update HUD if game is considered running
        if (this.isGameRunningState) {
            this.uiManager.updateHUD(this.localPlayerState);
        }
    }

    // --- Network Callbacks ---
    _onConnect() {
        console.log("[GameClient] Connected. Sending player name.");
        this.uiManager.updateConnectionStatus("Connected", "connected");
        this.networkManager.sendSetNameRequest(this.uiManager.getPlayerName());
    }
    _onDisconnect(code, reason, wasClean) {
        console.log(`[GameClient] Disconnected. Reason: ${reason} (Code: ${code})`);
        this.isGameRunningState = false; // Mark game as stopped
        this.clientId = null;
        this.graphicsManager?.setLocalPlayerId(null);
        this.graphicsManager?.clearWorld();
        this.playerDataCache.clear();
        this.uiManager.updateConnectionStatus("Disconnected", "disconnected");
        this.uiManager.showRespawnOverlay(false);
        this.uiManager.hideGameUI();
        this.uiManager.showMenuContainer();
        this.uiManager.showMainMenu();
        this.uiManager.setPaused(true);
        this.localPlayerState.isAlive = false;
    }
    _onError(errorMessage) {
        console.error(`[GameClient] Network Error: ${errorMessage}`);
        this.uiManager.updateConnectionStatus(`Error: ${errorMessage.substring(0, 30)}`, "error");
        // Optionally disconnect or show menu on error
        this.networkManager?.disconnect(); // Example: Disconnect on error
    }
    _onInit(initData) {
        console.log("[GameClient] Received init data.");
        if (!initData?.self?.id || !initData.others || !initData.world || !this.graphicsManager) {
            console.error("[GameClient] Invalid init data received.");
            this.uiManager.updateConnectionStatus("Init Error", "error");
            this.networkManager?.disconnect(); return;
        }
        this.clientId = initData.self.id;
        this.graphicsManager.setLocalPlayerId(this.clientId);
        this.localPlayerState = { ...initData.self }; // Full state sync
        this.playerDataCache.set(initData.self.id, initData.self);
        this.graphicsManager.addOrUpdatePlayer(initData.self);
        initData.others.players?.forEach(p => { this.playerDataCache.set(p.id, p); this.graphicsManager.addOrUpdatePlayer(p); });
        initData.others.projectiles?.forEach(p => this.graphicsManager.addOrUpdateProjectile(p));
        initData.others.npcs?.forEach(n => this.graphicsManager.addOrUpdateNpc(n));
        this.graphicsManager.createObstacles(initData.world.obstacles);
        this.uiManager.updateConnectionStatus("Initialized", "connected");
        this.uiManager.showRespawnOverlay(false);
        this.uiManager.addSystemChatMessage(`Joined game as ${this.localPlayerState.name || 'Player'}.`);
        this.uiManager.addSystemChatMessage(`Controls: [${this.uiManager.settings.keybinds.MOVE_FORWARD?.toUpperCase() || 'W'}]... | [${this.uiManager.settings.keybinds.TOGGLE_MENU?.toUpperCase() || 'ESC'}] to toggle menu.`);

        this.isGameRunningState = true; // <<< Mark game as fully running >>>
        this.uiManager.setPaused(false); // <<< Unpause input >>>
        this.uiManager.hideMenuContainer(); // <<< Hide menu >>>
        this.uiManager.showGameUI(); // <<< Show game UI >>>
        if(this.uiManager.dom.gameCanvas) this.uiManager.dom.gameCanvas.focus();
    }
    _onStateUpdate(gameState) {
        if (!gameState || !this.graphicsManager || !this.isGameRunningState) return;
        this.graphicsManager.processGameStateUpdate(gameState); // Graphics handles meshes
        const serverSelfState = gameState.players.find(p => p.id === this.clientId);
        if (serverSelfState) {
            // Update non-predicted state
            this.localPlayerState.score = serverSelfState.score;
            this.localPlayerState.health = serverSelfState.health;
            this.localPlayerState.isAlive = serverSelfState.isAlive;
            this.localPlayerState.currentWeapon = serverSelfState.currentWeapon;
            // Update predicted states (server is authoritative)
            this.localPlayerState.isJumping = serverSelfState.isJumping;
            this.localPlayerState.isGrounded = serverSelfState.isGrounded;
            this.localPlayerState.isSprinting = serverSelfState.isSprinting;

            // Server Reconciliation (Basic Example: Correct if position diverges too much)
            const serverPos = new THREE.Vector3(serverSelfState.position.x, serverSelfState.position.y, serverSelfState.position.z);
            const clientPos = new THREE.Vector3(this.localPlayerState.position.x, this.localPlayerState.position.y, this.localPlayerState.position.z);
            const correctionThresholdSq = 1.5 * 1.5; // If prediction is > 1.5 units off
            if (clientPos.distanceToSquared(serverPos) > correctionThresholdSq) {
                console.warn("Correcting player position based on server state.");
                this.localPlayerState.position.x = serverPos.x;
                this.localPlayerState.position.y = serverPos.y; // Snap Y position too
                this.localPlayerState.position.z = serverPos.z;
                // Immediately update graphics mesh position to avoid visual jump
                this.graphicsManager.updateLocalPlayerPose(this.localPlayerState.position, this.localPlayerState.rotation, {}, this.localPlayerState.isGrounded, 0);
            }
            // Update cache
            this.playerDataCache.set(this.clientId, serverSelfState);
        } else if (this.localPlayerState.isAlive && this.networkManager?.isConnected) {
            // console.warn("[GameClient] Local player state not found in game_state_update.");
        }
        // Update cache for others
        gameState.players?.forEach(p => { if (p.id !== this.clientId) this.playerDataCache.set(p.id, p); });
    }
    _onPlayerJoin(playerData) {
        console.log(`[GameClient] Player joined: ${playerData.name || playerData.id}`);
        this.playerDataCache.set(playerData.id, playerData);
        this.graphicsManager?.addOrUpdatePlayer(playerData);
        this.uiManager.addSystemChatMessage(`${playerData.name || 'Player'} joined.`);
    }
    _onPlayerLeave(leaveData) {
        const playerName = this.playerDataCache.get(leaveData.id)?.name || `Player ${leaveData.id.substring(0, 4)}`;
        console.log(`[GameClient] Player left: ${playerName}`);
        this.playerDataCache.delete(leaveData.id);
        this.graphicsManager?.removePlayer(leaveData.id);
        this.uiManager.addSystemChatMessage(`${playerName} left.`);
    }
    _onPlayerHit(hitData) {
        const targetIsLocal = hitData.playerId === this.clientId;
        const targetIsNpc = hitData.targetType === 'npc';
        if (targetIsLocal) {
            this.localPlayerState.health = hitData.remainingHealth;
            console.log("SOUND: local_player_hit");
            this.graphicsManager?.triggerPlayerHitEffect(hitData.playerId);
        } else if (targetIsNpc && hitData.targetId) {
            this.graphicsManager?.triggerNpcHitEffect(hitData.targetId);
            console.log("SOUND: npc_hit_generic");
        } else if (hitData.playerId) {
            this.graphicsManager?.triggerPlayerHitEffect(hitData.playerId);
            console.log("SOUND: player_hit_generic");
        }
    }
    _onPlayerDied(deathData) {
        console.log(`[GameClient] Local player died.`);
        this.localPlayerState.isAlive = false;
        this.uiManager.showRespawnOverlay(true, deathData.killerId, this.playerDataCache);
        console.log("SOUND: player_death");
    }
    _onPlayerRespawn(respawnData) {
        console.log("[GameClient] Local player respawned.");
        this.localPlayerState = { ...respawnData }; // Full state sync
        this.playerDataCache.set(this.clientId, respawnData);
        this.uiManager.showRespawnOverlay(false);
        this.graphicsManager?.addOrUpdatePlayer(respawnData);
        const localMesh = this.graphicsManager?.getLocalPlayerMesh();
        if (localMesh) { // Force mesh position/rotation immediately
            localMesh.position.copy(respawnData.position);
            localMesh.rotation.y = respawnData.rotation.y;
            localMesh.visible = true;
        }
        console.log("SOUND: player_respawn");
    }
    _onPlayerShoot(shootData) { /* Optional feedback */ }
    _onChatMessage(chatData) {
        this.uiManager.addChatMessage(chatData.senderId, chatData.senderName, chatData.senderColor, chatData.text);
    }
    _onWeaponSwitchConfirm(payload) {
        if (this.localPlayerState && payload.currentWeapon) {
            this.localPlayerState.currentWeapon = payload.currentWeapon;
            console.log(`[GameClient] Weapon switched locally to: ${payload.currentWeapon}`);
        }
    }
    _onPlayerJump(payload) {
        // Optional: Trigger jump effect/sound for specific player
        if (payload?.playerId) {
             console.log(`SOUND: player_jump event for ${payload.playerId}`);
             // Could trigger visual effect via graphicsManager
             // this.graphicsManager?.triggerJumpEffect(payload.playerId);
        }
    }

    // --- Settings & Name Persistence Callbacks ---
    saveSettings(dataToSave) { // Expects { settings: { graphics, audio }, playerName, keybinds }
        try {
             localStorage.setItem(Constants.LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(dataToSave));
             console.log("[GameClient] Saved settings to localStorage:", dataToSave);
             // Apply graphics setting immediately if changed
             if (this.graphicsManager && dataToSave.settings?.graphics) {
                 this.graphicsManager.applyGraphicsSetting(dataToSave.settings.graphics);
             }
             // NOTE: Keybinds are applied via the onKeybindsUpdated callback path
        } catch (e) { console.error("Failed to save settings:", e); }
    }
    loadSettings() {
        try {
             const saved = localStorage.getItem(Constants.LOCAL_STORAGE_SETTINGS_KEY);
             const defaultData = {
                 settings: { graphics: 'medium', audio: 'medium' },
                 playerName: '',
                 keybinds: { ...Constants.DEFAULT_KEYBINDS }
             };
             let loadedData = defaultData;
             if (saved) {
                 try {
                     loadedData = JSON.parse(saved);
                     // Ensure structure integrity after loading
                     loadedData.settings = { ...defaultData.settings, ...(loadedData.settings || {}) };
                     loadedData.keybinds = { ...defaultData.keybinds, ...(loadedData.keybinds || {}) };
                     loadedData.playerName = loadedData.playerName || defaultData.playerName;
                 } catch (parseError) {
                     console.error("Failed to parse saved settings, using defaults:", parseError);
                     loadedData = defaultData; // Use defaults if parsing fails
                 }
             }
             console.log("[GameClient] Loaded settings from localStorage:", loadedData);
             return loadedData; // Return the full structure
        } catch (e) {
            console.error("Failed to load settings:", e);
            return { // Return defaults on error
                 settings: { graphics: 'medium', audio: 'medium' },
                 playerName: '',
                 keybinds: { ...Constants.DEFAULT_KEYBINDS }
             };
        }
    }
    savePlayerName(name) {
         try {
             const cleanName = (name || '').trim().substring(0, 16);
             const currentSettings = this.loadSettings(); // Load existing settings
             if (currentSettings.playerName !== cleanName) {
                 currentSettings.playerName = cleanName;
                 localStorage.setItem(Constants.LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(currentSettings)); // Save updated object
                 console.log(`[GameClient] Saved player name: ${cleanName}`);
                 if (this.localPlayerState) this.localPlayerState.name = cleanName; // Update current state
                 if (this.networkManager?.isConnected && this.clientId) {
                    this.networkManager.sendSetNameRequest(cleanName); // Send to server
                 }
             }
         } catch (e) { console.error("Failed to save player name:", e); }
    }
    loadPlayerName() {
         // Name is now loaded as part of loadSettings
         return this.loadSettings().playerName;
    }

    // --- Error Handling & Cleanup ---
    _initializationError(message, error = null) {
        console.error(`[GameClient] Fatal Init Error: ${message}`, error || '');
        if (this.uiManager) { this.uiManager.updateConnectionStatus(`Error: Init Failed`, "error"); }
        else { document.body.innerHTML = `<div style="color: red; padding: 20px;"><h1>Init Error</h1><p>${message}</p><pre>${error ? error.stack || error : ''}</pre></div>`; }
        this.dispose(); return false;
    }
    dispose() {
        if (this.isDisposed) return;
        console.log("[GameClient] Disposing client resources...");
        this.isDisposed = true;
        this.isGameRunningState = false;
        this.networkManager?.disconnect();
        this.graphicsManager?.dispose();
        this.inputManager?.dispose();
        // UIManager doesn't need explicit dispose if it only adds/removes listeners managed by InputManager
        console.log("[GameClient] Disposal complete.");
    }
}

// --- Entry Point ---
window.addEventListener('DOMContentLoaded', () => {
    let gameClient = null;
    try { gameClient = new GameClient(); }
    catch (error) {
        console.error("Failed to initialize GameClient:", error);
        // Display error if THREE failed or constructor threw
        if (!document.getElementById('game-canvas')) { // Check if basic HTML is there
             document.body.innerHTML = `<div style="color: red; padding: 20px;"><h1>Initialization Error</h1><p>Failed to start the game client. Check console (F12).</p><pre>${error.stack || error}</pre></div>`;
        }
    }
    window.addEventListener('beforeunload', () => { gameClient?.dispose(); });
});
