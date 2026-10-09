// Cajas de la tienda: ruleta de objetos que pasa rápido, frena y se para en el premio (estilo AAA).
// El premio se decide ANTES de girar (wallet.openCase: en el navegador o en el servidor de cuentas); la ruleta
// solo lo enseña. Los objetos de relleno salen con las mismas probabilidades que la caja.
import { CASES, RARITIES, rollCase, itemName } from '../shared/shop.js';
import { shopThumb } from './shopview.js';

const CARD = 148; // ancho de tarjeta + separación (px)
const COUNT = 52, WIN = 44, SPIN = 6.4; // tarjetas · posición del premio · duración (s)
const UNIQUE = 12, PREP_MAX = 2200; // objetos distintos en la tira · espera máxima de miniaturas (ms)
const $ = (id) => document.getElementById(id);
const ease = (t) => 1 - (1 - t) ** 4; // frenada larga al final

export class CaseOpener {
  // deps: { wallet, sfx, skin(): skin actual, onEquip(result), onClose(), message(text) }
  constructor(deps) {
    this.d = deps;
    this.busy = false;
    $('case-skip').addEventListener('click', () => { this.skip = true; });
    $('case-again').addEventListener('click', () => this.open(this.c));
    $('case-close').addEventListener('click', () => this.close());
    $('case-equip').addEventListener('click', () => {
      this.d.onEquip(this.result);
      $('case-equip').hidden = true;
      $('case-note').textContent = '¡Equipado!';
    });
    addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && !$('case-open').classList.contains('hidden') && !this.busy) this.close();
    });
  }

  async open(c) {
    if (this.busy) return;
    const box = CASES[c];
    this.d.sfx.unlock?.();
    if (!this.d.wallet.tokens[c] && this.d.wallet.coins < box.price) {
      this.d.message(`Te faltan ◈ ${(box.price - this.d.wallet.coins).toLocaleString('es-ES')} para la ${box.name.toLowerCase()}. ¡Juega para ganar más!`);
      if (!$('case-open').classList.contains('hidden')) $('case-note').textContent = 'No te quedan créditos suficientes.';
      return;
    }
    this.busy = true;
    let result;
    try { result = await this.d.wallet.openCase(c); } catch (e) { this.d.message(e.message); this.busy = false; return; }
    if (!result) { this.d.message('Créditos insuficientes.'); this.busy = false; return; }
    this.c = c;
    this.result = result;
    this.show(box, result);
  }

  show(box, result) {
    const skin = this.d.skin();
    $('case-open').classList.remove('hidden');
    $('case-open').style.setProperty('--rc', RARITIES[result.r].color);
    $('case-title').textContent = box.name;
    $('case-result').hidden = true;
    for (const id of ['case-equip', 'case-again', 'case-close']) $(id).hidden = true;
    $('case-skip').hidden = false;
    this.skip = false;
    $('case-open').classList.remove('done', 'r0', 'r1', 'r2', 'r3');
    // Tira de tarjetas: relleno (pocos objetos distintos, para no generar demasiadas miniaturas) + el premio.
    const strip = $('reel-strip');
    const pool = Array.from({ length: UNIQUE }, () => rollCase(this.c));
    const items = Array.from({ length: COUNT }, (_, k) => (k === WIN ? result : pool[(Math.random() * UNIQUE) | 0]));
    const cards = items.map((it) => {
      const el = document.createElement('div');
      el.className = 'rc';
      el.style.setProperty('--rc', RARITIES[it.r].color);
      const th = document.createElement('span');
      th.className = 'thumb loading';
      const nm = document.createElement('b');
      nm.textContent = itemName(it.kind, it.i);
      el.append(th, nm);
      return { el, th, it };
    });
    strip.replaceChildren(...cards.map((x) => x.el));
    // Miniaturas: primero la del premio. Se espera a tenerlas (con tope) antes de girar: generarlas durante el
    // giro le quitaría fluidez. Mientras, la caja «se desbloquea».
    const order = [cards[WIN], ...cards.filter((_, k) => k !== WIN)];
    const ready = order.map((x, k) => new Promise((ok) => shopThumb(x.it.kind, x.it.i, skin, (url) => {
      if (url) { x.th.style.backgroundImage = `url(${url})`; x.th.classList.remove('loading'); }
      ok();
    }, k === 0)));
    $('case-open').classList.add('prep');
    strip.style.transform = 'translate3d(0,0,0)';
    const go = () => { $('case-open').classList.remove('prep'); this.spin(cards); };
    Promise.race([Promise.all(ready), new Promise((ok) => setTimeout(ok, PREP_MAX))]).then(() => setTimeout(go, 350));
    this.d.sfx.boxOpen?.();
  }

  spin(cards) {
    const strip = $('reel-strip');
    const view = $('reel').clientWidth;
    const jitter = (Math.random() - 0.5) * CARD * 0.7;
    const end = -(WIN * CARD + CARD / 2 - view / 2) - jitter;
    const t0 = performance.now();
    let lastIdx = -1;
    const step = (now) => {
      let t = Math.min(1, (now - t0) / 1000 / SPIN);
      if (this.skip) t = 1;
      const x = end * ease(t);
      strip.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`;
      const speed = Math.abs(end) * 4 * (1 - t) ** 3 / SPIN; // px/s (derivada de la curva)
      strip.classList.toggle('fast', speed > 2500);
      const idx = Math.floor((view / 2 - x) / CARD);
      if (idx !== lastIdx) { lastIdx = idx; if (!this.skip) this.d.sfx.boxTick?.(); }
      if (t < 1) requestAnimationFrame(step);
      else this.reveal(cards[WIN]);
    };
    requestAnimationFrame(step);
  }

  reveal(card) {
    const r = this.result, rar = RARITIES[r.r];
    card.el.classList.add('win');
    $('case-open').classList.add('done', `r${r.r}`);
    this.d.sfx.boxReveal?.();
    if (r.r >= 2) this.d.sfx.wave?.();
    $('case-skip').hidden = true;
    const res = $('case-result');
    res.hidden = false;
    $('case-thumb').style.backgroundImage = card.th.style.backgroundImage;
    shopThumb(r.kind, r.i, this.d.skin(), (url) => { if (url) $('case-thumb').style.backgroundImage = `url(${url})`; }, true);
    $('case-name').textContent = itemName(r.kind, r.i);
    $('case-rarity').textContent = rar.name;
    $('case-note').textContent = r.dup ? `Ya lo tenías: se convierte en ◈ ${r.refund}.` : '¡Nuevo! Ya es tuyo.';
    this.d.onOpened?.(r);
    $('case-equip').hidden = false; // nuevo o repetido, ya es tuyo
    $('case-again').hidden = false;
    $('case-again').textContent = this.d.wallet.tokens[this.c] ? `ABRIR OTRA · GRATIS ×${this.d.wallet.tokens[this.c]}` : `ABRIR OTRA · ◈ ${CASES[this.c].price}`;
    $('case-close').hidden = false;
    this.busy = false;
  }

  close() {
    $('case-open').classList.add('hidden');
    $('reel-strip').replaceChildren();
    this.d.onClose();
  }
}
