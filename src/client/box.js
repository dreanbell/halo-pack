import * as THREE from 'three';
import { CFG } from './config.js';
import { plate } from './avatar.js';
import { buildGun } from './guns.js';

// Caja misteriosa (modos de oleadas con la regla de cajas): se abre, van pasando armas y sale una al azar.
// Estados: idle → rolling (armas girando) → offer (el que la abrió puede cogerla) → closing → idle.
const B = CFG.box;
let qTex = null;

function questionTexture() {
  if (qTex) return qTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#0b1a24';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#5fe1ff';
  g.lineWidth = 6;
  g.strokeRect(8, 8, 112, 112);
  g.font = '900 90px Rajdhani, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#9ff0ff';
  g.shadowColor = '#5fe1ff';
  g.shadowBlur = 16;
  g.fillText('?', 64, 70);
  qTex = new THREE.CanvasTexture(c);
  qTex.colorSpace = THREE.SRGBColorSpace;
  return qTex;
}

export class MysteryBox {
  constructor(ctx, id, [x, y, z, rot]) {
    this.ctx = ctx;
    this.id = id;
    this.state = 'idle';
    this.t = 0;
    this.owner = null;
    this.weapon = null;
    this.pos = new THREE.Vector3(x, y, z);
    this.guns = new Map();
    this.build(rot);
  }

  build(rot) {
    const g = (this.group = new THREE.Group());
    g.position.copy(this.pos);
    g.rotation.y = rot;
    const wood = new THREE.MeshStandardMaterial({ color: 0x2c2f35, metalness: 0.6, roughness: 0.4 });
    const trim = new THREE.MeshStandardMaterial({ color: 0xb08a3c, metalness: 0.85, roughness: 0.3 });
    const panel = new THREE.MeshStandardMaterial({ map: questionTexture(), emissive: 0x5fe1ff, emissiveMap: questionTexture(), emissiveIntensity: 0.9, roughness: 0.5 });
    this.mats = [wood, trim, panel];
    const add = (geo, mat, x, y, z, parent = g) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    add(plate(1.5, 0.62, 0.78, 0.05), wood, 0, 0.31, 0);
    for (const sx of [-1, 1]) add(plate(0.08, 0.66, 0.82, 0.02), trim, sx * 0.7, 0.33, 0);
    for (const sz of [-1, 1]) add(new THREE.PlaneGeometry(0.45, 0.45), panel, 0, 0.32, sz * 0.395).rotation.y = sz > 0 ? 0 : Math.PI;
    // Tapa con bisagra en el borde trasero.
    const lid = (this.lid = new THREE.Group());
    lid.position.set(0, 0.62, 0.39);
    g.add(lid);
    add(plate(1.52, 0.12, 0.8, 0.04), wood, 0, 0.06, -0.39, lid);
    add(plate(1.56, 0.04, 0.12, 0.015), trim, 0, 0.1, -0.39, lid);
    // Haz de luz para localizarla desde lejos.
    this.beamMat = new THREE.MeshBasicMaterial({ color: 0x5fe1ff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.45, 26, 16, 1, true), this.beamMat);
    beam.position.y = 13.6;
    g.add(beam);
    this.light = new THREE.PointLight(0x7fe7ff, 0, 7, 2);
    this.light.position.set(0, 1.1, 0);
    g.add(this.light);
    // Expositor de armas sobre la caja.
    this.display = new THREE.Group();
    this.display.position.set(0, 0.7, 0);
    g.add(this.display);
    this.ctx.scene.add(g);
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

  // Empieza la tirada; weapon es el resultado decidido por el anfitrión.
  start(weapon, owner, pool) {
    this.state = 'rolling';
    this.t = 0;
    this.owner = owner;
    this.weapon = weapon;
    this.pool = pool.length ? pool : [weapon];
    this.flip = 0;
    this.cycle = 0;
    this.ctx.sfx.boxOpen();
  }

  takeable(me) {
    return this.state === 'offer' && this.owner === me;
  }

  close() {
    if (this.state === 'idle') return;
    this.state = 'closing';
    this.t = 0;
  }

  update(dt) {
    this.t += dt;
    const open = this.state === 'idle' ? 0 : this.state === 'closing' ? Math.max(0, 1 - this.t * 2) : Math.min(1, this.t * 3);
    this.lid.rotation.x = -open * 1.9;
    this.light.intensity = open * 12;
    this.beamMat.opacity = 0.07 + Math.sin(performance.now() / 400) * 0.025 + open * 0.06;
    if (this.state === 'rolling') {
      // Las armas pasan cada vez más despacio.
      this.flip -= dt;
      if (this.flip <= 0) {
        this.cycle++;
        this.flip = 0.06 + (this.t / B.roll) ** 2 * 0.3;
        this.showGun(this.pool[this.cycle % this.pool.length]);
        this.ctx.sfx.boxTick();
      }
      this.display.position.y = 0.7 + Math.min(1, this.t / B.roll) * 0.55;
      this.display.rotation.y += dt * 4;
      if (this.t >= B.roll) {
        this.state = 'offer';
        this.t = 0;
        this.showGun(this.weapon);
        this.ctx.sfx.boxReveal();
      }
    } else if (this.state === 'offer') {
      this.display.rotation.y += dt * 1.2;
      this.display.position.y = 1.25 + Math.sin(this.t * 3) * 0.04 - Math.max(0, this.t - B.offer + 2) * 0.25;
      if (this.t >= B.offer) this.close();
    } else if (this.state === 'closing') {
      this.display.position.y = Math.max(0.3, this.display.position.y - dt * 2);
      if (this.t > 0.6) {
        this.state = 'idle';
        this.showGun(null);
        this.owner = null;
      }
    }
  }

  dispose() {
    this.ctx.scene.remove(this.group);
    this.group.traverse((o) => { if (o.isMesh && !o.userData.shared) o.geometry.dispose(); });
    for (const m of this.mats) m.dispose();
  }
}
