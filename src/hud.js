import { CFG } from './config.js';

const IDS = [
  'hud', 'menu', 'pause', 'gameover', 'lobby', 'armory', 'loadout', 'shield-bar', 'shield-fill', 'health-bar', 'health-fill',
  'crosshair', 'hitmarker', 'weapon-name', 'ammo', 'ammo-mag', 'ammo-res', 'heat', 'heat-fill',
  'grenades', 'radar', 'score', 'banner', 'banner-title', 'banner-sub',
  'toast', 'hint', 'vignette', 'dmg-dir', 'go-stats', 'go-title', 'btn-retry', 'feed', 'scoreboard', 'sb-title',
  'sb-table', 'wave-info', 'score-label', 'weapon-alt', 'scope', 'boss', 'boss-name', 'boss-hp', 'boss-sh',
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

  toggle(id, cls, on) {
    this.el[id].classList.toggle(cls, !!on);
  }

  showOverlay(name) {
    for (const n of ['menu', 'pause', 'gameover', 'lobby', 'armory', 'loadout']) this.toggle(n, 'hidden', n !== name);
    this.toggle('hud', 'hidden', ['menu', 'lobby', 'armory', 'loadout'].includes(name));
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
    const sp = this.spec;
    // Espectando: las barras muestran el estado del jugador observado.
    const shield = sp ? sp.shield : p.shield, health = sp ? sp.health : p.health;

    this.style('shield-fill', 'width', `${((shield / P.maxShield) * 100).toFixed(1)}%`);
    this.toggle('shield-bar', 'low', shield < P.maxShield * 0.25);
    this.toggle('shield-bar', 'charging', !sp && p.recharging);
    this.style('health-fill', 'width', `${((health / P.maxHealth) * 100).toFixed(1)}%`);
    this.toggle('health-bar', 'low', health < 35);

    const sl = a.w, wd = sl.def, other = a.slots[1 - a.current];
    this.text('weapon-name', wd.name);
    this.text('weapon-alt', other ? `${other.def.name} [Q]` : '');
    this.toggle('ammo', 'hidden', !wd.mag);
    this.toggle('heat', 'hidden', !wd.heat);
    if (wd.mag) {
      this.text('ammo-mag', sl.mag);
      this.text('ammo-res', `/ ${sl.reserve}`);
      this.toggle('ammo', 'low', sl.mag <= Math.ceil(wd.mag / 4));
    } else {
      this.style('heat-fill', 'width', `${(sl.heat * 100).toFixed(1)}%`);
      this.toggle('heat', 'over', sl.overT > 0);
    }
    this.text('grenades', '◆'.repeat(a.grenades) + '◇'.repeat(CFG.grenade.max - a.grenades));
    if (g.mode === 'dm') {
      const net = ctx.net, me = net.players.get(net.id);
      const lead = [...net.players.values()].sort((x, y) => y.kills - x.kills)[0];
      this.text('score', `${me?.kills ?? 0} / ${net.scoreLimit}`);
      this.text('score-label', 'BAJAS');
      this.text('wave-info', lead ? `LÍDER: ${lead.name.toUpperCase()} · ${lead.kills}` : '');
    } else {
      this.text('score', g.score.toLocaleString('es-ES'));
      this.text('score-label', g.mode === 'coop' ? `CRÉDITOS ${d.credits()} · TUS BAJAS ${g.kills}` : '');
      this.text('wave-info', `OLEADA ${Math.max(1, g.wave)} · ${d.state === 'combat' ? `${d.remaining()} HOSTILES` : 'PREPARANDO…'}`);
    }

    const scoped = wd.scope && a.zoom > 1;
    this.toggle('scope', 'hidden', !scoped);
    this.toggle('crosshair', 'hidden', scoped);
    this.toggle('crosshair', 'pistol', !wd.auto);
    this.toggle('crosshair', 'enemy', a.aimEnemy);
    this.style('crosshair', '--s', `${(wd.kind === 'pellets' ? 22 : 7 + a.spread() * 300).toFixed(1)}px`);

    let hint = '';
    const box = g.mode === 'coop' ? d.boxPrompt() : '';
    if (!p.alive && g.respawnIn > 0) hint = `REAPARECES EN ${Math.ceil(g.respawnIn)}`;
    else if (!p.alive && g.mode === 'coop') hint = 'CAÍDO · REAPARECES EN LA PRÓXIMA OLEADA';
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
    const view = sp ? ctx.remotes.get(sp.id) : null;
    if (view) this.drawRadar(view.pos, view.yaw, d.enemies, ctx.remotes.list().filter((r) => r !== view), g.mode);
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

  showGameOver({ wave, kills, score, best, time }) {
    this.el['go-title'].textContent = 'FIN DE LA PARTIDA';
    this.el['btn-retry'].textContent = 'REINTENTAR';
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
