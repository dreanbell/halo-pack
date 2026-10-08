import * as THREE from 'three';
import { clamp } from './config.js';

// Modo espectador (multijugador): al caer, la cámara sigue en tercera persona a otro jugador vivo.
const DIST = { min: 1.6, max: 6, def: 3.2 };
const SHOULDER = 0.45; // desplazamiento lateral de la cámara (sobre el hombro derecho)
const _pivot = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _cam = new THREE.Vector3();
const _ray = new THREE.Raycaster();

export class Spectator {
  constructor(ctx) {
    this.ctx = ctx;
    this.active = false;
    this.delay = 0;
    this.targetId = null;
    this.orbitYaw = 0;
    this.orbitPitch = 0;
    this.dist = DIST.def;
    this.curDist = DIST.def;

    const viewing = () => this.active && this.delay <= 0 && ctx.game.state === 'playing' && document.pointerLockElement;
    document.addEventListener('mousedown', (e) => {
      if (!viewing()) return;
      if (e.button === 0) this.cycle(1);
      else if (e.button === 2) this.cycle(-1);
    });
    document.addEventListener('mousemove', (e) => {
      if (!viewing() || Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.orbitYaw -= e.movementX * 0.0025;
      this.orbitPitch = clamp(this.orbitPitch - e.movementY * 0.0025, -1.1, 0.9);
    });
    document.addEventListener('wheel', (e) => {
      if (viewing()) this.dist = clamp(this.dist + Math.sign(e.deltaY) * 0.4, DIST.min, DIST.max);
    }, { passive: true });
    addEventListener('keydown', (e) => {
      if (!viewing() || e.repeat) return;
      if (e.code === 'Space' || e.code === 'ArrowRight' || e.code === 'KeyD') this.cycle(1);
      else if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.cycle(-1);
      else if (e.code === 'KeyR') { this.orbitYaw = 0; this.orbitPitch = 0; this.dist = DIST.def; }
    });
  }

  // preferId: a quién seguir primero (p. ej. quien te eliminó). delay: segundos de animación de muerte antes de cambiar.
  start(preferId = null, delay = 1.6) {
    this.active = true;
    this.delay = delay;
    this.targetId = preferId;
    this.orbitYaw = 0;
    this.orbitPitch = -0.12;
    this.curDist = this.dist;
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.targetId = null;
    const { player, hud, arsenal } = this.ctx;
    player.pitch.rotation.z = 0;
    arsenal.vm.visible = true;
    hud.spectate(null);
  }

  candidates() {
    return this.ctx.remotes.alive().sort((a, b) => a.id - b.id);
  }

  target() {
    const r = this.ctx.remotes.get(this.targetId);
    return r && r.alive && r.buf.length ? r : null;
  }

  cycle(step) {
    const list = this.candidates();
    if (!list.length) return;
    const i = list.findIndex((r) => r.id === this.targetId);
    const next = list[(i + step + list.length) % list.length];
    if (next.id === this.targetId) return;
    this.targetId = next.id;
    this.curDist = this.dist;
    this.ctx.sfx.zoom();
  }

  // El más cercano a la posición donde caíste (o al anterior objetivo).
  pickNearest() {
    const from = this.ctx.remotes.get(this.targetId)?.pos ?? this.ctx.player.pos;
    let best = null, bestD = Infinity;
    for (const r of this.candidates()) {
      const d = r.pos.distanceToSquared(from);
      if (d < bestD) { best = r; bestD = d; }
    }
    return best;
  }

  // Devuelve el jugador observado (o null). Llamar tras player/remotes/arsenal.update.
  update(dt) {
    if (!this.active) return null;
    const { player, hud, arsenal, world, net } = this.ctx;
    if (this.delay > 0) {
      this.delay -= dt;
      if (this.delay > 0) return null;
    }
    let t = this.target();
    if (!t) {
      t = this.pickNearest();
      this.targetId = t?.id ?? null;
      this.curDist = this.dist;
    }
    if (!t) { hud.spectate(null); return null; }

    // Cámara: detrás del objetivo, siguiendo su mirada más el giro libre del ratón.
    const yaw = t.yaw + this.orbitYaw;
    const pitch = clamp(t.pitch * 0.5 + this.orbitPitch, -1.2, 1.0);
    _dir.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    _right.set(Math.cos(yaw), 0, -Math.sin(yaw));
    _pivot.copy(t.eye()).addScaledVector(_right, SHOULDER);
    _pivot.y += 0.15;
    // Sin atravesar paredes: acorta la distancia si hay geometría detrás.
    _ray.set(_pivot, _cam.copy(_dir).negate());
    _ray.far = this.dist + 0.3;
    const hit = _ray.intersectObjects(world.solids, false)[0];
    const want = hit ? Math.max(0.4, hit.distance - 0.3) : this.dist;
    this.curDist = want < this.curDist ? want : this.curDist + (want - this.curDist) * Math.min(1, dt * 4);
    _cam.copy(_pivot).addScaledVector(_dir, -this.curDist);

    player.yaw.position.copy(_cam);
    player.yaw.rotation.set(0, yaw, 0);
    player.pitch.rotation.set(pitch, 0, 0);
    this.ctx.camera.position.set(0, 0, 0);
    arsenal.vm.visible = false;
    t.tag.visible = false; // la etiqueta propia taparía la vista

    const kills = this.ctx.game.mode === 'dm' ? net.players.get(t.id)?.kills : this.ctx.director.scores.get(t.id)?.kills;
    hud.spectate({
      id: t.id, name: t.name, color: t.colorHex, shield: t.shield, health: t.health, weapon: t.weapon,
      kills: kills ?? 0, count: this.candidates().length,
    });
    return t;
  }
}
