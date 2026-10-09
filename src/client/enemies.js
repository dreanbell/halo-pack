import * as THREE from 'three';
import { CFG, waveComposition, difficulty, rand } from './config.js';
import { DIFFICULTY } from '../shared/rules.js';
import { v3 } from './net.js';
import { SupplyDrop } from './drop.js';
import { buildAlien } from './aliens.js';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _f = { x: 0, z: 0 };
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const TYPES = Object.keys(CFG.enemies);
const SNAP_RATE = 1 / 12;

const GRAV = 22;
const MORTAR_G = 16;
const pick = (list) => list[(Math.random() * list.length) | 0];

class Enemy {
  // replica = true: copia de un enemigo simulado por el anfitrión (coop, cliente).
  constructor(ctx, type, pos, id, replica = false, scale = {}) {
    this.ctx = ctx;
    this.id = id;
    this.type = type;
    this.replica = replica;
    this.cfg = CFG.enemies[type];
    const c = this.cfg;
    this.dmgMult = scale.dmg ?? 1;
    this.maxHp = c.hp * (scale.hp ?? 1);
    this.maxShield = c.shield * (scale.hp ?? 1);
    this.hp = this.maxHp;
    this.shield = this.maxShield;
    this.pos = pos.clone();
    this.flying = !!c.fly;
    this.altitude = c.fly ? rand(...c.fly) : 0;
    if (this.flying && !replica) this.pos.y = Math.max(this.pos.y, this.altitude);
    this.netPos = this.pos.clone();
    this.netRot = 0;
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.onGround = true;
    this.sinceHit = 99;
    this.cool = rand(1.2, 2.4);
    this.burstLeft = 0;
    this.burstTimer = 0;
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.strafeTimer = rand(1, 3);
    this.orbitA = Math.random() * Math.PI * 2;
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
    this.attackT = 0;
    this.revealT = 0;
    this.revealK = 0;
    this.leapCD = rand(2, 4);
    this.flags = 0;
    // Jefes
    this.bstate = 'walk';
    this.bT = 2.5;
    this.summoned = 0;
    this.enraged = false;
    this.telegraph = false;
    this.radius = 0.45 * c.scale;
    this.height = (this.flying ? 0.8 : 1.6) * c.scale;
    this.t = Math.random() * 10;
    this.build();
  }

  build() {
    const rig = (this.rig = buildAlien(this.type));
    this.group = rig.root;
    for (const m of rig.hitMeshes) m.userData = { enemy: this, part: m.userData.part };
    this.hitMeshes = rig.hitMeshes;
    this.muzzle = rig.muzzle;
    rig.body.scale.setScalar(0.01);
    this.group.position.copy(this.pos);
    this.ctx.scene.add(this.group);
  }

  center(out = _b) {
    return out.set(this.pos.x, this.pos.y + (this.flying ? 0 : this.height * 0.55), this.pos.z);
  }

  facing() {
    const r = this.group.rotation.y;
    return _a.set(Math.sin(r), 0, Math.cos(r));
  }

  // Efectos visuales comunes; devuelve false cuando el cadáver ya puede retirarse.
  animate(dt) {
    this.t += dt;
    this.hitT = Math.max(0, this.hitT - dt * 5);
    this.flash = Math.max(0, this.flash - dt * 3);
    if (this.dead) {
      if (this.deathT === 0) {
        // Criatura de carne: estallido de sangre y vísceras, con un destello de su energía.
        const c = this.center(_a).clone();
        this.ctx.fx.gore?.(c, this.cfg.boss ? 2.6 : 1.2);
        this.ctx.fx.burst(c, this.cfg.glow, this.cfg.boss ? 40 : 12, this.cfg.boss ? 10 : 5, 0.7, 0.1, 6);
      }
      this.deathT += dt;
      const body = this.rig.body;
      if (this.flying) {
        this.vy -= GRAV * dt;
        this.pos.y = Math.max(0.3, this.pos.y + this.vy * dt);
        body.rotation.z += dt * 6;
        this.group.position.copy(this.pos);
      } else {
        body.rotation.x = -Math.min(this.deathT * 3, Math.PI / 2);
        this.group.position.y = this.pos.y - Math.max(0, this.deathT - 0.8) * 0.8;
      }
      this.rig.animate(dt, { speed: 0, hit: 1 - Math.min(1, this.deathT), shield: 0 });
      return this.deathT < 2;
    }
    if (this.spawnT < 1) {
      this.spawnT = Math.min(1, this.spawnT + dt * 2.5);
      this.rig.body.scale.setScalar(this.spawnT);
    }
    const revealed = (this.flags & 1) !== 0;
    this.revealK += ((revealed ? 1 : 0) - this.revealK) * Math.min(1, dt * 6);
    this.rig.animate(dt, {
      speed: Math.hypot(this.vel.x, this.vel.z),
      attack: (this.flags & 8) !== 0,
      telegraph: (this.flags & 2) !== 0,
      enraged: (this.flags & 4) !== 0,
      hit: this.hitT,
      shield: this.shield,
      flash: this.flash,
      cloak: this.cfg.ai === 'stalker' ? this.revealK : undefined,
    });
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
    this.group.position.copy(this.pos);
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
    const { world } = this.ctx;
    const c = this.cfg;

    this.sinceHit += dt;
    if (this.maxShield > 0 && this.sinceHit > (c.boss ? 8 : 5)) this.shield = Math.min(this.maxShield, this.shield + this.maxShield * (c.boss ? 0.08 : 0.4) * dt);
    this.attackT = Math.max(0, this.attackT - dt);
    this.revealT = Math.max(0, this.revealT - dt);
    this.leapCD -= dt;

    this.targetT -= dt;
    if (this.targetT <= 0 || !this.target?.alive) {
      const t = this.pickTarget();
      if (t !== this.target) this.losTimer = 0;
      this.target = t;
      this.targetT = 0.6;
    }
    const tg = this.target;
    this.losTimer -= dt;
    if (this.losTimer <= 0 && tg) {
      this.losTimer = 0.2 + Math.random() * 0.15;
      const eye = this.flying ? this.center(_a) : _a.set(this.pos.x, this.pos.y + this.height * 0.9, this.pos.z);
      this.los = world.lineOfSight(eye, tg.eye());
    }
    if (!tg) this.los = false;
    this.cool = Math.max(-1, this.cool - dt);

    if (c.ai === 'flyer') this.flyAI(dt, tg);
    else if (c.ai === 'warlord') this.warlordAI(dt, tg);
    else if (c.ai === 'overseer') this.overseerAI(dt, tg);
    else this.groundAI(dt, tg);

    if (c.ai === 'stalker') {
      const near = tg && Math.hypot(tg.pos.x - this.pos.x, tg.pos.z - this.pos.z) < 3.2;
      if (near) this.revealT = Math.max(this.revealT, 0.3);
    }
    this.flags = (this.revealT > 0 || c.ai !== 'stalker' ? 1 : 0) | (this.telegraph ? 2 : 0) | (this.enraged ? 4 : 0) | (this.attackT > 0 ? 8 : 0);
    if (tg && this.bstate !== 'charge') this.group.rotation.y = Math.atan2(tg.pos.x - this.pos.x, tg.pos.z - this.pos.z);
    this.group.position.copy(this.pos);
    this.group.updateMatrixWorld(true);
    return true;
  }

  toTarget(tg) {
    if (!tg) return { dist: 999, fx: 0, fz: 1, dy: 0 };
    const dx = tg.pos.x - this.pos.x, dz = tg.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    return { dist, fx: dx / dist, fz: dz / dist, dy: tg.pos.y - this.pos.y };
  }

  // Desplazamiento con colisiones, rodeo de obstáculos y gravedad (enemigos de suelo).
  move(dt, mx, mz, speed, ignoreSeparation = false) {
    const { world, director } = this.ctx;
    if (!ignoreSeparation) {
      for (const o of director.enemies) {
        if (o === this || o.dead || o.flying !== this.flying) continue;
        const ox = this.pos.x - o.pos.x, oz = this.pos.z - o.pos.z, d2 = ox * ox + oz * oz, min = this.radius + o.radius + 0.6;
        if (d2 < min * min && d2 > 1e-4) {
          const d = Math.sqrt(d2);
          mx += (ox / d) * (min - d);
          mz += (oz / d) * (min - d);
        }
      }
    }
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    const k = 1 - Math.exp(-(this.onGround ? 8 : 0.6) * dt);
    this.vel.x += (mx * speed - this.vel.x) * k;
    this.vel.z += (mz * speed - this.vel.z) * k;
    const px = this.pos.x, pz = this.pos.z;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    world.resolveHorizontal(this.pos, this.radius, this.pos.y, this.pos.y + this.height);
    world.clampToArena(this.pos, this.radius);
    const gh = world.groundHeightAt(this.pos.x, this.pos.z, this.radius * 0.5, this.pos.y);
    if (this.vy !== 0 || this.pos.y > gh + 0.6) {
      this.vy -= GRAV * dt;
      this.pos.y += this.vy * dt;
      this.onGround = false;
      if (this.pos.y <= gh) {
        this.pos.y = gh;
        this.vy = 0;
        this.onGround = true;
        this.onLand?.();
      }
    } else {
      this.pos.y += (gh - this.pos.y) * Math.min(1, dt * 10);
      this.onGround = true;
    }
    const moved = Math.hypot(this.pos.x - px, this.pos.z - pz);
    if (ml > 0.01 && this.onGround && moved < speed * dt * 0.35) this.stuck += dt;
    else this.stuck = Math.max(0, this.stuck - dt);
    if (this.stuck > 0.35) {
      // Atascado otra vez durante un rodeo (rincón cóncavo) -> invierte el sentido.
      this.detour = this.detourT > 0 ? -this.detour : this.detour || (Math.random() < 0.5 ? -1 : 1);
      this.detourT = 1;
      this.stuck = 0;
    }
  }

  // Dirección de avance: directa con visión, si no por el campo de flujo; con rodeo si se atasca.
  steer(dt, tg, direct, fx, fz) {
    let mx = fx, mz = fz;
    if (!direct) {
      const fdir = this.ctx.nav.flowDir(this.pos, _f);
      if (fdir) { mx = fdir.x; mz = fdir.z; }
    }
    if (this.detourT > 0) {
      this.detourT -= dt;
      mx = -fz * this.detour + fx * 0.2;
      mz = fx * this.detour + fz * 0.2;
    }
    return [mx, mz];
  }

  groundAI(dt, tg) {
    const c = this.cfg;
    const { dist, fx, fz, dy } = this.toTarget(tg);
    const [near, far] = c.range;
    const melee = !!c.melee;
    const direct = melee ? this.los && dist < 4 : this.los && dist <= far;
    let [mx, mz] = tg ? this.steer(dt, tg, direct, fx, fz) : [0, 0];
    if (direct && !melee && dist < near) { mx = -fx; mz = -fz; }
    if (this.los && !melee) {
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) { this.strafeDir *= -1; this.strafeTimer = rand(0.8, 2.6); }
      const st = c.ai === 'artillery' ? 0.4 : 0.8;
      mx += -fz * this.strafeDir * st;
      mz += fx * this.strafeDir * st;
    }
    if (!tg) { mx = 0; mz = 0; }
    // Stalker: salto de emboscada.
    if (c.ai === 'stalker' && tg && this.los && this.onGround && this.leapCD <= 0 && dist > 3 && dist < 10) {
      this.vel.set(fx * c.leap, 0, fz * c.leap);
      this.vy = 6.5;
      this.onGround = false;
      this.leapCD = rand(3, 5);
      this.revealT = 1.2;
      this.attackT = 0.6;
      this.ctx.sfx.enemyMelee(this.pos.distanceTo(this.ctx.player.pos));
    }
    const speed = c.speed * (melee && this.los && dist < 10 ? 1.35 : !this.los ? 1.2 : 1) * this.spawnT;
    this.move(dt, mx, mz, speed);
    if (!tg) return;
    if (melee) {
      const reach = c.range[1] + 0.3 + (this.onGround ? 0 : 0.8);
      if (dist < reach && Math.abs(dy) < 1.6 && this.cool <= 0) {
        this.cool = rand(...c.interval);
        this.attackT = 0.4;
        this.revealT = Math.max(this.revealT, 1.5);
        this.ctx.director.hurtTarget(tg, c.dmg * this.dmgMult, this.pos, fx * 6, fz * 6, this);
      }
    } else if (this.los && dist < (c.ai === 'artillery' ? 60 : 50)) {
      this.burstFire(dt, tg);
    }
  }

  burstFire(dt, tg) {
    const c = this.cfg;
    if (this.burstLeft > 0) {
      this.burstTimer -= dt;
      if (this.burstTimer <= 0) {
        if (c.ai === 'artillery') this.mortar(tg, c.dmg, c.splash);
        else this.fire(tg);
        this.burstLeft--;
        this.burstTimer = c.gap;
        this.attackT = 0.3;
      }
    } else if (this.cool <= 0) {
      this.burstLeft = c.burst ?? 1;
      this.burstTimer = 0;
      this.cool = rand(...c.interval);
    }
  }

  // Vuelo: órbita alrededor del objetivo a cierta altura.
  flyAI(dt, tg) {
    const c = this.cfg;
    const { dist } = this.toTarget(tg);
    const mid = (c.range[0] + c.range[1]) / 2;
    this.orbitA += dt * 0.5 * this.strafeDir;
    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) { this.strafeDir *= -1; this.strafeTimer = rand(2, 5); }
    const goal = _c.set(0, this.altitude, 0);
    if (tg) goal.set(tg.pos.x + Math.cos(this.orbitA) * mid, tg.pos.y + this.altitude, tg.pos.z + Math.sin(this.orbitA) * mid);
    this.flyTo(dt, goal, c.speed * this.spawnT);
    if (tg && this.los && dist < 40) this.burstFire(dt, tg);
  }

  flyTo(dt, goal, speed, k = 2.5) {
    const { world } = this.ctx;
    _d.subVectors(goal, this.pos);
    const d = _d.length();
    if (d > 0.5) _d.multiplyScalar(Math.min(1, d / 3) * speed / d); else _d.set(0, 0, 0);
    const a = 1 - Math.exp(-k * dt);
    this.vel.lerp(_d, a);
    this.pos.addScaledVector(this.vel, dt);
    // No atravesar estructuras: si choca, sube.
    if (world.pointInSolid(this.pos)) {
      this.pos.y += 4 * dt * speed * 0.3;
      this.vel.y = Math.max(this.vel.y, 2);
    }
    world.clampToArena(this.pos, this.radius);
    const floor = world.groundHeightAt(this.pos.x, this.pos.z, this.radius, 99, 99) + 1.2;
    this.pos.y = Math.min(16, Math.max(floor, this.pos.y));
  }

  fire(tg, opts = {}) {
    const c = this.cfg;
    this.group.updateMatrixWorld(true);
    const origin = this.muzzle.getWorldPosition(new THREE.Vector3());
    const speed = opts.speed ?? c.projSpeed;
    const target = tg.eye().clone();
    target.y -= 0.35;
    target.addScaledVector(tg.vel, (origin.distanceTo(target) / speed) * 0.6);
    const dir = target.sub(origin).normalize();
    if (opts.yaw) dir.applyAxisAngle(UP, opts.yaw);
    const sp = opts.spread ?? c.spread;
    dir.x += (Math.random() - 0.5) * sp * 2;
    dir.y += (Math.random() - 0.5) * sp * 2;
    dir.z += (Math.random() - 0.5) * sp * 2;
    dir.normalize().multiplyScalar(speed);
    this.ctx.director.spawnProjectile(origin, dir, (opts.dmg ?? c.dmg) * this.dmgMult, c.glow, true, { ...opts, src: this });
  }

  // Mortero en parábola hacia donde estará el objetivo.
  mortar(tg, dmg, splash, at = null) {
    this.group.updateMatrixWorld(true);
    const o = this.muzzle.getWorldPosition(new THREE.Vector3());
    const t = at ?? tg.pos.clone();
    const T = Math.min(2.6, Math.max(1.1, o.distanceTo(t) / 15));
    if (!at) t.addScaledVector(tg.vel, T * 0.5);
    const v = new THREE.Vector3((t.x - o.x) / T, (t.y + 0.2 - o.y + 0.5 * MORTAR_G * T * T) / T, (t.z - o.z) / T);
    this.ctx.director.spawnProjectile(o, v, dmg * this.dmgMult, this.cfg.glow, true, { gravity: MORTAR_G, splash, size: 2.2, src: this });
  }

  // --- Jefe de tierra: abanico de plasma, salto con onda expansiva, embestida, refuerzos ---
  warlordAI(dt, tg) {
    const c = this.cfg, director = this.ctx.director;
    const { dist, fx, fz } = this.toTarget(tg);
    this.enraged = this.hp < this.maxHp * 0.5;
    const rage = this.enraged ? 1.35 : 1;
    this.summonCheck(['skitter', 'skitter', 'ravager', 'warden']);
    this.bT -= dt * rage;
    this.telegraph = this.bstate === 'leapPrep' || this.bstate === 'chargePrep';
    switch (this.bstate) {
      case 'walk': {
        const [mx, mz] = tg ? this.steer(dt, tg, this.los && dist < 30, fx, fz) : [0, 0];
        this.move(dt, dist < 7 ? 0 : mx, dist < 7 ? 0 : mz, c.speed * rage * this.spawnT, true);
        if (this.bT <= 0 && tg) {
          const opts = this.los ? ['barrage', 'leapPrep', 'chargePrep'] : ['leapPrep'];
          this.bstate = pick(opts);
          this.bT = this.bstate === 'barrage' ? 1.5 : this.bstate === 'leapPrep' ? 0.55 : 0.75;
          this.volley = 0;
          this.volleyT = 0;
        }
        break;
      }
      case 'barrage':
        this.move(dt, 0, 0, 0, true);
        this.volleyT -= dt;
        if (this.volleyT <= 0 && this.volley < 3 && tg) {
          for (let i = -3; i <= 3; i++) this.fire(tg, { yaw: i * 0.12, spread: 0.01 });
          this.volley++;
          this.volleyT = 0.45 / rage;
          this.attackT = 0.3;
        }
        if (this.bT <= 0) this.endAttack();
        break;
      case 'leapPrep':
        this.move(dt, 0, 0, 0, true);
        if (this.bT <= 0 && tg) {
          const T = 1.0;
          const land = tg.pos.clone().addScaledVector(tg.vel, 0.4);
          this.vel.set((land.x - this.pos.x) / T, 0, (land.z - this.pos.z) / T);
          this.vy = (land.y - this.pos.y + 0.5 * GRAV * T * T) / T;
          this.onGround = false;
          this.bstate = 'air';
          this.onLand = () => {
            this.onLand = null;
            director.shockwave(this.pos.clone(), c.slamRadius, c.slamDmg * this.dmgMult, c.glow);
            this.bstate = 'recover';
            this.bT = 0.9;
          };
        }
        break;
      case 'air':
        this.move(dt, 0, 0, 0, true);
        break;
      case 'chargePrep':
        this.move(dt, 0, 0, 0, true);
        if (this.bT <= 0 && tg) {
          this.chargeDir = new THREE.Vector3(fx, 0, fz);
          this.group.rotation.y = Math.atan2(fx, fz);
          this.bstate = 'charge';
          this.bT = 1.2;
          this.vel.set(fx * 17, 0, fz * 17); // arranca ya a toda velocidad
          this.hitSet = new Set();
        }
        break;
      case 'charge': {
        const before = this.pos.clone();
        this.move(dt, this.chargeDir.x, this.chargeDir.z, 17, true);
        this.attackT = 0.2;
        for (const t of director.targets) {
          if (this.hitSet.has(t) || Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z) > 2.8) continue;
          this.hitSet.add(t);
          director.hurtTarget(t, c.chargeDmg * this.dmgMult, this.pos, this.chargeDir.x * 14, this.chargeDir.z * 14, this);
        }
        // Termina por tiempo o al chocar contra un muro.
        if (this.bT <= 0 || (this.bT < 1.0 && before.distanceTo(this.pos) < 17 * dt * 0.25)) { this.bstate = 'recover'; this.bT = 1.0; }
        break;
      }
      default: // recover
        this.move(dt, 0, 0, 0, true);
        if (this.bT <= 0) this.endAttack();
    }
  }

  endAttack() {
    this.bstate = 'walk';
    this.bT = rand(1.4, 2.6);
    this.telegraph = false;
  }

  summonCheck(types) {
    const th = [0.5, 0.25];
    if (this.summoned < th.length && this.hp < this.maxHp * th[this.summoned]) {
      this.summoned++;
      this.ctx.director.summon(types, this.pos);
    }
  }

  // --- Jefe volador: lluvia de orbes, bombardeo de morteros, drones y picados ---
  overseerAI(dt, tg) {
    const c = this.cfg, director = this.ctx.director;
    this.enraged = this.hp < this.maxHp * 0.5;
    const rage = this.enraged ? 1.35 : 1;
    this.summonCheck(['drone', 'drone', 'drone', 'drone']);
    this.bT -= dt * rage;
    this.telegraph = this.bstate === 'divePrep';
    const hover = () => {
      this.orbitA += dt * 0.35;
      const goal = _c.set(Math.cos(this.orbitA) * 18, this.altitude, Math.sin(this.orbitA) * 18);
      if (tg) goal.set(tg.pos.x + Math.cos(this.orbitA) * 16, tg.pos.y + this.altitude, tg.pos.z + Math.sin(this.orbitA) * 16);
      this.flyTo(dt, goal, c.speed * rage, 1.5);
    };
    switch (this.bstate) {
      case 'walk':
        hover();
        if (this.bT <= 0 && tg) {
          this.bstate = pick(this.los ? ['orbs', 'mortar', 'divePrep'] : ['mortar', 'divePrep']);
          this.bT = this.bstate === 'divePrep' ? 0.8 : 2;
          this.volley = 0;
          this.volleyT = 0;
        }
        break;
      case 'orbs':
        hover();
        this.volleyT -= dt;
        if (this.volleyT <= 0 && this.volley < 3 && tg) {
          for (let i = -4; i <= 4; i++) this.fire(tg, { yaw: i * 0.16, spread: 0.02, splash: 2.2, size: 2.4 });
          this.volley++;
          this.volleyT = 0.55 / rage;
          this.attackT = 0.3;
        }
        if (this.bT <= 0) this.endAttack();
        break;
      case 'mortar':
        hover();
        this.volleyT -= dt;
        if (this.volleyT <= 0 && this.volley < 7 && tg) {
          const at = tg.pos.clone().add(_d.set(rand(-6, 6), 0, rand(-6, 6)));
          if (this.volley === 0) at.copy(tg.pos);
          this.mortar(tg, c.mortarDmg, c.splash, at);
          this.volley++;
          this.volleyT = 0.22;
          this.attackT = 0.3;
        }
        if (this.bT <= 0) this.endAttack();
        break;
      case 'divePrep':
        this.flyTo(dt, _c.copy(this.pos), 0.1);
        if (this.bT <= 0 && tg) {
          this.diveTo = tg.pos.clone().setY(tg.pos.y + 1.6);
          this.bstate = 'dive';
          this.bT = 1.4;
        }
        break;
      case 'dive':
        this.flyTo(dt, this.diveTo, 22, 6);
        this.attackT = 0.2;
        if (this.pos.distanceTo(this.diveTo) < 1.5 || this.bT <= 0) {
          director.shockwave(this.pos.clone().setY(this.diveTo.y - 1.6), 6, c.diveDmg * this.dmgMult, c.glow);
          this.bstate = 'recover';
          this.bT = 1.2;
        }
        break;
      default:
        this.flyTo(dt, _c.set(this.pos.x, (tg?.pos.y ?? 0) + this.altitude, this.pos.z), c.speed);
        if (this.bT <= 0) this.endAttack();
    }
  }

  // by: id del jugador que causa el daño (null = jugador local en un jugador).
  takeDamage(dmg, { shieldMult = 1, headMult = 1, part = 'body', by = null, headKill = false } = {}) {
    if (this.dead) return { killed: false };
    this.hitT = 1;
    this.revealT = Math.max(this.revealT, 1.5);
    if (this.shield > 0) this.flash = 1;
    if (this.replica) {
      // El anfitrión decide; aquí solo hay respuesta visual inmediata.
      const net = this.ctx.net;
      net.to(net.hostId, 'edmg', { id: this.id, dmg, sm: shieldMult, hm: headMult, part, hk: headKill ? 1 : 0 });
      this.ctx.onEnemyDamage?.(this, dmg * (part === 'head' && this.shield <= 0 ? headMult : 1), part === 'head', this.shield > 0, false, by);
      return { killed: false, shieldHit: this.shield > 0 };
    }
    this.sinceHit = 0;
    this.los = true;
    const before = this.hp + this.shield;
    let remaining = dmg, shieldHit = false;
    // Arma de precisión (francotirador): a la cabeza elimina a cualquiera que no sea jefe, atraviesa el escudo.
    if (headKill && part === 'head' && !this.cfg.boss) { remaining = this.hp + 1; if (this.shield > 0) { this.shield = 0; this.ctx.sfx.shieldPop(); } }
    else if (this.shield > 0) {
      shieldHit = true;
      const sd = remaining * shieldMult;
      if (sd < this.shield) { this.shield -= sd; remaining = 0; }
      else { remaining = (sd - this.shield) / shieldMult; this.shield = 0; this.ctx.sfx.shieldPop(); }
    }
    // Regla «cabeza = baja»: un tiro a la cabeza sin escudo elimina (salvo jefes).
    if (part === 'head' && !shieldHit && !this.cfg.boss && this.ctx.rules.headKill) remaining = Math.max(remaining, this.hp);
    else if (part === 'head' && !shieldHit) remaining *= headMult;
    if (remaining > 0) this.hp -= remaining;
    this.ctx.onEnemyDamage?.(this, before - Math.max(0, this.hp) - this.shield, part === 'head', shieldHit, this.hp <= 0, by);
    if (this.hp <= 0) {
      this.dead = true;
      this.deathT = 0;
      this.ctx.director.onKill(this, by, part === 'head');
      return { killed: true, head: part === 'head', shieldHit };
    }
    return { killed: false, shieldHit };
  }

  dispose() {
    this.rig.dispose();
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

  // mode: 'sp' | 'coop' | 'dm' (sin enemigos) | 'menu' (escena vacía). authority: este equipo simula la IA.
  configure(mode, authority) {
    this.mode = mode;
    this.authority = authority;
    this.reset();
    this.lives = this.rules.lives;
    // Suministros del cielo: los decide quien simula la IA (un jugador o el anfitrión).
    this.dropsOn = (mode === 'sp' || mode === 'coop') && !!this.rules.box;
    this.dropT = CFG.drop.first;
    this.dropId = 0;
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
    this.dropsOn = false;
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

  get rules() {
    return this.ctx.rules;
  }

  // Vidas compartidas (Tiroteo): solo la autoridad las gasta.
  takeLife() {
    if (!this.rules.lives || this.lives <= 0) return false;
    this.lives--;
    return true;
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
    const comp = waveComposition(game.wave, this.playerCount(), this.rules.waveSet);
    // Oleada de élite (3, 7, 11…, sin jefe): enemigos más duros, doble puntuación y lluvia de suministros al acabar.
    this.elite = this.rules.waveSet === 'classic' && game.wave % 4 === 3 && !Object.keys(comp).some((t) => CFG.enemies[t].boss);
    for (const [type, n] of Object.entries(comp)) for (let i = 0; i < n; i++) this.queue.push(type);
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    }
    // El jefe sale el primero.
    const bi = this.queue.findIndex((t) => CFG.enemies[t].boss);
    if (bi > 0) this.queue.unshift(...this.queue.splice(bi, 1));
    this.state = 'combat';
    this.spawnTimer = 0.5;
    this.onWave({ k: 'start', n: game.wave, comp, elite: this.elite });
    if (this.online) this.net.bcast('wave', { k: 'start', n: game.wave, comp, elite: this.elite });
  }

  clearWave() {
    const { game } = this.ctx;
    this.state = 'intermission';
    this.timer = CFG.waves.intermission;
    game.score += game.wave * 100;
    // Créditos por oleada para todo el equipo (los caídos también).
    const ids = this.online ? [...this.net.players.keys()] : [this.myId()];
    if (this.rules.lives) this.lives++;
    this.onWave({ k: 'clear', n: game.wave, elite: this.elite });
    if (this.online) this.net.bcast('wave', { k: 'clear', n: game.wave, elite: this.elite });
    if (this.elite && this.rules.box) { this.spawnDrop(); this.spawnDrop(); }
    this.elite = false;
  }

  // Efectos de inicio/fin de oleada en este equipo (anfitrión o cliente).
  onWave(m) {
    const { hud, sfx, arsenal, game } = this.ctx;
    if (m.k === 'start') {
      game.wave = m.n;
      const parts = Object.entries(m.comp).filter(([t, n]) => n > 0 && !CFG.enemies[t].boss).map(([t, n]) => `${n} ${CFG.enemies[t].label.toUpperCase()}`);
      const boss = Object.keys(m.comp).find((t) => CFG.enemies[t].boss);
      if (boss) { hud.banner(`OLEADA ${m.n} · ¡JEFE!`, `${CFG.enemies[boss].label} · ${parts.join(' · ')}`, 3.5); sfx.boss(); }
      else if (m.elite) { hud.banner(`OLEADA ${m.n} · ÉLITE`, `ENEMIGOS REFORZADOS · PUNTOS ×2 · ${parts.join(' · ')}`, 3.2); this.ctx.medals?.say('Oleada de élite'); }
      else hud.banner(`OLEADA ${m.n}`, parts.join(' · '));
      sfx.wave();
      game.onWaveStart?.();
    } else {
      arsenal.addAmmo(1.5);
      arsenal.addGrenade(1);
      hud.banner(m.elite ? 'ÉLITE SUPERADA' : 'OLEADA SUPERADA', `+${m.n * 100} PTS · MUNICIÓN Y GRANADA${this.rules.lives ? ' · +1 VIDA' : ''}${m.elite && this.rules.box ? ' · ¡LLUEVEN SUMINISTROS!' : ''}`, 2.6);
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
    const e = this.addEnemy(type, pos, this.nextId++, false, this.scaling(type));
    fx.burst(e.center(), e.cfg.glow, e.cfg.boss ? 80 : 18, e.cfg.boss ? 10 : 4, 0.8, 0.12, 2);
    sfx.spawn(pos.distanceTo(player.pos));
  }

  playerCount() {
    return this.online ? Math.max(1, this.net.players.size) : 1;
  }

  // Multiplicadores de vida y daño según oleada, jugadores, dificultad y (para jefes) cuántos llevamos.
  scaling(type) {
    const wave = Math.max(1, this.ctx.game.wave);
    const d = difficulty(wave, this.playerCount());
    const k = DIFFICULTY[this.rules.difficulty] ?? DIFFICULTY.normal;
    let bossK = 1;
    if (CFG.enemies[type].boss) bossK = this.rules.waveSet === 'bosses' ? 1 + 0.15 * (wave - 1) : 1 + 0.3 * Math.max(0, Math.floor(wave / 5) - 1);
    return { hp: d.hp * bossK * k.hp * (this.elite ? 1.35 : 1), dmg: d.dmg * k.dmg * (this.elite ? 1.15 : 1) };
  }

  // Refuerzos invocados por un jefe alrededor de su posición.
  summon(types, around) {
    const { fx, hud, sfx, player } = this.ctx;
    for (const type of types) {
      const a = Math.random() * Math.PI * 2, r = rand(3, 6);
      const pos = around.clone().add(_a.set(Math.cos(a) * r, 0, Math.sin(a) * r));
      this.ctx.world.clampToArena(pos, 1);
      pos.y = CFG.enemies[type].fly ? around.y : this.ctx.world.groundHeightAt(pos.x, pos.z, 0.3, around.y + 1);
      const e = this.addEnemy(type, pos, this.nextId++, false, this.scaling(type));
      fx.burst(e.center(), e.cfg.glow, 22, 5, 0.6, 0.12, 2);
    }
    hud.toast('¡REFUERZOS!');
    sfx.spawn(around.distanceTo(player.pos));
    if (this.online) this.net.bcast('efx', { k: 'toast', text: '¡REFUERZOS!' });
  }

  // Onda expansiva (golpe de jefe): daña a los jugadores en el suelo dentro del radio.
  shockwave(pos, radius, dmg, color, broadcast = true) {
    const { fx, sfx, player, remotes, net } = this.ctx;
    fx.shockwave(pos, radius, color);
    sfx.explosion(pos.distanceTo(player.pos));
    if (!broadcast) return;
    if (this.online) net.bcast('efx', { k: 'ring', p: v3(pos), r: radius, c: color });
    const hits = [player, ...(this.online ? remotes.alive() : [])];
    for (const t of hits) {
      if (!t.alive) continue;
      const dx = t.pos.x - pos.x, dz = t.pos.z - pos.z, d = Math.hypot(dx, dz);
      if (d > radius || t.pos.y - pos.y > 2.2) continue;
      const k = 1 - (d / radius) * 0.5;
      this.hurtTarget(t, dmg * k, pos, (dx / (d || 1)) * 12 * k, (dz / (d || 1)) * 12 * k);
    }
  }

  addEnemy(type, pos, id, replica, scale = {}) {
    const e = new Enemy(this.ctx, type, pos, id, replica, scale);
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
    const pts = e.cfg.score * (this.elite ? 2 : 1);
    s.score += pts;
    s.credits += pts;
    game.score += pts;
    if (killer === me) {
      game.kills++;
      // Progreso (misiones/XP): arma en la mano, o granada / cuerpo a cuerpo si el daño vino de ahí.
      this.ctx.progress?.kill({ weapon: arsenal.w?.id, head: !!head, boss: !!e.cfg.boss, src: this.ctx.killSrc ?? null });
      this.ctx.medals?.onKill({ head: !!head, boss: !!e.cfg.boss, src: this.ctx.killSrc ?? null, dist: e.pos.distanceTo(this.ctx.player.pos) });
    }
    if (this.online) {
      const msg = { id: e.id, by: killer, head: !!head, label: e.cfg.label };
      net.bcast('ekill', msg);
      net.emit('ekill', { ...msg, t: 'ekill', from: net.id }); // también en el registro del anfitrión
    }
    if (e.cfg.boss) {
      for (const [i, kind] of ['ammo', 'ammo', 'ammo', 'grenade', 'grenade'].entries()) {
        const a = (i / 5) * Math.PI * 2;
        this.addPickup(this.nextId++, kind, e.pos.x + Math.cos(a) * 1.5, e.pos.y + 0.4, e.pos.z + Math.sin(a) * 1.5);
      }
    } else if (Math.random() < e.cfg.drop) {
      const kind = Math.random() < 0.25 && arsenal.grenades < CFG.grenade.max ? 'grenade' : 'ammo';
      this.addPickup(this.nextId++, kind, e.pos.x, e.flying ? 0.4 : e.pos.y + 0.4, e.pos.z);
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
  // src: el enemigo que golpea (para la pantalla de muerte).
  hurtTarget(tg, dmg, from, pushX, pushZ, src = null) {
    const { player, sfx, net } = this.ctx;
    sfx.enemyMelee(tg.pos.distanceTo(player.pos));
    if (tg === player) {
      player.lastSource = src;
      player.damage(dmg, from);
      player.vel.x += pushX;
      player.vel.z += pushZ;
    } else {
      net.to(tg.id, 'hurt', { dmg, from: v3(from), push: [pushX, pushZ] });
    }
  }

  // opts: gravity (mortero), splash (radio de explosión), size (escala visual).
  spawnProjectile(origin, vel, dmg, color, broadcast = false, opts = {}) {
    if (!this.projMats.has(color)) this.projMats.set(color, new THREE.MeshBasicMaterial({ color }));
    const mesh = new THREE.Mesh(this.projGeo, this.projMats.get(color));
    mesh.position.copy(origin);
    mesh.lookAt(_a.copy(origin).add(vel));
    if (opts.size) mesh.scale.setScalar(opts.size);
    this.ctx.scene.add(mesh);
    const gravity = opts.gravity ?? 0, splash = opts.splash ?? 0;
    this.projectiles.push({ mesh, vel: vel.clone(), dmg, color, life: gravity ? 6 : 3.5, gravity, splash, src: opts.src ?? null });
    const dist = origin.distanceTo(this.ctx.player.pos);
    if (gravity) this.ctx.sfx.mortar(dist); else this.ctx.sfx.enemyShot(dist);
    if (broadcast && this.online) this.net.bcast('proj', { p: v3(origin), v: v3(vel), d: dmg, c: color, g: gravity, s: splash, z: opts.size ?? 0 });
  }

  // Explosión de proyectil enemigo: cada equipo calcula solo el daño a su jugador.
  projExplode(pos, p) {
    const { fx, sfx, player } = this.ctx;
    fx.explosion(pos, p.splash, { color: p.color });
    sfx.explosion(pos.distanceTo(player.pos));
    if (!player.alive) return;
    const d = _b.set(player.pos.x, player.pos.y + 0.9, player.pos.z).distanceTo(pos);
    if (d < p.splash) { player.lastSource = p.src ?? null; player.damage(p.dmg * (1 - (d / p.splash) * 0.7), pos.clone()); }
  }

  damageRadius(center, radius, damage, by = null) {
    const { world, hud, sfx } = this.ctx;
    const mine = by === null || by === this.myId();
    let kills = 0, hits = 0;
    if (mine) this.ctx.killSrc = 'grenade';
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
    this.ctx.killSrc = null;
    if (mine && hits) { hud.hitMarker(kills > 0); sfx.hit(); }
    if (mine && kills) sfx.kill();
  }

  // --- Red (coop) ---
  snapshot() {
    const { game } = this.ctx;
    return {
      w: game.wave, st: this.state, tm: +this.timer.toFixed(2), q: this.queue.length, sc: game.score, lv: this.lives,
      e: this.enemies.map((e) => [e.id, TYPES.indexOf(e.type), ...v3(e.pos), +e.group.rotation.y.toFixed(3), Math.round(e.hp), Math.round(e.shield), e.dead ? 1 : 0, Math.round(e.maxHp), Math.round(e.maxShield), e.flags]),
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
    this.queueN = Array.isArray(s.q) ? s.q.length : s.q; // versiones anteriores mandaban la cola entera
    this.lives = s.lv ?? 0;
    this.scores = new Map(s.s.map(([id, kills, score, credits]) => [id, { kills, score, credits }]));
    game.kills = this.scores.get(this.net.id)?.kills ?? 0;

    const seen = new Set();
    for (const [id, ti, x, y, z, rot, hp, sh, dead, maxHp, maxSh, flags] of s.e) {
      let e = this.byId.get(id);
      if (!e) {
        if (dead) continue;
        e = this.addEnemy(TYPES[ti], _a.set(x, y, z), id, true);
        this.ctx.fx.burst(e.center(), e.cfg.glow, 18, 4, 0.5, 0.1, 2);
      }
      seen.add(id);
      e.netPos.set(x, y, z);
      e.netRot = rot;
      if (sh < e.shield) e.flash = 1;
      e.hp = hp;
      e.shield = sh;
      e.maxHp = maxHp;
      e.maxShield = maxSh;
      e.flags = flags;
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
    e.takeDamage(m.dmg, { shieldMult: m.sm, headMult: m.hm, part: m.part, by: m.from, headKill: !!m.hk });
  }

  onClaim(m) {
    const p = this.pickups.find((q) => q.id === m.id);
    if (!this.authority || !p) return;
    this.removePickup(p);
    this.net.to(m.from, 'grant', { kind: p.kind });
  }

  // --- Suministros del cielo ---
  boxPool() {
    const wave = Math.max(1, this.ctx.game.wave);
    return CFG.drop.pool.filter((p) => p.wave <= wave).flatMap((p) => p.ids);
  }

  // Anfitrión: sitio despejado al azar dentro de la arena (sin estructuras encima, lejos del borde).
  dropSpot() {
    const { world } = this.ctx, H = world.half - 8, box = new THREE.Box3();
    for (let i = 0; i < 40; i++) {
      const x = (Math.random() * 2 - 1) * H, z = (Math.random() * 2 - 1) * H;
      const y = world.groundHeightAt(x, z, 1, 60);
      box.min.set(x - 1.2, y + 0.05, z - 1.4);
      box.max.set(x + 1.2, y + 8, z + 1.4);
      if (world.colliders.some((c) => c.intersectsBox(box))) continue;
      if (world.liftAt?.({ x, y: 0, z })) continue;
      return [x, y, z];
    }
    return [0, world.groundHeightAt(0, 0, 1, 60), 0];
  }

  spawnDrop() {
    const id = this.dropId++, p = this.dropSpot();
    this.onDrop({ id, p, f: CFG.drop.fall });
    if (this.online) this.net.bcast('drop', { id, p, f: CFG.drop.fall });
  }

  onDrop(m) {
    if (this.boxes.some((b) => b.id === m.id)) return;
    this.boxes.push(new SupplyDrop(this.ctx, m.id, m.p, m.f));
    this.dropId = Math.max(this.dropId, m.id + 1);
    this.ctx.hud.toast('SUMINISTROS EN CAMINO · BUSCA EL HUMO NARANJA');
    this.ctx.sfx.boxReveal();
  }

  nearBox() {
    const p = this.ctx.player;
    if (!p.alive) return null;
    return this.boxes.find((b) => b.state !== 'falling' && b.state !== 'gone' && Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z) < CFG.drop.range && Math.abs(b.pos.y - p.pos.y) < 1.5) ?? null;
  }

  // Texto de ayuda cuando estás junto a una caja.
  boxPrompt() {
    const b = this.nearBox();
    if (!b) return '';
    if (b.takeable(this.myId())) return `E · COGER ${CFG.weapons[b.weapon].name}`;
    if (b.openable) return 'E · ABRIR SUMINISTROS';
    return b.state === 'closing' ? '' : 'SUMINISTROS ABIERTOS';
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
    if (!b.openable) return true;
    if (this.authority) this.useBox(b.id, me);
    else this.net.to(this.net.hostId, 'boxUse', { id: b.id });
    return true;
  }

  // Anfitrión: se abre gratis para el primero que lo pide; decide el arma.
  useBox(boxId, playerId) {
    const b = this.boxes.find((x) => x.id === boxId);
    if (!b || !b.openable) {
      if (playerId === this.myId()) { this.ctx.hud.toast('YA ESTÁ ABIERTA'); this.ctx.sfx.deny(); }
      else this.net.to(playerId, 'boxDeny', { reason: 'YA ESTÁ ABIERTA' });
      return;
    }
    const pool = this.boxPool();
    const w = pool[(Math.random() * pool.length) | 0];
    b.start(w, playerId, pool);
    if (this.online) this.net.bcast('box', { id: boxId, by: playerId, w, pool });
  }

  onBox(m) {
    this.boxes.find((x) => x.id === m.id)?.start(m.w, m.by, m.pool);
  }

  updateDrops(dt) {
    if (this.dropsOn && this.authority && this.ctx.game.state !== 'over') {
      this.dropT -= dt;
      const active = this.boxes.filter((b) => b.state !== 'closing' && b.state !== 'gone').length;
      if (this.dropT <= 0) {
        this.dropT = CFG.drop.every;
        if (active < CFG.drop.max) this.spawnDrop();
      }
    }
    for (let i = this.boxes.length - 1; i >= 0; i--) {
      const b = this.boxes[i];
      b.update(dt);
      if (b.state === 'gone') { b.dispose(); this.boxes.splice(i, 1); }
    }
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
    this.updateDrops(dt);
    const { game, player, world, fx, arsenal } = this.ctx;
    this.collectTargets();

    if (this.authority) {
      if (this.targets.length) this.ctx.nav.update(this.targets, dt);
      if (this.state === 'intermission') {
        this.timer -= dt;
        if (this.timer <= 0 && this.targets.length) this.startWave();
      } else {
        this.spawnTimer -= dt;
        const aliveCount = this.enemies.reduce((n, e) => n + (e.dead ? 0 : 1), 0);
        const diff = difficulty(Math.max(1, game.wave), this.playerCount());
        if (this.queue.length && this.spawnTimer <= 0 && aliveCount < diff.maxAlive) {
          this.spawnOne(this.queue.shift());
          this.spawnTimer = diff.gap;
        }
        if (!this.queue.length && aliveCount === 0 && this.targets.length) this.clearWave();
      }
      // Coop: todos caídos (y sin vidas que gastar) → fin de partida.
      if (this.online) {
        const lives = this.rules.lives > 0;
        this.allDeadT = this.targets.length ? 0 : this.allDeadT + dt;
        if (this.allDeadT > (lives ? this.rules.respawn + 3 : 2.5) && (!lives || this.lives <= 0)) { this.allDeadT = -1e9; game.onCoopOver?.(); }
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
      if (p.gravity) {
        p.vel.y -= p.gravity * dt;
        p.mesh.lookAt(_a.copy(pos).add(p.vel));
      }
      this.ctx.fx.trail?.(pos, p.color, 0.2 * (p.mesh.scale.x || 1));
      for (let s = 0; s < 3 && !hit; s++) {
        pos.addScaledVector(p.vel, dt / 3);
        if (player.alive) {
          const cy = Math.min(Math.max(pos.y, player.pos.y + 0.2), player.pos.y + player.height - 0.1);
          if (Math.hypot(pos.x - player.pos.x, pos.y - cy, pos.z - player.pos.z) < P.radius + 0.12 * (p.mesh.scale.x || 1)) {
            if (p.splash) this.projExplode(pos, p);
            else { player.lastSource = p.src ?? null; player.damage(p.dmg, _b.copy(pos).addScaledVector(p.vel, -0.1)); }
            hit = true;
            break;
          }
        }
        if (world.pointInSolid(pos)) {
          if (p.splash) this.projExplode(pos, p); else fx.sparks(pos, p.color);
          hit = true;
        }
      }
      if (!hit && p.life <= 0 && p.splash) this.projExplode(pos, p);
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
