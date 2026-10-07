import { CFG } from './config.js';

const IDS = [
  'hud', 'menu', 'pause', 'gameover', 'shield-bar', 'shield-fill', 'health-bar', 'health-fill',
  'crosshair', 'hitmarker', 'weapon-name', 'ammo', 'ammo-mag', 'ammo-res', 'heat', 'heat-fill',
  'grenades', 'radar', 'score', 'wave-num', 'enemies-left', 'banner', 'banner-title', 'banner-sub',
  'toast', 'hint', 'vignette', 'dmg-dir', 'go-stats',
];
const RADAR_RANGE = 30;

export class Hud {
  constructor() {
    this.el = Object.fromEntries(IDS.map((id) => [id, document.getElementById(id)]));
    this.radar = this.el.radar.getContext('2d');
    this.cache = new Map();
    this.timers = {};
    this.dmgFlash = 0;
  }

  text(id, v) {
    v = String(v);
    if (this.cache.get(id) !== v) { this.cache.set(id, v); this.el[id].textContent = v; }
  }

  style(id, prop, v) {
    const key = `${id}.${prop}`;
    if (this.cache.get(key) !== v) { this.cache.set(key, v); this.el[id].style.setProperty(prop, v); }
  }

  toggle(id, cls, on) {
    this.el[id].classList.toggle(cls, !!on);
  }

  showOverlay(name) {
    for (const n of ['menu', 'pause', 'gameover']) this.toggle(n, 'hidden', n !== name);
    this.toggle('hud', 'hidden', name === 'menu');
  }

  reset() {
    this.cache.clear();
    this.dmgFlash = 0;
    for (const t of Object.values(this.timers)) clearTimeout(t);
    this.toggle('banner', 'show', false);
    this.toggle('toast', 'show', false);
  }

  flashClass(id, cls, ms) {
    this.toggle(id, cls, true);
    clearTimeout(this.timers[id]);
    this.timers[id] = setTimeout(() => this.toggle(id, cls, false), ms);
  }

  banner(title, sub = '', dur = 2.5) {
    this.el['banner-title'].textContent = title;
    this.el['banner-sub'].textContent = sub;
    this.flashClass('banner', 'show', dur * 1000);
  }

  toast(msg, dur = 1.4) {
    this.el.toast.textContent = msg;
    this.flashClass('toast', 'show', dur * 1000);
  }

  hitMarker(kill) {
    const h = this.el.hitmarker;
    h.classList.remove('show', 'kill');
    void h.offsetWidth; // reinicia la animación CSS
    h.classList.add('show');
    if (kill) h.classList.add('kill');
  }

  damage(angle, intensity) {
    this.dmgFlash = Math.min(1, this.dmgFlash + 0.15 + 0.35 * intensity);
    if (angle == null) return;
    this.el['dmg-dir'].style.transform = `rotate(${angle}rad)`;
    this.flashClass('dmg-dir', 'show', 80);
  }

  update(ctx, dt) {
    const { player: p, arsenal: a, director: d, game: g } = ctx;
    const P = CFG.player;

    this.style('shield-fill', 'width', `${((p.shield / P.maxShield) * 100).toFixed(1)}%`);
    this.toggle('shield-bar', 'low', p.shield < P.maxShield * 0.25);
    this.toggle('shield-bar', 'charging', p.recharging);
    this.style('health-fill', 'width', `${((p.health / P.maxHealth) * 100).toFixed(1)}%`);
    this.toggle('health-bar', 'low', p.health < 35);

    const rifle = a.current === 0;
    this.text('weapon-name', rifle ? CFG.rifle.name : CFG.pistol.name);
    this.toggle('ammo', 'hidden', !rifle);
    this.toggle('heat', 'hidden', rifle);
    if (rifle) {
      this.text('ammo-mag', a.mag);
      this.text('ammo-res', `/ ${a.reserve}`);
      this.toggle('ammo', 'low', a.mag <= 8);
    } else {
      this.style('heat-fill', 'width', `${(a.heat * 100).toFixed(1)}%`);
      this.toggle('heat', 'over', a.overT > 0);
    }
    this.text('grenades', '◆'.repeat(a.grenades) + '◇'.repeat(CFG.grenade.max - a.grenades));
    this.text('score', g.score.toLocaleString('es-ES'));
    this.text('wave-num', Math.max(1, g.wave));
    this.text('enemies-left', d.state === 'combat' ? `${d.remaining()} HOSTILES` : 'PREPARANDO…');

    this.toggle('crosshair', 'pistol', !rifle);
    this.toggle('crosshair', 'enemy', a.aimEnemy);
    this.style('crosshair', '--s', `${(rifle ? 12 + a.spread() * 300 : 7).toFixed(1)}px`);

    let hint = '';
    if (a.reloadT > 0) hint = 'RECARGANDO';
    else if (!rifle && a.overT > 0) hint = 'SOBRECALENTADA';
    else if (rifle && a.mag === 0 && a.reserve === 0) hint = 'SIN MUNICIÓN · CAMBIA DE ARMA [Q]';
    else if (rifle && a.mag <= 6 && a.reserve > 0) hint = 'RECARGA [R]';
    this.text('hint', hint);

    this.dmgFlash = Math.max(0, this.dmgFlash - dt * 1.8);
    const low = p.health < 40 ? (1 - p.health / 40) * 0.7 : 0;
    this.style('vignette', 'opacity', Math.max(this.dmgFlash, low).toFixed(2));

    this.drawRadar(p, d.enemies);
  }

  drawRadar(p, enemies) {
    const c = this.radar, W = c.canvas.width, cx = W / 2, R = W / 2 - 6;
    c.clearRect(0, 0, W, W);
    c.fillStyle = 'rgba(8,24,34,0.55)';
    c.beginPath(); c.arc(cx, cx, R, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(127,231,255,0.35)';
    c.lineWidth = 1.5;
    for (const k of [1, 2 / 3, 1 / 3]) { c.beginPath(); c.arc(cx, cx, R * k, 0, Math.PI * 2); c.stroke(); }
    c.beginPath(); c.moveTo(cx, cx - R); c.lineTo(cx, cx + R); c.moveTo(cx - R, cx); c.lineTo(cx + R, cx); c.stroke();

    const s = Math.sin(p.yaw.rotation.y), co = Math.cos(p.yaw.rotation.y);
    for (const e of enemies) {
      if (e.dead) continue;
      const rx = e.pos.x - p.pos.x, rz = e.pos.z - p.pos.z;
      let right = rx * co - rz * s, fwd = -rx * s - rz * co;
      const dist = Math.hypot(right, fwd);
      const edge = dist > RADAR_RANGE;
      if (edge) { right *= RADAR_RANGE / dist; fwd *= RADAR_RANGE / dist; }
      const x = cx + (right / RADAR_RANGE) * R, y = cx - (fwd / RADAR_RANGE) * R;
      const size = e.cfg.scale > 1.1 ? 6 : 4.5;
      c.globalAlpha = edge ? 0.35 : 1;
      c.fillStyle = '#ff4d5e';
      c.beginPath(); c.arc(x, y, size, 0, Math.PI * 2);
      if (Math.abs(e.pos.y - p.pos.y) > 2) { c.strokeStyle = '#ff4d5e'; c.lineWidth = 2; c.stroke(); } else c.fill();
    }
    c.globalAlpha = 1;
    c.fillStyle = '#ffe27a';
    c.beginPath(); c.moveTo(cx, cx - 8); c.lineTo(cx - 6, cx + 6); c.lineTo(cx + 6, cx + 6); c.closePath(); c.fill();
  }

  showGameOver({ wave, kills, score, best, time }) {
    const m = Math.floor(time / 60), s = String(Math.floor(time % 60)).padStart(2, '0');
    const rows = [
      ['Oleada alcanzada', wave], ['Bajas', kills], ['Tiempo', `${m}:${s}`],
      ['Puntuación', score.toLocaleString('es-ES')], ['Récord', best.toLocaleString('es-ES')],
    ];
    this.el['go-stats'].replaceChildren(...rows.flatMap(([k, v]) => {
      const a = document.createElement('span'); a.textContent = k;
      const b = document.createElement('b'); b.textContent = v;
      return [a, b];
    }));
    this.showOverlay('gameover');
  }
}
