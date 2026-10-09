import { CFG } from './config.js';
import { gunThumbnails } from './gunview.js';
import { S } from './settings.js';
import { Vector3 } from 'three';

const _p = new Vector3();

const IDS = [
  'hud', 'menu', 'pause', 'gameover', 'lobby', 'armory', 'loadout', 'setup', 'shield-bar', 'shield-fill', 'health-bar', 'health-fill',
  'crosshair', 'hitmarker', 'weapon-name', 'ammo', 'ammo-mag', 'ammo-res', 'heat', 'heat-fill',
  'grenades', 'radar', 'score', 'banner', 'banner-title', 'banner-sub',
  'toast', 'hint', 'vignette', 'dmg-dir', 'go-stats', 'go-title', 'btn-retry', 'feed', 'scoreboard', 'sb-title',
  'sb-table', 'wave-info', 'score-label', 'weapon-alt', 'scope', 'boss', 'boss-name', 'boss-hp', 'boss-sh', 'timer',
  'weapon-icon', 'reload', 'reload-fill', 'scope-zoom', 'scope-range',
  'spectate', 'spec-name', 'spec-sub',
];
const RADAR_RANGE = 30;

export class Hud {
  constructor() {
    this.el = Object.fromEntries(IDS.map((id) => [id, document.getElementById(id)]));
    this.radar = this.el.radar.getContext('2d');
    this.cache = new Map();
    this.timers = {};
    this.dmgFlash = 0;
    this.spec = null;
  }

  text(id, v) {
    v = String(v);
    if (this.cache.get(id) !== v) { this.cache.set(id, v); this.el[id].textContent = v; }
  }

  style(id, prop, v) {
    const key = `${id}.${prop}`;
    if (this.cache.get(key) !== v) { this.cache.set(key, v); this.el[id].style.setProperty(prop, v); }
  }

  attr(id, name, v) {
    const key = `${id}@${name}`;
    if (this.cache.get(key) !== v) { this.cache.set(key, v); this.el[id].setAttribute(name, v); }
  }

  toggle(id, cls, on) {
    this.el[id].classList.toggle(cls, !!on);
  }

  showOverlay(name) {
    for (const n of ['menu', 'pause', 'gameover', 'lobby', 'armory', 'loadout', 'setup']) this.toggle(n, 'hidden', n !== name);
    this.toggle('hud', 'hidden', ['menu', 'lobby', 'armory', 'loadout', 'setup'].includes(name));
  }

  reset() {
    this.cache.clear();
    this.dmgFlash = 0;
    for (const t of Object.values(this.timers)) clearTimeout(t);
    this.toggle('banner', 'show', false);
    this.toggle('toast', 'show', false);
    this.el.feed.replaceChildren();
    this.toggle('scoreboard', 'hidden', true);
    this.spectate(null);
  }

  // Modo espectador: info = { name, color, shield, health, weapon, kills, count } o null para salir.
  spectate(info) {
    this.spec = info;
    this.toggle('hud', 'spectating', info);
    if (!info) return;
    this.text('spec-name', info.name.toUpperCase());
    this.style('spec-name', 'color', info.color);
    const w = CFG.weapons[info.weapon]?.name ?? '';
    this.text('spec-sub', [w, info.kills != null && `${info.kills} BAJAS`].filter(Boolean).join(' · '));
  }

  // Entrada del registro de bajas: partes = [{ text, color? }].
  feed(parts) {
    const row = document.createElement('div');
    for (const { text, color } of parts) {
      const span = document.createElement('span');
      span.textContent = text;
      if (color) span.style.color = color;
      row.append(span);
    }
    this.el.feed.prepend(row);
    while (this.el.feed.children.length > 5) this.el.feed.lastChild.remove();
    setTimeout(() => row.remove(), 6000);
  }

  // rows: [{ name, color, cols: [...], me }]
  table(el, headers, rows) {
    const tr = (cells, tag, cls) => {
      const r = document.createElement('tr');
      if (cls) r.className = cls;
      cells.forEach((c) => {
        const td = document.createElement(tag);
        td.textContent = c;
        r.append(td);
      });
      return r;
    };
    el.replaceChildren(tr(headers, 'th'), ...rows.map((row) => {
      const r = tr([row.name, ...row.cols], 'td', row.me ? 'me' : '');
      r.firstChild.style.color = row.color;
      return r;
    }));
  }

  scoreboard(show, title, headers, rows) {
    this.toggle('scoreboard', 'hidden', !show);
    if (!show) return;
    this.el['sb-title'].textContent = title;
    this.table(this.el['sb-table'], headers, rows);
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
    if (!S.hitmarker) return;
    const h = this.el.hitmarker;
    // Web Animations: reinicia sin forzar un recálculo de diseño (antes, offsetWidth en cada impacto).
    h.classList.toggle('kill', kill);
    this.hmAnim?.cancel();
    this.hmAnim = h.animate([
      { opacity: 1, transform: 'translate(-50%, -50%) rotate(45deg) scale(1.3)' },
      { opacity: 0, transform: 'translate(-50%, -50%) rotate(45deg) scale(1)' },
    ], { duration: kill ? 350 : 200, easing: 'ease-out' });
  }

  // Números de daño flotantes (ajuste «Números de daño»): un grupo fijo de etiquetas reutilizadas.
  // kind: '' normal · 'head' cabeza (amarillo) · 'shield' escudo (azul) · 'kill' baja (rojo, más grande).
  dmgNumber(pos, amount, kind = '') {
    if (!S.dmgNumbers || !(amount > 0)) return;
    if (!this.nums) {
      const box = document.getElementById('dmgnums');
      this.nums = Array.from({ length: 18 }, () => { const e = document.createElement('span'); box.appendChild(e); return { e, t: 1, p: new Vector3() }; });
      this.numI = 0;
    }
    // Mismo objetivo en menos de 0,12 s (escopeta): se suma al número anterior.
    const last = this.nums[(this.numI + this.nums.length - 1) % this.nums.length];
    if (last.t < 0.12 && last.p.distanceToSquared(pos) < 1.5 && last.kind === kind) {
      last.v += amount;
      last.e.textContent = Math.round(last.v);
      return;
    }
    const n = this.nums[this.numI];
    this.numI = (this.numI + 1) % this.nums.length;
    n.p.copy(pos).add(_p.set((Math.random() - 0.5) * 0.4, 0.2, (Math.random() - 0.5) * 0.4));
    n.t = 0;
    n.v = amount;
    n.kind = kind;
    n.e.className = `on ${kind}`;
    n.e.textContent = Math.round(amount);
  }

  updateNumbers(camera, dt) {
    if (!this.nums) return;
    const W = innerWidth / 2, H = innerHeight / 2, z = 1 / (S.hudScale || 1);
    for (const n of this.nums) {
      if (n.t >= 0.85) continue;
      n.t += dt;
      if (n.t >= 0.85) { n.e.className = ''; continue; }
      _p.copy(n.p).setY(n.p.y + n.t * 0.7).project(camera);
      if (_p.z > 1) { n.e.style.opacity = 0; continue; }
      const k = n.t / 0.85;
      n.e.style.opacity = (k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4).toFixed(2);
      n.e.style.transform = `translate(${((_p.x * W + W) * z).toFixed(1)}px, ${((-_p.y * H + H) * z).toFixed(1)}px) translate(-50%, -50%) scale(${(1 + Math.max(0, 0.15 - n.t) * 3).toFixed(2)})`;
    }
  }

  damage(angle, intensity) {
    this.dmgFlash = Math.min(1, this.dmgFlash + 0.15 + 0.35 * intensity);
    if (angle == null) return;
    this.el['dmg-dir'].style.transform = `rotate(${angle}rad)`;
    this.flashClass('dmg-dir', 'show', 80);
  }

  update(ctx, dt) {
    const { player: p, arsenal: a, director: d, game: g, rules: r } = ctx;
    this.updateNumbers(ctx.camera, dt);
    const P = CFG.player;
    const sp = this.spec;
    // Espectando: las barras muestran el estado del jugador observado.
    const shield = sp ? sp.shield : p.shield, health = sp ? sp.health : p.health;

    const maxShield = sp ? (r.shields ? P.maxShield : 0) : p.maxShield;
    this.toggle('shield-bar', 'hidden', !maxShield);
    if (maxShield) this.style('shield-fill', 'width', `${((shield / maxShield) * 100).toFixed(1)}%`);
    this.toggle('shield-bar', 'low', shield < maxShield * 0.25);
    this.toggle('shield-bar', 'charging', !sp && p.recharging);
    this.style('health-fill', 'width', `${((health / P.maxHealth) * 100).toFixed(1)}%`);
    this.toggle('health-bar', 'low', health < 35);

    const sl = a.w, wd = sl.def, other = a.slots[1 - a.current];
    this.text('weapon-name', wd.name);
    if (this.cache.get('icon') !== sl.id) {
      this.cache.set('icon', sl.id);
      const url = `url(${gunThumbnails()[sl.id]})`;
      this.el['weapon-icon'].style.maskImage = this.el['weapon-icon'].style.webkitMaskImage = url;
    }
    const reloading = a.reloadT > 0 && wd.reload;
    this.toggle('reload', 'hidden', !reloading);
    if (reloading) this.style('reload-fill', 'width', `${((1 - a.reloadT / wd.reload) * 100).toFixed(1)}%`);
    this.text('weapon-alt', other ? `${other.def.name} [Q]` : '');
    this.toggle('ammo', 'hidden', !wd.mag);
    this.toggle('heat', 'hidden', !wd.heat);
    if (wd.mag) {
      this.text('ammo-mag', sl.mag);
      this.text('ammo-res', a.infinite ? '/ ∞' : `/ ${sl.reserve}`);
      this.toggle('ammo', 'low', sl.mag <= Math.ceil(wd.mag / 4));
    } else {
      this.style('heat-fill', 'width', `${(sl.heat * 100).toFixed(1)}%`);
      this.toggle('heat', 'over', sl.overT > 0);
    }
    this.text('grenades', '◆'.repeat(a.grenades) + '◇'.repeat(CFG.grenade.max - a.grenades));
    if (g.mode === 'dm') {
      const net = ctx.net, me = net.players.get(net.id), hill = r.objective === 'hill';
      const val = (p) => (hill ? p.pts ?? 0 : p.kills);
      const lead = [...net.players.values()].sort((x, y) => val(y) - val(x))[0];
      this.text('score', `${me ? val(me) : 0} / ${hill ? r.scoreLimit * 4 : r.scoreLimit}`);
      this.text('score-label', hill ? 'PUNTOS DE COLINA' : r.objective === 'gungame' ? `ARMA ${Math.min(r.scoreLimit, (me?.kills ?? 0) + 1)} · ${a.w?.def.name ?? ''}` : 'BAJAS');
      this.text('wave-info', lead ? `LÍDER: ${lead.name.toUpperCase()} · ${val(lead)}` : '');
    } else {
      this.text('score', g.score.toLocaleString('es-ES'));
      this.text('score-label', g.mode === 'coop' ? `TUS BAJAS ${g.kills}` : '');
      const lives = r.lives ? ` · VIDAS ${d.lives}` : '';
      this.text('wave-info', `OLEADA ${d.state === 'combat' ? g.wave : g.wave + 1} · ${d.state === 'combat' ? `${d.remaining()} HOSTILES` : 'PREPARANDO…'}${lives}`);
    }

    // Visor (DMR / francotirador) con telémetro; retícula propia de cada arma al disparar desde la cadera.
    const scoped = wd.scope && a.zoom > 1.5;
    this.toggle('scope', 'hidden', !scoped);
    if (scoped) {
      this.attr('scope', 'data-k', wd.scope);
      this.text('scope-zoom', `×${wd.zoom}`);
      this.text('scope-range', a.aimDist ? `${Math.round(a.aimDist)} m` : '--- m');
      this.toggle('scope', 'enemy', a.aimEnemy);
    }
    this.attr('crosshair', 'data-w', sl.id);
    this.toggle('crosshair', 'enemy', a.aimEnemy);
    const xo = Math.max(0, 1 - a.aimK * 2.2) * (1 - 0.6 * a.sprintK);
    this.style('crosshair', 'opacity', xo.toFixed(2));
    // Retícula viva: se abre con la dispersión real, cada disparo y al esprintar/saltar, y se cierra suave.
    const xs = (wd.kind === 'pellets' ? 22 : 5 + a.spread() * 280) + a.recoil * 9 + a.sprintK * 6;
    this.xs = this.xs === undefined ? xs : this.xs + (xs - this.xs) * (1 - Math.exp(-(xs > this.xs ? 30 : 9) * dt));
    this.style('crosshair', '--s', `${this.xs.toFixed(1)}px`);

    let hint = '';
    const box = d.boxes.length ? d.boxPrompt() : '';
    if (!p.alive && g.respawnIn > 0) hint = `REAPARECES EN ${Math.ceil(g.respawnIn)}`;
    else if (!p.alive && g.lifePending) hint = 'CAÍDO';
    else if (!p.alive && g.mode === 'coop') hint = r.lives ? 'SIN VIDAS · ESPERA A QUE EL EQUIPO GANE UNA' : 'CAÍDO · REAPARECES EN LA PRÓXIMA OLEADA';
    else if (box) hint = box;
    else if (a.reloadT > 0) hint = 'RECARGANDO';
    else if (wd.heat && sl.overT > 0) hint = 'SOBRECALENTADA';
    else if (wd.mag && sl.mag === 0 && sl.reserve === 0) hint = 'SIN MUNICIÓN · CAMBIA DE ARMA [Q]';
    else if (wd.mag && sl.mag <= Math.ceil(wd.mag / 5) && sl.reserve > 0) hint = 'RECARGA [R]';
    this.text('hint', hint);

    this.dmgFlash = Math.max(0, this.dmgFlash - dt * 1.8);
    const low = !sp && p.health < 40 ? (1 - p.health / 40) * 0.7 : 0;
    this.style('vignette', 'opacity', Math.max(this.dmgFlash, low).toFixed(2));

    // Barra del jefe.
    const boss = d.enemies.find((e) => e.cfg.boss && !e.dead);
    this.toggle('boss', 'hidden', !boss);
    if (boss) {
      this.text('boss-name', `${boss.cfg.label}${(boss.flags & 4) ? ' · FURIA' : ''}`);
      this.style('boss-hp', 'width', `${Math.max(0, (boss.hp / boss.maxHp) * 100).toFixed(1)}%`);
      this.style('boss-sh', 'width', `${boss.maxShield ? Math.max(0, (boss.shield / boss.maxShield) * 100).toFixed(1) : 0}%`);
    }
    // Tiempo restante.
    const tl = g.timeLeft;
    this.toggle('timer', 'hidden', !Number.isFinite(tl));
    if (Number.isFinite(tl)) {
      this.text('timer', `${Math.floor(tl / 60)}:${String(Math.floor(tl % 60)).padStart(2, '0')}`);
      this.toggle('timer', 'low', tl < 30);
    }

    const radar = r.radar && S.radar;
    this.toggle('radar', 'hidden', !radar);
    if (!radar) return;
    // El radar no necesita 60 Hz: ~20 Hz basta y ahorra rasterizar el lienzo 2D en cada fotograma (sobre todo en móvil).
    this.radarT = (this.radarT ?? 0) - dt;
    if (this.radarT > 0) return;
    this.radarT = 0.05;
    const view = sp ? ctx.remotes.get(sp.id) : null;
    if (view) this.drawRadar(view.pos, view.yaw, d.enemies, ctx.remotes.list().filter((x) => x !== view), g.mode);
    else this.drawRadar(p.pos, p.yaw.rotation.y, d.enemies, ctx.remotes.list(), g.mode);
  }

  drawRadar(pos, yaw, enemies, remotes = [], mode = 'sp') {
    const c = this.radar, W = c.canvas.width, cx = W / 2, R = W / 2 - 6;
    c.clearRect(0, 0, W, W);
    c.fillStyle = 'rgba(8,24,34,0.55)';
    c.beginPath(); c.arc(cx, cx, R, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(127,231,255,0.35)';
    c.lineWidth = 1.5;
    for (const k of [1, 2 / 3, 1 / 3]) { c.beginPath(); c.arc(cx, cx, R * k, 0, Math.PI * 2); c.stroke(); }
    c.beginPath(); c.moveTo(cx, cx - R); c.lineTo(cx, cx + R); c.moveTo(cx - R, cx); c.lineTo(cx + R, cx); c.stroke();

    const s = Math.sin(yaw), co = Math.cos(yaw);
    // Los Stalker camuflados no aparecen en el radar.
    const blips = enemies.filter((e) => !e.dead && (e.flags & 1)).map((e) => ({ pos: e.pos, big: e.cfg.scale > 1.1, color: e.cfg.boss ? '#ffb340' : '#ff4d5e' }));
    const now = performance.now();
    for (const r of remotes) {
      if (!r.alive) continue;
      // Rivales: solo aparecen si corren o han disparado hace poco (agacharse/caminar despacio oculta).
      const loud = Math.hypot(r.vel.x, r.vel.z) > 3.5 || now - r.lastShot < 1500;
      if (mode === 'dm' && !loud) continue;
      blips.push({ pos: r.pos, big: false, color: mode === 'dm' ? '#ff4d5e' : r.colorHex, ally: mode !== 'dm' });
    }
    for (const e of blips) {
      const rx = e.pos.x - pos.x, rz = e.pos.z - pos.z;
      let right = rx * co - rz * s, fwd = -rx * s - rz * co;
      const dist = Math.hypot(right, fwd);
      const edge = dist > RADAR_RANGE;
      if (edge) { right *= RADAR_RANGE / dist; fwd *= RADAR_RANGE / dist; }
      const x = cx + (right / RADAR_RANGE) * R, y = cx - (fwd / RADAR_RANGE) * R;
      const size = e.big ? 6 : 4.5;
      c.globalAlpha = edge ? 0.35 : 1;
      c.fillStyle = c.strokeStyle = e.color;
      c.beginPath();
      if (e.ally) { c.rect(x - 4, y - 4, 8, 8); } else c.arc(x, y, size, 0, Math.PI * 2);
      if (Math.abs(e.pos.y - pos.y) > 2) { c.lineWidth = 2; c.stroke(); } else c.fill();
    }
    c.globalAlpha = 1;
    c.fillStyle = '#ffe27a';
    c.beginPath(); c.moveTo(cx, cx - 8); c.lineTo(cx - 6, cx + 6); c.lineTo(cx + 6, cx + 6); c.closePath(); c.fill();
  }

  // Resultados de partida multijugador.
  showResults(title, headers, rows, button) {
    this.el['go-title'].textContent = title;
    const table = document.createElement('table');
    table.className = 'results';
    this.table(table, headers, rows);
    this.el['go-stats'].replaceChildren(table);
    this.el['btn-retry'].textContent = button;
    this.showOverlay('gameover');
  }

  showGameOver({ wave, kills, score, best, time, title = 'FIN DE LA PARTIDA', recordLabel = 'Récord' }) {
    this.el['go-title'].textContent = title;
    this.el['btn-retry'].textContent = 'REINTENTAR';
    const m = Math.floor(time / 60), s = String(Math.floor(time % 60)).padStart(2, '0');
    const rows = [
      ['Oleada alcanzada', wave], ['Bajas', kills], ['Tiempo', `${m}:${s}`],
      ['Puntuación', score.toLocaleString('es-ES')], ...(best === null ? [] : [[recordLabel, best.toLocaleString('es-ES')]]),
    ];
    this.el['go-stats'].replaceChildren(...rows.flatMap(([k, v]) => {
      const a = document.createElement('span'); a.textContent = k;
      const b = document.createElement('b'); b.textContent = v;
      return [a, b];
    }));
    this.showOverlay('gameover');
  }
}
