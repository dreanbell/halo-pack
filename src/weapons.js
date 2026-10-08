import * as THREE from 'three';
import { CFG, rand } from './config.js';
import { glowTexture } from './world.js';
import { v3 } from './net.js';
import { skinMaterials } from './avatar.js';
import { DEFAULT_SKIN } from './skins.js';

const R = CFG.rifle, PI = CFG.pistol, G = CFG.grenade, M = CFG.melee;
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Vector3(), _n = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class Arsenal {
  constructor(ctx) {
    this.ctx = ctx;
    this.ray = new THREE.Raycaster();
    this.grenadeList = [];
    this.grenadeGeo = new THREE.SphereGeometry(0.12, 10, 8);
    this.buildViewmodels();

    const playing = () => ctx.game.state === 'playing' && ctx.player.alive;
    document.addEventListener('mousedown', (e) => {
      if (!playing()) return;
      if (e.button === 0) { this.trigger = true; this.pressed = true; }
      if (e.button === 2) this.throwGrenade();
    });
    document.addEventListener('mouseup', (e) => { if (e.button === 0) this.trigger = false; });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('wheel', (e) => { if (playing() && Math.abs(e.deltaY) > 2) this.swap(); }, { passive: true });
    addEventListener('keydown', (e) => {
      if (!playing() || e.repeat) return;
      if (e.code === 'KeyR') this.startReload();
      else if (e.code === 'KeyQ') this.swap();
      else if (e.code === 'Digit1') this.swap(0);
      else if (e.code === 'Digit2') this.swap(1);
      else if (e.code === 'KeyG') this.throwGrenade();
      else if (e.code === 'KeyF' || e.code === 'KeyV') this.melee();
    });
    this.reset();
  }

  reset() {
    this.mag = R.mag;
    this.reserve = R.reserve;
    this.heat = 0;
    this.overT = 0;
    this.current = 0;
    this.grenades = G.start;
    this.cooldown = this.reloadT = this.swapT = this.meleeT = this.throwT = 0;
    this.spray = this.recoil = this.flashT = this.bobT = 0;
    this.trigger = this.pressed = false;
    this.aimEnemy = false;
    for (const g of this.grenadeList) this.ctx.scene.remove(g.mesh);
    this.grenadeList.length = 0;
    this.showModel();
  }

  // --- Modelos en primera persona ---
  buildViewmodels() {
    const cam = this.ctx.camera;
    this.vm = new THREE.Group();
    this.vm.scale.setScalar(0.8);
    cam.add(this.vm);
    const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, metalness: 0.25, roughness: 0.55, ...o });
    const box = (parent, m, w, h, d, x, y, z) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(x, y, z);
      parent.add(b);
      return b;
    };
    const flashTex = glowTexture('rgba(255,240,200,1)', 'rgba(255,170,60,0)');
    const makeFlash = (parent, color) => {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28),
        new THREE.MeshBasicMaterial({ map: flashTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      f.visible = false;
      parent.add(f);
      return f;
    };

    // Carabina
    const rifle = (this.rifleModel = new THREE.Group());
    const body = mat(0x66775e), dark = mat(0x34393f), glow = new THREE.MeshBasicMaterial({ color: 0x8fe3ff });
    box(rifle, body, 0.09, 0.12, 0.42, 0, 0, 0);
    box(rifle, body, 0.1, 0.08, 0.22, 0, 0.04, -0.25);
    box(rifle, dark, 0.06, 0.16, 0.08, 0, -0.12, -0.02).rotation.x = 0.2;
    box(rifle, dark, 0.05, 0.13, 0.06, 0, -0.1, 0.13).rotation.x = -0.3;
    box(rifle, body, 0.07, 0.1, 0.18, 0, -0.02, 0.27);
    box(rifle, glow, 0.05, 0.03, 0.06, 0, 0.075, 0.08);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.3, 8), dark);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.4);
    rifle.add(barrel);
    this.rifleMuzzle = new THREE.Object3D();
    this.rifleMuzzle.position.set(0, 0.02, -0.57);
    rifle.add(this.rifleMuzzle);
    this.rifleFlash = makeFlash(this.rifleMuzzle, 0xffd08a);

    // Pistola de iones
    const pistol = (this.pistolModel = new THREE.Group());
    const white = mat(0xc9ccd6, { metalness: 0.3, roughness: 0.35 });
    this.coilMat = new THREE.MeshBasicMaterial({ color: 0x5fe9ff });
    box(pistol, white, 0.07, 0.09, 0.26, 0, 0, -0.05);
    box(pistol, this.coilMat, 0.076, 0.03, 0.14, 0, 0.02, -0.08);
    box(pistol, dark, 0.055, 0.14, 0.07, 0, -0.1, 0.04).rotation.x = -0.25;
    box(pistol, white, 0.05, 0.05, 0.06, 0, 0.01, -0.2);
    pistol.position.set(-0.02, 0.02, 0.06);
    this.pistolMuzzle = new THREE.Object3D();
    this.pistolMuzzle.position.set(0, 0.01, -0.25);
    pistol.add(this.pistolMuzzle);
    this.pistolFlash = makeFlash(this.pistolMuzzle, 0x7ff2ff);

    // Brazos con la armadura del jugador: mano en el origen, antebrazo hacia la cámara.
    this.skinMeshes = [];
    const sm = skinMaterials(DEFAULT_SKIN);
    const geo = {
      glove: new THREE.BoxGeometry(0.075, 0.075, 0.1),
      knuckle: new THREE.BoxGeometry(0.078, 0.025, 0.04),
      gauntlet: new THREE.CylinderGeometry(0.05, 0.043, 0.22, 14).rotateX(Math.PI / 2),
      cuff: new THREE.TorusGeometry(0.05, 0.01, 6, 16),
      sleeve: new THREE.CapsuleGeometry(0.046, 0.22, 4, 12).rotateX(Math.PI / 2),
    };
    const arm = (parent, pos, rot) => {
      const a = new THREE.Group();
      a.position.set(...pos);
      a.rotation.set(...rot);
      a.scale.setScalar(1.25);
      const part = (g, role, z, y = 0) => {
        const m = new THREE.Mesh(g, sm[role]);
        m.position.set(0, y, z);
        m.userData.role = role;
        a.add(m);
        this.skinMeshes.push(m);
      };
      part(geo.glove, 'suit', 0);
      part(geo.knuckle, 'trim', -0.03, 0.035);
      part(geo.gauntlet, 'armor', 0.16);
      part(geo.cuff, 'trim', 0.06);
      part(geo.sleeve, 'suit', 0.36);
      parent.add(a);
    };
    arm(rifle, [0.01, -0.1, 0.13], [0.32, 0.42, 0]);
    arm(rifle, [-0.015, -0.07, -0.27], [0.62, -0.42, 0]);
    arm(pistol, [0.005, -0.11, 0.06], [0.3, 0.38, 0]);
    arm(pistol, [-0.04, -0.12, 0.05], [0.45, -0.45, 0.15]);

    this.vm.add(rifle, pistol);
    this.vm.traverse((o) => { o.frustumCulled = false; });
    this.muzzleLight = new THREE.PointLight(0xffd08a, 0, 9, 2);
    this.muzzleLight.position.set(0, 0.05, -0.6);
    this.vm.add(this.muzzleLight);
  }

  setSkin(skin) {
    const sm = skinMaterials(skin);
    for (const m of this.skinMeshes) m.material = sm[m.userData.role];
  }

  showModel() {
    this.rifleModel.visible = this.current === 0;
    this.pistolModel.visible = this.current === 1;
  }

  muzzle() {
    return (this.current === 0 ? this.rifleMuzzle : this.pistolMuzzle).getWorldPosition(_m);
  }

  get pvp() {
    return this.ctx.game.mode === 'dm';
  }

  targets() {
    const { world, director, remotes } = this.ctx;
    return [...world.solids, ...director.hitMeshes(), ...(this.pvp ? remotes.hitMeshes() : [])];
  }

  // Impacto a otro jugador (DM): la víctima aplica el daño sobre su propio escudo.
  hitRemote(r, dmg, opts, part, from) {
    const { net, hud, sfx } = this.ctx;
    net.to(r.id, 'hit', { dmg: dmg * CFG.pvp.damageMult, sm: opts.shieldMult ?? 1, hm: opts.headMult ?? 1, part, from: v3(from) });
    hud.hitMarker(false);
    sfx.hit();
  }

  spread() {
    const p = this.ctx.player;
    const moving = Math.hypot(p.vel.x, p.vel.z) > 1 ? 0.008 : 0;
    const air = p.onGround ? 0 : 0.02;
    const crouch = p.crouching ? 0.6 : 1;
    return this.current === 0 ? (R.spread + this.spray + moving + air) * crouch : PI.spread + air * 0.5;
  }

  // --- Acciones ---
  addAmmo(n) {
    if (this.reserve >= R.maxReserve) return false;
    this.reserve = Math.min(R.maxReserve, this.reserve + n);
    return true;
  }

  addGrenade(n) {
    if (this.grenades >= G.max) return false;
    this.grenades = Math.min(G.max, this.grenades + n);
    return true;
  }

  swap(to) {
    if (to === undefined) to = 1 - this.current;
    if (to === this.current || this.swapT > 0) return;
    this.current = to;
    this.reloadT = 0;
    this.swapT = CFG.swapTime;
    this.ctx.sfx.swap();
    this.showModel();
  }

  startReload() {
    if (this.current !== 0 || this.reloadT > 0 || this.swapT > 0 || this.mag >= R.mag || this.reserve <= 0) return;
    this.reloadT = R.reload;
    this.ctx.sfx.reload();
  }

  finishReload() {
    const take = Math.min(R.mag - this.mag, this.reserve);
    this.mag += take;
    this.reserve -= take;
  }

  hitscan(spread, damage, range, opts, color) {
    const { camera, fx, hud, sfx, game } = this.ctx;
    camera.getWorldPosition(_o);
    camera.getWorldDirection(_d);
    _d.x += rand(-1, 1) * spread;
    _d.y += rand(-1, 1) * spread;
    _d.z += rand(-1, 1) * spread;
    _d.normalize();
    this.ray.set(_o, _d);
    this.ray.far = range;
    const hit = this.ray.intersectObjects(this.targets(), false)[0];
    const end = hit ? hit.point : _o.clone().addScaledVector(_d, range);
    if (hit) {
      const e = hit.object.userData.enemy, r = hit.object.userData.remote;
      if (r) {
        this.hitRemote(r, damage, opts, hit.object.userData.part, _o);
        fx.sparks(hit.point, r.shield > 0 ? 0x7fe7ff : 0xffb347);
      } else if (e) {
        const res = e.takeDamage(damage, { ...opts, part: hit.object.userData.part });
        hud.hitMarker(res.killed);
        fx.sparks(hit.point, res.shieldHit ? e.cfg.glow : 0xffb347);
        sfx.hit();
        if (res.killed) {
          sfx.kill();
          if (res.head && game.mode === 'sp') { game.score += 25; hud.toast('DISPARO A LA CABEZA +25'); }
        }
      } else {
        _n.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
        fx.impact(hit.point, _n);
      }
    }
    const muzzle = this.muzzle();
    fx.tracer(muzzle, end, color);
    if (this.ctx.net.active) this.ctx.net.bcast('fx', { w: this.current, a: v3(muzzle), b: v3(end) });
  }

  fireRifle() {
    const { player, sfx } = this.ctx;
    this.mag--;
    this.cooldown = R.interval;
    this.hitscan(this.spread(), R.damage, R.range, { shieldMult: R.shieldMult, headMult: R.headMult }, 0xffe3a0);
    this.spray = Math.min(R.sprayMax, this.spray + R.sprayGrow);
    this.recoil = Math.min(1, this.recoil + 0.35);
    player.addRecoil(0.004 + Math.random() * 0.003, rand(-0.002, 0.002));
    this.flash(0xffd08a);
    sfx.rifle();
  }

  firePistol() {
    const { player, sfx, hud } = this.ctx;
    if (this.overT > 0) { sfx.empty(); return; }
    this.cooldown = PI.interval;
    this.heat += PI.heatPerShot;
    this.hitscan(this.spread(), PI.damage, PI.range, { shieldMult: PI.shieldMult, headMult: PI.headMult }, 0x6ff5ff);
    this.recoil = Math.min(1, this.recoil + 0.6);
    player.addRecoil(0.012, 0);
    this.flash(0x7ff2ff);
    sfx.pistol();
    if (this.heat >= 1) {
      this.heat = 1;
      this.overT = PI.overheat;
      sfx.overheat();
      hud.toast('SOBRECALENTADA');
    }
  }

  flash(color) {
    this.flashT = 0.05;
    this.muzzleLight.color.setHex(color);
    const f = this.current === 0 ? this.rifleFlash : this.pistolFlash;
    f.rotation.z = Math.random() * Math.PI;
  }

  throwGrenade() {
    const { camera, scene, player, sfx } = this.ctx;
    if (this.grenades <= 0 || this.throwT > 0 || this.swapT > 0) return;
    this.grenades--;
    this.throwT = 0.6;
    this.reloadT = 0;
    camera.getWorldPosition(_o);
    camera.getWorldDirection(_d);
    const mesh = new THREE.Mesh(this.grenadeGeo, new THREE.MeshStandardMaterial({ color: 0x3f5a2c, emissive: 0x000000, roughness: 0.5 }));
    mesh.position.copy(_o).addScaledVector(_d, 0.6);
    mesh.castShadow = true;
    scene.add(mesh);
    const vel = _d.clone().multiplyScalar(G.speed).addScaledVector(UP, 3).addScaledVector(player.vel, 0.5);
    this.grenadeList.push({ mesh, vel, fuse: G.fuse, owner: null });
    sfx.throwG();
    if (this.ctx.net.active) this.ctx.net.bcast('gren', { p: v3(mesh.position), v: v3(vel) });
  }

  // Granada lanzada por otro jugador: se simula igual aquí y explota con su propia mecha.
  remoteGrenade(p, v, owner) {
    const mesh = new THREE.Mesh(this.grenadeGeo, new THREE.MeshStandardMaterial({ color: 0x3f5a2c, emissive: 0x000000, roughness: 0.5 }));
    mesh.position.fromArray(p);
    mesh.castShadow = true;
    this.ctx.scene.add(mesh);
    this.grenadeList.push({ mesh, vel: new THREE.Vector3().fromArray(v), fuse: G.fuse, owner });
  }

  explode(g) {
    const { fx, sfx, player, director, world, scene } = this.ctx;
    const p = g.mesh.position;
    scene.remove(g.mesh);
    g.mesh.material.dispose();
    fx.explosion(p, G.radius);
    sfx.explosion(p.distanceTo(player.pos));
    // El daño a enemigos lo calcula quien simula la IA (un jugador o anfitrión coop).
    if (director.authority && director.mode !== 'dm') director.damageRadius(p, G.radius, G.damage, g.owner);
    const pc = _o.set(player.pos.x, player.pos.y + 0.9, player.pos.z);
    const d = pc.distanceTo(p);
    // Coop: sin fuego amigo de granadas ajenas.
    const hurtsMe = g.owner === null || this.pvp;
    if (d < G.radius) {
      player.shake = 1;
      if (hurtsMe && player.alive && world.lineOfSight(_m.copy(p).setY(p.y + 0.3), pc)) {
        const f = 1 - d / G.radius;
        player.damage(G.damage * 0.6 * f * (g.owner !== null ? CFG.pvp.damageMult : 1), p, g.owner);
        _d.subVectors(pc, p).setY(0).normalize();
        player.vel.addScaledVector(_d, 10 * f);
        player.vel.y += 4 * f;
      }
    } else if (d < G.radius * 3) {
      player.shake = Math.min(1, player.shake + 0.4);
    }
  }

  updateGrenades(dt) {
    const { world } = this.ctx;
    for (let i = this.grenadeList.length - 1; i >= 0; i--) {
      const g = this.grenadeList[i];
      const p = g.mesh.position;
      const prevY = p.y;
      g.vel.y -= 22 * dt;
      p.addScaledVector(g.vel, dt);
      const bx = p.x, bz = p.z;
      world.resolveHorizontal(p, 0.12, p.y - 0.12, p.y + 0.12, 0);
      world.clampToArena(p, 0.12);
      if (p.x !== bx) g.vel.x *= -0.45;
      if (p.z !== bz) g.vel.z *= -0.45;
      const gh = world.groundHeightAt(p.x, p.z, 0.05, Math.max(prevY, p.y) - 0.12, 0.05);
      if (p.y - 0.12 <= gh) {
        p.y = gh + 0.12;
        if (g.vel.y < 0) g.vel.y *= -0.35;
        if (Math.abs(g.vel.y) < 1) g.vel.y = 0;
        g.vel.x *= 0.7;
        g.vel.z *= 0.7;
      }
      g.mesh.rotation.x += dt * g.vel.length();
      g.fuse -= dt;
      g.mesh.material.emissive.setHex(Math.sin(g.fuse * 30) > 0 ? 0x88ff44 : 0x000000);
      if (g.fuse <= 0) {
        this.grenadeList.splice(i, 1);
        this.explode(g);
      }
    }
  }

  melee() {
    const { player, director, sfx, hud, fx, remotes } = this.ctx;
    if (this.meleeT > 0 || this.swapT > 0) return;
    this.meleeT = M.cooldown;
    this.reloadT = 0;
    sfx.melee();
    const fwd = player.forward(_d);
    player.vel.addScaledVector(fwd, M.lunge);
    let best = null, bestD = Infinity;
    for (const e of director.enemies) {
      if (e.dead) continue;
      const to = _o.set(e.pos.x - player.pos.x, 0, e.pos.z - player.pos.z);
      const d = to.length() - e.radius;
      if (d > M.range || Math.abs(e.pos.y - player.pos.y) > 2) continue;
      if (to.normalize().dot(fwd) < 0.5 || d >= bestD) continue;
      best = e;
      bestD = d;
    }
    if (this.pvp) {
      const r = remotes.nearestInFront(player.pos, fwd, M.range);
      if (r) {
        // Por la espalda: el rival mira en la misma dirección que el atacante.
        const back = Math.cos(r.yaw - player.yaw.rotation.y) > 0.3;
        this.hitRemote(r, back ? 9999 : M.damage / CFG.pvp.damageMult, {}, back ? 'back' : 'body', player.pos);
        fx.sparks(_o.set(r.pos.x, r.pos.y + 1.1, r.pos.z), 0x7fe7ff);
        return;
      }
    }
    if (!best) return;
    // Golpe por la espalda = eliminación instantánea.
    const back = best.facing().dot(_o.set(player.pos.x - best.pos.x, 0, player.pos.z - best.pos.z).normalize()) < -0.3;
    const res = best.takeDamage(back ? 9999 : M.damage, { part: 'body' });
    hud.hitMarker(res.killed);
    fx.sparks(best.center(), best.cfg.glow);
    if (res.killed) {
      sfx.kill();
      if (back && this.ctx.game.mode === 'sp') { this.ctx.game.score += 50; hud.toast('ASESINATO +50'); }
      else if (back) hud.toast('ASESINATO');
    }
  }

  update(dt) {
    const { player, camera, sfx } = this.ctx;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.meleeT = Math.max(0, this.meleeT - dt);
    this.throwT = Math.max(0, this.throwT - dt);
    this.swapT = Math.max(0, this.swapT - dt);
    this.spray = Math.max(0, this.spray - dt * (this.trigger ? 0.02 : 0.15));
    if (this.overT > 0) {
      this.overT -= dt;
      this.heat = Math.max(0, this.overT / PI.overheat);
      if (this.overT <= 0) { this.overT = 0; this.heat = 0; }
    } else {
      this.heat = Math.max(0, this.heat - PI.cool * dt);
    }
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) { this.reloadT = 0; this.finishReload(); }
    }

    const busy = this.swapT > 0 || this.meleeT > M.cooldown - 0.35 || this.throwT > 0.3;
    if (this.trigger && !busy && this.cooldown <= 0 && player.alive) {
      if (this.current === 0) {
        if (this.reloadT > 0) { /* recargando */ }
        else if (this.mag > 0) this.fireRifle();
        else if (this.reserve > 0) this.startReload();
        else if (this.pressed) sfx.empty();
      } else if (this.pressed) {
        this.firePistol();
      }
    }
    this.pressed = false;
    this.updateGrenades(dt);

    // Animación del arma: balanceo, retroceso, cambio, recarga, golpe y sprint.
    const sp = Math.hypot(player.vel.x, player.vel.z);
    this.bobT += dt * sp * 1.4;
    const bob = Math.min(sp / 9, 1) * (player.onGround ? 1 : 0.3);
    this.recoil = Math.max(0, this.recoil - dt * 8);
    const swap = this.swapT / CFG.swapTime;
    const rl = this.reloadT > 0 ? Math.sin((1 - this.reloadT / R.reload) * Math.PI) : 0;
    const mel = this.meleeT > 0 ? Math.sin((1 - this.meleeT / M.cooldown) * Math.PI) ** 2 : 0;
    const sprint = player.sprinting ? 1 : 0;
    this.sprintK = (this.sprintK ?? 0) + (sprint - (this.sprintK ?? 0)) * Math.min(1, dt * 8);
    this.vm.position.set(
      0.28 + Math.sin(this.bobT) * 0.012 * bob - mel * 0.18,
      -0.26 + Math.abs(Math.cos(this.bobT)) * 0.012 * bob - swap * 0.35 - rl * 0.08 - this.sprintK * 0.04,
      -0.62 + this.recoil * 0.06 - mel * 0.25,
    );
    this.vm.rotation.set(this.recoil * 0.08 - rl * 0.6 - this.sprintK * 0.25, mel * 0.6 + this.sprintK * 0.5, rl * 0.3);

    this.flashT = Math.max(0, this.flashT - dt);
    this.rifleFlash.visible = this.flashT > 0 && this.current === 0;
    this.pistolFlash.visible = this.flashT > 0 && this.current === 1;
    this.muzzleLight.intensity = this.flashT > 0 ? 6 : 0;
    this.coilMat.color.setRGB(0.37 + this.heat * 0.63, 0.91 - this.heat * 0.6, 1 - this.heat * 0.8);

    // ¿Apunta a un enemigo? (retícula roja)
    camera.getWorldPosition(_o);
    camera.getWorldDirection(_d);
    this.ray.set(_o, _d);
    this.ray.far = this.current === 0 ? R.range * 0.6 : PI.range * 0.6;
    const hit = this.ray.intersectObjects(this.targets(), false)[0];
    this.aimEnemy = !!(hit?.object.userData.enemy || hit?.object.userData.remote);
  }
}
