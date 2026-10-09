// Reglas de partida: variantes (preajustes) y ajustes editables. Sin dependencias de navegador:
// lo usan el juego, la sala P2P del anfitrión y server.js (Node).
// Modos base: 'sp' (un jugador) | 'coop' (cooperativo) | 'dm' (todos contra todos).
export const MODES = ['sp', 'coop', 'dm'];
export const MODE_NAMES = { sp: 'UN JUGADOR', coop: 'COOPERATIVO', dm: 'TODOS CONTRA TODOS' };
const WAVES = ['sp', 'coop'];

// Armas fijas por regla de armamento ('choice' = las que elige cada jugador).
export const LOADOUTS = {
  choice: null,
  basic: ['rifle', 'pistol'],
  snipers: ['sniper', 'pistol'],
  swat: ['dmr', 'pistol'],
  shotguns: ['shotgun', 'smg'],
  alien: ['plasma', 'needler'],
};

// Multiplicadores de vida y daño de la IA.
export const DIFFICULTY = {
  easy: { hp: 0.7, dmg: 0.6 },
  normal: { hp: 1, dmg: 1 },
  hard: { hp: 1.35, dmg: 1.3 },
  legendary: { hp: 1.8, dmg: 1.7 },
};

// Esquema de ajustes. modes: en qué modos se muestra/aplica. show(rules, mode): visibilidad condicional.
export const RULES = {
  scoreLimit: { label: 'LÍMITE DE BAJAS', type: 'int', min: 5, max: 50, step: 5, modes: ['dm'] },
  timeLimit: { label: 'LÍMITE DE TIEMPO', type: 'int', min: 0, max: 30, step: 1, unit: ' MIN', zero: 'SIN LÍMITE', modes: MODES },
  lives: { label: 'VIDAS', type: 'int', min: 0, max: 30, step: 1, zero: 'CLÁSICO', modes: WAVES },
  respawn: { label: 'REAPARICIÓN', type: 'int', min: 1, max: 15, step: 1, unit: ' S', modes: MODES, show: (r, m) => m === 'dm' || r.lives > 0 },
  startWave: { label: 'OLEADA INICIAL', type: 'int', min: 1, max: 30, step: 1, modes: WAVES },
  waveSet: { label: 'OLEADAS', type: 'enum', options: { classic: 'NORMALES', bosses: 'SOLO JEFES' }, modes: WAVES },
  difficulty: { label: 'DIFICULTAD', type: 'enum', options: { easy: 'FÁCIL', normal: 'NORMAL', hard: 'DIFÍCIL', legendary: 'LEGENDARIA' }, modes: WAVES },
  box: { label: 'CAJAS MISTERIOSAS', type: 'bool', modes: WAVES },
  friendlyFire: { label: 'FUEGO AMIGO', type: 'bool', modes: ['coop'] },
  pvpDamage: { label: 'DAÑO ENTRE JUGADORES', type: 'num', min: 0.6, max: 3, step: 0.2, prefix: '×', modes: ['dm', 'coop'], show: (r, m) => m === 'dm' || r.friendlyFire },
  loadout: {
    label: 'ARMAS INICIALES', type: 'enum', modes: MODES,
    options: { choice: 'A ELEGIR', basic: 'CARABINA + PISTOLA', snipers: 'FRANCOTIRADOR + PISTOLA', swat: 'DMR + PISTOLA', shotguns: 'ESCOPETA + SMG', alien: 'ALIENÍGENAS' },
  },
  grenades: { label: 'GRANADAS INICIALES', type: 'int', min: 0, max: 4, step: 1, modes: MODES },
  infiniteAmmo: { label: 'MUNICIÓN INFINITA', type: 'bool', modes: MODES },
  shields: { label: 'ESCUDOS', type: 'bool', modes: MODES },
  headKill: { label: 'CABEZA = BAJA', type: 'bool', modes: MODES },
  radar: { label: 'RADAR', type: 'bool', modes: MODES },
};

const BASE = {
  scoreLimit: 15, timeLimit: 0, lives: 0, respawn: 3, startWave: 1, waveSet: 'classic', difficulty: 'normal',
  box: false, friendlyFire: false, pvpDamage: 1.6, loadout: 'choice', grenades: 2, infiniteAmmo: false,
  shields: true, headKill: false, radar: true,
};

// Valores por modo antes de aplicar la variante.
const MODE_BASE = {
  sp: {},
  coop: { box: true, loadout: 'basic' },
  dm: {},
};

export const VARIANTS = {
  classic: {
    name: 'CLÁSICO', modes: MODES, rules: {},
    desc: { sp: 'Oleadas sin fin. Si caes, se acaba.', coop: 'Oleadas contra la IA. Si caes, reapareces en la siguiente oleada; si cae todo el equipo, se acaba.', dm: 'Cada uno por su cuenta. Gana el primero en llegar al límite de bajas.' },
  },
  firefight: {
    name: 'TIROTEO', modes: WAVES, rules: { lives: 7, respawn: 5, box: false, loadout: 'choice', difficulty: 'hard' },
    desc: 'Vidas compartidas: al caer gastas una y reapareces en unos segundos. Cada oleada superada da +1 vida. Sin vidas, quien caiga no vuelve.',
  },
  bossRush: {
    name: 'JEFES EN CADENA', modes: WAVES, rules: { waveSet: 'bosses', grenades: 4 },
    desc: 'Cada oleada es un jefe con escolta, alternando WARLORD y OVERSEER. Desde la 6.ª, cada tres oleadas vienen los dos.',
  },
  snipers: {
    name: 'FRANCOTIRADORES', modes: MODES, rules: { loadout: 'snipers', infiniteAmmo: true, grenades: 0, radar: false },
    desc: 'Francotirador y pistola para todos, munición infinita, sin granadas ni radar.',
  },
  swat: {
    name: 'SWAT', modes: MODES, rules: { loadout: 'swat', shields: false, headKill: true, radar: false, grenades: 0 },
    desc: 'Sin escudos ni radar. Un tiro en la cabeza elimina (salvo a los jefes). DMR y pistola.',
  },
};

export const variantsFor = (mode) => Object.keys(VARIANTS).filter((v) => VARIANTS[v].modes.includes(mode));

export function variantDesc(variant, mode) {
  const d = VARIANTS[variant]?.desc;
  return typeof d === 'string' ? d : d?.[mode] ?? '';
}

export function defaultRules(mode = 'sp', variant = 'classic', base = {}) {
  if (!MODES.includes(mode)) mode = 'sp';
  if (!VARIANTS[variant]?.modes.includes(mode)) variant = 'classic';
  return { ...BASE, ...base, ...MODE_BASE[mode], ...VARIANTS[variant].rules, variant };
}

const num = (v, d, min, max, step) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return d;
  const k = Math.round((Math.min(max, Math.max(min, n)) - min) / step);
  return +(min + k * step).toFixed(2);
};

// Valida unas reglas recibidas (red, almacenamiento): todo campo inválido vuelve al valor por defecto.
export function sanitizeRules(mode, raw, base = {}) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const def = defaultRules(mode, r.variant, base);
  const out = { variant: def.variant };
  for (const [k, s] of Object.entries(RULES)) {
    const v = r[k];
    if (s.type === 'bool') out[k] = typeof v === 'boolean' ? v : def[k];
    else if (s.type === 'enum') out[k] = Object.hasOwn(s.options, v) ? v : def[k];
    else out[k] = v === undefined ? def[k] : num(v, def[k], s.min, s.max, s.step);
  }
  return out;
}

// ¿Difieren de la variante elegida en algún ajuste visible para el modo?
export function isCustom(mode, rules, base = {}) {
  const def = defaultRules(mode, rules.variant, base);
  return Object.entries(RULES).some(([k, s]) => s.modes.includes(mode) && rules[k] !== def[k]);
}

export function ruleVisible(key, rules, mode) {
  const s = RULES[key];
  return s.modes.includes(mode) && (!s.show || s.show(rules, mode));
}

export function formatRule(key, v) {
  const s = RULES[key];
  if (s.type === 'bool') return v ? 'SÍ' : 'NO';
  if (s.type === 'enum') return s.options[v] ?? v;
  if (v === 0 && s.zero) return s.zero;
  const n = s.type === 'num' ? v.toFixed(1).replace('.', ',') : String(v);
  return `${s.prefix ?? ''}${n}${s.unit ?? ''}`;
}

// Siguiente valor de un ajuste (dir = +1 / -1).
export function stepRule(key, v, dir) {
  const s = RULES[key];
  if (s.type === 'bool') return !v;
  if (s.type === 'enum') {
    const keys = Object.keys(s.options);
    return keys[(keys.indexOf(v) + dir + keys.length) % keys.length];
  }
  return num(v + dir * s.step, v, s.min, s.max, s.step);
}

export const isWaves = (mode) => WAVES.includes(mode);
