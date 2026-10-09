import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/three/addons/loaders/GLTFLoader.js';
import { CFG } from './config.js';
import { buildGun } from './guns.js';

// Suministros del cielo (modos de oleadas con la regla de suministros): cada cierto tiempo cae una caja en
// paracaídas; al aterrizar se abre con E (gratis), van pasando armas y sale una que se coge con E.
// Estados: falling → landed → rolling → offer → closing → gone.
// Modelo de la caja: «crate-wide» del Blaster Kit de Kenney (CC0), con la tapa como pieza con bisagra.
const D = CFG.drop;
let crate = null;

export function loadDropModel() {
  return new GLTFLoader().loadAsync(new URL('../../vendor/assets/drops/crate-wide.glb', import.meta.url).href)
    .then((g) => { crate = g.scene; })
    .catch((e) => console.warn('caja de suministros: modelo procedural', e));
}

// Lona del paracaídas: gajos alternos naranja y blanco.
let canopyTex = null;
function canopyTexture() {
  if (canopyTex) return canopyTex;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 32;
  const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f2efe6' : '#e2621f'; g.fillRect(i * 32, 0, 32, 32); }
  canopyTex = new THREE.CanvasTexture(c);
  canopyTex.colorSpace = THREE.SRGBColorSpace;
  return canopyTex;
}

const SCALE = 1.6; // la maleta original mide 0,55 × 1,2 m
const _v = new THREE.Vector3();

export class SupplyDrop {
  // fall: segundos que le quedan de caída (los clientes la crean con el valor que manda el anfitrión).
  constructor(ctx, id, [x, y, z], fall = D.fall) {
    this.ctx = ctx;
    this.id = id;
    this.state = fall > 0 ? 'falling' : 'landed';
    this.t = 0;
    this.fall = fall;
    this.age = 0;
    this.owner = null;
    this.weapon = null;
    this.pos = new THREE.Vector3(x, y, z);
    this.guns = new Map();
    this.mats = [];
    this.build();
    this.place();
  }

  build() {
    const g = (this.group = new THREE.Group());
    this.ctx.scene.add(g);
    // Caja (con la tapa como pieza móvil).
    this.box = new THREE.Group();
    g.add(this.box);
    if (crate) {
      const m = crate.clone(true);
      m.scale.setScalar(SCALE);
      m.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; o.userData.shared = true; } });
      this.lid = m.getObjectByName('lid');
      this.box.add(m);
    } else {
      const mat = new THREE.MeshStandardMaterial({ color: 0x4d5a3a, roughness: 0.6, metalness: 0.4 });
      this.mats.push(mat);
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.28, 1.9), mat);
      body.position.y = 0.14;
      this.box.add(body);
      this.lid = new THREE.Group();
      this.lid.position.set(0.42, 0.28, 0);
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.06, 1.9), mat);
      top.position.x = -0.42;
      this.lid.add(top);
      this.box.add(this.lid);
    }
    // Paracaídas: cúpula y cuerdas hasta las esquinas de la caja.
    const canopyMat = new THREE.MeshStandardMaterial({ map: canopyTexture(), side: THREE.DoubleSide, roughness: 0.9, transparent: true });
    const lineMat = new THREE.LineBasicMaterial({ color: 0x2a2a26, transparent: true });
    this.mats.push(canopyMat, lineMat);
    this.chute = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2.6, 16, 6, 0, Math.PI * 2, 0, Math.PI * 0.42), canopyMat);
    dome.position.y = 3.2;
    dome.castShadow = true;
    const pts = [];
    for (const [cx, cz] of [[-0.4, -0.9], [0.4, -0.9], [-0.4, 0.9], [0.4, 0.9]]) pts.push(new THREE.Vector3(cx, 0.4, cz), new THREE.Vector3(cx * 4.5, 4.4, cz * 2));
    this.chute.add(dome, new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
    this.chuteMats = [canopyMat, lineMat];
    g.add(this.chute);
    // Haz luminoso que marca dónde cae (naranja) y dónde está (verde al aterrizar).
    this.beamMat = new THREE.MeshBasicMaterial({ color: 0xff9a3d, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.mats.push(this.beamMat);
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.6, 40, 16, 1, true), this.beamMat);
    this.ctx.scene.add(this.beam);
    this.beam.position.set(this.pos.x, this.pos.y + 20, this.pos.z);
    this.light = new THREE.PointLight(0x9dff6a, 0, 8, 2);
    this.light.position.set(0, 1.2, 0);
    g.add(this.light);
    // Expositor de armas sobre la caja.
    this.display = new THREE.Group();
    this.display.position.set(0, 0.5, 0);
    g.add(this.display);
  }

  // Altura según el tiempo de caída que queda (velocidad constante, como con paracaídas).
  place() {
    const h = Math.max(0, this.fall) * D.speed;
    this.group.position.set(this.pos.x, this.pos.y + h, this.pos.z);
  }

  showGun(id) {
    for (const [k, gun] of this.guns) gun.group.visible = k === id;
    if (!id) return;
    if (!this.guns.has(id)) {
      const gun = buildGun(id);
      gun.group.scale.setScalar(1.25);
      this.display.add(gun.group);
      this.guns.set(id, gun);
    }
    this.guns.get(id).group.visible = true;
  }

  get openable() { return this.state === 'landed'; }

  // Empieza la tirada; weapon es el resultado decidido por el anfitrión.
  start(weapon, owner, pool) {
    if (this.state === 'falling') this.land();
    this.state = 'rolling';
    this.t = 0;
    this.owner = owner;
    this.weapon = weapon;
    this.pool = pool.length ? pool : [weapon];
    this.flip = 0;
    this.cycle = 0;
    this.ctx.sfx.boxOpen();
    if (owner === this.ctx.director.myId()) this.ctx.progress?.event('drops');
  }

  takeable(me) {
    return this.state === 'offer' && this.owner === me;
  }

  close() {
    if (this.state === 'closing' || this.state === 'gone') return;
    this.state = 'closing';
    this.t = 0;
  }

  land() {
    this.fall = 0;
    this.place();
    this.state = 'landed';
    this.t = 0;
    const { fx, sfx, player } = this.ctx;
    _v.set(this.pos.x, this.pos.y + 0.2, this.pos.z);
    fx.shockwave?.(this.pos, 3, 0xc8b89a);
    sfx.land?.();
    sfx.explosion?.(Math.max(12, this.pos.distanceTo(player.pos) * 2));
    this.beamMat.color.set(0x9dff6a);
  }

  update(dt) {
    this.t += dt;
    this.age += dt;
    const { fx } = this.ctx;
    if (this.state === 'falling') {
      this.fall -= dt;
      this.place();
      // Balanceo bajo el paracaídas y humo de la bengala en el punto de caída.
      this.group.rotation.set(Math.sin(this.age * 1.3) * 0.08, this.age * 0.25, Math.cos(this.age * 1.1) * 0.08);
      this.smokeT = (this.smokeT ?? 0) - dt;
      if (this.smokeT <= 0 && fx.norm) {
        this.smokeT = 0.12;
        fx.norm.emit({ p: _v.set(this.pos.x + 0.6, this.pos.y + 0.2, this.pos.z), v: new THREE.Vector3((Math.random() - 0.5) * 0.4, 1.6, (Math.random() - 0.5) * 0.4), life: 2.4, s0: 0.3, s1: 2.2, c0: new THREE.Color(0xff7a2a), c1: new THREE.Color(0xd9b8a0), a: 0.5, fi: 0.1, frame: 1, drag: 0.6, rv: 0.5 });
        fx.add_?.emit({ p: _v, life: 0.15, s0: 0.5, c0: new THREE.Color(3, 0.6, 0.2), a: 0.9, fi: 0, frame: 0 });
      }
      if (this.fall <= 0) this.land();
    } else {
      // El paracaídas se desploma y desaparece.
      const k = Math.min(1, this.t / 1.2);
      if (this.chute.visible) {
        this.chute.scale.set(1 + k * 0.3, Math.max(0.05, 1 - k), 1 + k * 0.3);
        this.chute.position.set(k * 1.5, -k * 0.5, 0);
        for (const m of this.chuteMats) m.opacity = 1 - k;
        if (k >= 1 && this.state !== 'falling') this.chute.visible = false;
      }
      this.group.rotation.x = this.group.rotation.z = 0;
    }
    // Tapa, luz y haz.
    const open = this.state === 'rolling' || this.state === 'offer' ? Math.min(1, this.t * 3) : this.state === 'closing' ? Math.max(0, 1 - this.t * 2) : 0;
    if (this.lid) this.lid.rotation.z = -open * 1.9;
    this.light.intensity = this.state === 'landed' ? 4 + Math.sin(this.age * 4) * 2 : open * 12;
    const fade = this.state === 'closing' ? Math.max(0, 1 - this.t / 1.5) : 1;
    // El haz se apaga al acercarse (dentro de él teñiría la pantalla).
    const p = this.ctx.player.pos, near = Math.min(1, Math.max(0, (Math.hypot(p.x - this.pos.x, p.z - this.pos.z) - 2) / 5));
    this.beamMat.opacity = (0.12 + Math.sin(this.age * 2.5) * 0.04) * fade * near;
    if (this.state === 'rolling') {
      // Las armas pasan cada vez más despacio.
      this.flip -= dt;
      if (this.flip <= 0) {
        this.cycle++;
        this.flip = 0.06 + (this.t / D.roll) ** 2 * 0.3;
        this.showGun(this.pool[this.cycle % this.pool.length]);
        this.ctx.sfx.boxTick();
      }
      this.display.position.y = 0.5 + Math.min(1, this.t / D.roll) * 0.6;
      this.display.rotation.y += dt * 4;
      if (this.t >= D.roll) {
        this.state = 'offer';
        this.t = 0;
        this.showGun(this.weapon);
        this.ctx.sfx.boxReveal();
      }
    } else if (this.state === 'offer') {
      this.display.rotation.y += dt * 1.2;
      this.display.position.y = 1.1 + Math.sin(this.t * 3) * 0.04;
      if (this.t >= D.offer) this.close();
    } else if (this.state === 'closing') {
      this.display.position.y = Math.max(0.2, this.display.position.y - dt * 2);
      this.box.position.y = -Math.max(0, this.t - 1) * 0.6; // se hunde y desaparece
      if (this.t > 2.2) this.state = 'gone';
    } else if (this.state === 'landed' && this.age > D.fall + D.expire) {
      this.close(); // nadie la abrió
    }
  }

  dispose() {
    this.ctx.scene.remove(this.group, this.beam);
    this.group.traverse((o) => { if ((o.isMesh || o.isLine) && !o.userData.shared) o.geometry.dispose(); });
    this.beam.geometry.dispose();
    for (const m of this.mats) m.dispose();
  }
}
