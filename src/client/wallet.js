// Monedero: créditos ◈ que se ganan jugando y desbloqueos de la tienda (modelos, cascos y patrones).
// Se guarda en el navegador (localStorage). Los colores y el visor son siempre gratis.
import { MODELS, HELMETS, PATTERNS } from '../shared/skins.js';

const KEY = 'ringfall.wallet';
export const START_COINS = 300;

// Precios por tipo de artículo (índice = el de la lista de skins.js). 0 = gratis desde el principio.
export const PRICES = {
  m: [0, 400, 400, 600, 900, 500, 500, 750, 750, 750, 1200, 1000, 1000],
  h: [0, 300, 300],
  t: [0, 150, 200, 250],
};
export const ITEM_NAMES = { m: MODELS, h: HELMETS, t: PATTERNS };
export const KIND_NAMES = { m: 'MODELOS', h: 'CASCOS', t: 'PATRONES' };

// Créditos de una partida: bajas, oleadas superadas y puntuación (oleadas); bajas y victoria (todos contra todos).
export function matchReward({ mode, kills = 0, wave = 0, score = 0, won = false, time = 0 }) {
  const base = time > 20 ? 10 : 0;
  if (mode === 'dm') return base + kills * 12 + (won ? 100 : 0);
  return base + kills * 4 + Math.max(0, wave - 1) * 20 + Math.floor(score / 40);
}

export class Wallet {
  // skin: lo que lleva equipado el jugador al crear el monedero por primera vez (se le regala: nadie pierde nada).
  constructor(skin) {
    this.listeners = new Set();
    let data = null;
    try { data = JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { /* sin almacenamiento */ }
    if (data && Number.isFinite(data.coins) && Array.isArray(data.owned)) {
      this.coins = Math.max(0, Math.floor(data.coins));
      this.owned = new Set(data.owned);
      this.earned = data.earned ?? 0;
    } else {
      this.coins = START_COINS;
      this.owned = new Set();
      this.earned = 0;
      if (skin) for (const k of ['m', 'h', 't']) this.owned.add(`${k}:${skin[k]}`);
      this.save();
    }
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify({ coins: this.coins, owned: [...this.owned], earned: this.earned })); } catch { /* sin almacenamiento */ }
    for (const fn of this.listeners) fn(this);
  }

  onChange(fn) { this.listeners.add(fn); }

  price(kind, i) { return PRICES[kind]?.[i] ?? 0; }

  owns(kind, i) { return this.price(kind, i) === 0 || this.owned.has(`${kind}:${i}`); }

  // Precio si está bloqueado; 0 si se puede usar.
  locked(kind, i) { return this.owns(kind, i) ? 0 : this.price(kind, i); }

  buy(kind, i) {
    if (this.owns(kind, i)) return true;
    const p = this.price(kind, i);
    if (this.coins < p) return false;
    this.coins -= p;
    this.owned.add(`${kind}:${i}`);
    this.save();
    return true;
  }

  add(n) {
    n = Math.max(0, Math.floor(n));
    if (!n) return 0;
    this.coins += n;
    this.earned += n;
    this.save();
    return n;
  }
}
