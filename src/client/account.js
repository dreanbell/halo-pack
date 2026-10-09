// Cuenta del jugador en el servidor de Ringfall (server/accounts.js): inicio de sesión y llamadas a la API.
// Servidor: el mismo que sirve el juego (npm start) o, si el juego está en otra web (GitHub Pages), el que se
// indique en AJUSTES/CUENTA (se guarda en el navegador) o con ?api=https://servidor.
// Servidor de cuentas por defecto para el juego publicado como web estática (p. ej. GitHub Pages):
// pon aquí la dirección del servidor desplegado (npm start / Dockerfile), p. ej. 'https://ringfall.onrender.com'.
export const DEFAULT_API = '';
const TOKEN_KEY = 'ringfall.token';
const API_KEY = 'ringfall.api';

const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* sin almacenamiento */ } };

export class Account {
  constructor() {
    const q = new URLSearchParams(location.search).get('api');
    if (q) set(API_KEY, q.replace(/\/+$/, ''));
    this.base = get(API_KEY) ?? null; // null = aún sin saber; '' = mismo origen
    this.token = get(TOKEN_KEY);
    this.profile = null;
    this.listeners = new Set();
  }

  onChange(fn) { this.listeners.add(fn); }
  emit() { for (const fn of this.listeners) fn(this); }
  get online() { return !!this.profile; }
  get available() { return this.base !== null; }

  // ¿Hay servidor de cuentas? Primero el configurado; si no, el mismo origen (cuando el juego lo sirve npm start).
  async detect() {
    for (const base of [get(API_KEY), DEFAULT_API || null, '']) {
      if (base === null) continue;
      try {
        const r = await fetch(`${base}/api/info`, { cache: 'no-store' });
        if (r.ok && (await r.json()).accounts) { this.base = base; return true; }
      } catch { /* sin servidor */ }
    }
    this.base = null;
    return false;
  }

  setServer(url) {
    url = String(url ?? '').trim().replace(/\/+$/, '');
    if (url && !/^https?:\/\//.test(url)) url = `https://${url}`;
    set(API_KEY, url || null);
    this.base = url || null;
  }

  async call(name, body) {
    if (this.base === null) throw new Error('No hay servidor de cuentas.');
    let r;
    try {
      r = await fetch(`${this.base}/api/account/${name}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new Error('No se pudo conectar con el servidor de cuentas.');
    }
    const data = await r.json().catch(() => ({}));
    if (r.status === 401 && name !== 'login') this.drop();
    if (data.profile) { this.profile = data.profile; this.emit(); }
    if (!r.ok) throw Object.assign(new Error(data.error ?? `Error ${r.status}`), { status: r.status, data });
    return data;
  }

  // Al abrir el juego: si había sesión guardada, recupera el perfil.
  async resume() {
    if (!this.token || this.base === null) return false;
    try { await this.call('me'); return true; } catch { return false; }
  }

  async register(name, password, local) {
    const d = await this.call('register', { name, password, local });
    this.keep(d.token);
    return d.profile;
  }

  async login(name, password) {
    const d = await this.call('login', { name, password });
    this.keep(d.token);
    return d.profile;
  }

  async logout() {
    try { await this.call('logout', {}); } catch { /* da igual */ }
    this.drop();
  }

  keep(token) { this.token = token; set(TOKEN_KEY, token); this.emit(); }
  drop() { this.token = null; this.profile = null; set(TOKEN_KEY, null); this.emit(); }
}
