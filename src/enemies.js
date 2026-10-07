import * as THREE from 'three';
import { CFG, waveComposition, rand } from './config.js';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _f = { x: 0, z: 0 };

class Enemy {
  constructor(ctx, type, pos) {
    this.ctx = ctx;
    this.type = type;
    this.cfg = CFG.enemies[type];
    const c = this.cfg;
    this.pos = pos.clone();
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

  // Devuelve false cuando el cadáver ya puede retirarse.
  update(dt) {
    const { player, world, sfx, director, nav } = this.ctx;
    const c = this.cfg;
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

    this.sinceHit += dt;
    if (c.shield > 0) {
      if (this.sinceHit > 5) this.shield = Math.min(c.shield, this.shield + 30 * dt);
      this.flash = Math.max(0, this.flash - dt * 3);
      this.bubbleMat.opacity = this.flash * 0.55;
    }
    this.hitT = Math.max(0, this.hitT - dt * 5);
    this.bodyMat.emissive.setRGB(this.hitT * 0.8, this.hitT * 0.15, 0);

    const eye = _a.set(this.pos.x, this.pos.y + this.height * 0.9, this.pos.z);
    this.losTimer -= dt;
    if (this.losTimer <= 0 && player.alive) {
      this.losTimer = 0.2 + Math.random() * 0.15;
      this.los = world.lineOfSight(eye, player.eye());
    }
    if (!player.alive) this.los = false;

    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
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
    if (!player.alive) { mx = 0; mz = 0; }
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
    this.group.rotation.y = Math.atan2(fx, fz);
    this.group.updateMatrixWorld(true);

    // --- Ataque ---
    this.cool = Math.max(-1, this.cool - dt);
    if (!player.alive) return true;
    if (c.melee) {
      if (dist < c.range[1] + 0.3 && Math.abs(player.pos.y - this.pos.y) < 1.5 && this.cool <= 0) {
        this.cool = rand(...c.interval);
        player.damage(c.dmg, this.pos);
        sfx.enemyMelee(dist);
        player.vel.x += fx * 6;
        player.vel.z += fz * 6;
      }
    } else if (this.los && dist < 50) {
      if (this.burstLeft > 0) {
        this.burstTimer -= dt;
        if (this.burstTimer <= 0) { this.fire(dist); this.burstLeft--; this.burstTimer = c.gap; }
      } else if (this.cool <= 0) {
        this.burstLeft = c.burst;
        this.burstTimer = 0;
        this.cool = rand(...c.interval);
      }
    }
    return true;
  }

  fire(dist) {
    const { player, director, sfx } = this.ctx;
    const c = this.cfg;
    const origin = this.muzzle.getWorldPosition(new THREE.Vector3());
    const target = player.eye().clone();
    target.y -= 0.35;
    target.addScaledVector(player.vel, (origin.distanceTo(target) / c.projSpeed) * 0.6);
    const dir = target.sub(origin).normalize();
    dir.x += (Math.random() - 0.5) * c.spread * 2;
    dir.y += (Math.random() - 0.5) * c.spread * 2;
    dir.z += (Math.random() - 0.5) * c.spread * 2;
    dir.normalize().multiplyScalar(c.projSpeed);
    director.spawnProjectile(origin, dir, c.dmg, c.glow);
    sfx.enemyShot(dist);
  }

  takeDamage(dmg, { shieldMult = 1, headMult = 1, part = 'body' } = {}) {
    if (this.dead) return { killed: false };
    this.sinceHit = 0;
    this.hitT = 1;
    this.los = true;
    let remaining = dmg, shieldHit = false;
    if (this.shield > 0) {
      shieldHit = true;
      this.flash = 1;
      const sd = remaining * shieldMult;
      if (sd < this.shield) { this.shield -= sd; remaining = 0; }
      else { remaining = (sd - this.shield) / shieldMult; this.shield = 0; this.ctx.sfx.shieldPop(); }
    }
    if (remaining > 0) this.hp -= remaining * (part === 'head' && !shieldHit ? headMult : 1);
    if (this.hp <= 0) {
      this.dead = true;
      this.deathT = 0;
      this.ctx.director.onKill(this);
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
    this.projGeo = new THREE.SphereGeometry(0.12, 8, 6).scale(1, 1, 3);
    this.projMats = new Map();
    this.pickupGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
    this.pickupMats = {
      ammo: new THREE.MeshStandardMaterial({ color: 0x8cff6a, emissive: 0x2f8f1a, roughness: 0.4 }),
      grenade: new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0x8f4a10, roughness: 0.4 }),
    };
    this.reset();
  }

  reset() {
    for (const e of this.enemies) e.dispose();
    for (const p of this.projectiles) this.ctx.scene.remove(p.mesh);
    for (const p of this.pickups) this.ctx.scene.remove(p.mesh);
    this.enemies.length = this.projectiles.length = this.pickups.length = this.queue.length = 0;
    this.state = 'intermission';
    this.timer = 2.5;
    this.spawnTimer = 0;
  }

  alive() {
    return this.enemies.filter((e) => !e.dead);
  }

  remaining() {
    return this.queue.length + this.enemies.reduce((n, e) => n + (e.dead ? 0 : 1), 0);
  }

  hitMeshes() {
    const out = [];
    for (const e of this.enemies) if (!e.dead) out.push(...e.hitMeshes);
    return out;
  }

  startWave() {
    const { game, hud, sfx } = this.ctx;
    game.wave++;
    const comp = waveComposition(game.wave);
    for (const [type, n] of Object.entries(comp)) for (let i = 0; i < n; i++) this.queue.push(type);
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    }
    const parts = Object.entries(comp).filter(([, n]) => n > 0).map(([t, n]) => `${n} ${CFG.enemies[t].label.toUpperCase()}`);
    hud.banner(`OLEADA ${game.wave}`, parts.join(' · '));
    sfx.wave();
    this.state = 'combat';
    this.spawnTimer = 0.5;
  }

  spawnOne(type) {
    const { world, player, fx, sfx } = this.ctx;
    const far = world.spawnPoints.filter((p) => p.distanceTo(player.pos) > 28);
    const pool = far.length ? far : world.spawnPoints;
    const base = pool[(Math.random() * pool.length) | 0];
    const pos = base.clone();
    pos.x += rand(-1.5, 1.5);
    pos.z += rand(-1.5, 1.5);
    const e = new Enemy(this.ctx, type, pos);
    this.enemies.push(e);
    fx.burst(e.center(), e.cfg.glow, 18, 4, 0.5, 0.1, 2);
    sfx.spawn(pos.distanceTo(player.pos));
  }

  onKill(e) {
    const { game, arsenal } = this.ctx;
    game.kills++;
    game.score += e.cfg.score;
    if (Math.random() < e.cfg.drop) {
      const kind = Math.random() < 0.25 && arsenal.grenades < CFG.grenade.max ? 'grenade' : 'ammo';
      const mesh = new THREE.Mesh(this.pickupGeo, this.pickupMats[kind]);
      mesh.position.set(e.pos.x, e.pos.y + 0.4, e.pos.z);
      mesh.castShadow = true;
      this.ctx.scene.add(mesh);
      this.pickups.push({ mesh, kind, life: 30, t: Math.random() * 6 });
    }
  }

  spawnProjectile(origin, vel, dmg, color) {
    if (!this.projMats.has(color)) this.projMats.set(color, new THREE.MeshBasicMaterial({ color }));
    const mesh = new THREE.Mesh(this.projGeo, this.projMats.get(color));
    mesh.position.copy(origin);
    mesh.lookAt(_a.copy(origin).add(vel));
    this.ctx.scene.add(mesh);
    this.projectiles.push({ mesh, vel: vel.clone(), dmg, color, life: 3 });
  }

  damageRadius(center, radius, damage) {
    const { world, hud, sfx } = this.ctx;
    let kills = 0, hits = 0;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const c = e.center(new THREE.Vector3());
      const d = c.distanceTo(center);
      if (d > radius || !world.lineOfSight(_a.copy(center).setY(center.y + 0.3), c)) continue;
      const f = 1 - d / radius;
      const res = e.takeDamage(damage * (0.15 + 0.85 * f), { part: 'body' });
      const push = c.sub(center).setY(0).normalize().multiplyScalar(9 * f);
      e.vel.add(push);
      hits++;
      if (res.killed) kills++;
    }
    if (hits) { hud.hitMarker(kills > 0); sfx.hit(); }
    if (kills) sfx.kill();
  }

  update(dt) {
    const { game, player, world, fx, hud, sfx, arsenal } = this.ctx;
    const W = CFG.waves;

    if (player.alive) this.ctx.nav.update(player.pos, player.pos.y, dt);

    if (this.state === 'intermission') {
      this.timer -= dt;
      if (this.timer <= 0 && player.alive) this.startWave();
    } else {
      this.spawnTimer -= dt;
      const aliveCount = this.enemies.reduce((n, e) => n + (e.dead ? 0 : 1), 0);
      if (this.queue.length && this.spawnTimer <= 0 && aliveCount < W.maxAlive) {
        this.spawnOne(this.queue.shift());
        this.spawnTimer = W.spawnGap;
      }
      if (!this.queue.length && aliveCount === 0 && player.alive) {
        this.state = 'intermission';
        this.timer = W.intermission;
        game.score += game.wave * 100;
        arsenal.addAmmo(64);
        arsenal.addGrenade(1);
        hud.banner('OLEADA SUPERADA', `+${game.wave * 100} PTS · MUNICIÓN Y GRANADA`, 2.6);
        sfx.pickup();
      }
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (!this.enemies[i].update(dt)) {
        this.enemies[i].dispose();
        this.enemies.splice(i, 1);
      }
    }

    // Proyectiles enemigos (subpasos para no atravesar al jugador).
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

    // Recogibles.
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.life -= dt;
      p.t += dt;
      p.mesh.rotation.y += dt * 2;
      p.mesh.position.y = p.mesh.position.y * 0.9 + (world.groundHeightAt(p.mesh.position.x, p.mesh.position.z, 0.1, p.mesh.position.y) + 0.45 + Math.sin(p.t * 3) * 0.1) * 0.1;
      let taken = false;
      if (player.alive && p.mesh.position.distanceTo(_a.set(player.pos.x, player.pos.y + 0.6, player.pos.z)) < 1.5) {
        if (p.kind === 'ammo' && arsenal.addAmmo(48)) { hud.toast('+48 MUNICIÓN'); taken = true; }
        if (p.kind === 'grenade' && arsenal.addGrenade(1)) { hud.toast('+1 GRANADA'); taken = true; }
        if (taken) sfx.pickup();
      }
      if (taken || p.life <= 0) {
        this.ctx.scene.remove(p.mesh);
        this.pickups.splice(i, 1);
      }
    }
  }
}
