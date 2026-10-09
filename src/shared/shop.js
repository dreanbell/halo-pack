// Economía compartida por el juego y el servidor de cuentas: precios de la tienda y créditos por partida.
// Módulo puro (sin navegador): el servidor lo usa para validar compras y calcular recompensas.
import { MODELS, HELMETS, PATTERNS } from './skins.js';

export const START_COINS = 300;
// Precios por tipo de artículo (índice = el de la lista de skins.js). 0 = gratis desde el principio.
export const PRICES = {
  m: [0, 400, 400, 600, 900, 500, 500, 750, 750, 750, 1200, 1000, 1000],
  h: [0, 300, 300],
  t: [0, 150, 200, 250],
};
export const ITEM_NAMES = { m: MODELS, h: HELMETS, t: PATTERNS };
export const KIND_NAMES = { m: 'MODELOS', h: 'CASCOS', t: 'PATRONES' };
export const itemPrice = (kind, i) => (Number.isInteger(i) ? PRICES[kind]?.[i] ?? null : null);

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
