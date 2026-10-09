// Datos de las armaduras. Módulo puro: lo usan el navegador y server.js (vía room.js).
export const PRIMARY = ['#3d6b4f', '#2f5d8a', '#8a2f2f', '#c08a2f', '#5b5f66', '#d8dce2', '#6b3f8a', '#25292e', '#d06a1e', '#2f8a85'];
export const SECONDARY = ['#1e2226', '#3a3f46', '#c9ced6', '#a0262b', '#1f4f7a', '#c7a046', '#2f5a3a', '#e07a2a', '#5a3f7a', '#101214'];
export const VISORS = ['#ffb340', '#45d6ff', '#ff4d6a', '#7dff6a', '#d8d8ff'];
export const HELMETS = ['CENTINELA', 'HALCÓN', 'BASTIÓN'];
export const PATTERNS = ['LISO', 'CAMUFLAJE', 'RAYAS', 'HEXÁGONOS'];
// Modelo del soldado: 0 = procedural (colores y patrón); el resto son modelos 3D (src/playermodels.js).
export const MODELS = ['CLÁSICO', 'FEDERAL', 'MILITAR', 'RENEGADO', 'EXOTROOPER', 'COMANDO', 'COMANDO F', 'MONO', 'PATO', 'RANA', 'CHICA GANCHO', 'DADO PAR', 'DADO IMPAR'];

export const DEFAULT_SKIN = { p: PRIMARY[0], s: SECONDARY[0], v: VISORS[0], h: 0, t: 0, m: 0 };

const pick = (list, v, def) => (list.includes(v) ? v : def);
const idx = (n, len) => (Number.isInteger(n) && n >= 0 && n < len ? n : 0);

// Acepta solo valores de las listas (datos que llegan por la red).
export function sanitizeSkin(x) {
  const s = x && typeof x === 'object' ? x : {};
  return {
    p: pick(PRIMARY, s.p, DEFAULT_SKIN.p),
    s: pick(SECONDARY, s.s, DEFAULT_SKIN.s),
    v: pick(VISORS, s.v, DEFAULT_SKIN.v),
    h: idx(s.h, HELMETS.length),
    t: idx(s.t, PATTERNS.length),
    m: idx(s.m, MODELS.length),
  };
}

export function randomSkin() {
  const r = (l) => l[(Math.random() * l.length) | 0];
  return { p: r(PRIMARY), s: r(SECONDARY), v: r(VISORS), h: (Math.random() * HELMETS.length) | 0, t: (Math.random() * PATTERNS.length) | 0, m: (Math.random() * MODELS.length) | 0 };
}
