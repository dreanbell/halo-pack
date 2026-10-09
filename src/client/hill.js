import * as THREE from 'three';

// Rey de la colina (todos contra todos): una zona circular que cambia de sitio cada 45 s. Quien está solo dentro
// (vivo) suma 1 punto por segundo: lo comunica a la sala, que lleva la cuenta y decide el ganador.
// Todos calculan la misma zona: mismos puntos candidatos del mapa y mismo reloj desde el inicio de la partida.
const R = 4.5, MOVE = 45;
const _v = new THREE.Vector3();

export class Hill {
  constructor(ctx) {
    this.ctx = ctx;
    this.active = false;
    this.group = new THREE.Group();
    const col = 0xffc23a;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.06, 8, 64).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: col, toneMapped: false }));
    ring.position.y = 0.06;
    this.wallMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 2.2, 48, 1, true), this.wallMat);
    wall.position.y = 1.1;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 40, 8, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    beam.position.y = 20;
    this.group.add(ring, wall, beam);
    this.ringMat = ring.material;
    this.el = document.getElementById('hill-mark');
  }

  // Candidatos: a media distancia del centro, en el suelo y fuera de obstáculos; más el centro si está libre.
  spots(world) {
    if (this.cache?.id === world.id) return this.cache.list;
    const H = world.half, list = [], probe = new THREE.Vector3();
    const grown = world.colliders.map((b) => b.clone().expandByScalar(0.8));
    const free = (x, z) => { probe.set(x, 0.6, z); return !grown.some((b) => b.containsPoint(probe)); };
    if (free(0, 0)) list.push(new THREE.Vector3(0, 0, 0));
    for (const rk of [0.3, 0.45, 0.2]) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + rk, x = Math.cos(a) * H * rk * 1.6, z = Math.sin(a) * H * rk * 1.6;
        if (free(x, z) && list.every((p) => Math.hypot(p.x - x, p.z - z) > 14)) list.push(new THREE.Vector3(x, 0, z));
      }
      if (list.length >= 6) break;
    }
    if (!list.length) list.push(new THREE.Vector3(0, 0, 0));
    this.cache = { id: world.id, list };
    return list;
  }

  start() {
    this.active = true;
    this.t0 = performance.now();
    this.tick = 0;
    this.ctx.scene.add(this.group);
    this.el?.classList.remove('hidden');
    this.place(0);
  }

  stop() {
    this.active = false;
    this.ctx.scene.remove(this.group);
    this.el?.classList.add('hidden');
  }

  place(i) {
    const list = this.spots(this.ctx.world), p = list[i % list.length];
    this.index = i;
    this.pos = p;
    this.group.position.set(p.x, this.ctx.world.groundHeightAt(p.x, p.z, 0.5, 0.6), p.z);
  }

  inside(pos) {
    return Math.hypot(pos.x - this.group.position.x, pos.z - this.group.position.z) < R && Math.abs(pos.y - this.group.position.y) < 3;
  }

  update(dt) {
    if (!this.active) return;
    const { player, remotes, net, camera, hud } = this.ctx;
    const el = (performance.now() - this.t0) / 1000;
    const i = Math.floor(el / MOVE);
    if (i !== this.index) { this.place(i); hud.toast('LA COLINA SE HA MOVIDO'); }
    const me = player.alive && this.inside(player.pos);
    const rivals = remotes.alive().filter((r) => this.inside(r.pos)).length;
    const state = me ? (rivals ? 'contested' : 'mine') : rivals ? 'taken' : 'free';
    // Color: dorado libre · azul tuya · rojo disputada/de otro.
    const c = state === 'mine' ? 0x5fe1ff : state === 'free' ? 0xffc23a : 0xff4d5e;
    this.ringMat.color.setHex(c);
    this.wallMat.color.setHex(c);
    if (state === 'mine') {
      this.tick += dt;
      if (this.tick >= 1) { this.tick -= 1; net.send('hill', {}); }
    } else this.tick = 0;
    // Marcador en pantalla: dirección, distancia y estado.
    if (!this.el) return;
    _v.copy(this.group.position).setY(this.group.position.y + 1.5).project(camera);
    const behind = _v.z > 1;
    let x = _v.x, y = _v.y;
    if (behind) { x = -x; y = -y; }
    const edge = behind || Math.abs(x) > 0.92 || Math.abs(y) > 0.85;
    if (edge) { const k = 1 / Math.max(Math.abs(x) / 0.92, Math.abs(y) / 0.85, 1e-3); x *= k; y *= k; }
    this.el.style.left = `${((x + 1) / 2) * 100}%`;
    this.el.style.top = `${((1 - y) / 2) * 100}%`;
    const d = Math.round(Math.hypot(player.pos.x - this.group.position.x, player.pos.z - this.group.position.z));
    this.el.dataset.state = state;
    this.el.textContent = state === 'mine' ? 'TUYA +1' : state === 'contested' ? 'DISPUTADA' : `COLINA ${d} m`;
  }
}
