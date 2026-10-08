import { CFG } from './config.js';
import { GUN_INFO } from './guns.js';
import { GunViewer, gunThumbnails } from './gunview.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const fmt = (v, d = 1) => v.toLocaleString('es-ES', { maximumFractionDigits: d });

// Barras comparativas (0..1).
function bars(w, id) {
  const shots = w.kind === 'pellets' ? w.pellets : w.burst ?? 1;
  const dps = (w.damage * shots) / (w.interval + (w.burst ? w.burstGap * (w.burst - 1) : 0));
  const range = w.kind === 'projectile' ? w.projSpeed * w.life : w.range;
  return [
    ['DAÑO', Math.min(1, dps / 230)],
    ['ALCANCE', Math.min(1, range / 400)],
    ['CADENCIA', Math.min(1, (0.05 / w.interval) * 1.4)],
    ['PRECISIÓN', Math.max(0.05, 1 - (w.zoomSpread ?? w.spread) / 0.08)],
    ['MOVILIDAD', Math.max(0.05, 1 - (GUN_INFO[id]?.weight ?? 4) / 10)],
  ];
}

// Ficha técnica.
function stats(w, id) {
  const mode = w.boltAction ? 'CERROJO' : w.shellReload ? 'CORREDERA' : w.burst ? `RÁFAGA ×${w.burst}` : w.auto ? 'AUTOMÁTICO' : 'SEMIAUTOMÁTICO';
  const range = w.kind === 'projectile' ? Math.round(w.projSpeed * w.life) : w.range;
  return [
    ['DAÑO', w.kind === 'pellets' ? `${w.damage} × ${w.pellets}` : w.splash ? `${w.damage} · ÁREA ${fmt(w.splash)} m` : `${w.damage}`],
    ['CADENCIA', `${Math.round(60 / w.interval)} DPM`],
    ['MODO', mode],
    ['MUNICIÓN', w.heat ? 'CALOR' : `${w.mag} / ${w.maxReserve}`],
    ['RECARGA', w.heat ? `ENFRÍA ${fmt(w.heat.overheat)} s` : w.shellReload ? `${fmt(w.reload)} s / CARTUCHO` : `${fmt(w.reload)} s`],
    ['ALCANCE', `${range} m`],
    ['MIRA', `${GUN_INFO[id]?.optic ?? '—'} ×${fmt(w.zoom ?? w.ads ?? 1.25, 2)}`],
    ['CALIBRE', GUN_INFO[id]?.caliber ?? '—'],
    ['CABEZA / ESCUDO', `×${fmt(w.headMult ?? 1)} / ×${fmt(w.shieldMult ?? 1)}`],
    ['PESO', `${fmt(GUN_INFO[id]?.weight ?? 0)} kg`],
  ];
}

// Menú de armas: dos ranuras, rejilla con miniaturas y vista previa 3D con ficha técnica.
export class LoadoutMenu {
  constructor({ get, set }) {
    this.get = get;
    this.set = set;
    this.slot = 0;
    this.viewer = new GunViewer($('gun-view'));
    $('lo-grid').addEventListener('pointerleave', () => this.preview(this.get()[this.slot]));
  }

  open() {
    this.render();
    this.viewer.show();
    this.preview(this.get()[this.slot]);
  }

  close() {
    this.viewer.hide();
  }

  pick(id) {
    const l = [...this.get()], other = 1 - this.slot;
    if (l[other] === id) l[other] = l[this.slot]; // ya equipada en la otra ranura: se intercambian
    l[this.slot] = id;
    this.set(l);
    this.render();
    this.preview(id);
  }

  render() {
    const thumbs = gunThumbnails(), lo = this.get();
    $('lo-slots').replaceChildren(...[0, 1].map((slot) => {
      const id = lo[slot], b = el('button', `lo-slot${slot === this.slot ? ' active' : ''}`);
      const img = el('img');
      img.src = thumbs[id] ?? '';
      img.alt = '';
      b.append(el('small', '', slot ? 'ARMA SECUNDARIA [2]' : 'ARMA PRINCIPAL [1]'), el('b', '', CFG.weapons[id].name), img);
      b.addEventListener('click', () => { this.slot = slot; this.render(); this.preview(id); });
      return b;
    }));
    $('lo-grid').replaceChildren(...Object.entries(CFG.weapons).map(([id, w]) => {
      const slotOf = lo.indexOf(id);
      const b = el('button', `wcard${w.alien ? ' alien' : ''}${slotOf >= 0 ? ' equipped' : ''}${id === this.focus ? ' preview' : ''}`);
      b.dataset.id = id;
      const img = el('img');
      img.src = thumbs[id] ?? '';
      img.alt = '';
      b.append(img, el('b', '', w.name), el('small', '', GUN_INFO[id]?.cls ?? ''));
      if (slotOf >= 0) b.append(el('span', 'slot-tag', slotOf ? '2' : '1'));
      b.addEventListener('pointerenter', () => this.preview(id));
      b.addEventListener('focus', () => this.preview(id));
      b.addEventListener('click', () => this.pick(id));
      return b;
    }));
  }

  preview(id) {
    if (!id || !CFG.weapons[id]) return;
    this.focus = id;
    for (const c of $('lo-grid').children) c.classList.toggle('preview', c.dataset.id === id);
    const w = CFG.weapons[id], info = GUN_INFO[id] ?? {};
    this.viewer.setGun(id);
    $('gi-name').textContent = w.name;
    $('gi-class').textContent = info.cls ?? '';
    $('gi-desc').textContent = info.desc ?? '';
    $('gi-name').closest('.lo-info').classList.toggle('alien', !!w.alien);
    $('gi-stats').replaceChildren(...stats(w, id).map(([k, v]) => {
      const d = el('div');
      d.append(el('dt', '', k), el('dd', '', v));
      return d;
    }));
    $('gi-bars').replaceChildren(...bars(w, id).flatMap(([k, v]) => {
      const bar = el('div', 'bar'), fill = el('i');
      fill.style.width = `${Math.round(v * 100)}%`;
      bar.append(fill);
      return [el('span', '', k), bar];
    }));
  }
}
