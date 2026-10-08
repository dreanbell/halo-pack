#!/usr/bin/env node
// Servidor LAN de Ringfall: sirve el juego por HTTP y retransmite mensajes por WebSocket.
// Sin dependencias (Node >= 18). Uso: node server.js [puerto]
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const PORT = Number(process.env.PORT || process.argv[2] || 8080);
const ROOT = __dirname;
const MAX_PLAYERS = 8;
const SCORE_LIMIT = 15;
const MAX_FRAME = 1 << 20;
const COLORS = ['#3ad0ff', '#ff5a5a', '#7dff6a', '#ffc23a', '#c77dff', '#ff8ad8', '#5affd6', '#f0f0f0'];
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8',
};

// --- HTTP estático -----------------------------------------------------------
const server = http.createServer((req, res) => {
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
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

  sendText(text) { this.frame(0x1, Buffer.from(text, 'utf8')); }
  send(obj) { this.sendText(JSON.stringify(obj)); }

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
const players = new Map();
let nextId = 1;
let hostId = null;
let mode = 'coop';
let state = 'lobby';

const pub = (p) => ({ id: p.id, name: p.name, color: p.color, kills: p.kills, deaths: p.deaths });
const roster = () => [...players.values()].map(pub);
const lobbyMsg = () => ({ t: 'lobby', players: roster(), hostId, mode, state, scoreLimit: SCORE_LIMIT });

function broadcast(msg, exceptId) {
  const text = JSON.stringify(msg);
  for (const p of players.values()) if (p.id !== exceptId) p.conn.sendText(text);
}

function pickHost() {
  hostId = players.size ? Math.min(...players.keys()) : null;
}

function endMatch(winner, summary) {
  state = 'lobby';
  broadcast({ t: 'matchEnd', mode, winner, summary: summary ?? null, players: roster() });
  broadcast(lobbyMsg());
  log(`Fin de partida${winner ? ` · ganador: ${players.get(winner)?.name}` : ''}`);
}

function join(conn, m) {
  if (players.size >= MAX_PLAYERS) { conn.send({ t: 'error', msg: 'Partida llena' }); conn.close(); return; }
  const name = String(m.name ?? '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 16) || `Jugador${nextId}`;
  const used = new Set([...players.values()].map((p) => p.color));
  const p = {
    id: nextId++, name, color: COLORS.find((c) => !used.has(c)) ?? COLORS[0],
    conn, kills: 0, deaths: 0,
  };
  players.set(p.id, p);
  conn.player = p;
  if (hostId === null) hostId = p.id;
  conn.send({ ...lobbyMsg(), t: 'welcome', id: p.id });
  broadcast({ t: 'join', player: pub(p) }, p.id);
  broadcast(lobbyMsg(), p.id);
  log(`+ ${name} (#${p.id}) · ${players.size} jugador(es)`);
}

function onMessage(conn, raw) {
  let m;
  try { m = JSON.parse(raw); } catch { return; }
  if (!m || typeof m.t !== 'string') return;
  const me = conn.player;
  if (!me) { if (m.t === 'hello') join(conn, m); return; }

  switch (m.t) {
    case 'st': // estado del jugador → resto
      m.id = me.id;
      broadcast(m, me.id);
      break;
    case 'b': // difusión genérica
      if (m.m && typeof m.m.t === 'string') broadcast({ ...m.m, from: me.id }, me.id);
      break;
    case 'to': { // mensaje directo
      const target = players.get(m.to);
      if (target && m.m && typeof m.m.t === 'string') target.conn.send({ ...m.m, from: me.id });
      break;
    }
    case 'mode':
      if (me.id === hostId && state === 'lobby' && (m.mode === 'coop' || m.mode === 'dm')) {
        mode = m.mode;
        broadcast(lobbyMsg());
      }
      break;
    case 'start':
      if (me.id === hostId && state === 'lobby') {
        state = 'playing';
        for (const p of players.values()) { p.kills = 0; p.deaths = 0; }
        broadcast({ t: 'start', mode, hostId, players: roster() });
        log(`Partida iniciada · ${mode === 'coop' ? 'Cooperativo' : 'Todos contra todos'}`);
      }
      break;
    case 'kill': { // DM: la víctima informa de su muerte
      if (state !== 'playing' || mode !== 'dm') break;
      const killer = players.get(m.killer);
      me.deaths++;
      if (killer && killer !== me) killer.kills++;
      else me.kills--; // suicidio
      broadcast({ t: 'feed', killer: killer && killer !== me ? killer.id : null, victim: me.id, head: !!m.head, players: roster() });
      if (killer && killer !== me && killer.kills >= SCORE_LIMIT) endMatch(killer.id);
      break;
    }
    case 'end': // coop: el anfitrión cierra la partida
      if (me.id === hostId && state === 'playing') endMatch(null, m.summary);
      break;
    case 'ping':
      conn.send({ t: 'pong', ts: m.ts });
      break;
    default:
      break;
  }
}

function onClose(conn) {
  const p = conn.player;
  if (!p) return;
  players.delete(p.id);
  if (p.id === hostId) pickHost();
  if (!players.size) state = 'lobby';
  broadcast({ t: 'leave', id: p.id, hostId });
  broadcast(lobbyMsg());
  log(`- ${p.name} (#${p.id}) · ${players.size} jugador(es)${players.size ? ` · anfitrión: ${players.get(hostId)?.name}` : ''}`);
}

server.on('upgrade', (req, socket) => {
  let pathname = '';
  try { pathname = new URL(req.url, 'http://x').pathname; } catch { /* url inválida */ }
  const key = req.headers['sec-websocket-key'];
  if (pathname !== '/ws' || String(req.headers.upgrade).toLowerCase() !== 'websocket' || !key) { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
  socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${accept}`, '', ''].join('\r\n'));
  socket.setNoDelay(true);
  conns.add(new Conn(socket, onMessage, (c) => { conns.delete(c); onClose(c); }));
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
