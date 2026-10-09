// Lógica de la sala multijugador, sin dependencias de navegador ni de Node.
// La usan server.js (LAN con Node) y el navegador del anfitrión (P2P con WebRTC).
// conn: { send(obj), close(), player? }
import { sanitizeSkin } from './skins.js';
import { DEFAULT_MAP, isMap } from './mapinfo.js';
import { MODES, MODE_NAMES, VARIANTS, defaultRules, sanitizeRules } from './rules.js';

const TIMEUP_GRACE = 4000; // ms que espera la sala el resumen del anfitrión al acabarse el tiempo (coop)

export const COLORS = ['#3ad0ff', '#ff5a5a', '#7dff6a', '#ffc23a', '#c77dff', '#ff8ad8', '#5affd6', '#f0f0f0'];

export class Room {
  // fixedHost: P2P — la sala vive en el navegador del primer jugador, que no cambia.
  constructor({ maxPlayers = 8, scoreLimit = 15, fixedHost = false, log = () => {} } = {}) {
    this.maxPlayers = maxPlayers;
    this.scoreLimit = scoreLimit;
    this.fixedHost = fixedHost;
    this.log = log;
    this.players = new Map();
    this.nextId = 1;
    this.hostId = null;
    this.mode = 'coop';
    this.map = DEFAULT_MAP;
    this.rules = this.defaults('coop');
    this.state = 'lobby';
    this.endsAt = 0;
    this.timers = [];
  }

  defaults(mode, variant) {
    return defaultRules(mode, variant, { scoreLimit: this.scoreLimit });
  }

  // ms restantes de partida (0 = sin límite).
  timeLeft() {
    return this.state === 'playing' && this.endsAt ? Math.max(1, this.endsAt - Date.now()) : 0;
  }

  clearTimers() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    this.endsAt = 0;
  }

  // Límite de tiempo: en DM gana quien más bajas tenga (empate = sin ganador); en coop el anfitrión envía el resumen.
  timeUp() {
    if (this.state !== 'playing') return;
    if (this.mode === 'dm') {
      const [a, b] = [...this.players.values()].sort((x, y) => y.kills - x.kills);
      this.endMatch(a && (!b || a.kills > b.kills) ? a.id : null, null, true);
      return;
    }
    this.players.get(this.hostId)?.conn.send({ t: 'timeUp' });
    this.timers.push(setTimeout(() => this.endMatch(null, null, true), TIMEUP_GRACE));
  }

  pub(p) {
    return { id: p.id, name: p.name, color: p.color, skin: p.skin, kills: p.kills, deaths: p.deaths };
  }

  roster() {
    return [...this.players.values()].map((p) => this.pub(p));
  }

  lobbyMsg() {
    return { t: 'lobby', players: this.roster(), hostId: this.hostId, mode: this.mode, map: this.map, rules: this.rules, state: this.state, timeLeft: this.timeLeft() };
  }

  broadcast(msg, exceptId) {
    for (const p of this.players.values()) if (p.id !== exceptId) p.conn.send(msg);
  }

  endMatch(winner, summary, timeUp = false) {
    if (this.state !== 'playing') return;
    this.clearTimers();
    this.state = 'lobby';
    this.broadcast({ t: 'matchEnd', mode: this.mode, winner, summary: summary ?? null, timeUp: timeUp || !!summary?.timeUp, players: this.roster() });
    this.broadcast(this.lobbyMsg());
    this.log(`Fin de partida${winner ? ` · ganador: ${this.players.get(winner)?.name}` : ''}`);
  }

  join(conn, m) {
    if (this.players.size >= this.maxPlayers) {
      conn.send({ t: 'error', msg: 'Partida llena' });
      conn.close();
      return;
    }
    const name = String(m.name ?? '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 16) || `Jugador${this.nextId}`;
    const used = new Set([...this.players.values()].map((p) => p.color));
    const p = { id: this.nextId++, name, color: COLORS.find((c) => !used.has(c)) ?? COLORS[0], skin: sanitizeSkin(m.skin), conn, kills: 0, deaths: 0 };
    this.players.set(p.id, p);
    conn.player = p;
    if (this.hostId === null) this.hostId = p.id;
    conn.send({ ...this.lobbyMsg(), t: 'welcome', id: p.id });
    this.broadcast({ t: 'join', player: this.pub(p) }, p.id);
    this.broadcast(this.lobbyMsg(), p.id);
    this.log(`+ ${name} (#${p.id}) · ${this.players.size} jugador(es)`);
  }

  message(conn, m) {
    if (!m || typeof m.t !== 'string') return;
    const me = conn.player;
    if (!me) {
      if (m.t === 'hello') this.join(conn, m);
      return;
    }
    switch (m.t) {
      case 'st': // estado del jugador → resto
        this.broadcast({ ...m, id: me.id }, me.id);
        break;
      case 'b': // difusión genérica
        if (m.m && typeof m.m.t === 'string') this.broadcast({ ...m.m, from: me.id }, me.id);
        break;
      case 'to': { // mensaje directo
        const target = this.players.get(m.to);
        if (target && m.m && typeof m.m.t === 'string') target.conn.send({ ...m.m, from: me.id });
        break;
      }
      case 'mode': // cambiar de modo conserva la variante si existe en el nuevo modo
        if (me.id === this.hostId && this.state === 'lobby' && MODES.includes(m.mode) && m.mode !== 'sp') {
          this.mode = m.mode;
          this.rules = this.defaults(m.mode, this.rules.variant);
          this.broadcast(this.lobbyMsg());
        }
        break;
      case 'rules':
        if (me.id === this.hostId && this.state === 'lobby') {
          this.rules = sanitizeRules(this.mode, m.rules, { scoreLimit: this.scoreLimit });
          this.broadcast(this.lobbyMsg());
        }
        break;
      case 'map':
        if (me.id === this.hostId && this.state === 'lobby' && isMap(m.map)) {
          this.map = m.map;
          this.broadcast(this.lobbyMsg());
        }
        break;
      case 'start':
        if (me.id === this.hostId && this.state === 'lobby') {
          this.state = 'playing';
          for (const p of this.players.values()) { p.kills = 0; p.deaths = 0; }
          this.clearTimers();
          const limit = this.rules.timeLimit * 60000;
          if (limit) {
            this.endsAt = Date.now() + limit;
            this.timers.push(setTimeout(() => this.timeUp(), limit));
          }
          this.broadcast({ t: 'start', mode: this.mode, map: this.map, rules: this.rules, timeLeft: this.timeLeft(), hostId: this.hostId, players: this.roster() });
          this.log(`Partida iniciada · ${MODE_NAMES[this.mode]} · ${VARIANTS[this.rules.variant].name} · ${this.map}`);
        }
        break;
      case 'kill': { // DM: la víctima informa de su muerte
        if (this.state !== 'playing' || this.mode !== 'dm') break;
        const killer = this.players.get(m.killer);
        const valid = killer && killer !== me;
        me.deaths++;
        if (valid) killer.kills++;
        else me.kills--; // suicidio
        this.broadcast({ t: 'feed', killer: valid ? killer.id : null, victim: me.id, head: !!m.head, players: this.roster() });
        if (valid && killer.kills >= this.rules.scoreLimit) this.endMatch(killer.id);
        break;
      }
      case 'end': // coop: el anfitrión cierra la partida
        if (me.id === this.hostId && this.state === 'playing') this.endMatch(null, m.summary);
        break;
      case 'skin': // cambio de armadura (se aplica en la siguiente partida)
        me.skin = sanitizeSkin(m.skin);
        this.broadcast(this.lobbyMsg());
        break;
      case 'ping':
        conn.send({ t: 'pong', ts: m.ts });
        break;
      default:
        break;
    }
  }

  leave(conn) {
    const p = conn.player;
    if (!p || !this.players.has(p.id)) return;
    this.players.delete(p.id);
    if (p.id === this.hostId && !this.fixedHost) this.hostId = this.players.size ? Math.min(...this.players.keys()) : null;
    if (!this.players.size) { this.clearTimers(); this.state = 'lobby'; }
    this.broadcast({ t: 'leave', id: p.id, hostId: this.hostId });
    this.broadcast(this.lobbyMsg());
    this.log(`- ${p.name} (#${p.id}) · ${this.players.size} jugador(es)`);
  }
}
