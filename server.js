const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let peers = [];

wss.on('connection', (ws) => {
  peers.push(ws);
  console.log("New WebSocket connection");

  ws.on('message', (msg) => {
    // Relay to all other peers
    for (const peer of peers) {
      if (peer !== ws && peer.readyState === WebSocket.OPEN) {
        peer.send(msg);
      }
    }
  });

  ws.on('close', () => {
    peers = peers.filter(p => p !== ws);
    console.log("WebSocket connection closed");
  });
});

app.use(express.static('public'));

server.listen(3000, () => {
  console.log("WebRTC test server running at http://localhost:3000");
});
