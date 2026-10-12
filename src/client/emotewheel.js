import * as THREE from 'three';
import { Avatar } from './avatar.js';
import { EMOTES, WHEEL_SIZE } from '../shared/emotes.js';
import { emoteDone } from './emotes.js';
import { shopThumb } from './shopview.js';

// Emotes en partida: rueda (mantén B, mueve el ratón y suelta; en móvil, botón ☺ y toca uno), cámara en tercera
// persona que gira con el ratón alrededor del soldado, y el número de emote viaja en el estado de red ('st').
// Moverse, saltar, disparar, apuntar o recibir daño lo cancela.
const KEY = 'ringfall.wheel';
const DEFAULT_WHEEL = ['venaqui', 'hombros', 'senalar', 'rendicion'].map((id) => EMOTES.findIndex((e) => e.id === id));
const DIST = 3.1;
const _pivot = new THREE.Vector3(), _dir = new THREE.Vector3(), _cam = new THREE.Vector3(), _ray = new THREE.Raycaster();

export class EmoteController {
  constructor(ctx) {
    this.ctx = ctx;
    this.active = null; // { i, t, yaw, pitch }
    this.count = 0; // cuántos se han empezado (los demás reinician la animación aunque repitas el mismo)
    this.wheelOpen = false;
    this.sel = -1;
    this.av = null;
    this.avKey = '';
    try { this.slots = (JSON.parse(localStorage.getItem(KEY) ?? 'null') ?? DEFAULT_WHEEL).filter((i) => EMOTES[i]); } catch { this.slots = [...DEFAULT_WHEEL]; }
    this.buildWheel();
    const touch = () => document.body.classList.contains('touch');
    addEventListener('keydown', (e) => {
      if (e.code !== 'KeyB' || e.repeat) return;
      if (this.wheelOpen && touch()) this.close();
      else this.open();
    });
    addEventListener('keyup', (e) => { if (e.code === 'KeyB' && this.wheelOpen && !touch()) this.close(true); });
    document.addEventListener('mousemove', (e) => {
      if (!this.wheelOpen || !document.pointerLockElement || Math.abs(e.movementX) > 400) return;
      this.mx = Math.max(-120, Math.min(120, this.mx + e.movementX));
      this.my = Math.max(-120, Math.min(120, this.my + e.movementY));
      if (Math.hypot(this.mx, this.my) > 28) this.select(Math.round(((Math.atan2(this.mx, -this.my) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI / WHEEL_SIZE)) % WHEEL_SIZE);
    });
    // Clic con la rueda abierta: elige (y no dispara: se corta antes de llegar al arma).
    document.addEventListener('mousedown', (e) => {
      if (!this.wheelOpen || !document.pointerLockElement) return;
      e.stopPropagation();
      if (e.button === 0) this.close(true);
    }, true);
  }

  // --- Rueda --------------------------------------------------------------------------------------------
  get owned() { return this.ctx.wallet ? EMOTES.map((_, i) => i).filter((i) => this.ctx.wallet.owns('o', i)) : DEFAULT_WHEEL; }
  wheel() { const own = new Set(this.owned); return this.slots.filter((i) => own.has(i)).slice(0, WHEEL_SIZE); }
  inWheel(i) { return this.wheel().includes(i); }
  // true si se pudo (la rueda tiene 8 huecos).
  toggle(i) {
    const w = this.wheel();
    if (w.includes(i)) this.slots = w.filter((x) => x !== i);
    else if (w.length >= WHEEL_SIZE) return false;
    else this.slots = [...w, i];
    try { localStorage.setItem(KEY, JSON.stringify(this.slots)); } catch { /* sin almacenamiento */ }
    return true;
  }
  add(i) { if (!this.inWheel(i)) this.toggle(i); }
  // En el menú: deja hechas las miniaturas de la rueda (en partida no se generan).
  prefetch() { for (const i of this.wheel()) shopThumb('o', i, this.ctx.skin, () => {}); }

  buildWheel() {
    const el = (this.el = document.createElement('div'));
    el.id = 'emote-wheel';
    el.className = 'hidden';
    el.innerHTML = '<div class="ew-ring"></div><div class="ew-center"><b id="ew-name">EMOTES</b><small id="ew-hint"></small></div>';
    this.slotEls = [];
    for (let k = 0; k < WHEEL_SIZE; k++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ew-slot';
      const a = (k / WHEEL_SIZE) * 2 * Math.PI;
      b.style.left = `${50 + Math.sin(a) * 38}%`;
      b.style.top = `${50 - Math.cos(a) * 38}%`;
      b.addEventListener('pointerenter', () => this.select(k));
      b.addEventListener('click', (ev) => { ev.stopPropagation(); this.select(k); this.close(true); });
      el.append(b);
      this.slotEls.push(b);
    }
    el.addEventListener('click', () => this.close());
    (document.getElementById('hud') ?? document.body).append(el);
  }

  canEmote() {
    const { game, player } = this.ctx;
    return game.state === 'playing' && player.alive && player.onGround && !this.ctx.spectator?.active;
  }

  open() {
    if (!this.canEmote()) return;
    const w = this.wheel();
    this.slotEls.forEach((b, k) => {
      const i = w[k];
      b.replaceChildren();
      b.disabled = i === undefined;
      b.classList.toggle('empty', i === undefined);
      if (i === undefined) return;
      const img = document.createElement('span');
      img.className = 'ew-thumb';
      shopThumb('o', i, this.ctx.skin, (url) => { if (url) img.style.backgroundImage = `url(${url})`; });
      const n = document.createElement('b');
      n.textContent = EMOTES[i].name;
      b.append(img, n);
    });
    document.getElementById('ew-hint').textContent = document.body.classList.contains('touch') ? 'Toca uno' : w.length ? 'Mueve el ratón y suelta B' : 'Consíguelos en la tienda';
    this.wheelOpen = true;
    this.mx = this.my = 0;
    this.select(-1);
    this.el.classList.remove('hidden');
  }

  select(k) {
    const w = this.wheel();
    this.sel = k >= 0 && w[k] !== undefined ? k : -1;
    this.slotEls.forEach((b, n) => b.classList.toggle('on', n === this.sel));
    document.getElementById('ew-name').textContent = this.sel >= 0 ? EMOTES[w[this.sel]].name : 'EMOTES';
  }

  close(play = false) {
    if (!this.wheelOpen) return;
    this.wheelOpen = false;
    this.el.classList.add('hidden');
    const i = this.wheel()[this.sel];
    if (play && i !== undefined) this.play(i);
  }

  // --- Reproducción ----------------------------------------------------------------------------------------
  play(i) {
    if (!this.canEmote() || !this.ctx.wallet?.owns('o', i)) return;
    const { player } = this.ctx;
    if (!this.active) this.home = { yaw: player.yaw.rotation.y, pitch: player.pitch.rotation.x };
    this.active = { i, t: 0, yaw: this.home.yaw };
    this.count = (this.count + 1) % 1000;
    // La cámara empieza delante, mirando a la cara del soldado.
    player.yaw.rotation.y = this.home.yaw + Math.PI;
    player.pitch.rotation.x = -0.18;
    this.hp = player.health + player.shield;
    this.ensureAvatar();
    this.ctx.scene.add(this.av.root);
    document.body.classList.add('emoting');
  }

  stop() {
    if (!this.active) return;
    const { player, camera, scene } = this.ctx;
    this.active = null;
    player.yaw.rotation.y = this.home.yaw;
    player.pitch.rotation.x = this.home.pitch;
    camera.position.set(0, 0, 0);
    camera.rotation.set(0, 0, 0);
    if (this.av) scene.remove(this.av.root);
    document.body.classList.remove('emoting');
  }

  ensureAvatar() {
    const key = JSON.stringify(this.ctx.skin);
    if (this.av && this.avKey === key) return;
    this.av?.dispose();
    this.av = new Avatar(this.ctx.skin);
    this.avKey = key;
  }

  // Estado para la red: e = emote + 1 (0 = ninguno), ec = contador de inicio.
  net() { return this.active ? { e: this.active.i + 1, ec: this.count, y: this.active.yaw } : null; }

  // Tras player/arsenal/spectator.update.
  update(dt) {
    if (this.wheelOpen && !this.canEmote()) this.close();
    const a = this.active;
    if (!a) return;
    const { player, arsenal, camera, world, game } = this.ctx;
    const moving = Math.hypot(player.vel.x, player.vel.z) > 0.7 || !player.onGround;
    const hit = player.health + player.shield < this.hp - 0.5;
    if (game.state !== 'playing' || !player.alive || moving || hit || arsenal.trigger || arsenal.aimHeld || arsenal.reloadT > 0) { this.stop(); return; }
    a.t += dt;
    if (emoteDone(a.i, a.t)) { this.stop(); return; }

    // Soldado propio en tercera persona.
    const av = this.av;
    av.setWeapon(arsenal.w.id, this.ctx.skin.f?.[arsenal.w.id] ?? 0);
    av.root.position.copy(player.pos);
    av.root.rotation.set(0, a.yaw, 0);
    av.animate(dt, { speed: 0, pitch: 0, alive: true, emote: a });
    av.root.updateMatrixWorld(true);

    // Cámara: orbita con el ratón (el giro del jugador) alrededor del pecho; no atraviesa paredes.
    const yaw = player.yaw.rotation.y, pitch = Math.max(-0.9, Math.min(0.6, player.pitch.rotation.x));
    player.pitch.rotation.x = pitch;
    _dir.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    _pivot.set(player.pos.x, player.pos.y + 1.15, player.pos.z);
    _ray.set(_pivot, _cam.copy(_dir).negate());
    _ray.far = DIST + 0.3;
    const wall = _ray.intersectObjects(world.solids, false)[0];
    const d = wall ? Math.max(0.5, wall.distance - 0.3) : DIST;
    _cam.copy(_pivot).addScaledVector(_dir, -d);
    player.yaw.updateMatrixWorld(true);
    camera.position.copy(player.pitch.worldToLocal(_cam));
    camera.rotation.set(0, 0, 0);
    arsenal.vm.visible = false;
  }
}
