import * as THREE from 'three';
import { CFG, clamp } from './config.js';

const P = CFG.player;
const SL = P.slide;
const SPAWN = new THREE.Vector3(0, 0, 30);

export class Player {
  constructor(ctx) {
    this.ctx = ctx;
    this.yaw = new THREE.Object3D();
    this.pitch = new THREE.Object3D();
    this.yaw.add(this.pitch);
    this.pitch.add(ctx.camera);
    ctx.scene.add(this.yaw);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this._eye = new THREE.Vector3();
    this.keys = new Set();

    addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (!e.repeat) {
        if (e.code === 'Space') this.jumpBuf = P.jumpBuffer;
        if (e.code === 'ControlLeft' || e.code === 'KeyC') this.crouchBuf = SL.buffer;
      }
      if (ctx.game.state === 'playing' && (e.code === 'Space' || e.code === 'ControlLeft' || e.code.startsWith('Arrow'))) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    // Chrome a veces manda un primer movimiento enorme justo al capturar el puntero: se descarta.
    let lockedAt = 0;
    document.addEventListener('pointerlockchange', () => { lockedAt = performance.now(); });
    document.addEventListener('mousemove', (e) => {
      if (!document.pointerLockElement || ctx.game.state !== 'playing' || !this.alive) return;
      if (performance.now() - lockedAt < 150 || Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.look(e.movementX, e.movementY);
    });
    this.reset();
  }

  reset(spawn = SPAWN, yaw = 0) {
    this.pos.copy(spawn);
    this.vel.set(0, 0, 0);
    this.maxShield = this.ctx.rules?.shields === false ? 0 : P.maxShield;
    this.health = P.maxHealth;
    this.shield = this.maxShield;
    this.sinceHit = 99;
    this.onGround = true;
    this.alive = true;
    this.liftT = 0;
    this.height = P.height;
    this.sprinting = this.crouching = this.recharging = this.sliding = false;
    this.slideT = this.slideCD = this.slideK = this.jumpBuf = this.dip = 0;
    this.coyote = P.coyote;
    this.crouchBuf = 0;
    this.shake = 0;
    this.alarmT = 0;
    this.deathT = 0;
    this.lastHit = null;
    this.yaw.rotation.set(0, yaw, 0);
    this.pitch.rotation.set(0, 0, 0);
    this.syncCamera(0);
  }

  look(dx, dy) {
    const k = P.sensitivity / (this.ctx.arsenal?.zoom ?? 1); // más fino con mira
    this.lookDX = (this.lookDX ?? 0) + dx; // para la inercia del arma en mano
    this.lookDY = (this.lookDY ?? 0) + dy;
    this.yaw.rotation.y -= dx * k;
    this.pitch.rotation.x = clamp(this.pitch.rotation.x - dy * k, -1.5, 1.5);
  }

  addRecoil(up, side) {
    this.pitch.rotation.x = clamp(this.pitch.rotation.x + up, -1.5, 1.5);
    this.yaw.rotation.y += side;
  }

  eye() {
    return this._eye.set(this.pos.x, this.pos.y + this.height, this.pos.z);
  }

  forward(out = new THREE.Vector3()) {
    const y = this.yaw.rotation.y;
    return out.set(-Math.sin(y), 0, -Math.cos(y));
  }

  // Ángulo (rad) del origen del daño relativo a la vista: 0 = delante, +PI/2 = derecha.
  localAngle(from) {
    const rx = from.x - this.pos.x, rz = from.z - this.pos.z;
    const s = Math.sin(this.yaw.rotation.y), c = Math.cos(this.yaw.rotation.y);
    return Math.atan2(rx * c - rz * s, -rx * s - rz * c);
  }

  update(dt) {
    if (!this.alive) return this.deathAnim(dt);
    const { world, sfx } = this.ctx;
    const k = this.keys;
    const f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const s = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const crouchHeld = k.has('ControlLeft') || k.has('KeyC');
    // Margen para pulsar agachar justo antes de alcanzar velocidad o de tocar suelo.
    const tap = this.crouchBuf > 0;
    this.crouchBuf = Math.max(0, this.crouchBuf - dt);
    this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    this.slideCD = Math.max(0, this.slideCD - dt);
    if (this.liftT > 0) this.liftT -= dt; // vuelo de ascensor gravitatorio: sin control en el aire
    this.coyote = this.onGround ? P.coyote : Math.max(0, this.coyote - dt);

    const yaw = this.yaw.rotation.y, sn = Math.sin(yaw), cs = Math.cos(yaw);
    let wx = -sn * f + cs * s, wz = -cs * f - sn * s;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx /= wl; wz /= wl; }
    const hs = Math.hypot(this.vel.x, this.vel.z);

    // Inicio del deslizamiento: agacharse con inercia de carrera (o caer agachado con velocidad).
    if (!this.sliding && crouchHeld && this.onGround && this.slideCD <= 0 && hs >= SL.minSpeed &&
        (tap || this.justLanded) && (this.vel.x * wx + this.vel.z * wz > 0 || wl === 0)) {
      this.sliding = true;
      this.crouchBuf = 0;
      this.slideT = 0;
      const boost = tap ? Math.max(hs, SL.boost) / hs : 1; // al aterrizar solo se conserva la inercia
      this.vel.x *= boost; this.vel.z *= boost;
      this.shake = Math.min(1, this.shake + 0.12);
      sfx.slide?.();
    }
    this.justLanded = false;
    const shift = k.has('ShiftLeft') || k.has('ShiftRight');
    // Agachar recién pulsado con Shift+avance: se sigue acelerando unos instantes para entrar en deslizamiento.
    const pending = !this.sliding && tap && crouchHeld && shift && f > 0 && this.onGround && this.slideCD <= 0;
    this.crouching = (crouchHeld && !pending) || this.sliding;
    this.sprinting = !this.crouching && shift && f > 0;

    const wantJump = (this.jumpBuf > 0 || k.has('Space')) && this.coyote > 0 && this.vel.y <= 0.5;
    if (this.sliding) {
      this.slideT += dt;
      // Fricción constante + giro limitado hacia donde se apunta con el teclado.
      const sp = Math.hypot(this.vel.x, this.vel.z);
      const ns = Math.max(0, sp - SL.friction * dt);
      let dx = this.vel.x / (sp || 1), dz = this.vel.z / (sp || 1);
      if (wl > 0) {
        const st = Math.min(1, SL.steer * dt);
        dx += (wx - dx) * st; dz += (wz - dz) * st;
        const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
      }
      this.vel.x = dx * ns; this.vel.z = dz * ns;
      this.airT = this.onGround ? 0 : (this.airT ?? 0) + dt; // tolera rampas y escalones bajando
      if (!crouchHeld || ns < P.crouch + 0.6 || this.slideT > SL.maxTime || this.airT > 0.18) this.endSlide();
      if (wantJump) {
        // Salto desde el deslizamiento: conserva casi toda la inercia.
        this.vel.x *= SL.jumpKeep; this.vel.z *= SL.jumpKeep;
        this.endSlide();
      }
    } else {
      const aiming = (this.ctx.arsenal?.aimK ?? 0) > 0.5; // apuntando: más lento
      const speed = (this.crouching ? P.crouch : this.sprinting ? P.sprint : P.walk) * (aiming ? 0.72 : 1);
      // En el aire se conserva la inercia si ya se va más rápido que la velocidad objetivo.
      const ctl = this.onGround ? P.groundAccel : P.airControl;
      const a = 1 - Math.exp(-ctl * dt);
      const tx = wx * speed, tz = wz * speed;
      if ((this.onGround || wl > 0) && !(this.liftT > 0)) {
        this.vel.x += (tx - this.vel.x) * a;
        this.vel.z += (tz - this.vel.z) * a;
        if (!this.onGround && hs > speed) {
          const nh = Math.hypot(this.vel.x, this.vel.z);
          if (nh > 0 && nh < hs) { this.vel.x *= hs / nh; this.vel.z *= hs / nh; }
        }
      }
    }
    if (wantJump) {
      this.vel.y = P.jump;
      this.onGround = false;
      this.coyote = this.jumpBuf = 0;
    }
    const lift = this.onGround && world.liftAt?.(this.pos);
    if (lift) {
      if (this.sliding) this.endSlide();
      this.vel.fromArray(lift.vel);
      this.liftT = lift.t;
      this.onGround = false;
      this.coyote = 0;
      sfx.lift();
    }
    this.vel.y -= P.gravity * dt;

    const prevY = this.pos.y, px = this.pos.x, pz = this.pos.z;
    this.pos.addScaledVector(this.vel, dt);
    const ex = this.pos.x - px, ez = this.pos.z - pz;
    const targetH = this.sliding ? SL.height : this.crouching ? P.crouchHeight : P.height;
    this.height += (targetH - this.height) * Math.min(1, dt * (this.sliding ? 16 : 12));
    world.resolveHorizontal(this.pos, P.radius, this.pos.y, this.pos.y + this.height);
    world.clampToArena(this.pos, P.radius);
    // Choque contra pared durante el deslizamiento: se corta y se pierde la velocidad bloqueada.
    if (this.sliding) {
      const want = Math.hypot(ex, ez), got = Math.hypot(this.pos.x - px, this.pos.z - pz);
      if (want > 1e-4 && got < want * 0.4) { this.vel.x = (this.pos.x - px) / dt; this.vel.z = (this.pos.z - pz) / dt; this.endSlide(); }
    }
    const gh = world.groundHeightAt(this.pos.x, this.pos.z, P.radius * 0.7, Math.max(prevY, this.pos.y));
    // Subiendo en un ascensor no se "pisa" el borde de los parapetos.
    if (this.pos.y <= gh && !(this.liftT > 0 && this.vel.y > 0)) {
      this.liftT = 0;
      if (!this.onGround) {
        if (this.vel.y < -11) { sfx.land(); this.shake = Math.min(1, this.shake + 0.2); }
        this.dip = Math.min(0.22, Math.max(0, -this.vel.y - 4) * 0.018);
        this.justLanded = true;
      }
      this.pos.y = gh; this.vel.y = 0; this.onGround = true;
    } else if (this.pos.y > gh + 0.05) {
      this.onGround = false;
    }

    // Escudo: recarga tras un tiempo sin recibir daño; la salud se recupera despacio a la par.
    // Sin escudos (regla), solo se recupera la salud.
    this.sinceHit += dt;
    if (this.sinceHit > P.shieldDelay && this.shield < this.maxShield) {
      if (!this.recharging) { this.recharging = true; sfx.shieldRecharge(); }
      this.shield = Math.min(this.maxShield, this.shield + P.shieldRate * dt);
      this.health = Math.min(P.maxHealth, this.health + P.healthRate * dt);
    } else if (!this.maxShield && this.sinceHit > P.shieldDelay) {
      this.health = Math.min(P.maxHealth, this.health + P.healthRate * dt);
    }
    if (this.shield >= this.maxShield) this.recharging = false;
    if (this.maxShield && this.shield <= 0) {
      this.alarmT -= dt;
      if (this.alarmT <= 0) { sfx.alarm(); this.alarmT = 0.45; }
    }
    this.syncCamera(dt);
  }

  endSlide() {
    if (!this.sliding) return;
    this.sliding = false;
    this.slideCD = SL.cooldown;
  }

  syncCamera(dt) {
    const cam = this.ctx.camera;
    this.dip = Math.max(0, this.dip - dt * 0.9);
    this.yaw.position.set(this.pos.x, this.pos.y + this.height - this.dip, this.pos.z);
    // Inclinación lateral de cámara al deslizar.
    this.slideK += ((this.sliding ? 1 : 0) - this.slideK) * Math.min(1, dt * 10);
    cam.rotation.z = this.slideK * 0.07;
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const s = this.shake * this.shake * 0.25;
    cam.position.set((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, 0);
    const zoom = this.ctx.arsenal?.zoom ?? 1;
    const fov = zoom > 1 ? 78 / zoom : this.sliding ? 90 : this.sprinting ? 86 : 78;
    if (Math.abs(cam.fov - fov) > 0.05) {
      cam.fov += (fov - cam.fov) * Math.min(1, dt * 14);
      cam.updateProjectionMatrix();
    }
  }

  damage(amount, from, by = null) {
    this.takeHit(amount, {}, from, by);
  }

  // shieldMult: multiplicador contra escudo; headMult: tiro a la cabeza sin escudo. by: id del atacante (red).
  takeHit(amount, { shieldMult = 1, headMult = 1, part = 'body' } = {}, from = null, by = null) {
    if (!this.alive) return;
    const { sfx, hud } = this.ctx;
    this.sinceHit = 0;
    this.recharging = false;
    this.lastHit = by !== null ? { by, head: false } : null;
    if (this.shield > 0) {
      const sd = amount * shieldMult;
      const absorbed = Math.min(this.shield, sd);
      this.shield -= absorbed;
      amount = (sd - absorbed) / shieldMult;
      if (this.shield <= 0) sfx.shieldBreak(); else sfx.shieldHit();
    } else if (part === 'head') {
      amount = this.ctx.rules?.headKill ? Math.max(amount, this.health) : amount * headMult;
      if (this.lastHit) this.lastHit.head = true;
    }
    if (amount > 0) { this.health -= amount; sfx.hurt(); }
    hud.damage(from ? this.localAngle(from) : null, amount > 0 ? 1 : 0.5);
    this.shake = Math.min(1, this.shake + 0.25);
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      this.deathT = 0;
      this.ctx.game.onPlayerDeath(this.lastHit);
    }
  }

  deathAnim(dt) {
    this.deathT += dt;
    const t = Math.min(1, this.deathT / 0.8);
    this.yaw.position.y = this.pos.y + this.height * (1 - 0.75 * t);
    this.pitch.rotation.z = t * 0.9;
    this.ctx.camera.position.set(0, 0, 0);
    this.ctx.camera.rotation.z = 0;
  }
}
