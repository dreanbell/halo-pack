import * as THREE from 'three';
import { Avatar } from './avatar.js';
import { S } from './settings.js';

// Pantalla de inicio: tu soldado (skin y arma principal) de pie sobre un pedestal holográfico en el mapa elegido,
// encuadrado a la izquierda (los paneles del menú van a la derecha). Arrastrar lo gira; la rueda o el pellizco acercan.
// Usa la escena y la cámara del juego (sin renderer aparte) y se retira al empezar la partida.
const FOV = 38;

export class Home {
  constructor(ctx) {
    this.ctx = ctx;
    this.group = new THREE.Group();
    this.rot = 0;
    this.rotV = 0;
    this.zoom = 0.35; // 0 = lejos (cuerpo entero) · 1 = cerca (busto)
    this.zoomT = 0.35;
    this.active = false;
    this.t = 0;
    // Pedestal: disco oscuro, anillo luminoso y halo.
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x5fe1ff, toneMapped: false });
    const haloMat = new THREE.MeshBasicMaterial({ color: 0x5fe1ff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.88, 0.08, 48), new THREE.MeshStandardMaterial({ color: 0x1c2228, metalness: 0.75, roughness: 0.3 }));
    base.position.y = 0.04;
    base.receiveShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.84, 0.014, 8, 72).rotateX(Math.PI / 2), ringMat);
    ring.position.y = 0.085;
    this.halo = new THREE.Mesh(new THREE.CylinderGeometry(0.84, 0.84, 0.35, 48, 1, true), haloMat);
    this.halo.position.y = 0.26;
    this.haloMat = haloMat;
    this.group.add(base, ring, this.halo);
  }

  // Coloca el pedestal en la salida del mapa, mirando al centro de la arena (la cámara queda del lado del centro).
  place() {
    const w = this.ctx.world;
    if (this.worldId === w.id) return;
    this.worldId = w.id;
    const s = w.spawn ?? { x: 0, z: 30 };
    const y = w.groundHeightAt(s.x, s.z, 0.5, 30);
    this.group.position.set(s.x, y, s.z);
    const toC = new THREE.Vector3(-s.x, 0, -s.z);
    if (toC.lengthSq() < 1) toC.set(0, 0, -1);
    this.dir = toC.normalize(); // hacia la cámara
    this.face = Math.atan2(-this.dir.x, -this.dir.z); // el avatar mira a la cámara
  }

  setSkin(skin) {
    this.skin = skin;
    this.avatar?.setSkin(skin);
  }

  setWeapon(id) {
    this.weapon = id;
    this.avatar?.setWeapon(id);
  }

  show() {
    if (this.active) return;
    this.active = true;
    if (!this.avatar && this.skin) {
      this.avatar = new Avatar(this.skin);
      this.avatar.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.group.add(this.avatar.root);
      this.avatar.root.position.y = 0.08;
      if (this.weapon) this.avatar.setWeapon(this.weapon);
    }
    this.worldId = null;
    this.ctx.scene.add(this.group);
  }

  // El arma en primera persona no se ve en el menú, pero su luz sigue en la escena: si cambiara el número de
  // luces, three.js recompilaría todos los shaders al entrar y salir del menú.
  hideViewmodel() {
    const { vm, muzzleLight } = this.ctx.arsenal;
    vm.visible = true;
    for (const c of vm.children) if (c !== muzzleLight) c.visible = false;
  }

  hide() {
    if (!this.active) return;
    this.active = false;
    this.ctx.scene.remove(this.group);
    const cam = this.ctx.camera, l = this.ctx.arsenal.muzzleLight;
    cam.fov = S.fov;
    cam.updateProjectionMatrix();
    l.intensity = 0;
    l.distance = 9;
    for (const c of this.ctx.arsenal.vm.children) c.visible = true;
    this.ctx.arsenal.equip(); // deja visible solo el arma actual
  }

  drag(dx) { this.rotV = dx * 0.012; this.rot += this.rotV; }
  release() { /* la inercia (rotV) se frena sola */ }
  wheel(dy) { this.zoomT = THREE.MathUtils.clamp(this.zoomT - dy * 0.0012, 0, 1); }
  pinch(k) { this.zoomT = THREE.MathUtils.clamp(this.zoomT + k, 0, 1); }

  update(dt, dragging) {
    this.show();
    this.place();
    this.t += dt;
    if (!dragging) { this.rot += this.rotV; this.rotV *= Math.exp(-dt * 5); }
    this.zoom += (this.zoomT - this.zoom) * (1 - Math.exp(-dt * 8));
    const a = this.avatar;
    if (a) {
      a.root.rotation.y = this.face + this.rot;
      a.animate(dt, { speed: 0, pitch: Math.sin(this.t * 0.4) * 0.05, alive: true });
    }
    this.haloMat.opacity = 0.1 + Math.sin(this.t * 2) * 0.04;
    // Cámara: delante del avatar (lado del centro del mapa), encuadre a la izquierda de la pantalla.
    const { player, camera } = this.ctx, p = this.group.position, d = this.dir;
    const dist = THREE.MathUtils.lerp(6.2, 2.3, this.zoom), h = THREE.MathUtils.lerp(1.0, 1.45, this.zoom);
    const side = new THREE.Vector3(-d.z, 0, d.x); // derecha de la cámara mirando al avatar
    const look = new THREE.Vector3(p.x, p.y + h - 0.08, p.z).addScaledVector(side, -THREE.MathUtils.lerp(0.95, 0.42, this.zoom));
    player.yaw.position.set(p.x + d.x * dist, p.y + h + 0.1, p.z + d.z * dist);
    const dx = look.x - player.yaw.position.x, dz = look.z - player.yaw.position.z, dy = look.y - player.yaw.position.y;
    player.yaw.rotation.set(0, Math.atan2(-dx, -dz), 0);
    player.pitch.rotation.set(Math.atan2(dy, Math.hypot(dx, dz)), 0, 0);
    camera.position.set(0, 0, 0);
    camera.rotation.set(0, 0, 0);
    if (camera.fov !== FOV) { camera.fov = FOV; camera.updateProjectionMatrix(); }
    // Luz de relleno desde la cámara (la luz del fogonazo, que en el menú no se usa).
    const l = this.ctx.arsenal.muzzleLight;
    l.color.setHex(0xdfeeff);
    l.intensity = 9;
    l.distance = 12;
    this.hideViewmodel();
  }
}
