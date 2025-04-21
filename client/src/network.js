// client/js/network.js

import { Constants } from './constants.js';

/**
 * Manages WebSocket connection and message handling.
 */
export class NetworkManager {
    constructor(serverUrl, gameCallbacks) {
        if (!serverUrl) throw new Error("[NetworkManager] Server URL must be provided.");
        this.serverUrl = serverUrl;
        this.ws = null;
        this.isConnected = false;
        this.playerId = null;
        this.latency = 0;
        this.pingStartTime = 0;
        this.pingIntervalId = null;

        // Define callbacks with defaults
        this.callbacks = {
            onConnect: gameCallbacks.onConnect || (() => {}),
            onDisconnect: gameCallbacks.onDisconnect || (() => {}),
            onError: gameCallbacks.onError || ((error) => console.error("[Network Default Error]", error)),
            onInit: gameCallbacks.onInit || ((data) => {}),
            onStateUpdate: gameCallbacks.onStateUpdate || ((state) => {}),
            onPlayerJoin: gameCallbacks.onPlayerJoin || ((data) => {}),
            onPlayerLeave: gameCallbacks.onPlayerLeave || ((data) => {}),
            onPlayerHit: gameCallbacks.onPlayerHit || ((data) => {}),
            onPlayerDied: gameCallbacks.onPlayerDied || ((data) => {}),
            onPlayerRespawn: gameCallbacks.onPlayerRespawn || ((data) => {}),
            onPlayerShoot: gameCallbacks.onPlayerShoot || ((data) => {}), // Server confirms/broadcasts shot
            onChatMessage: gameCallbacks.onChatMessage || ((data) => {}),
            onWeaponSwitchConfirm: gameCallbacks.onWeaponSwitchConfirm || ((data) => {}), // Server confirms weapon switch
        };
        console.log(`[NetworkManager] Initialized for server: ${serverUrl}`);
    }

    /** Attempts connection */
    connect() {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
        console.log(`[NetworkManager] Connecting to ${this.serverUrl}...`);
        try {
            this.ws = new WebSocket(this.serverUrl);
            this.ws.onopen = this._onOpen.bind(this);
            this.ws.onmessage = this._onMessage.bind(this);
            this.ws.onclose = this._onClose.bind(this);
            this.ws.onerror = this._onError.bind(this);
        } catch (error) {
            console.error("[NetworkManager] WebSocket creation failed:", error);
            this.callbacks.onError("WebSocket creation failed.");
            this.isConnected = false;
        }
    }

    /** Disconnects */
    disconnect() {
        if (this.ws) {
            console.log("[NetworkManager] Disconnecting...");
            this.stopPinging();
            this.ws.close(1000, "Client disconnect");
        }
    }

    /** Internal: Handle connection open */
    _onOpen() {
        console.log("[NetworkManager] WebSocket connection established.");
        this.isConnected = true;
        this.callbacks.onConnect();
        this.startPinging();
    }

    /** Internal: Handle received message */
    _onMessage(event) {
        try {
            const message = JSON.parse(event.data);
            // Delegate handling to specific callbacks based on type
            switch (message.type) {
                case Constants.MSG_INIT:
                    this.playerId = message.payload?.self?.id;
                    console.log(`[NetworkManager] Init received. Player ID: ${this.playerId}`);
                    this.callbacks.onInit(message.payload);
                    break;
                case Constants.MSG_GAME_STATE_UPDATE:
                    this.callbacks.onStateUpdate(message.payload);
                    break;
                case Constants.MSG_PLAYER_JOIN:
                    if (message.payload?.id !== this.playerId) this.callbacks.onPlayerJoin(message.payload);
                    break;
                case Constants.MSG_PLAYER_LEAVE:
                    this.callbacks.onPlayerLeave(message.payload);
                    break;
                case Constants.MSG_PONG:
                    this.latency = Date.now() - this.pingStartTime;
                    break;
                case Constants.MSG_CHAT_BROADCAST:
                    this.callbacks.onChatMessage(message.payload);
                    break;
                case Constants.MSG_PLAYER_HIT:
                     this.callbacks.onPlayerHit(message.payload);
                     break;
                 case Constants.MSG_PLAYER_DIED:
                     this.callbacks.onPlayerDied(message.payload);
                     break;
                 case Constants.MSG_PLAYER_RESPAWN:
                     this.callbacks.onPlayerRespawn(message.payload);
                     break;
                case Constants.MSG_PLAYER_SHOOT:
                     this.callbacks.onPlayerShoot(message.payload);
                     break;
                case Constants.MSG_WEAPON_SWITCH_CONFIRM: // Handle server confirming weapon switch
                     this.callbacks.onWeaponSwitchConfirm(message.payload);
                     break;
                default:
                    console.warn(`[NetworkManager] Unhandled message type: ${message.type}`);
            }
        } catch (error) {
            console.error("[NetworkManager] Error processing message:", error, "Data:", event.data);
            this.callbacks.onError("Failed to process server message.");
        }
    }

    /** Internal: Handle connection close */
    _onClose(event) {
        console.log(`[NetworkManager] WebSocket closed. Code: ${event.code}, Clean: ${event.wasClean}`);
        const wasConnected = this.isConnected;
        this.isConnected = false; this.playerId = null; this.ws = null;
        this.stopPinging();
        if (wasConnected) this.callbacks.onDisconnect(event.code, event.reason, event.wasClean);
    }

    /** Internal: Handle connection error */
    _onError(event) {
        console.error("[NetworkManager] WebSocket error:", event);
        this.callbacks.onError("WebSocket communication error.");
        // Ensure cleanup if close doesn't follow error
        if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
             try { this.ws.close(1006); } catch(e){} // Force close if possible
        }
         this.isConnected = false; this.playerId = null; this.ws = null;
         this.stopPinging();
    }

    /** Sends a generic message */
    sendMessage(type, payload = {}) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
        try {
            this.ws.send(JSON.stringify({ type, payload }));
            return true;
        } catch (error) {
            console.error(`[NetworkManager] Fail send ${type}:`, error);
            this.callbacks.onError(`Fail send ${type}`);
            return false;
        }
    }

    /** Sends player state update */
    sendPlayerUpdate(playerState, inputFlags, inputSeq) {
        this.sendMessage(Constants.MSG_PLAYER_UPDATE, {
            position: { x: playerState.position.x, y: playerState.position.y, z: playerState.position.z },
            rotation: { y: playerState.rotation.y }, // Only send Y rotation usually
            movingForward: inputFlags.movingForward,
            movingBackward: inputFlags.movingBackward,
            turningLeft: inputFlags.turningLeft,
            turningRight: inputFlags.turningRight,
            isShooting: inputFlags.isShooting,
            // Include jump request if needed, or handle via separate message
            // isJumpingRequest: inputFlags.jumpRequested, // Add if server needs explicit jump signal this way
            inputSeq: inputSeq
        });
    }

    /** Sends shoot request */
    sendShootRequest(direction) {
         if (!direction) return;
         this.sendMessage(Constants.MSG_SHOOT_REQUEST, { direction });
    }

     /** Sends jump request */
     sendJumpRequest() {
         this.sendMessage(Constants.MSG_JUMP_REQUEST);
     }

     /** Sends weapon switch request */
     sendWeaponSwitchRequest() {
         this.sendMessage(Constants.MSG_WEAPON_SWITCH_REQUEST);
     }

     /** Sends request to update player name */
     sendSetNameRequest(name) {
         this.sendMessage(Constants.MSG_SET_NAME_REQUEST, { name });
     }


    /** Sends chat message */
    sendChatMessage(text) {
        if (!text || text.trim().length === 0) return;
        this.sendMessage(Constants.MSG_CHAT_MESSAGE, { text });
    }

    /** Starts pinging */
    startPinging() {
        if (this.pingIntervalId) return;
        this.pingIntervalId = setInterval(() => {
            if (this.isConnected) {
                this.pingStartTime = Date.now();
                this.sendMessage(Constants.MSG_PING, this.pingStartTime);
            } else {
                this.stopPinging();
            }
        }, Constants.PING_INTERVAL);
        // console.log(`[NetworkManager] Pinging every ${Constants.PING_INTERVAL} ms.`);
    }

    /** Stops pinging */
    stopPinging() {
        if (this.pingIntervalId) {
            clearInterval(this.pingIntervalId);
            this.pingIntervalId = null;
            this.latency = 0;
            // console.log("[NetworkManager] Stopped pinging.");
        }
    }

    /** Gets latency */ getLatency() { return this.latency; }
    /** Gets connection status */ isConnected() { return this.isConnected; }
    /** Gets player ID */ getPlayerId() { return this.playerId; }

} // End NetworkManager Class