const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { PLAYER_DEFAULTS, GAME_SETTINGS, POWERUP_TYPES } = require('../shared/constants.js');
const { router: matchRoutes } = require('./routes/match.js');
const { router: statusRoutes, injectDataSources } = require('./routes/status.js');
const { Player } = require('./player.js');
const { addPlayer, removePlayer, getGameState, resetMatch } = require('./game_state.js');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static('client'));
app.use(matchRoutes);
app.use(statusRoutes);

injectDataSources(getGameState().players, getGameState().startTime);

io.on('connection', (socket) => {
  console.log(\Player connected: \\);
  const newPlayer = new Player(socket.id, \User\\);
  addPlayer(newPlayer);

  socket.on('disconnect', () => {
    console.log(\Player disconnected: \\);
    removePlayer(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(\Server running on port \\);
});
