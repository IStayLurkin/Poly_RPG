
const express = require("express");
const http = require("http");
const path = require("path");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "..", "public")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

wss.on("connection", (ws) => {
  console.log("Client connected");
  ws.send("Hello from server!");
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
