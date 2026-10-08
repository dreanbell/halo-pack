// Lógica de la sala multijugador, sin dependencias de navegador ni de Node.
// La usan server.js (LAN con Node) y el navegador del anfitrión (P2P con WebRTC).
// conn: { send(obj), close(), player? }
import { sanitizeSkin } from './skins.js';

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
    this.state = 'lobby';
  }

  pub(p) {
    return { id: p.id, name: p.name, color: p.color, skin: p.skin, kills: p.kills, deaths: p.deaths };
  }

  roster() {
    return [...this.players.values()].map((p) => this.pub(p));
  }

  lobbyMsg() {
    return { t: 'lobby', players: this.roster(), hostId: this.hostId, mode: this.mode, state: this.state, scoreLimit: this.scoreLimit };
  }

  broadcast(msg, exceptId) {
    for (const p of this.players.values()) if (p.id !== exceptId) p.conn.send(msg);
  }

  endMatch(winner, summary) {
    this.state = 'lobby';
    this.broadcast({ t: 'matchEnd', mode: this.mode, winner, summary: summary ?? null, players: this.roster() });
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
      case 'mode':
        if (me.id === this.hostId && this.state === 'lobby' && (m.mode === 'coop' || m.mode === 'dm')) {
          this.mode = m.mode;
          this.broadcast(this.lobbyMsg());
        }
        break;
      case 'start':
        if (me.id === this.hostId && this.state === 'lobby') {
          this.state = 'playing';
          for (const p of this.players.values()) { p.kills = 0; p.deaths = 0; }
          this.broadcast({ t: 'start', mode: this.mode, hostId: this.hostId, players: this.roster() });
          this.log(`Partida iniciada · ${this.mode === 'coop' ? 'Cooperativo' : 'Todos contra todos'}`);
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
        if (valid && killer.kills >= this.scoreLimit) this.endMatch(killer.id);
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
    if (!this.players.size) this.state = 'lobby';
    this.broadcast({ t: 'leave', id: p.id, hostId: this.hostId });
    this.broadcast(this.lobbyMsg());
    this.log(`- ${p.name} (#${p.id}) · ${this.players.size} jugador(es)`);
  }
}
