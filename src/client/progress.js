// Progreso del jugador: nivel con XP (1-100), misiones diarias y semanales y recompensa por entrar cada día.
// Se guarda en el navegador (ringfall.progress) y viaja en el código de respaldo. Las recompensas van al monedero
// local (créditos y cajas gratis). Los días y semanas son los del reloj del dispositivo.
const KEY = 'ringfall.progress';
export const MAX_LEVEL = 100;
export const xpToNext = (lv) => 500 + 100 * Math.min(lv - 1, 40); // 500 → 4 500 xp por nivel

// Recompensa al alcanzar un nivel: créditos y, cada 5 niveles, una caja gratis (c = índice de CASES).
export function levelReward(lv) {
  const r = { coins: 100 + 10 * lv, box: null };
  if (lv % 25 === 0) r.box = 3;
  else if (lv % 10 === 0) r.box = 1;
  else if (lv % 5 === 0) r.box = 0;
  return r;
}

// Requisitos de los títulos (mismo orden que TITLES en src/shared/skins.js).
export const TITLE_REQ = [
  { lv: 1 }, { lv: 5 }, { lv: 10 }, { lv: 15 }, { lv: 20 }, { lv: 30 }, { lv: 40 }, { lv: 50 }, { lv: 75 }, { lv: 100 },
  { stat: 'heads', n: 250, text: '250 bajas a la cabeza' },
  { stat: 'boss', n: 25, text: '25 jefes derrotados' },
  { stat: 'grenade', n: 100, text: '100 bajas con granada' },
  { stat: 'wave', n: 20, text: 'llegar a la oleada 20' },
  { stat: 'dmWins', n: 10, text: '10 victorias en todos contra todos' },
  { stat: 'cases', n: 30, text: 'abrir 30 cajas' },
  { stat: 'matches', n: 100, text: 'jugar 100 partidas' },
];

// Recompensa diaria por días seguidos (al 8.º vuelve a empezar).
export const LOGIN = [{ coins: 50 }, { coins: 75 }, { coins: 100 }, { box: 0 }, { coins: 150 }, { coins: 200 }, { box: 2 }];

// XP de cada acción.
const XP = { kill: 10, head: 5, boss: 100, wave: 30, match: 50, dmWin: 150 };

// Misiones. stat: contador del evento · max: récord en una sola partida (no se suma) · goal · coins · xp · box.
const CLASS = { shotgun: 'k_shotgun', sawed: 'k_shotgun', sniper: 'k_sniper', dmr: 'k_sniper', pistol: 'k_pistol', revolver: 'k_pistol', plasma: 'k_alien', needler: 'k_alien', arc: 'k_alien', carbine: 'k_alien', rifle: 'k_auto', smg: 'k_auto', battle: 'k_auto' };
const DAILY = [
  { id: 'd_kills', stat: 'kills', goal: 30, text: 'Elimina a 30 enemigos', coins: 150, xp: 200 },
  { id: 'd_heads', stat: 'heads', goal: 10, text: 'Consigue 10 bajas a la cabeza', coins: 150, xp: 200 },
  { id: 'd_shotgun', stat: 'k_shotgun', goal: 10, text: '10 bajas con escopeta o recortada', coins: 150, xp: 200 },
  { id: 'd_sniper', stat: 'k_sniper', goal: 8, text: '8 bajas con francotirador o DMR', coins: 150, xp: 200 },
  { id: 'd_pistol', stat: 'k_pistol', goal: 10, text: '10 bajas con pistola o revólver', coins: 150, xp: 200 },
  { id: 'd_alien', stat: 'k_alien', goal: 12, text: '12 bajas con armas alienígenas', coins: 150, xp: 200 },
  { id: 'd_auto', stat: 'k_auto', goal: 20, text: '20 bajas con fusil, subfusil o de batalla', coins: 150, xp: 200 },
  { id: 'd_grenade', stat: 'grenade', goal: 4, text: '4 bajas con granada', coins: 150, xp: 200 },
  { id: 'd_melee', stat: 'melee', goal: 3, text: '3 bajas cuerpo a cuerpo', coins: 150, xp: 200 },
  { id: 'd_drops', stat: 'drops', goal: 2, text: 'Abre 2 suministros caídos del cielo', coins: 120, xp: 150 },
  { id: 'd_matches', stat: 'matches', goal: 3, text: 'Juega 3 partidas', coins: 120, xp: 150 },
  { id: 'd_wave', stat: 'wave', max: true, goal: 6, text: 'Llega a la oleada 6 en una partida', coins: 180, xp: 250 },
  { id: 'd_score', stat: 'score', max: true, goal: 4000, text: 'Haz 4 000 puntos en una partida', coins: 180, xp: 250 },
  { id: 'd_dm', stat: 'dmKills', goal: 15, text: '15 bajas en todos contra todos', coins: 180, xp: 250 },
];
const WEEKLY = [
  { id: 'w_kills', stat: 'kills', goal: 300, text: 'Elimina a 300 enemigos', coins: 600, xp: 1000, box: 1 },
  { id: 'w_heads', stat: 'heads', goal: 80, text: 'Consigue 80 bajas a la cabeza', coins: 600, xp: 1000, box: 1 },
  { id: 'w_boss', stat: 'boss', goal: 5, text: 'Derrota a 5 jefes', coins: 700, xp: 1200, box: 1 },
  { id: 'w_wave', stat: 'wave', max: true, goal: 12, text: 'Llega a la oleada 12 en una partida', coins: 700, xp: 1200, box: 1 },
  { id: 'w_matches', stat: 'matches', goal: 15, text: 'Juega 15 partidas', coins: 500, xp: 900, box: 1 },
  { id: 'w_grenade', stat: 'grenade', goal: 25, text: '25 bajas con granada', coins: 600, xp: 1000, box: 1 },
  { id: 'w_dmwins', stat: 'dmWins', goal: 3, text: 'Gana 3 partidas de todos contra todos', coins: 800, xp: 1400, box: 1 },
  { id: 'w_cases', stat: 'cases', goal: 5, text: 'Abre 5 cajas', coins: 400, xp: 800, box: 1 },
];
const ALL = Object.fromEntries([...DAILY, ...WEEKLY].map((m) => [m.id, m]));
const mission = (id) => ALL[id];

// Fechas locales: «2026-10-09» y la semana ISO «2026-W41».
const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${pad(Math.ceil(((t - y0) / 864e5 + 1) / 7))}`;
}
const prevDay = (key) => { const [y, m, d] = key.split('-').map(Number); return dayKey(new Date(y, m - 1, d - 1)); };

// Elección determinista por fecha (mismas misiones aunque recargues), sin repetir.
function pick(pool, n, seedKey, avoid = []) {
  let h = 2166136261;
  for (const c of seedKey) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 2246822519) ^ Math.imul(h ^ (h >>> 13), 3266489917)) >>> 0) / 4294967296;
  const left = pool.filter((m) => !avoid.includes(m.id)), out = [];
  while (out.length < n && left.length) out.push(left.splice(Math.floor(rnd() * left.length), 1)[0].id);
  return out;
}

export class Progress {
  // grant({ coins, box }): da la recompensa (monedero) · notify(texto): aviso en pantalla.
  constructor({ grant, notify }) {
    this.grant = grant;
    this.notify = notify;
    this.listeners = new Set();
    this.s = this.blank();
    try { this.load(JSON.parse(localStorage.getItem(KEY) ?? 'null')); } catch { /* sin almacenamiento */ }
    this.roll();
  }

  blank() {
    return { level: 1, xp: 0, total: 0, daily: null, weekly: null, login: { last: null, streak: 0 }, life: {} };
  }

  // Datos de fuera (almacenamiento o código de respaldo), saneados.
  load(d) {
    if (!d || typeof d !== 'object') return;
    const int = (v, min = 0, max = 1e9) => Math.min(max, Math.max(min, Math.floor(Number(v) || 0)));
    const s = this.blank();
    s.level = int(d.level, 1, MAX_LEVEL);
    s.xp = int(d.xp, 0, xpToNext(s.level));
    s.total = int(d.total);
    const set = (x) => (x && typeof x.key === 'string' && Array.isArray(x.ids) ? {
      key: x.key, ids: x.ids.filter((id) => ALL[id]).slice(0, 4), prog: Object.fromEntries(Object.entries(x.prog ?? {}).map(([k, v]) => [k, int(v)])),
      done: (x.done ?? []).filter((id) => ALL[id]), rerolled: !!x.rerolled,
    } : null);
    s.daily = set(d.daily);
    s.weekly = set(d.weekly);
    if (d.login && typeof d.login === 'object') s.login = { last: typeof d.login.last === 'string' ? d.login.last : null, streak: int(d.login.streak, 0, 7) };
    s.life = Object.fromEntries(Object.entries(d.life ?? {}).map(([k, v]) => [k, int(v)]));
    this.s = s;
    this.roll();
    this.save();
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.s)); } catch { /* sin almacenamiento */ }
    for (const fn of this.listeners) fn(this);
  }
  onChange(fn) { this.listeners.add(fn); }

  // Nuevo día o nueva semana: misiones nuevas.
  roll() {
    const d = dayKey(), w = weekKey();
    if (this.s.daily?.key !== d) this.s.daily = { key: d, ids: pick(DAILY, 3, d), prog: {}, done: [], rerolled: false };
    if (this.s.weekly?.key !== w) this.s.weekly = { key: w, ids: pick(WEEKLY, 2, w), prog: {}, done: [], rerolled: false };
  }

  // --- Lectura para la interfaz ---
  get level() { return this.s.level; }
  get xp() { return this.s.xp; }
  get need() { return this.s.level >= MAX_LEVEL ? 0 : xpToNext(this.s.level); }
  missions(kind) {
    this.roll();
    const set = this.s[kind];
    return set.ids.map((id) => {
      const m = mission(id), n = Math.min(m.goal, set.prog[id] ?? 0);
      return { ...m, n, complete: n >= m.goal, claimed: set.done.includes(id) };
    });
  }
  canReroll(kind) { return !this.s[kind].rerolled; }
  titleUnlocked(i) {
    const r = TITLE_REQ[i];
    if (!r) return false;
    return r.lv ? this.s.level >= r.lv : (this.s.life[r.stat] ?? 0) >= r.n;
  }
  titleReq(i) {
    const r = TITLE_REQ[i];
    return r?.lv ? `nivel ${r.lv}` : `${r?.text ?? ''} (${(this.s.life[r?.stat] ?? 0).toLocaleString('es-ES')}/${(r?.n ?? 0).toLocaleString('es-ES')})`;
  }
  loginState() {
    const today = dayKey(), L = this.s.login;
    const claimed = L.last === today;
    const streak = claimed ? L.streak : L.last === prevDay(today) ? L.streak % 7 : 0; // días ya cobrados de la racha
    return { claimed, day: claimed ? streak : streak + 1, streak };
  }
  // Cosas por cobrar (para el aviso de la pestaña).
  pending() {
    let n = this.loginState().claimed ? 0 : 1;
    for (const k of ['daily', 'weekly']) n += this.missions(k).filter((m) => m.complete && !m.claimed).length;
    return n;
  }

  // --- Acciones ---
  addXp(n) {
    if (n <= 0) return [];
    const ups = [];
    this.s.total += n;
    if (this.s.level >= MAX_LEVEL) { this.save(); return ups; }
    this.s.xp += n;
    while (this.s.level < MAX_LEVEL && this.s.xp >= xpToNext(this.s.level)) {
      this.s.xp -= xpToNext(this.s.level);
      this.s.level++;
      const r = levelReward(this.s.level);
      this.grant(r);
      ups.push({ level: this.s.level, ...r });
      this.notify(`¡NIVEL ${this.s.level}! +◈ ${r.coins}${r.box !== null ? ' · CAJA GRATIS' : ''}`);
    }
    if (this.s.level >= MAX_LEVEL) this.s.xp = 0;
    this.save();
    return ups;
  }

  // Suma a un contador (o récord) y avisa al completar una misión.
  stat(name, n = 1, max = false) {
    this.roll();
    this.s.life[name] = max ? Math.max(this.s.life[name] ?? 0, n) : (this.s.life[name] ?? 0) + n;
    for (const kind of ['daily', 'weekly']) {
      const set = this.s[kind];
      for (const id of set.ids) {
        const m = mission(id);
        if (m.stat !== name || !!m.max !== max) continue;
        const before = set.prog[id] ?? 0;
        set.prog[id] = max ? Math.max(before, n) : before + n;
        if (before < m.goal && set.prog[id] >= m.goal) this.notify(`MISIÓN COMPLETADA · ${m.text.toUpperCase()}`);
      }
    }
  }

  // Eventos del juego.
  kill({ weapon, head = false, boss = false, src = null, dm = false }) {
    this.stat('kills');
    if (head) this.stat('heads');
    if (boss) this.stat('boss');
    if (src === 'grenade' || src === 'melee') this.stat(src);
    else if (CLASS[weapon]) this.stat(CLASS[weapon]);
    if (dm) this.stat('dmKills');
    this.matchXp = (this.matchXp ?? 0) + XP.kill + (head ? XP.head : 0) + (boss ? XP.boss : 0);
    this.save();
  }
  event(name) { this.stat(name); this.save(); }

  // Fin de partida: XP de la partida (bajas acumuladas + oleadas + participar) → { xp, ups }.
  matchEnd({ mode, wave = 0, score = 0, won = false, time = 0 }) {
    let xp = this.matchXp ?? 0;
    this.matchXp = 0;
    if (time > 20) { xp += XP.match; this.stat('matches'); }
    if (mode !== 'dm') { xp += Math.max(0, wave - 1) * XP.wave; this.stat('wave', wave, true); this.stat('score', score, true); }
    if (won) { xp += XP.dmWin; this.stat('dmWins'); }
    const ups = this.addXp(xp);
    return { xp, ups };
  }

  claim(kind, id) {
    const set = this.s[kind], m = mission(id);
    if (!set.ids.includes(id) || set.done.includes(id) || (set.prog[id] ?? 0) < m.goal) return null;
    set.done.push(id);
    this.grant({ coins: m.coins, box: m.box ?? null });
    const ups = this.addXp(m.xp);
    this.save();
    return { ...m, ups };
  }

  // Cambiar una misión sin terminar por otra (una vez al día / a la semana).
  reroll(kind, id) {
    const set = this.s[kind];
    if (set.rerolled || !set.ids.includes(id) || set.done.includes(id)) return false;
    const [next] = pick(kind === 'daily' ? DAILY : WEEKLY, 1, `${set.key}|${id}|r`, set.ids);
    if (!next) return false;
    set.ids[set.ids.indexOf(id)] = next;
    set.rerolled = true;
    this.save();
    return true;
  }

  claimLogin() {
    const st = this.loginState();
    if (st.claimed) return null;
    const r = LOGIN[(st.day - 1) % 7];
    this.s.login = { last: dayKey(), streak: st.day };
    this.grant({ coins: r.coins ?? 0, box: r.box ?? null });
    this.save();
    return { day: st.day, ...r };
  }
}
