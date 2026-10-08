// Cliente de red: conexión WebSocket con server.js, sala y mensajería.
export class Net {
  constructor() {
    this.ws = null;
    this.handlers = new Map();
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
  }

  get active() {
    return this.id !== null && this.ws?.readyState === WebSocket.OPEN;
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

  connect(name) {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      let ws;
      try { ws = new WebSocket(`${proto}//${location.host}/ws`); } catch (e) { reject(e); return; }
      this.ws = ws;
      const timer = setTimeout(() => { reject(new Error('Tiempo de espera agotado')); ws.close(); }, 4000);
      ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', name }));
      ws.onerror = () => {};
      ws.onclose = () => {
        clearTimeout(timer);
        const wasConnected = this.id !== null;
        if (this.ws === ws) { this.ws = null; this.reset(); }
        if (wasConnected) this.emit('disconnect', {});
        else reject(new Error('No se encontró el servidor'));
      };
      ws.onmessage = (ev) => {
        let m;
        try { m = JSON.parse(ev.data); } catch { return; }
        if (m.t === 'welcome') { clearTimeout(timer); this.id = m.id; resolve(m); }
        if (m.t === 'error') { clearTimeout(timer); reject(new Error(m.msg)); }
        this.handle(m);
      };
    });
  }

  handle(m) {
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
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t, ...data }));
  }

  // A todos los demás.
  bcast(t, data = {}) {
    this.send('b', { m: { t, ...data } });
  }

  // A un jugador concreto.
  to(id, t, data = {}) {
    this.send('to', { to: id, m: { t, ...data } });
  }

  disconnect() {
    const ws = this.ws;
    this.ws = null;
    this.reset();
    ws?.close();
  }

  name(id) {
    return this.players.get(id)?.name ?? '???';
  }
}

export const v3 = (v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];
