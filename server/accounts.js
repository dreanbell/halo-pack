// Cuentas de jugador: créditos ◈, desbloqueos, armadura y armas guardados en el servidor (sin dependencias).
// - Contraseñas con scrypt + sal; sesiones con token aleatorio (se guarda su hash) que caduca a los 30 días.
// - El servidor decide: precios de la tienda y créditos por partida (src/shared/shop.js), con topes y esperas.
// - Datos en un JSON (por defecto data/accounts.json; RINGFALL_DATA para otra carpeta), escrito de forma atómica.
// API (JSON, CORS abierto para que el juego publicado en otra web pueda usarla), bajo /api/account/:
//   POST register {name, password, local?} · POST login {name, password} · POST logout · GET me
//   POST buy {kind, i} · POST reward {mode, kills, wave, score, won, time} · POST profile {skin?, loadout?}
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { sanitizeSkin } from '../src/shared/skins.js';
import { START_COINS, PRICES, itemPrice, matchReward } from '../src/shared/shop.js';

const SESSION_DAYS = 30;
const REWARD_GAP = 25 * 1000; // entre dos partidas cobradas
const REWARD_HOUR = 6000; // máximo de créditos por hora
const IMPORT_COINS = 2000, IMPORT_VALUE = 3000; // progreso del navegador que se puede traer al crear la cuenta
const NAME_RE = /^[a-z0-9_-]{3,16}$/i;

const scrypt = (pw, salt) => new Promise((ok, ko) => crypto.scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? ko(e) : ok(k))));
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

export function createAccounts(dir, log = () => {}) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'accounts.json');
  let db = { users: {}, sessions: {} };
  try { db = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* base nueva */ }
  db.users ??= {};
  db.sessions ??= {};

  // Escritura atómica y agrupada (como mucho una cada 300 ms).
  let saveT = null;
  const save = () => {
    if (saveT) return;
    saveT = setTimeout(() => {
      saveT = null;
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(db));
      fs.renameSync(tmp, file);
    }, 300);
  };

  // Límite de intentos por IP (registro e inicio de sesión).
  const hits = new Map();
  const limited = (ip) => {
    const now = Date.now(), h = (hits.get(ip) ?? []).filter((t) => now - t < 60000);
    h.push(now);
    hits.set(ip, h);
    return h.length > 12;
  };

  const owns = (u, kind, i) => itemPrice(kind, i) === 0 || u.owned.includes(`${kind}:${i}`);
  const profile = (u) => ({ name: u.display, coins: u.coins, owned: u.owned, earned: u.earned, skin: u.skin, loadout: u.loadout, matches: u.matches });

  function newSession(key) {
    const token = crypto.randomBytes(32).toString('hex');
    db.sessions[sha(token)] = { user: key, exp: Date.now() + SESSION_DAYS * 864e5 };
    // Limpieza de sesiones caducadas.
    for (const [k, s] of Object.entries(db.sessions)) if (s.exp < Date.now()) delete db.sessions[k];
    save();
    return token;
  }

  function userOf(req) {
    const m = /^Bearer ([0-9a-f]{64})$/.exec(req.headers.authorization ?? '');
    const s = m && db.sessions[sha(m[1])];
    if (!s || s.exp < Date.now()) return null;
    return db.users[s.user] ?? null;
  }

  // Progreso del navegador al crear la cuenta: créditos y desbloqueos, con tope (no es verificable).
  function importLocal(u, local) {
    if (!local || typeof local !== 'object') return;
    u.coins += Math.min(IMPORT_COINS, Math.max(0, Math.floor(Number(local.coins) || 0)));
    let value = 0;
    const items = (Array.isArray(local.owned) ? local.owned : []).map(String)
      .map((k) => { const [kind, i] = k.split(':'); return { k, p: itemPrice(kind, Number(i)) }; })
      .filter((x) => x.p > 0).sort((a, b) => a.p - b.p);
    for (const { k, p } of items) {
      if (value + p > IMPORT_VALUE || u.owned.includes(k)) continue;
      value += p;
      u.owned.push(k);
    }
  }

  const routes = {
    async register(req, body, ip) {
      if (limited(ip)) return [429, { error: 'Demasiados intentos. Espera un minuto.' }];
      const name = String(body.name ?? '').trim(), pw = String(body.password ?? '');
      if (!NAME_RE.test(name)) return [400, { error: 'El usuario debe tener de 3 a 16 letras, números, - o _.' }];
      if (pw.length < 6 || pw.length > 128) return [400, { error: 'La contraseña debe tener al menos 6 caracteres.' }];
      const key = name.toLowerCase();
      if (db.users[key]) return [409, { error: 'Ese usuario ya existe.' }];
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = (await scrypt(pw, salt)).toString('hex');
      const u = db.users[key] = {
        display: name, salt, hash, coins: START_COINS, owned: [], earned: 0, skin: null, loadout: null,
        matches: 0, created: Date.now(), rewards: [],
      };
      importLocal(u, body.local);
      log(`cuenta nueva: ${name}`);
      return [200, { token: newSession(key), profile: profile(u) }];
    },

    async login(req, body, ip) {
      if (limited(ip)) return [429, { error: 'Demasiados intentos. Espera un minuto.' }];
      const key = String(body.name ?? '').trim().toLowerCase(), pw = String(body.password ?? '');
      const u = db.users[key];
      // Se calcula el hash aunque el usuario no exista (mismo tiempo de respuesta).
      const hash = await scrypt(pw, u?.salt ?? 'x'.repeat(32));
      if (!u || !crypto.timingSafeEqual(hash, Buffer.from(u.hash, 'hex'))) return [401, { error: 'Usuario o contraseña incorrectos.' }];
      return [200, { token: newSession(key), profile: profile(u) }];
    },

    async logout(req) {
      const m = /^Bearer ([0-9a-f]{64})$/.exec(req.headers.authorization ?? '');
      if (m) { delete db.sessions[sha(m[1])]; save(); }
      return [200, { ok: true }];
    },

    async me(req, body, ip, u) {
      return [200, { profile: profile(u) }];
    },

    async buy(req, body, ip, u) {
      const kind = String(body.kind), i = Number(body.i), price = itemPrice(kind, i);
      if (price === null || !PRICES[kind]) return [400, { error: 'Artículo desconocido.' }];
      if (!owns(u, kind, i)) {
        if (u.coins < price) return [402, { error: 'Créditos insuficientes.', profile: profile(u) }];
        u.coins -= price;
        u.owned.push(`${kind}:${i}`);
        save();
      }
      return [200, { profile: profile(u) }];
    },

    async reward(req, body, ip, u) {
      const now = Date.now();
      u.rewards = (u.rewards ?? []).filter((r) => now - r.t < 3600e3);
      const last = u.rewards.at(-1);
      if (last && now - last.t < REWARD_GAP) return [200, { gained: 0, profile: profile(u) }];
      const hour = u.rewards.reduce((s, r) => s + r.n, 0);
      const gained = Math.max(0, Math.min(matchReward(body), REWARD_HOUR - hour));
      u.coins += gained;
      u.earned += gained;
      u.matches += 1;
      u.rewards.push({ t: now, n: gained });
      save();
      return [200, { gained, profile: profile(u) }];
    },

    async profile(req, body, ip, u) {
      if (body.skin) {
        const s = sanitizeSkin(body.skin);
        // Solo se guarda lo que tiene desbloqueado.
        for (const k of ['m', 'h', 't']) if (!owns(u, k, s[k])) s[k] = 0;
        u.skin = s;
      }
      if (Array.isArray(body.loadout) && body.loadout.length === 2 && body.loadout.every((x) => typeof x === 'string' && x.length <= 16)) u.loadout = body.loadout;
      save();
      return [200, { profile: profile(u) }];
    },
  };
  const PUBLIC = new Set(['register', 'login', 'logout']);

  // Devuelve true si atendió la petición.
  return function handle(req, res, rel) {
    if (!rel.startsWith('/api/account/')) return false;
    const cors = {
      'Access-Control-Allow-Origin': req.headers.origin || '*', 'Vary': 'Origin',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '600',
    };
    const send = (code, obj) => { res.writeHead(code, { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors).end(); return true; }
    const name = rel.slice('/api/account/'.length), route = routes[name];
    if (!route) { send(404, { error: 'No existe.' }); return true; }
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 8192) req.destroy(); });
    req.on('end', async () => {
      let body = {};
      try { body = raw ? JSON.parse(raw) : {}; } catch { send(400, { error: 'JSON inválido.' }); return; }
      const u = userOf(req);
      if (!PUBLIC.has(name) && !u) { send(401, { error: 'Sesión caducada: vuelve a iniciar sesión.' }); return; }
      try {
        const [code, obj] = await route(req, body, req.socket.remoteAddress ?? '', u);
        send(code, obj);
      } catch (e) {
        log(`cuentas: ${e.message}`);
        send(500, { error: 'Error del servidor.' });
      }
    });
    return true;
  };
}
