// Economía compartida por el juego y el servidor de cuentas: precios de la tienda, cajas y créditos por partida.
// Módulo puro (sin navegador): el servidor lo usa para validar compras, abrir cajas y calcular recompensas.
import { MODELS, HELMETS, PATTERNS } from './skins.js';

export const START_COINS = 300;
// Precios por tipo de artículo (índice = el de la lista de skins.js). 0 = gratis desde el principio;
// -1 = solo se consigue en cajas.
export const PRICES = {
  m: [0, 400, 400, 600, 900, 500, 500, 750, 750, 750, 1200, 1000, 1000],
  h: [0, 300, 300, 450, 550],
  t: [0, 150, 200, 250, 300, 350, 400, 500, -1, -1],
};
export const ITEM_NAMES = { m: MODELS, h: HELMETS, t: PATTERNS };
export const KIND_NAMES = { m: 'MODELOS', h: 'CASCOS', t: 'PATRONES' };
export const itemPrice = (kind, i) => (Number.isInteger(i) ? PRICES[kind]?.[i] ?? null : null);

// --- Acabados de arma (solo en cajas) ----------------------------------------------------------------------
// Artículo «w:i» con i = arma × 32 + acabado. El acabado 0 (DE FÁBRICA) lo tiene todo el mundo.
export const GUN_IDS = ['rifle', 'pistol', 'smg', 'shotgun', 'dmr', 'sniper', 'plasma', 'needler', 'arc', 'battle', 'revolver', 'sawed', 'carbine'];
export const GUN_NAMES = {
  rifle: 'AR-9', pistol: 'ION', smg: 'VIPER', shotgun: 'ESCOPETA', dmr: 'DMR', sniper: 'FRANCOTIRADOR', plasma: 'PLASMA',
  needler: 'AGUJAS', arc: 'ARCO', battle: 'BATALLA', revolver: 'REVÓLVER', sawed: 'RECORTADA', carbine: 'CARABINA',
};
// r: rareza (0 común · 1 raro · 2 épico · 3 legendario).
export const FINISHES = [
  { name: 'DE FÁBRICA', r: -1 },
  { name: 'ÁRTICO', r: 0 }, { name: 'DESIERTO', r: 0 }, { name: 'BOSQUE', r: 0 }, { name: 'PIZARRA', r: 0 }, { name: 'ÓXIDO', r: 0 },
  { name: 'URBANO', r: 1 }, { name: 'SELVA', r: 1 }, { name: 'TIGRE', r: 1 }, { name: 'DIGITAL', r: 1 },
  { name: 'NEÓN', r: 2 }, { name: 'MAGMA', r: 2 }, { name: 'HIELO', r: 2 }, { name: 'CARBONO ROJO', r: 2 },
  { name: 'ORO', r: 3 }, { name: 'CROMO', r: 3 }, { name: 'PLASMA', r: 3 }, { name: 'DRAGÓN', r: 3 },
];
export const finishItem = (gun, f) => GUN_IDS.indexOf(gun) * 32 + f;
export const finishOf = (i) => ({ gun: GUN_IDS[Math.floor(i / 32)], f: i % 32 });
export const isFinishItem = (i) => Number.isInteger(i) && i >= 0 && !!GUN_IDS[Math.floor(i / 32)] && (i % 32) > 0 && (i % 32) < FINISHES.length;

export const RARITIES = [
  { name: 'COMÚN', color: '#9fb6cc' },
  { name: 'RARO', color: '#3d8bff' },
  { name: 'ÉPICO', color: '#b45cff' },
  { name: 'LEGENDARIO', color: '#ffb020' },
];
// Repetido: se convierte en créditos según su rareza.
export const DUP_REFUND = [25, 60, 150, 400];

// Cajas: precio y probabilidad (%) de cada rareza.
export const CASES = [
  { name: 'CAJA BÁSICA', price: 100, odds: [70, 22, 6, 2] },
  { name: 'CAJA RARA', price: 250, odds: [40, 40, 15, 5] },
  { name: 'CAJA ÉPICA', price: 500, odds: [10, 45, 35, 10] },
  { name: 'CAJA LEGENDARIA', price: 1000, odds: [0, 25, 50, 25] },
];

// Rareza de los artículos de armadura según su precio (los gratis no salen en cajas).
const ARMOR_RARITY = { 8: 2, 9: 3 }; // patrones exclusivos: NEÓN épico, ORO legendario
function armorRarity(kind, i) {
  const p = PRICES[kind][i];
  if (kind === 't' && ARMOR_RARITY[i] !== undefined) return ARMOR_RARITY[i];
  if (p <= 0) return -1;
  if (kind === 'm') return p >= 1000 ? 3 : p >= 600 ? 2 : 1;
  if (kind === 'h') return p >= 550 ? 2 : p >= 450 ? 1 : 0;
  return p >= 400 ? 2 : p >= 300 ? 1 : 0;
}
// Contenido de las cajas por rareza: [{ kind, i }].
export const CASE_POOL = [[], [], [], []];
for (const gun of GUN_IDS) FINISHES.forEach((f, k) => { if (f.r >= 0) CASE_POOL[f.r].push({ kind: 'w', i: finishItem(gun, k) }); });
export const ARMOR_POOL = [[], [], [], []];
for (const kind of ['m', 'h', 't']) PRICES[kind].forEach((_, i) => { const r = armorRarity(kind, i); if (r >= 0) ARMOR_POOL[r].push({ kind, i }); });

export function rarityOf(kind, i) {
  if (kind === 'w') return isFinishItem(i) ? FINISHES[i % 32].r : -1;
  return PRICES[kind] && i >= 0 && i < PRICES[kind].length ? armorRarity(kind, i) : -1;
}
export function itemName(kind, i) {
  if (kind === 'w') { const { gun, f } = finishOf(i); return `${GUN_NAMES[gun]} | ${FINISHES[f].name}`; }
  return ITEM_NAMES[kind]?.[i] ?? '?';
}

// Saca un artículo de la caja c. rnd(): número en [0, 1) (el servidor usa uno criptográfico).
// Dentro de cada rareza: 30 % armadura (si hay de esa rareza) y 70 % acabado de arma.
export function rollCase(c, rnd = Math.random) {
  const odds = CASES[c].odds;
  let x = rnd() * 100, r = 0;
  while (r < 3 && x >= odds[r]) { x -= odds[r]; r++; }
  const armor = ARMOR_POOL[r], pool = armor.length && rnd() < 0.3 ? armor : CASE_POOL[r];
  const it = pool[Math.floor(rnd() * pool.length)];
  return { kind: it.kind, i: it.i, r };
}

// Límites razonables de una partida (el servidor recorta lo que manda el cliente).
const CAP = { kills: 250, wave: 60, score: 60000 };
export const MAX_REWARD = 1500; // por partida
const n = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));

// Créditos de una partida: bajas, oleadas superadas y puntuación (oleadas); bajas y victoria (todos contra todos).
export function matchReward({ mode, kills = 0, wave = 0, score = 0, won = false, time = 0 } = {}) {
  const k = n(kills, CAP.kills), w = n(wave, CAP.wave), s = n(score, CAP.score);
  const base = Number(time) > 20 ? 10 : 0;
  const r = mode === 'dm' ? base + k * 12 + (won ? 100 : 0) : base + k * 4 + Math.max(0, w - 1) * 20 + Math.floor(s / 40);
  return Math.min(MAX_REWARD, r);
}
