import { Room } from './room.js';

// Cliente de red con tres transportes y el mismo protocolo de mensajes:
//  - 'p2p-host': la sala vive en este navegador; los demás se conectan por WebRTC (PeerJS).
//  - 'p2p':      invitado WebRTC conectado al navegador del anfitrión.
//  - 'lan':      WebSocket contra server.js (red local sin internet).
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const PEER_PREFIX = 'ringfall-v1-';
const TIMEOUT = 15000;
const HEARTBEAT = 2000; // ms entre pings
const SILENCE = 9000; // ms sin mensajes = conexión perdida

export const BUILD = '1.4.0';
export const DEBUG = new URLSearchParams(location.search).has('debug');

export const makeCode = () => Array.from({ length: 5 }, () => CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0]).join('');
export const normalizeCode = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);

// Opciones del servidor de emparejamiento: por defecto el público de PeerJS.
// Para uno propio: ?peerhost=mi-equipo&peerport=9000&peerpath=/
const ICE = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      // Relés públicos de PeerJS (UDP y TCP) por si la red aísla los equipos entre sí.
      urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478', 'turn:eu-0.turn.peerjs.com:3478?transport=tcp', 'turn:us-0.turn.peerjs.com:3478?transport=tcp'],
      username: 'peerjs',
      credential: 'peerjsp',
    },
  ],
  sdpSemantics: 'unified-plan',
};

function peerOptions() {
  const q = new URLSearchParams(location.search);
  const o = { debug: DEBUG ? 2 : 0, config: ICE };
  if (q.get('peerhost')) {
    o.host = q.get('peerhost');
    o.port = Number(q.get('peerport') || 9000);
    o.path = q.get('peerpath') || '/';
    o.secure = q.get('peersecure') === '1';
  }
  return o;
}

// Mensaje según la fase en la que se agota el tiempo.
const STUCK = {
  broker: 'No se pudo contactar con el servidor de emparejamiento. Comprueba internet; en Brave, baja los escudos para esta página',
  room: 'La sala no responde. Comprueba el código y que el anfitrión siga con la sala abierta',
  ice: 'No se pudo abrir la conexión directa entre los equipos. En Brave, baja los escudos para esta página o prueba con Chrome/Edge',
};

const PEER_ERRORS = {
  'peer-unavailable': 'Sala no encontrada. Revisa el código',
  'unavailable-id': 'Ese código ya está en uso',
  network: 'No se pudo contactar con el servidor de emparejamiento (hace falta internet para crear o unirse a una sala)',
  'server-error': 'El servidor de emparejamiento no responde',
  'socket-error': 'El servidor de emparejamiento no responde',
  'browser-incompatible': 'Este navegador no admite WebRTC',
  webrtc: 'Fallo de WebRTC',
};

export class Net {
  constructor() {
    this.link = null;
    this.peer = null;
    this.room = null;
    this.handlers = new Map();
    this.guests = new Set();
    this.reset();
  }

  reset() {
    this.id = null;
    this.hostId = null;
    this.mode = 'coop';
    this.state = 'lobby';
    this.scoreLimit = 15;
    this.players = new Map();
    this.ping = 0;
    this.kind = null;
    this.code = null;
  }

  get active() {
    return this.id !== null && !!this.link?.open();
  }

  get isHost() {
    return this.active && this.id === this.hostId;
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(fn);
  }

  emit(type, msg) {
    for (const fn of this.handlers.get(type) ?? []) fn(msg);
  }

  // Espera la bienvenida de la sala; rechaza si falla antes.
  waitWelcome() {
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      this.pendingTimer = setTimeout(() => this.fail(new Error(STUCK[this.phase] ?? 'Tiempo de espera agotado')), TIMEOUT);
    });
  }

  fail(err) {
    if (DEBUG) console.warn('[ringfall] fallo en fase', this.phase, err);
    clearTimeout(this.pendingTimer);
    const p = this.pending;
    this.pending = null;
    this.teardown();
    p?.reject(err);
  }

  // Conexión perdida después de haber entrado.
  lost(reason) {
    const was = this.id !== null;
    this.teardown();
    if (this.pending) this.fail(new Error(reason));
    else if (was) this.emit('disconnect', { reason });
  }

  // Latido: WebRTC puede tardar mucho en notar que el otro lado cerró la pestaña.
  startHeartbeat() {
    clearInterval(this.beat);
    this.lastRecv = performance.now();
    this.beat = setInterval(() => {
      const now = performance.now();
      this.send('ping', { ts: now });
      if (this.kind !== 'p2p-host' && now - this.lastRecv > SILENCE) this.lost('Se perdió la conexión con el anfitrión');
      if (this.kind === 'p2p-host') {
        for (const c of this.guests) if (now - c.lastSeen > SILENCE) c.drop();
      }
    }, HEARTBEAT);
  }

  teardown() {
    clearInterval(this.beat);
    this.guests = new Set();
    const link = this.link, peer = this.peer;
    this.link = null;
    this.peer = null;
    this.room = null;
    this.reset();
    try { link?.close(); } catch { /* ya cerrado */ }
    try { peer?.destroy(); } catch { /* ya destruido */ }
  }

  progress(phase, text) {
    this.phase = phase;
    this.emit('progress', { phase, text });
  }

  // --- Transportes ---
  hostP2P(name) {
    if (!window.Peer) return Promise.reject(new Error('No se pudo cargar PeerJS'));
    const done = this.waitWelcome();
    const code = makeCode();
    const room = (this.room = new Room({ fixedHost: true }));
    const peer = (this.peer = new window.Peer(PEER_PREFIX + code, peerOptions()));
    this.kind = 'p2p-host';
    this.progress('broker', 'Conectando con el servidor de emparejamiento…');
    // El propio anfitrión entra a la sala sin red (entrega asíncrona para evitar reentradas).
    const self = { send: (m) => queueMicrotask(() => this.handle(m)), close() {} };
    this.link = { send: (m) => room.message(self, m), close: () => room.leave(self), open: () => !!this.peer && !this.peer.destroyed };

    peer.on('open', () => {
      this.code = code;
      this.link.send({ t: 'hello', name, skin: this.skin });
    });
    peer.on('connection', (dc) => {
      const conn = {
        lastSeen: performance.now(),
        send: (m) => { if (dc.open) dc.send(m); },
        close: () => dc.close(),
        drop: () => { this.guests.delete(conn); room.leave(conn); try { dc.close(); } catch { /* cerrado */ } },
      };
      this.guests.add(conn);
      dc.on('data', (m) => { conn.lastSeen = performance.now(); room.message(conn, m); });
      dc.on('close', () => conn.drop());
      dc.on('error', () => conn.drop());
    });
    // Si se cae el servidor de emparejamiento, las conexiones ya hechas siguen; reintenta para nuevas.
    peer.on('disconnected', () => { if (!peer.destroyed) setTimeout(() => { if (!peer.destroyed) peer.reconnect(); }, 2000); });
    peer.on('error', (e) => {
      if (this.id === null) this.fail(new Error(this.explain(e)));
    });
    return done;
  }

  explain(e) {
    const msg = PEER_ERRORS[e.type] ?? e.message;
    return DEBUG ? `${msg} [${e.type}: ${e.message}]` : msg;
  }

  joinP2P(name, code) {
    if (!window.Peer) return Promise.reject(new Error('No se pudo cargar PeerJS'));
    const done = this.waitWelcome();
    const peer = (this.peer = new window.Peer(peerOptions()));
    this.kind = 'p2p';
    this.progress('broker', 'Conectando con el servidor de emparejamiento…');
    peer.on('open', () => {
      this.progress('room', `Buscando la sala ${normalizeCode(code)}…`);
      const dc = peer.connect(PEER_PREFIX + normalizeCode(code), { serialization: 'json', reliable: true });
      dc.on('iceStateChanged', (st) => {
        if (st === 'checking' && this.id === null) this.progress('ice', 'Sala encontrada. Abriendo conexión directa…');
        if (st === 'failed' && this.id === null) this.fail(new Error(STUCK.ice));
      });
      this.link = { send: (m) => { if (dc.open) dc.send(m); }, close: () => dc.close(), open: () => dc.open };
      dc.on('open', () => dc.send({ t: 'hello', name, skin: this.skin }));
      dc.on('data', (m) => this.handle(m));
      dc.on('close', () => this.lost('El anfitrión cerró la sala o se perdió la conexión'));
      dc.on('error', () => {
        if (this.id === null) this.fail(new Error(STUCK[this.phase] ?? STUCK.ice));
        else this.lost('Se perdió la conexión con el anfitrión');
      });
    });
    peer.on('error', (e) => {
      if (this.id === null) this.fail(new Error(this.explain(e)));
    });
    return done;
  }

  joinLan(name) {
    const done = this.waitWelcome();
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    let ws;
    try { ws = new WebSocket(`${proto}//${location.host}/ws`); } catch (e) { this.fail(e); return done; }
    this.kind = 'lan';
    this.link = { send: (m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); }, close: () => ws.close(), open: () => ws.readyState === 1 };
    ws.onopen = () => this.link.send({ t: 'hello', name, skin: this.skin });
    ws.onerror = () => {};
    ws.onclose = () => { if (this.link?.close && this.kind === 'lan') this.lost('Se perdió la conexión con el servidor'); };
    ws.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      this.handle(m);
    };
    return done;
  }

  handle(m) {
    this.lastRecv = performance.now();
    if (m.t === 'welcome') {
      this.id = m.id;
      this.startHeartbeat();
      clearTimeout(this.pendingTimer);
      const p = this.pending;
      this.pending = null;
      queueMicrotask(() => p?.resolve(m));
    }
    if (m.t === 'error') {
      this.fail(new Error(m.msg));
      return;
    }
    if (m.t === 'welcome' || m.t === 'lobby') {
      this.players = new Map(m.players.map((p) => [p.id, p]));
      this.hostId = m.hostId;
      this.mode = m.mode;
      this.state = m.state;
      this.scoreLimit = m.scoreLimit;
    } else if (m.t === 'join') {
      this.players.set(m.player.id, m.player);
    } else if (m.t === 'leave') {
      this.players.delete(m.id);
      this.hostId = m.hostId;
    } else if (m.t === 'start') {
      this.state = 'playing';
      this.mode = m.mode;
      this.hostId = m.hostId;
      this.players = new Map(m.players.map((p) => [p.id, p]));
    } else if (m.t === 'feed' || m.t === 'matchEnd') {
      for (const p of m.players) this.players.set(p.id, p);
      if (m.t === 'matchEnd') this.state = 'lobby';
    } else if (m.t === 'pong') {
      this.ping = performance.now() - m.ts;
    }
    this.emit(m.t, m);
  }

  send(t, data = {}) {
    this.link?.send({ t, ...data });
  }

  // A todos los demás.
  bcast(t, data = {}) {
    this.send('b', { m: { t, ...data } });
  }

  // A un jugador concreto.
  to(id, t, data = {}) {
    this.send('to', { to: id, m: { t, ...data } });
  }

  setSkin(skin) {
    this.skin = skin;
    if (this.active) this.send('skin', { skin });
  }

  disconnect() {
    this.pending = null;
    clearTimeout(this.pendingTimer);
    this.teardown();
  }

  name(id) {
    return this.players.get(id)?.name ?? '???';
  }
}

export const v3 = (v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];
