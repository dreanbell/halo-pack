import * as THREE from 'three';

const MAX_DECALS = 80;
const _v = new THREE.Vector3();

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.decals = [];
    this.ballGeo = new THREE.SphereGeometry(1, 20, 14);
    this.decalGeo = new THREE.CircleGeometry(0.07, 8);
    this.decalMat = new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    // Luz reutilizable: añadir/quitar luces fuerza recompilar shaders.
    this.light = new THREE.PointLight(0xffa040, 0, 35, 2);
    this.lightT = 0;
    scene.add(this.light);
  }

  add(obj, life, tick, shared = false) {
    this.scene.add(obj);
    this.items.push({ obj, life, max: life, tick, shared });
  }

  tracer(a, b, color) {
    const geo = new THREE.BufferGeometry().setFromPoints([a.clone(), b.clone()]);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    this.add(new THREE.Line(geo, mat), 0.07, (it, k) => { mat.opacity = 0.9 * k; });
  }

  burst(pos, color, count = 10, speed = 5, life = 0.35, size = 0.08, gravity = 12) {
    const arr = new Float32Array(count * 3), vel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      _v.randomDirection().multiplyScalar(speed * (0.3 + Math.random() * 0.7));
      arr.set([pos.x, pos.y, pos.z], i * 3);
      vel.set([_v.x, _v.y, _v.z], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    const attr = new THREE.BufferAttribute(arr, 3);
    geo.setAttribute('position', attr);
    const mat = new THREE.PointsMaterial({ color, size, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.add(pts, life, (it, k, dt) => {
      for (let i = 0; i < count; i++) {
        vel[i * 3 + 1] -= gravity * dt;
        arr[i * 3] += vel[i * 3] * dt;
        arr[i * 3 + 1] += vel[i * 3 + 1] * dt;
        arr[i * 3 + 2] += vel[i * 3 + 2] * dt;
      }
      attr.needsUpdate = true;
      mat.opacity = k;
    });
  }

  impact(point, normal) {
    this.burst(_v.copy(point).addScaledVector(normal, 0.03), 0xffd27a, 7, 4, 0.25, 0.06);
    const d = new THREE.Mesh(this.decalGeo, this.decalMat);
    d.position.copy(point).addScaledVector(normal, 0.01);
    d.lookAt(_v.copy(d.position).add(normal));
    this.scene.add(d);
    this.decals.push(d);
    if (this.decals.length > MAX_DECALS) this.scene.remove(this.decals.shift());
  }

  sparks(point, color) {
    this.burst(point, color, 12, 6, 0.3, 0.09);
  }

  explosion(pos, radius) {
    const fire = new THREE.MeshBasicMaterial({ color: 0xffb04a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const ball = new THREE.Mesh(this.ballGeo, fire);
    ball.position.copy(pos);
    this.add(ball, 0.5, (it, k) => {
      ball.scale.setScalar(Math.max(0.01, radius * 0.42 * Math.sqrt(1 - k)));
      fire.opacity = k;
      fire.color.setHSL(0.02 + 0.08 * k, 1, 0.45 + 0.3 * k);
    }, true);

    const smokeMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, transparent: true, opacity: 0.55, depthWrite: false, roughness: 1 });
    const smoke = new THREE.Mesh(this.ballGeo, smokeMat);
    smoke.position.copy(pos);
    this.add(smoke, 1.6, (it, k, dt) => {
      smoke.scale.setScalar(radius * 0.15 + radius * 0.25 * (1 - k));
      smoke.position.y += dt * 1.2;
      smokeMat.opacity = 0.55 * k;
    }, true);

    this.burst(pos, 0xffc070, 40, 14, 0.8, 0.15, 9);
    this.light.position.set(pos.x, pos.y + 1, pos.z);
    this.lightT = 0.35;
  }

  clear() {
    for (const it of this.items) this.dispose(it);
    for (const d of this.decals) this.scene.remove(d);
    this.items.length = 0;
    this.decals.length = 0;
    this.lightT = 0;
    this.light.intensity = 0;
  }

  dispose(it) {
    this.scene.remove(it.obj);
    if (!it.shared) it.obj.geometry.dispose();
    it.obj.material.dispose();
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      if (it.life <= 0) { this.dispose(it); this.items.splice(i, 1); continue; }
      it.tick?.(it, it.life / it.max, dt);
    }
    this.lightT = Math.max(0, this.lightT - dt);
    this.light.intensity = (this.lightT / 0.35) * 400;
  }
}
