import * as THREE from 'three';
import { CFG, waveComposition, rand } from './config.js';
import { v3 } from './net.js';
import { MysteryBox } from './box.js';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _f = { x: 0, z: 0 };
const TYPES = Object.keys(CFG.enemies);
const SNAP_RATE = 1 / 12;

class Enemy {
  // replica = true: copia de un enemigo simulado por el anfitrión (coop, cliente).
  constructor(ctx, type, pos, id, replica = false) {
    this.ctx = ctx;
    this.id = id;
    this.type = type;
    this.replica = replica;
    this.cfg = CFG.enemies[type];
    const c = this.cfg;
    this.pos = pos.clone();
    this.netPos = pos.clone();
    this.netRot = 0;
    this.vel = new THREE.Vector3();
    this.hp = c.hp;
    this.shield = c.shield;
    this.sinceHit = 99;
    this.cool = rand(1.2, 2.4);
    this.burstLeft = 0;
    this.burstTimer = 0;
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.strafeTimer = rand(1, 3);
    this.losTimer = 0;
    this.los = false;
    this.target = null;
    this.targetT = 0;
    this.stuck = 0;
    this.detour = 0;
    this.detourT = 0;
    this.dead = false;
    this.deathT = 0;
    this.spawnT = 0;
    this.flash = 0;
    this.hitT = 0;
    this.t = Math.random() * 10;
    this.radius = 0.45 * c.scale;
    this.height = 1.6 * c.scale;
    this.build();
  }

  build() {
    const c = this.cfg, s = c.scale;
    const g = (this.group = new THREE.Group());
    this.bodyMat = new THREE.MeshStandardMaterial({ color: c.body, roughness: 0.45, metalness: 0.35, emissive: 0x000000 });
    const glowMat = new THREE.MeshBasicMaterial({ color: c.glow });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x22262b, metalness: 0.6, roughness: 0.4 });
    const mesh = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x * s, y * s, z * s);
      m.castShadow = true;
      g.add(m);
      return m;
    };
    const body = mesh(new THREE.CapsuleGeometry(0.38 * s, 0.6 * s, 4, 10), this.bodyMat, 0, 0.75, 0);
    const head = mesh(new THREE.SphereGeometry(0.24 * s, 14, 10), this.bodyMat, 0, 1.42, 0.04);
    mesh(new THREE.BoxGeometry(0.3 * s, 0.06 * s, 0.06 * s), glowMat, 0, 1.45, 0.24);
    mesh(new THREE.BoxGeometry(0.5 * s, 0.55 * s, 0.25 * s), this.bodyMat, 0, 0.95, -0.35);
    mesh(new THREE.BoxGeometry(0.36 * s, 0.08 * s, 0.05 * s), glowMat, 0, 1.05, -0.48);
    if (c.melee) {
      for (const sx of [-1, 1]) mesh(new THREE.ConeGeometry(0.09 * s, 0.6 * s, 6).rotateX(Math.PI / 2), glowMat, sx * 0.42, 0.85, 0.35);
    } else {
      mesh(new THREE.BoxGeometry(0.12 * s, 0.12 * s, 0.55 * s), darkMat, 0.32, 0.95, 0.3);
    }
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0.32 * s, 0.95 * s, 0.6 * s);
    g.add(this.muzzle);
    body.userData = { enemy: this, part: 'body' };
    head.userData = { enemy: this, part: 'head' };
    this.hitMeshes = [body, head];
    if (c.shield > 0) {
      this.bubbleMat = new THREE.MeshBasicMaterial({ color: c.glow, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.75 * s, 16, 12), this.bubbleMat);
      bubble.scale.y = 1.3;
      bubble.position.y = 0.85 * s;
      g.add(bubble);
    }
    g.position.copy(this.pos);
    g.scale.setScalar(0.01);
    this.ctx.scene.add(g);
  }

  center(out = _b) {
    return out.set(this.pos.x, this.pos.y + this.height * 0.55, this.pos.z);
  }

  facing() {
    const r = this.group.rotation.y;
    return _a.set(Math.sin(r), 0, Math.cos(r));
  }

  // Efectos visuales comunes; devuelve false cuando el cadáver ya puede retirarse.
  animate(dt) {
    this.t += dt;
    if (this.dead) {
      this.deathT += dt;
      this.group.rotation.x = -Math.min(this.deathT * 3, Math.PI / 2);
      this.group.position.y = this.pos.y - Math.max(0, this.deathT - 0.8) * 0.8;
      return this.deathT < 2;
    }
    if (this.spawnT < 1) {
      this.spawnT = Math.min(1, this.spawnT + dt * 2.5);
      this.group.scale.setScalar(this.spawnT);
    }
    if (this.bubbleMat) {
      this.flash = Math.max(0, this.flash - dt * 3);
      this.bubbleMat.opacity = this.flash * 0.55;
    }
    this.hitT = Math.max(0, this.hitT - dt * 5);
    this.bodyMat.emissive.setRGB(this.hitT * 0.8, this.hitT * 0.15, 0);
    return true;
  }

  updateReplica(dt) {
    if (!this.animate(dt)) return false;
    if (this.dead) return true;
    const k = 1 - Math.exp(-12 * dt);
    const px = this.pos.x, pz = this.pos.z;
    this.pos.lerp(this.netPos, k);
    this.vel.set((this.pos.x - px) / dt, 0, (this.pos.z - pz) / dt);
    const r = this.group.rotation.y;
    this.group.rotation.y = r + Math.atan2(Math.sin(this.netRot - r), Math.cos(this.netRot - r)) * k;
    const bob = Math.sin(this.t * 9) * 0.04 * Math.min(1, Math.hypot(this.vel.x, this.vel.z) / 3);
    this.group.position.set(this.pos.x, this.pos.y + Math.abs(bob), this.pos.z);
    this.group.updateMatrixWorld(true);
    return true;
  }

  pickTarget() {
    let best = null, bd = Infinity;
    for (const t of this.ctx.director.targets) {
      const d = (t.pos.x - this.pos.x) ** 2 + (t.pos.z - this.pos.z) ** 2;
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  update(dt) {
    if (this.replica) return this.updateReplica(dt);
    if (!this.animate(dt)) return false;
    if (this.dead) return true;
    const { world, director, nav } = this.ctx;
    const c = this.cfg;

    this.sinceHit += dt;
    if (c.shield > 0 && this.sinceHit > 5) this.shield = Math.min(c.shield, this.shield + 30 * dt);

    this.targetT -= dt;
    if (this.targetT <= 0 || !this.target?.alive) {
      const t = this.pickTarget();
      if (t !== this.target) this.losTimer = 0;
      this.target = t;
      this.targetT = 0.6;
    }
    const tg = this.target;

    const eye = _a.set(this.pos.x, this.pos.y + this.height * 0.9, this.pos.z);
    this.losTimer -= dt;
    if (this.losTimer <= 0 && tg) {
      this.losTimer = 0.2 + Math.random() * 0.15;
      this.los = world.lineOfSight(eye, tg.eye());
    }
    if (!tg) this.los = false;

    const dx = tg ? tg.pos.x - this.pos.x : 0, dz = tg ? tg.pos.z - this.pos.z : 1;
    const dist = Math.hypot(dx, dz) || 0.001;
    const fx = dx / dist, fz = dz / dist;

    // --- Movimiento ---
    let mx = 0, mz = 0;
    const [near, far] = c.range;
    const direct = c.melee ? this.los && dist < 4 : this.los && dist <= far;
    if (!direct) {
      // Ruta por el campo de flujo; si no hay ruta, línea recta.
      const fdir = nav.flowDir(this.pos, _f);
      mx = fdir ? fdir.x : fx;
      mz = fdir ? fdir.z : fz;
    } else if (c.melee) { mx = fx; mz = fz; }
    else if (dist < near) { mx = -fx; mz = -fz; }
    if (this.los && !c.melee) {
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) { this.strafeDir *= -1; this.strafeTimer = rand(0.8, 2.6); }
      mx += -fz * this.strafeDir * 0.8;
      mz += fx * this.strafeDir * 0.8;
    }
    if (this.detourT > 0) {
      // Rodeo dominante: perpendicular al objetivo, con leve avance.
      this.detourT -= dt;
      mx = -fz * this.detour + fx * 0.2;
      mz = fx * this.detour + fz * 0.2;
    }
    for (const o of director.enemies) {
      if (o === this || o.dead) continue;
      const ox = this.pos.x - o.pos.x, oz = this.pos.z - o.pos.z, d2 = ox * ox + oz * oz;
      if (d2 < 4 && d2 > 1e-4) {
        const d = Math.sqrt(d2);
        mx += (ox / d) * (2 - d);
        mz += (oz / d) * (2 - d);
      }
    }
    if (!tg) { mx = 0; mz = 0; }
    const ml = Math.hypot(mx, mz);
    if (ml > 0.01) { mx /= ml; mz /= ml; }
    const speed = c.speed * (c.melee && this.los && dist < 10 ? 1.35 : !this.los ? 1.2 : 1) * this.spawnT;
    const k = 1 - Math.exp(-8 * dt);
    this.vel.x += (mx * speed - this.vel.x) * k;
    this.vel.z += (mz * speed - this.vel.z) * k;
    const px = this.pos.x, pz = this.pos.z;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    world.resolveHorizontal(this.pos, this.radius, this.pos.y, this.pos.y + this.height);
    world.clampToArena(this.pos, this.radius);
    const gh = world.groundHeightAt(this.pos.x, this.pos.z, this.radius * 0.5, this.pos.y);
    this.pos.y += (gh - this.pos.y) * Math.min(1, dt * 10);

    // Si apenas avanza, rodea el obstáculo durante un rato.
    const moved = Math.hypot(this.pos.x - px, this.pos.z - pz);
    if (ml > 0.01 && moved < speed * dt * 0.35) this.stuck += dt;
    else this.stuck = Math.max(0, this.stuck - dt);
    if (this.stuck > 0.35) {
      // Atascado otra vez durante un rodeo (rincón cóncavo) -> invierte el sentido.
      this.detour = this.detourT > 0 ? -this.detour : this.detour || (Math.random() < 0.5 ? -1 : 1);
      this.detourT = 1;
      this.stuck = 0;
    }

    const bob = Math.sin(this.t * 9) * 0.04 * Math.min(1, Math.hypot(this.vel.x, this.vel.z) / 3);
    this.group.position.set(this.pos.x, this.pos.y + Math.abs(bob), this.pos.z);
    if (tg) this.group.rotation.y = Math.atan2(fx, fz);
    this.group.updateMatrixWorld(true);

    // --- Ataque ---
    this.cool = Math.max(-1, this.cool - dt);
    if (!tg) return true;
    if (c.melee) {
      if (dist < c.range[1] + 0.3 && Math.abs(tg.pos.y - this.pos.y) < 1.5 && this.cool <= 0) {
        this.cool = rand(...c.interval);
        director.hurtTarget(tg, c.dmg, this.pos, fx * 6, fz * 6);
      }
    } else if (this.los && dist < 50) {
      if (this.burstLeft > 0) {
        this.burstTimer -= dt;
        if (this.burstTimer <= 0) { this.fire(tg); this.burstLeft--; this.burstTimer = c.gap; }
      } else if (this.cool <= 0) {
        this.burstLeft = c.burst;
        this.burstTimer = 0;
        this.cool = rand(...c.interval);
      }
    }
    return true;
  }

  fire(tg) {
    const c = this.cfg;
    const origin = this.muzzle.getWorldPosition(new THREE.Vector3());
    const target = tg.eye().clone();
    target.y -= 0.35;
    target.addScaledVector(tg.vel, (origin.distanceTo(target) / c.projSpeed) * 0.6);
    const dir = target.sub(origin).normalize();
    dir.x += (Math.random() - 0.5) * c.spread * 2;
    dir.y += (Math.random() - 0.5) * c.spread * 2;
    dir.z += (Math.random() - 0.5) * c.spread * 2;
    dir.normalize().multiplyScalar(c.projSpeed);
    this.ctx.director.spawnProjectile(origin, dir, c.dmg, c.glow, true);
  }

  // by: id del jugador que causa el daño (null = jugador local en un jugador).
  takeDamage(dmg, { shieldMult = 1, headMult = 1, part = 'body', by = null } = {}) {
    if (this.dead) return { killed: false };
    this.hitT = 1;
    if (this.shield > 0) this.flash = 1;
    if (this.replica) {
      // El anfitrión decide; aquí solo hay respuesta visual inmediata.
      const net = this.ctx.net;
      net.to(net.hostId, 'edmg', { id: this.id, dmg, sm: shieldMult, hm: headMult, part });
      return { killed: false, shieldHit: this.shield > 0 };
    }
    this.sinceHit = 0;
    this.los = true;
    let remaining = dmg, shieldHit = false;
    if (this.shield > 0) {
      shieldHit = true;
      const sd = remaining * shieldMult;
      if (sd < this.shield) { this.shield -= sd; remaining = 0; }
      else { remaining = (sd - this.shield) / shieldMult; this.shield = 0; this.ctx.sfx.shieldPop(); }
    }
    if (remaining > 0) this.hp -= remaining * (part === 'head' && !shieldHit ? headMult : 1);
    if (this.hp <= 0) {
      this.dead = true;
      this.deathT = 0;
      this.ctx.director.onKill(this, by, part === 'head');
      return { killed: true, head: part === 'head', shieldHit };
    }
    return { killed: false, shieldHit };
  }

  dispose() {
    this.ctx.scene.remove(this.group);
    this.group.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.dispose();
      o.material.dispose();
    });
  }
}

export class Director {
  constructor(ctx) {
    this.ctx = ctx;
    this.enemies = [];
    this.projectiles = [];
    this.pickups = [];
    this.queue = [];
    this.targets = [];
    this.projGeo = new THREE.SphereGeometry(0.12, 8, 6).scale(1, 1, 3);
    this.projMats = new Map();
    this.pickupGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
    this.pickupMats = {
      ammo: new THREE.MeshStandardMaterial({ color: 0x8cff6a, emissive: 0x2f8f1a, roughness: 0.4 }),
      grenade: new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0x8f4a10, roughness: 0.4 }),
    };
    this.mode = 'sp';
    this.authority = true;
    this.reset();
  }

  // mode: 'sp' | 'coop' | 'dm' (sin enemigos). authority: este equipo simula la IA.
  configure(mode, authority) {
    this.mode = mode;
    this.authority = authority;
    this.reset();
    if (mode === 'coop') this.boxes = CFG.box.spots.map((spot, i) => new MysteryBox(this.ctx, i, this.freeSpot(spot)));
  }

  // Sitio libre para una caja cerca del punto pedido (las cajas del mapa son aleatorias).
  freeSpot([x, y, z, rot]) {
    const { colliders } = this.ctx.world;
    const box = new THREE.Box3();
    for (let r = 0; r <= 8; r++) {
      for (let a = 0; a < (r ? 12 : 1); a++) {
        const px = x + Math.cos((a / 12) * Math.PI * 2) * r, pz = z + Math.sin((a / 12) * Math.PI * 2) * r;
        box.min.set(px - 1.1, y + 0.02, pz - 0.8);
        box.max.set(px + 1.1, y + 1.5, pz + 0.8);
        if (!colliders.some((c) => c.intersectsBox(box))) return [px, y, pz, rot];
      }
    }
    return [x, y, z, rot];
  }

  reset() {
    for (const e of this.enemies) e.dispose();
    for (const p of this.projectiles) this.ctx.scene.remove(p.mesh);
    for (const p of this.pickups) this.ctx.scene.remove(p.mesh);
    for (const b of this.boxes ?? []) b.dispose();
    this.boxes = [];
    this.enemies.length = this.projectiles.length = this.pickups.length = this.queue.length = 0;
    this.byId = new Map();
    this.scores = new Map();
    this.state = 'intermission';
    this.timer = 2.5;
    this.spawnTimer = 0;
    this.snapT = 0;
    this.nextId = 1;
    this.queueN = 0;
    this.allDeadT = 0;
    this.last = null;
  }

  get net() {
    return this.ctx.net;
  }

  get online() {
    return this.mode === 'coop' && this.net.active;
  }

  myId() {
    return this.online ? this.net.id : 'local';
  }

  alive() {
    return this.enemies.filter((e) => !e.dead);
  }

  remaining() {
    return (this.authority ? this.queue.length : this.queueN) + this.enemies.reduce((n, e) => n + (e.dead ? 0 : 1), 0);
  }

  hitMeshes() {
    const out = [];
    for (const e of this.enemies) if (!e.dead) out.push(...e.hitMeshes);
    return out;
  }

  score(id) {
    if (!this.scores.has(id)) this.scores.set(id, { kills: 0, score: 0, credits: 0 });
    return this.scores.get(id);
  }

  // --- Oleadas (solo autoridad) ---
  startWave() {
    const { game } = this.ctx;
    game.wave++;
    const comp = waveComposition(game.wave);
    for (const [type, n] of Object.entries(comp)) for (let i = 0; i < n; i++) this.queue.push(type);
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    }
    this.state = 'combat';
    this.spawnTimer = 0.5;
    this.onWave({ k: 'start', n: game.wave, comp });
    if (this.online) this.net.bcast('wave', { k: 'start', n: game.wave, comp });
  }

  clearWave() {
    const { game } = this.ctx;
    this.state = 'intermission';
    this.timer = CFG.waves.intermission;
    game.score += game.wave * 100;
    // Créditos por oleada para todo el equipo (los caídos también).
    const ids = this.online ? [...this.net.players.keys()] : [this.myId()];
    for (const id of ids) this.score(id).credits += CFG.box.waveBonus;
    this.onWave({ k: 'clear', n: game.wave });
    if (this.online) this.net.bcast('wave', { k: 'clear', n: game.wave });
  }

  // Efectos de inicio/fin de oleada en este equipo (anfitrión o cliente).
  onWave(m) {
    const { hud, sfx, arsenal, game } = this.ctx;
    if (m.k === 'start') {
      game.wave = m.n;
      const parts = Object.entries(m.comp).filter(([, n]) => n > 0).map(([t, n]) => `${n} ${CFG.enemies[t].label.toUpperCase()}`);
      hud.banner(`OLEADA ${m.n}`, parts.join(' · '));
      sfx.wave();
      game.onWaveStart?.();
    } else {
      arsenal.addAmmo(1.5);
      arsenal.addGrenade(1);
      hud.banner('OLEADA SUPERADA', `+${m.n * 100} PTS · MUNICIÓN Y GRANADA`, 2.6);
      sfx.pickup();
    }
  }

  spawnOne(type) {
    const { world, player, fx, sfx } = this.ctx;
    const far = world.spawnPoints.filter((p) => this.targets.every((t) => p.distanceTo(t.pos) > 28));
    const pool = far.length ? far : world.spawnPoints;
    const pos = pool[(Math.random() * pool.length) | 0].clone();
    pos.x += rand(-1.5, 1.5);
    pos.z += rand(-1.5, 1.5);
    const e = this.addEnemy(type, pos, this.nextId++, false);
    fx.burst(e.center(), e.cfg.glow, 18, 4, 0.5, 0.1, 2);
    sfx.spawn(pos.distanceTo(player.pos));
  }

  addEnemy(type, pos, id, replica) {
    const e = new Enemy(this.ctx, type, pos, id, replica);
    this.enemies.push(e);
    this.byId.set(id, e);
    return e;
  }

  onKill(e, by, head) {
    const { game, arsenal, net } = this.ctx;
    const me = this.myId();
    const killer = by ?? me;
    const s = this.score(killer);
    s.kills++;
    s.score += e.cfg.score;
    s.credits += e.cfg.score;
    game.score += e.cfg.score;
    if (killer === me) game.kills++;
    if (this.online) {
      const msg = { id: e.id, by: killer, head: !!head, label: e.cfg.label };
      net.bcast('ekill', msg);
      net.emit('ekill', { ...msg, t: 'ekill', from: net.id }); // también en el registro del anfitrión
    }
    if (Math.random() < e.cfg.drop) {
      const kind = Math.random() < 0.25 && arsenal.grenades < CFG.grenade.max ? 'grenade' : 'ammo';
      this.addPickup(this.nextId++, kind, e.pos.x, e.pos.y + 0.4, e.pos.z);
    }
  }

  addPickup(id, kind, x, y, z) {
    const mesh = new THREE.Mesh(this.pickupGeo, this.pickupMats[kind]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    this.ctx.scene.add(mesh);
    const p = { id, mesh, kind, life: 30, t: Math.random() * 6, claimed: false };
    this.pickups.push(p);
    return p;
  }

  removePickup(p) {
    this.ctx.scene.remove(p.mesh);
    this.pickups.splice(this.pickups.indexOf(p), 1);
  }

  // Daño cuerpo a cuerpo de un enemigo: local directo, remoto por la red.
  hurtTarget(tg, dmg, from, pushX, pushZ) {
    const { player, sfx, net } = this.ctx;
    sfx.enemyMelee(tg.pos.distanceTo(player.pos));
    if (tg === player) {
      player.damage(dmg, from);
      player.vel.x += pushX;
      player.vel.z += pushZ;
    } else {
      net.to(tg.id, 'hurt', { dmg, from: v3(from), push: [pushX, pushZ] });
    }
  }

  spawnProjectile(origin, vel, dmg, color, broadcast = false) {
    if (!this.projMats.has(color)) this.projMats.set(color, new THREE.MeshBasicMaterial({ color }));
    const mesh = new THREE.Mesh(this.projGeo, this.projMats.get(color));
    mesh.position.copy(origin);
    mesh.lookAt(_a.copy(origin).add(vel));
    this.ctx.scene.add(mesh);
    this.projectiles.push({ mesh, vel: vel.clone(), dmg, color, life: 3 });
    this.ctx.sfx.enemyShot(origin.distanceTo(this.ctx.player.pos));
    if (broadcast && this.online) this.net.bcast('proj', { p: v3(origin), v: v3(vel), d: dmg, c: color });
  }

  damageRadius(center, radius, damage, by = null) {
    const { world, hud, sfx } = this.ctx;
    const mine = by === null || by === this.myId();
    let kills = 0, hits = 0;
    for (const e of this.enemies) {
      if (e.dead || e.replica) continue;
      const c = e.center(new THREE.Vector3());
      const d = c.distanceTo(center);
      if (d > radius || !world.lineOfSight(_a.copy(center).setY(center.y + 0.3), c)) continue;
      const f = 1 - d / radius;
      const res = e.takeDamage(damage * (0.15 + 0.85 * f), { part: 'body', by });
      e.vel.add(c.sub(center).setY(0).normalize().multiplyScalar(9 * f));
      hits++;
      if (res.killed) kills++;
    }
    if (mine && hits) { hud.hitMarker(kills > 0); sfx.hit(); }
    if (mine && kills) sfx.kill();
  }

  // --- Red (coop) ---
  snapshot() {
    const { game } = this.ctx;
    return {
      w: game.wave, st: this.state, tm: +this.timer.toFixed(2), q: this.queue, sc: game.score,
      e: this.enemies.map((e) => [e.id, TYPES.indexOf(e.type), ...v3(e.pos), +e.group.rotation.y.toFixed(3), Math.round(e.hp), Math.round(e.shield), e.dead ? 1 : 0]),
      p: this.pickups.map((p) => [p.id, p.kind, ...v3(p.mesh.position)]),
      s: [...this.scores].map(([id, s]) => [id, s.kills, s.score, s.credits]),
    };
  }

  applySnapshot(s) {
    const { game } = this.ctx;
    this.last = s;
    game.wave = s.w;
    game.score = s.sc;
    this.state = s.st;
    this.timer = s.tm;
    this.queueN = s.q.length;
    this.scores = new Map(s.s.map(([id, kills, score, credits]) => [id, { kills, score, credits }]));
    game.kills = this.scores.get(this.net.id)?.kills ?? 0;

    const seen = new Set();
    for (const [id, ti, x, y, z, rot, hp, sh, dead] of s.e) {
      let e = this.byId.get(id);
      if (!e) {
        if (dead) continue;
        e = this.addEnemy(TYPES[ti], _a.set(x, y, z), id, true);
        this.ctx.fx.burst(e.center(), e.cfg.glow, 18, 4, 0.5, 0.1, 2);
      }
      seen.add(id);
      e.netPos.set(x, y, z);
      e.netRot = rot;
      e.hp = hp;
      e.shield = sh;
      if (dead && !e.dead) { e.dead = true; e.deathT = 0; }
    }
    for (const e of this.enemies) if (!seen.has(e.id) && !e.dead) { e.dead = true; e.deathT = 1; }

    const pseen = new Set();
    for (const [id, kind, x, y, z] of s.p) {
      pseen.add(id);
      if (!this.pickups.some((p) => p.id === id)) this.addPickup(id, kind, x, y, z);
    }
    for (const p of [...this.pickups]) if (!pseen.has(p.id)) this.removePickup(p);
  }

  // Petición de daño de un cliente a un enemigo del anfitrión.
  onRemoteDamage(m) {
    const e = this.byId.get(m.id);
    if (!this.authority || !e || e.dead || e.replica) return;
    e.takeDamage(m.dmg, { shieldMult: m.sm, headMult: m.hm, part: m.part, by: m.from });
  }

  onClaim(m) {
    const p = this.pickups.find((q) => q.id === m.id);
    if (!this.authority || !p) return;
    this.removePickup(p);
    this.net.to(m.from, 'grant', { kind: p.kind });
  }

  // --- Caja misteriosa ---
  credits() {
    return this.scores.get(this.myId())?.credits ?? 0;
  }

  boxPool() {
    const wave = Math.max(1, this.ctx.game.wave);
    return CFG.box.pool.filter((p) => p.wave <= wave).flatMap((p) => p.ids);
  }

  nearBox() {
    const p = this.ctx.player;
    if (!p.alive) return null;
    return this.boxes.find((b) => Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z) < CFG.box.range && Math.abs(b.pos.y - p.pos.y) < 1.5) ?? null;
  }

  // Texto de ayuda cuando estás junto a una caja.
  boxPrompt() {
    const b = this.nearBox();
    if (!b) return '';
    if (b.takeable(this.myId())) return `E · COGER ${CFG.weapons[b.weapon].name}`;
    if (b.state !== 'idle') return 'CAJA EN USO';
    const c = CFG.box.cost;
    return this.credits() >= c ? `E · CAJA MISTERIOSA (${c} CRÉDITOS)` : `CAJA MISTERIOSA · NECESITAS ${c} CRÉDITOS`;
  }

  // Tecla E del jugador local.
  interact() {
    const b = this.nearBox();
    if (!b) return false;
    const me = this.myId();
    if (b.takeable(me)) {
      const id = b.weapon;
      const res = this.ctx.arsenal.give(id);
      this.ctx.hud.toast(res === 'ammo' ? `MUNICIÓN LLENA · ${CFG.weapons[id].name}` : CFG.weapons[id].name);
      this.ctx.sfx.pickup();
      b.close();
      if (this.online) this.net.bcast('boxTake', { id: b.id });
      return true;
    }
    if (b.state !== 'idle') return true;
    if (this.authority) this.useBox(b.id, me);
    else this.net.to(this.net.hostId, 'boxUse', { id: b.id });
    return true;
  }

  // Anfitrión: valida créditos, cobra y decide el arma.
  useBox(boxId, playerId) {
    const b = this.boxes[boxId];
    const s = this.score(playerId);
    let reason = null;
    if (!b || b.state !== 'idle') reason = 'CAJA EN USO';
    else if (s.credits < CFG.box.cost) reason = `NECESITAS ${CFG.box.cost} CRÉDITOS`;
    if (reason) {
      if (playerId === this.myId()) { this.ctx.hud.toast(reason); this.ctx.sfx.deny(); }
      else this.net.to(playerId, 'boxDeny', { reason });
      return;
    }
    s.credits -= CFG.box.cost;
    const pool = this.boxPool();
    const w = pool[(Math.random() * pool.length) | 0];
    b.start(w, playerId, pool);
    if (this.online) this.net.bcast('box', { id: boxId, by: playerId, w, pool });
  }

  onBox(m) {
    this.boxes[m.id]?.start(m.w, m.by, m.pool);
  }

  // Migración: el anfitrión se fue y ahora simulamos nosotros.
  promote() {
    if (this.authority) return;
    this.authority = true;
    const s = this.last;
    this.queue = s ? [...s.q] : [];
    let maxId = 0;
    for (const e of this.enemies) {
      maxId = Math.max(maxId, e.id);
      if (!e.replica) continue;
      e.replica = false;
      e.pos.copy(e.netPos);
      e.group.rotation.y = e.netRot;
    }
    for (const p of this.pickups) maxId = Math.max(maxId, p.id);
    this.nextId = maxId + 1;
  }

  collectTargets() {
    const { player, remotes } = this.ctx;
    this.targets.length = 0;
    if (player.alive) this.targets.push(player);
    if (this.online) for (const r of remotes.alive()) this.targets.push(r);
  }

  update(dt) {
    if (this.mode === 'dm') return;
    for (const b of this.boxes) b.update(dt);
    const { game, player, world, fx, arsenal } = this.ctx;
    const W = CFG.waves;
    this.collectTargets();

    if (this.authority) {
      if (this.targets.length) this.ctx.nav.update(this.targets, dt);
      if (this.state === 'intermission') {
        this.timer -= dt;
        if (this.timer <= 0 && this.targets.length) this.startWave();
      } else {
        this.spawnTimer -= dt;
        const aliveCount = this.enemies.reduce((n, e) => n + (e.dead ? 0 : 1), 0);
        if (this.queue.length && this.spawnTimer <= 0 && aliveCount < W.maxAlive) {
          this.spawnOne(this.queue.shift());
          this.spawnTimer = W.spawnGap;
        }
        if (!this.queue.length && aliveCount === 0 && this.targets.length) this.clearWave();
      }
      // Coop: todos caídos → fin de partida.
      if (this.online) {
        this.allDeadT = this.targets.length ? 0 : this.allDeadT + dt;
        if (this.allDeadT > 2.5) { this.allDeadT = -1e9; game.onCoopOver?.(); }
        this.snapT -= dt;
        if (this.snapT <= 0) { this.snapT = SNAP_RATE; this.net.bcast('snap', this.snapshot()); }
      }
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.update(dt)) {
        e.dispose();
        this.enemies.splice(i, 1);
        this.byId.delete(e.id);
      }
    }

    // Proyectiles (cada equipo solo comprueba impactos contra su propio jugador).
    const P = CFG.player;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      let hit = false;
      const pos = p.mesh.position;
      for (let s = 0; s < 3 && !hit; s++) {
        pos.addScaledVector(p.vel, dt / 3);
        if (player.alive) {
          const cy = Math.min(Math.max(pos.y, player.pos.y + 0.2), player.pos.y + player.height - 0.1);
          if (Math.hypot(pos.x - player.pos.x, pos.y - cy, pos.z - player.pos.z) < P.radius + 0.12) {
            player.damage(p.dmg, _b.copy(pos).addScaledVector(p.vel, -0.1));
            hit = true;
            break;
          }
        }
        if (world.pointInSolid(pos)) {
          fx.sparks(pos, p.color);
          hit = true;
        }
      }
      if (hit || p.life <= 0) {
        this.ctx.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }

    // Recogibles: el anfitrión los da directamente; un cliente los pide.
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.t += dt;
      p.mesh.rotation.y += dt * 2;
      p.mesh.position.y = p.mesh.position.y * 0.9 + (world.groundHeightAt(p.mesh.position.x, p.mesh.position.z, 0.1, p.mesh.position.y) + 0.45 + Math.sin(p.t * 3) * 0.1) * 0.1;
      const near = player.alive && p.mesh.position.distanceTo(_a.set(player.pos.x, player.pos.y + 0.6, player.pos.z)) < 1.5;
      const wanted = p.kind === 'ammo' ? arsenal.wantsAmmo() : arsenal.grenades < CFG.grenade.max;
      if (this.authority) {
        p.life -= dt;
        let taken = false;
        if (near && wanted) { this.grant(p.kind); taken = true; }
        if (taken || p.life <= 0) this.removePickup(p);
      } else if (near && wanted && !p.claimed) {
        p.claimed = true;
        this.net.to(this.net.hostId, 'claim', { id: p.id });
      }
    }
  }

  grant(kind) {
    const { arsenal, hud, sfx } = this.ctx;
    if (kind === 'ammo' && arsenal.addAmmo(1)) hud.toast('+MUNICIÓN');
    if (kind === 'grenade' && arsenal.addGrenade(1)) hud.toast('+1 GRANADA');
    sfx.pickup();
  }
}
