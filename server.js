#!/usr/bin/env node
// Servidor LAN de Ringfall: sirve el juego por HTTP y retransmite mensajes por WebSocket.
// Sin dependencias (Node >= 18). Uso: node server.js [puerto]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Room } from './src/room.js';

const PORT = Number(process.env.PORT || process.argv[2] || 8080);
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MAX_PLAYERS = 8;
const SCORE_LIMIT = 15;
const MAX_FRAME = 1 << 20;
const MIME = {
  '.mjs': 'text/javascript; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8',
};

// --- HTTP estático -----------------------------------------------------------
const server = http.createServer((req, res) => {
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
  if (rel === '/api/info') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ringfall: true, players: room.players.size, state: room.state }));
    return;
  }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(ROOT, path.normalize(rel));
  // Nada fuera del repo ni ficheros/carpetas ocultos (.git, .github…).
  if (!file.startsWith(ROOT + path.sep) || path.relative(ROOT, file).split(path.sep).some((s) => s.startsWith('.'))) {
    res.writeHead(404).end(); return;
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size, 'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(file).pipe(res);
  });
});

// --- WebSocket mínimo (RFC 6455, solo texto) ---------------------------------
class Conn {
  constructor(socket, onMessage, onClose) {
    this.socket = socket;
    this.onMessage = onMessage;
    this.onClose = onClose;
    this.buf = Buffer.alloc(0);
    this.frag = [];
    this.closed = false;
    this.lastSeen = Date.now();
    socket.on('data', (d) => { this.lastSeen = Date.now(); this.buf = Buffer.concat([this.buf, d]); this.parse(); });
    socket.on('close', () => this.finish());
    socket.on('error', () => this.finish());
  }

  parse() {
    while (!this.closed && this.buf.length >= 2) {
      const b0 = this.buf[0], b1 = this.buf[1];
      const fin = (b0 & 0x80) !== 0, op = b0 & 0x0f, masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) {
        if (this.buf.length < 4) return;
        len = this.buf.readUInt16BE(2); off = 4;
      } else if (len === 127) {
        if (this.buf.length < 10) return;
        const big = this.buf.readBigUInt64BE(2);
        if (big > BigInt(MAX_FRAME)) { this.close(1009); return; }
        len = Number(big); off = 10;
      }
      if (len > MAX_FRAME) { this.close(1009); return; }
      if (!masked) { this.close(1002); return; } // los clientes siempre enmascaran
      if (this.buf.length < off + 4 + len) return;
      const mask = this.buf.subarray(off, off + 4);
      const data = Buffer.from(this.buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < len; i++) data[i] ^= mask[i & 3];
      this.buf = this.buf.subarray(off + 4 + len);

      if (op === 0x8) { this.close(1000); return; }
      if (op === 0x9) { this.frame(0xa, data); continue; }
      if (op === 0xa) continue;
      if (op === 0x1 || op === 0x0) {
        this.frag.push(data);
        if (this.frag.reduce((n, b) => n + b.length, 0) > MAX_FRAME) { this.close(1009); return; }
        if (fin) {
          const text = Buffer.concat(this.frag).toString('utf8');
          this.frag = [];
          this.onMessage(this, text);
        }
      }
      // Binario u otros opcodes: se ignoran.
    }
  }

  frame(op, payload) {
    if (this.closed || !this.socket.writable) return;
    const n = payload.length;
    let head;
    if (n < 126) head = Buffer.from([0x80 | op, n]);
    else if (n < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(n, 2); }
    else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2); }
    this.socket.write(Buffer.concat([head, payload]));
  }

  send(obj) { this.frame(0x1, Buffer.from(JSON.stringify(obj), 'utf8')); }

  close(code = 1000) {
    if (this.closed) return;
    const b = Buffer.alloc(2);
    b.writeUInt16BE(code, 0);
    this.frame(0x8, b);
    this.socket.end();
    this.finish();
  }

  finish() {
    if (this.closed) return;
    this.closed = true;
    this.socket.destroy();
    this.onClose(this);
  }
}

// --- Sala única --------------------------------------------------------------
const room = new Room({ maxPlayers: MAX_PLAYERS, scoreLimit: SCORE_LIMIT, log });

function onMessage(conn, raw) {
  let m;
  try { m = JSON.parse(raw); } catch { return; }
  room.message(conn, m);
}

server.on('upgrade', (req, socket) => {
  let pathname = '';
  try { pathname = new URL(req.url, 'http://x').pathname; } catch { /* url inválida */ }
  const key = req.headers['sec-websocket-key'];
  if (pathname !== '/ws' || String(req.headers.upgrade).toLowerCase() !== 'websocket' || !key) { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
  socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${accept}`, '', ''].join('\r\n'));
  socket.setNoDelay(true);
  conns.add(new Conn(socket, onMessage, (c) => { conns.delete(c); room.leave(c); }));
});

// Latido: detecta clientes caídos (pestaña cerrada sin cierre limpio, Wi-Fi perdido…).
const conns = new Set();
setInterval(() => {
  const now = Date.now();
  for (const c of conns) {
    if (now - c.lastSeen > 30000) c.finish();
    else c.frame(0x9, Buffer.alloc(0));
  }
}, 10000).unref();

function log(msg) {
  console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

function lanAddresses() {
  return Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
}

server.on('error', (e) => {
  console.error(e.code === 'EADDRINUSE' ? `El puerto ${PORT} está en uso. Prueba: node server.js 8081` : e.message);
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n  RINGFALL · servidor LAN\n');
  console.log(`  En este equipo:   http://localhost:${PORT}`);
  for (const ip of lanAddresses()) console.log(`  En la red local:  http://${ip}:${PORT}`);
  console.log('\n  Comparte la dirección de red local con los demás jugadores. Ctrl+C para cerrar.\n');
});
