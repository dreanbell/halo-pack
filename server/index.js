#!/usr/bin/env node
// Servidor LAN de Ringfall: sirve el juego por HTTP y lleva una sala multijugador por WebSocket.
// Sin dependencias (Node >= 18). Uso: node server [puerto]   (o: npm start)
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Room } from '../src/shared/room.js';
import { createStatic } from './static.js';
import { acceptWebSocket } from './ws.js';

const PORT = Number(process.env.PORT || process.argv[2] || 8080);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_PLAYERS = 8;
const SCORE_LIMIT = 15;

const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
const room = new Room({ maxPlayers: MAX_PLAYERS, scoreLimit: SCORE_LIMIT, log });
const serveStatic = createStatic(ROOT);

const server = http.createServer((req, res) => {
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
  if (rel === '/api/info') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ringfall: true, players: room.players.size, state: room.state }));
    return;
  }
  serveStatic(req, res, rel);
});

// Sala única: cada conexión WebSocket es un jugador.
const conns = new Set();
acceptWebSocket(server, '/ws',
  (c) => conns.add(c),
  (conn, raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    room.message(conn, m);
  },
  (c) => { conns.delete(c); room.leave(c); });

// Latido: detecta clientes caídos (pestaña cerrada sin cierre limpio, Wi-Fi perdido…).
setInterval(() => {
  const now = Date.now();
  for (const c of conns) {
    if (now - c.lastSeen > 30000) c.finish();
    else c.frame(0x9, Buffer.alloc(0));
  }
}, 10000).unref();

const lanAddresses = () => Object.values(os.networkInterfaces()).flat()
  .filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);

server.on('error', (e) => {
  console.error(e.code === 'EADDRINUSE' ? `El puerto ${PORT} está en uso. Prueba: node server ${PORT + 1}` : e.message);
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n  RINGFALL · servidor LAN\n');
  console.log(`  En este equipo:   http://localhost:${PORT}`);
  for (const ip of lanAddresses()) console.log(`  En la red local:  http://${ip}:${PORT}`);
  console.log('\n  Comparte la dirección de red local con los demás jugadores. Ctrl+C para cerrar.\n');
});
