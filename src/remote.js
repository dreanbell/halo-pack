import * as THREE from 'three';
import { CFG } from './config.js';
import { Avatar } from './avatar.js';

const DELAY = 100; // ms de retardo de interpolación
const TELEPORT = 6; // m: salto mayor = reaparición, sin interpolar
const _q = new THREE.Vector3();

function nameTag(name, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '700 34px Rajdhani, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 6;
  g.strokeStyle = 'rgba(0,0,0,0.75)';
  g.strokeText(name, 128, 32);
  g.fillStyle = color;
  g.fillText(name, 128, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  s.scale.set(1.6, 0.4, 1);
  s.renderOrder = 10;
  return s;
}

const lerpAngle = (a, b, t) => a + (Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t);

class RemotePlayer {
  constructor(ctx, info) {
    this.ctx = ctx;
    this.id = info.id;
    this.name = info.name;
    this.colorHex = info.color;
    this.skin = info.skin;
    this.pos = new THREE.Vector3(0, -100, 0);
    this.vel = new THREE.Vector3();
    this.height = CFG.player.height;
    this.alive = false;
    this.yaw = 0;
    this.pitch = 0;
    this.weapon = 'rifle';
    this.health = 100;
    this.shield = 100;
    this.buf = [];
    this.lastShot = -1e9;
    this._eye = new THREE.Vector3();
    this.build();
  }

  build() {
    this.avatar = new Avatar(this.skin);
    this.avatar.setOwner(this);
    this.group = this.avatar.root;
    this.hitMeshes = this.avatar.hitboxes;
    this.tag = nameTag(this.name, this.colorHex);
    this.tag.position.y = 2.15;
    this.group.add(this.tag);
    this.ctx.scene.add(this.group);
  }

  eye() {
    return this._eye.set(this.pos.x, this.pos.y + this.height, this.pos.z);
  }

  push(s) {
    const now = performance.now();
    const last = this.buf[this.buf.length - 1];
    if (last && Math.hypot(s.p[0] - last.p[0], s.p[1] - last.p[1], s.p[2] - last.p[2]) > TELEPORT) this.buf.length = 0;
    this.buf.push({ t: now, p: s.p, y: s.y, pt: s.pt, h: s.h });
    if (this.buf.length > 30) this.buf.shift();
    this.vel.fromArray(s.v);
    this.alive = !!s.a;
    this.weapon = s.w;
    if (typeof s.w === 'string') this.avatar.setWeapon(s.w);
    this.health = s.hp;
    this.shield = s.sh;
  }

  update(dt) {
    const rt = performance.now() - DELAY;
    const b = this.buf;
    if (b.length) {
      let a = b[0], c = b[0];
      for (let i = b.length - 1; i >= 0; i--) {
        if (b[i].t <= rt) { a = b[i]; c = b[i + 1] ?? b[i]; break; }
      }
      if (c === a) {
        // Sin muestra futura: extrapola un poco con la velocidad.
        const ex = Math.min(0.1, Math.max(0, (rt - a.t) / 1000));
        this.pos.fromArray(a.p).addScaledVector(this.vel, this.alive ? ex : 0);
        this.yaw = a.y; this.pitch = a.pt; this.height = a.h;
      } else {
        const k = Math.min(1, Math.max(0, (rt - a.t) / Math.max(1, c.t - a.t)));
        this.pos.set(a.p[0] + (c.p[0] - a.p[0]) * k, a.p[1] + (c.p[1] - a.p[1]) * k, a.p[2] + (c.p[2] - a.p[2]) * k);
        this.yaw = lerpAngle(a.y, c.y, k);
        this.pitch = a.pt + (c.pt - a.pt) * k;
        this.height = a.h + (c.h - a.h) * k;
      }
    }
    const g = this.group;
    g.position.copy(this.pos);
    g.rotation.set(0, this.yaw, 0);
    const speed = Math.hypot(this.vel.x, this.vel.z);
    this.avatar.animate(dt, {
      speed: this.alive ? speed : 0,
      air: this.alive && Math.abs(this.vel.y) > 1.5,
      crouch: Math.min(1, Math.max(0, (CFG.player.height - this.height) / (CFG.player.height - CFG.player.crouchHeight))),
      pitch: this.pitch,
      alive: this.alive,
      sprint: speed > CFG.player.walk + 0.8,
    });
    this.tag.visible = this.alive;
    g.updateMatrixWorld(true);
  }

  dispose() {
    this.ctx.scene.remove(this.group);
    this.tag.material.map.dispose();
    this.tag.material.dispose();
  }
}

export class RemotePlayers {
  constructor(ctx) {
    this.ctx = ctx;
    this.map = new Map();
  }

  sync(players, selfId) {
    for (const p of players) if (p.id !== selfId && !this.map.has(p.id)) this.map.set(p.id, new RemotePlayer(this.ctx, p));
    const ids = new Set(players.map((p) => p.id));
    for (const id of [...this.map.keys()]) if (!ids.has(id)) this.remove(id);
  }

  get(id) {
    return this.map.get(id);
  }

  remove(id) {
    this.map.get(id)?.dispose();
    this.map.delete(id);
  }

  clear() {
    for (const id of [...this.map.keys()]) this.remove(id);
  }

  onState(m) {
    this.map.get(m.id)?.push(m);
  }

  // Compañeros visibles a través de paredes (coop); rivales no (DM).
  setTagsThroughWalls(on) {
    for (const r of this.map.values()) r.tag.material.depthTest = !on;
  }

  update(dt) {
    for (const r of this.map.values()) r.update(dt);
  }

  list() {
    return [...this.map.values()];
  }

  alive() {
    return this.list().filter((r) => r.alive && r.buf.length);
  }

  hitMeshes() {
    const out = [];
    for (const r of this.alive()) out.push(...r.hitMeshes);
    return out;
  }

  // Jugador remoto más cercano dentro del cono frontal (para cuerpo a cuerpo).
  nearestInFront(pos, fwd, range) {
    let best = null, bestD = Infinity;
    for (const r of this.alive()) {
      _q.set(r.pos.x - pos.x, 0, r.pos.z - pos.z);
      const d = _q.length() - CFG.player.radius;
      if (d > range || Math.abs(r.pos.y - pos.y) > 2 || d >= bestD) continue;
      if (_q.normalize().dot(fwd) < 0.5) continue;
      best = r;
      bestD = d;
    }
    return best;
  }
}
