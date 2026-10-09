// Monedero: créditos ◈ que se ganan jugando y desbloqueos de la tienda (modelos, cascos y patrones).
// Con cuenta iniciada manda el servidor (account.js): compras y créditos se validan allí. Sin cuenta (invitado),
// se guarda en el navegador (localStorage). Los colores y el visor son siempre gratis.
import { START_COINS, PRICES, matchReward, CASES, rollCase, DUP_REFUND } from '../shared/shop.js';

export { PRICES, ITEM_NAMES, KIND_NAMES, matchReward } from '../shared/shop.js';
const KEY = 'ringfall.wallet';
// Aleatorio del navegador para las cajas (sin cuenta, el sorteo es local).
const rnd = () => (globalThis.crypto?.getRandomValues ? crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32 : Math.random());

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
      this.localTokens = Array.isArray(data.tokens) ? [0, 1, 2, 3].map((c) => Math.max(0, Math.floor(data.tokens[c]) || 0)) : [0, 0, 0, 0];
    } else {
      this.localTokens = [0, 0, 0, 0];
      this.coins = START_COINS;
      this.owned = new Set();
      this.earned = 0;
      if (skin) for (const k of ['m', 'h', 't']) this.owned.add(`${k}:${skin[k]}`);
      this.save();
    }
  }

  // Modo cuenta: el perfil del servidor sustituye al monedero local mientras dure la sesión.
  attach(account) {
    this.account = account;
    account.onChange(() => this.emit());
  }
  get remote() { return !!this.account?.profile; }
  get coins() { return this.remote ? this.account.profile.coins : this.localCoins; }
  set coins(v) { this.localCoins = v; }
  get owned() { return this.remote ? new Set(this.account.profile.owned) : this.localOwned; }
  set owned(v) { this.localOwned = v; }
  get earned() { return this.remote ? this.account.profile.earned : this.localEarned ?? 0; }
  set earned(v) { this.localEarned = v; }
  // Lo que se puede traer a una cuenta nueva (el servidor lo recorta).
  get localData() { return { coins: this.localCoins, owned: [...this.localOwned] }; }

  emit() { for (const fn of this.listeners) fn(this); }

  // Tras crear una cuenta con el progreso de este navegador: el invitado vuelve a empezar desde cero.
  handOver() {
    this.localCoins = 0;
    this.localOwned = new Set();
    this.save();
  }

  // Restaurar un código de respaldo: sustituye el progreso de este navegador.
  restore({ coins, owned, earned, tokens }) {
    this.localCoins = coins;
    this.localOwned = new Set(owned);
    this.localEarned = earned;
    if (Array.isArray(tokens)) this.localTokens = [0, 1, 2, 3].map((c) => Math.max(0, Math.min(99, Math.floor(tokens[c]) || 0)));
    this.save();
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify({ coins: this.localCoins, owned: [...this.localOwned], earned: this.localEarned ?? 0, tokens: this.localTokens })); } catch { /* sin almacenamiento */ }
    this.emit();
  }

  onChange(fn) { this.listeners.add(fn); }

  // -1: no se vende (solo en cajas).
  price(kind, i) { return kind === 'w' ? -1 : PRICES[kind]?.[i] ?? 0; }

  owns(kind, i) {
    if (kind === 'w' && i % 32 === 0) return true; // acabado de fábrica
    return this.price(kind, i) === 0 || this.owned.has(`${kind}:${i}`);
  }

  // Precio si está bloqueado; 0 si se puede usar.
  locked(kind, i) { return this.owns(kind, i) ? 0 : this.price(kind, i); }

  // → true si ya es tuyo (o se compró); false si faltan créditos. Con cuenta lo decide el servidor.
  async buy(kind, i) {
    if (this.owns(kind, i)) return true;
    if (this.remote) {
      try { await this.account.call('buy', { kind, i }); return true; } catch (e) { if (e.status === 402) return false; throw e; }
    }
    const p = this.price(kind, i);
    if (p < 0 || this.localCoins < p) return false;
    this.localCoins -= p;
    this.localOwned.add(`${kind}:${i}`);
    this.save();
    return true;
  }

  // Cajas gratis (recompensas de nivel, misiones y días seguidos): solo en el monedero de este dispositivo.
  get tokens() { return this.remote ? [0, 0, 0, 0] : this.localTokens; }
  addToken(c) {
    if (!CASES[c]) return;
    this.localTokens[c]++;
    this.save();
  }

  // Abre la caja c → { kind, i, r, dup, refund, free }, o null si faltan créditos. Con cuenta sortea el servidor.
  // Si hay una caja gratis de ese tipo, se usa primero.
  async openCase(c) {
    const box = CASES[c];
    if (!box) return null;
    if (!this.remote && this.localTokens[c] > 0) {
      this.localTokens[c]--;
      const it = rollCase(c, rnd);
      const key = `${it.kind}:${it.i}`, dup = this.localOwned.has(key), refund = dup ? DUP_REFUND[it.r] : 0;
      this.localCoins += refund;
      if (!dup) this.localOwned.add(key);
      this.save();
      return { ...it, dup, refund, free: true };
    }
    if (this.remote) {
      try { return (await this.account.call('open', { c })).result; } catch (e) { if (e.status === 402) return null; throw e; }
    }
    if (this.localCoins < box.price) return null;
    const it = rollCase(c, rnd);
    const key = `${it.kind}:${it.i}`, dup = this.localOwned.has(key), refund = dup ? DUP_REFUND[it.r] : 0;
    this.localCoins += refund - box.price;
    if (!dup) this.localOwned.add(key);
    this.save();
    return { ...it, dup, refund };
  }

  // Créditos de una partida → cuántos se ganaron. Con cuenta los calcula el servidor (con topes).
  async reward(stats) {
    if (this.remote) {
      try { return (await this.account.call('reward', stats)).gained; } catch { return 0; }
    }
    return this.add(matchReward(stats));
  }

  add(n) {
    n = Math.max(0, Math.floor(n));
    if (!n) return 0;
    this.localCoins += n;
    this.localEarned = (this.localEarned ?? 0) + n;
    this.save();
    return n;
  }
}
