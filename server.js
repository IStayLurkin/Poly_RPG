// server/server.js

const http = require('http');
const path = require('path');
const express = require('express');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const GameState = require('./game_state');
const ConstantsServer = require('./constants_server');
const { Constants } = require('../client/js/constants'); // Shared constants

// --- Configuration ---
const PORT = process.env.PORT || 3000;
const CLIENT_PATH = path.join(__dirname, '..', 'client');
const TICK_RATE = 30; // Ticks per second (Use value directly or from ConstantsServer)
const BROADCAST_RATE = 20; // Hz (Use value directly or from ConstantsServer)

// --- Server Setup ---
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// --- Game State Initialization ---
const gameState = new GameState(broadcast); // Pass broadcast function

// --- Express Middleware ---
app.use(express.static(CLIENT_PATH));
console.log(`[Express] Serving static files from: ${CLIENT_PATH}`);
app.get('/', (req, res) => {
    res.sendFile(path.join(CLIENT_PATH, 'index.html'));
});

// --- WebSocket Handling ---
const clients = new Map(); // Map<playerId, WebSocket>

wss.on('connection', (ws) => {
    const playerId = uuidv4();
    console.log(`[WebSocket] Client connected: ${playerId}`);
    clients.set(playerId, ws);

    gameState.addPlayer(playerId, ws);

    const initData = gameState.getInitializationData(playerId);
    if (initData) {
        sendMessage(ws, Constants.MSG_INIT, initData);
        console.log(`[WebSocket] Sent 'init' data to player ${playerId}`);
    } else {
        console.error(`[WebSocket] Failed to get init data for ${playerId}`);
        ws.close(1011, "Initialization failed"); return;
    }

    const newPlayer = gameState.getPlayer(playerId);
    if (newPlayer) {
        broadcast(JSON.stringify({ type: Constants.MSG_PLAYER_JOIN, payload: newPlayer.getNetworkState() }), playerId);
        console.log(`[WebSocket] Broadcasted 'player_join' for ${playerId}`);
    }

    // --- Message Handling ---
    ws.on('message', (messageBuffer) => {
        try {
            const messageString = messageBuffer.toString();
            if (messageString.length > 2048) {
                 console.warn(`[WebSocket] Received oversized message from ${playerId}. Size: ${messageString.length}`);
                 return;
            }
            const message = JSON.parse(messageString);
            const player = gameState.getPlayer(playerId);

            // Ignore messages from unknown players (except ping maybe)
            if (!player && message.type !== Constants.MSG_PING) {
                console.warn(`[WebSocket] Received message from unknown/removed player ${playerId}. Type: ${message.type}`);
                return;
            }

            switch (message.type) {
                case Constants.MSG_PLAYER_UPDATE:
                    // Pass the entire payload, Player class will extract relevant fields
                    gameState.updatePlayerState(playerId, message.payload);
                    break;
                case Constants.MSG_SHOOT_REQUEST:
                    if (message.payload?.direction) {
                        gameState.handleShootRequest(playerId, message.payload);
                    } else { console.warn(`[WebSocket] Invalid 'shoot_request' from ${playerId}`); }
                    break;
                case Constants.MSG_JUMP_REQUEST:
                    gameState.handleJumpRequest(playerId); // Player class handles ground check
                    break;
                case Constants.MSG_WEAPON_SWITCH_REQUEST:
                    gameState.handleWeaponSwitch(playerId);
                    break;
                 case Constants.MSG_SET_NAME:
                     if (message.payload?.name) {
                         gameState.handleNameChange(playerId, message.payload);
                     } else { console.warn(`[WebSocket] Invalid 'set_name' request from ${playerId}`); }
                     break;
                case Constants.MSG_PING:
                    sendMessage(ws, Constants.MSG_PONG, message.payload);
                    break;
                case Constants.MSG_CHAT_MESSAGE:
                    if (player && message.payload?.text) {
                         const safeText = message.payload.text.substring(0, 100);
                         console.log(`[WebSocket] Chat from ${player.playerName}: ${safeText}`);
                         broadcast(JSON.stringify({
                             type: Constants.MSG_CHAT_BROADCAST,
                             payload: { senderId: playerId, senderName: player.playerName, senderColor: player.color, text: safeText }
                         }));
                    }
                    break;
                default:
                    console.warn(`[WebSocket] Unknown message type: ${message.type} from ${playerId}`);
            }
        } catch (error) {
            if (error instanceof SyntaxError) console.error(`[WebSocket] Failed to parse JSON from ${playerId}:`, messageBuffer.toString());
            else console.error(`[WebSocket] Failed to process message from ${playerId}:`, error);
        }
    });

    // --- Close Handling ---
    ws.on('close', (code, reason) => {
        const reasonString = reason.toString();
        const playerName = gameState.getPlayer(playerId)?.playerName || playerId;
        console.log(`[WebSocket] Client disconnected: ${playerName}. Code: ${code}. Reason: ${reasonString || 'N/A'}`);
        gameState.removePlayer(playerId);
        clients.delete(playerId);
        broadcast(JSON.stringify({ type: Constants.MSG_PLAYER_LEAVE, payload: { id: playerId } }));
        console.log(`[WebSocket] Broadcasted 'player_leave' for ${playerName}`);
    });

    // --- Error Handling ---
    ws.on('error', (error) => {
        const playerName = gameState.getPlayer(playerId)?.playerName || playerId;
        console.error(`[WebSocket] Error for client ${playerName}:`, error);
        if (clients.has(playerId)) {
            gameState.removePlayer(playerId);
            clients.delete(playerId);
            broadcast(JSON.stringify({ type: Constants.MSG_PLAYER_LEAVE, payload: { id: playerId } }));
        }
        try { ws.terminate(); } catch (e) {} // Force close
    });
});

// --- Server-Side Game Loop ---
let lastTickTime = Date.now();
let accumulatedTime = 0;
const tickInterval = 1000 / TICK_RATE;
let lastBroadcastTime = Date.now();
const broadcastInterval = 1000 / BROADCAST_RATE;

function gameLoop() {
    const now = Date.now();
    const elapsed = now - lastTickTime;
    lastTickTime = now;
    accumulatedTime += elapsed;
    let updatesProcessed = 0;

    while (accumulatedTime >= tickInterval && updatesProcessed < 5) {
        gameState.update(tickInterval / 1000.0);
        accumulatedTime -= tickInterval;
        updatesProcessed++;
    }
     if (updatesProcessed >= 5) {
         console.warn("[Server Loop] Falling behind, resetting accumulated time.");
         accumulatedTime = 0;
     }

    if (now - lastBroadcastTime >= broadcastInterval) {
        const combinedState = gameState.getCombinedNetworkState();
        if (combinedState.players.length > 0 || combinedState.projectiles.length > 0 || combinedState.npcs.length > 0) {
            broadcast(JSON.stringify({ type: Constants.MSG_GAME_STATE_UPDATE, payload: combinedState }));
        }
        lastBroadcastTime = now;
    }

    const processTime = Date.now() - now;
    const timeToNextTick = Math.max(0, tickInterval - accumulatedTime - processTime);
    setTimeout(gameLoop, timeToNextTick);
}

// --- Utility Functions ---
function sendMessage(wsClient, type, payload) {
    if (wsClient?.readyState === WebSocket.OPEN) {
        try { wsClient.send(JSON.stringify({ type, payload })); }
        catch (error) { console.error(`[WebSocket] Error sending ${type}:`, error); }
    }
}
function broadcast(messageString, excludePlayerId = null) {
    clients.forEach((wsClient, playerId) => {
        if (playerId !== excludePlayerId && wsClient.readyState === WebSocket.OPEN) {
            wsClient.send(messageString, (err) => { if (err) console.error(`[WebSocket] Broadcast error to ${playerId}:`, err); });
        }
    });
}

// --- Start Server ---
server.listen(PORT, () => {
    console.log(`[Server] HTTP/WebSocket server started on port ${PORT}`);
    console.log(`[Server] Tick Rate: ${TICK_RATE} Hz, Broadcast Rate: ${BROADCAST_RATE} Hz`);
    console.log(`[Server] Access game: http://localhost:${PORT}`);
    lastTickTime = Date.now();
    gameLoop();
});

// --- Graceful Shutdown ---
process.on('SIGINT', () => {
    console.log('\n[Server] SIGINT received, shutting down...');
    wss.clients.forEach(client => client.close(1001, 'Server shutting down'));
    setTimeout(() => {
         wss.close(() => console.log('[WebSocket] Server closed.'));
         server.close(() => { console.log('[HTTP] Server closed.'); process.exit(0); });
    }, 500);
    setTimeout(() => { console.error('[Server] Shutdown timed out, forcing exit.'); process.exit(1); }, 3000);
});
