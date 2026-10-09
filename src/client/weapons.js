import * as THREE from 'three';
import { CFG, rand } from './config.js';
import { glowTexture } from './world.js';
import { v3 } from './net.js';
import { skinMaterials, Avatar } from './avatar.js';
import { hasPlayerModel, requestPlayerModel } from './playermodels.js';
import { DEFAULT_SKIN } from '../shared/skins.js';
import { buildGun, GUN_INFO } from './guns.js';
import { Spring, damp } from './feel.js';

const W = CFG.weapons, G = CFG.grenade, M = CFG.melee;
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Vector3(), _n = new THREE.Vector3(), _c = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const VM_SCALE = 0.8;
const HIP = new THREE.Vector3(0.28, -0.26, -0.62);
// Casquillos: tipo y retardo de expulsión (corredera/cerrojo).
const EJECT = { rifle: ['rifle', 0], smg: ['small', 0], dmr: ['rifle', 0], shotgun: ['shell', 0.3], sniper: ['big', 0.42] };
const lerp = (a, b, k) => a + (b - a) * k;

const BOLT_CYCLE = 0.95;

// Texturas del fogonazo: estrella de puntas irregulares y llama lateral alargada.
function flashTexture(kind) {
  const c = document.createElement('canvas');
  const W = (c.width = 128), H = (c.height = kind === 'star' ? 128 : 64);
  const g = c.getContext('2d');
  g.globalCompositeOperation = 'lighter';
  if (kind === 'star') {
    g.translate(64, 64);
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.3, len = 30 + Math.random() * 32, w = 0.12 + Math.random() * 0.1;
      const grd = g.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
      grd.addColorStop(0, 'rgba(255,250,235,0.95)');
      grd.addColorStop(1, 'rgba(255,170,60,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(Math.cos(a - w) * 8, Math.sin(a - w) * 8);
      g.lineTo(Math.cos(a) * len, Math.sin(a) * len);
      g.lineTo(Math.cos(a + w) * 8, Math.sin(a + w) * 8);
      g.fill();
    }
    const core = g.createRadialGradient(0, 0, 0, 0, 0, 30);
    core.addColorStop(0, 'rgba(255,255,245,1)');
    core.addColorStop(0.4, 'rgba(255,220,150,0.7)');
    core.addColorStop(1, 'rgba(255,160,60,0)');
    g.fillStyle = core;
    g.fillRect(-64, -64, 128, 128);
  } else {
    // Llama: brillante junto a la boca (izquierda) y deshilachada hacia delante.
    for (let k = 0; k < 7; k++) {
      const y = H / 2 + (Math.random() - 0.5) * 10, len = W * (0.55 + Math.random() * 0.45), th = 8 + Math.random() * 10;
      const grd = g.createLinearGradient(0, 0, len, 0);
      grd.addColorStop(0, 'rgba(255,245,220,0.5)');
      grd.addColorStop(0.5, 'rgba(255,190,90,0.25)');
      grd.addColorStop(1, 'rgba(255,120,40,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(0, y - th);
      g.quadraticCurveTo(len * 0.5, y - th * 0.6, len, y);
      g.quadraticCurveTo(len * 0.5, y + th * 0.6, 0, y + th);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Estado de un arma en mano: munición en cargador/reserva o calor.
class Slot {
  constructor(id) {
    this.id = id;
    this.def = W[id];
    this.mag = this.def.mag ?? 0;
    this.reserve = this.def.reserve ?? 0;
    this.heat = 0;
    this.overT = 0;
  }
}

export class Arsenal {
  constructor(ctx) {
    this.ctx = ctx;
    this.ray = new THREE.Raycaster();
    this.grenadeList = [];
    this.shots = [];
    this.grenadeGeo = new THREE.SphereGeometry(0.12, 10, 8);
    this.shotGeo = new THREE.SphereGeometry(0.07, 10, 8).scale(1, 1, 3.2);
    this.models = new Map();
    this.zoom = 1;
    this.buildViewmodelBase();

    const playing = () => ctx.game.state === 'playing' && ctx.player.alive;
    document.addEventListener('mousedown', (e) => {
      if (!playing()) return;
      if (e.button === 0) { this.trigger = true; this.pressed = true; }
      if (e.button === 2) this.aimHeld = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.trigger = false;
      if (e.button === 2) this.aimHeld = false;
    });
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

  get w() {
    return this.slots[this.current];
  }

  // Se puede dañar a otros jugadores: DM, o cooperativo con fuego amigo.
  get pvp() {
    const { game, rules } = this.ctx;
    return game.mode === 'dm' || (game.mode === 'coop' && rules.friendlyFire);
  }

  get pvpMult() {
    return this.ctx.rules.pvpDamage;
  }

  get infinite() {
    return this.ctx.rules.infiniteAmmo;
  }

  reset(loadout = CFG.defaultLoadout) {
    this.slots = [...new Set(loadout)].filter((id) => W[id]).slice(0, 2).map((id) => new Slot(id));
    if (!this.slots.length) this.slots = CFG.defaultLoadout.map((id) => new Slot(id));
    this.current = 0;
    this.grenades = Math.min(G.max, this.ctx.rules?.grenades ?? G.start);
    this.cooldown = this.reloadT = this.swapT = this.meleeT = this.throwT = 0;
    this.spray = this.recoil = this.flashT = this.bobT = this.pumpT = 0;
    this.burstLeft = 0;
    this.burstT = 0;
    this.zoom = 1;
    this.aimK = this.sprintK = this.boltK = this.cycleT = 0;
    this.swayX = this.swayY = this.swayR = 0;
    // Muelles del arma en mano: retroceso (pos. atrás/arriba, cabeceo, guiñada, giro), inercia del ratón,
    // inclinación al moverse en lateral y rebote vertical (saltos y aterrizajes).
    const sp = (k, c) => new Spring(k, c);
    this.fk = { z: sp(180, 15), y: sp(180, 16), pitch: sp(160, 13), yaw: sp(150, 14), roll: sp(120, 10),
      swayX: sp(90, 11), swayY: sp(90, 11), swayR: sp(80, 9), tilt: sp(70, 12), lift: sp(110, 10) };
    this.bobK = this.runK = this.idleT = 0;
    this.wasGround = true;
    this.ejectQueue = [];
    this.aimDist = null;
    this.trigger = this.pressed = this.aimHeld = false;
    this.aimEnemy = false;
    for (const g of this.grenadeList) this.ctx.scene.remove(g.mesh);
    for (const s of this.shots) this.ctx.scene.remove(s.mesh);
    this.grenadeList.length = 0;
    this.shots.length = 0;
    this.equip();
  }

  // --- Modelos en primera persona ---
  buildViewmodelBase() {
    this.vm = new THREE.Group();
    this.vm.scale.setScalar(VM_SCALE);
    this.ctx.camera.add(this.vm);
    this.flashTex = glowTexture('rgba(255,240,200,1)', 'rgba(255,170,60,0)');
    this.flashStar = flashTexture('star');
    this.flashSide = flashTexture('side');
    this.flashPlane = new THREE.PlaneGeometry(1, 1);
    this.muzzleLight = new THREE.PointLight(0xffd08a, 0, 9, 2);
    this.muzzleLight.position.set(0, 0.05, -0.6);
    this.vm.add(this.muzzleLight);
    this.skin = DEFAULT_SKIN;
    this.skinMeshes = [];
    this.armGroups = []; // { a, side } de cada arma, para ponerles los brazos de la skin 3D
    this.armGeo = {
      glove: new THREE.BoxGeometry(0.075, 0.075, 0.1),
      knuckle: new THREE.BoxGeometry(0.078, 0.025, 0.04),
      gauntlet: new THREE.CylinderGeometry(0.05, 0.043, 0.22, 14).rotateX(Math.PI / 2),
      cuff: new THREE.TorusGeometry(0.05, 0.01, 6, 16),
      sleeve: new THREE.CapsuleGeometry(0.046, 0.22, 4, 12).rotateX(Math.PI / 2),
    };
  }

  // Brazo con la armadura del jugador: mano en el origen, antebrazo hacia la cámara.
  arm(parent, pos, rot, side) {
    const sm = skinMaterials(this.skin);
    const a = new THREE.Group();
    a.position.fromArray(pos);
    a.rotation.set(...rot);
    a.scale.setScalar(1.25);
    const part = (g, role, z, y = 0) => {
      const m = new THREE.Mesh(g, sm[role]);
      m.position.set(0, y, z);
      m.userData.role = role;
      a.add(m);
      this.skinMeshes.push(m);
    };
    part(this.armGeo.glove, 'suit', 0);
    part(this.armGeo.knuckle, 'trim', -0.03, 0.035);
    part(this.armGeo.gauntlet, 'armor', 0.16);
    part(this.armGeo.cuff, 'trim', 0.06);
    part(this.armGeo.sleeve, 'suit', 0.36);
    parent.add(a);
    this.armGroups.push({ a, side });
    this.addSkinArm(a, side);
  }

  // Skin 3D: los brazos del modelo sustituyen a los de la armadura procedural en primera persona.
  addSkinArm(a, side) {
    const parts = this.fpParts?.[side];
    if (!parts?.length) return;
    const g = new THREE.Group();
    g.userData.skinArm = true;
    for (const p of parts) {
      const m = new THREE.Mesh(p.geo, p.mat);
      m.frustumCulled = false;
      g.add(m);
    }
    a.add(g);
  }

  buildSkinArms() {
    for (const { a } of this.armGroups) for (const ch of [...a.children]) if (ch.userData.skinArm) a.remove(ch);
    if (this.fpParts) for (const list of Object.values(this.fpParts)) for (const p of list) p.geo.dispose();
    this.fpAvatar?.dispose();
    this.fpAvatar = this.fpParts = null;
    if (this.skin.m) requestPlayerModel(this.skin.m);
    const use = !!this.skin.m && hasPlayerModel(this.skin.m);
    this.fpWanted = !!this.skin.m && !use; // modelo aún cargando: se reintenta en update()
    if (use) {
      this.fpAvatar = new Avatar(this.skin); // fuera de la escena, en pose de reposo
      this.fpParts = { 1: this.fpAvatar.model.armParts(1), [-1]: this.fpAvatar.model.armParts(-1) };
      for (const { a, side } of this.armGroups) this.addSkinArm(a, side);
    }
    const skinned = !!this.fpParts && (this.fpParts[1].length || this.fpParts[-1].length);
    for (const m of this.skinMeshes) m.visible = !skinned;
  }

  model(id) {
    if (this.models.has(id)) return this.models.get(id);
    const gun = buildGun(id);
    const pistolLike = id === 'pistol';
    this.arm(gun.group, gun.grips.r, [0.32, 0.42, 0], 1);
    this.arm(gun.group, gun.grips.l, pistolLike ? [0.45, -0.45, 0.15] : [0.62, -0.42, 0], -1);
    if (this.fpParts) for (const m of this.skinMeshes) m.visible = false;
    gun.flash = this.makeFlash(W[id]);
    gun.muzzle.add(gun.flash);
    if (pistolLike) gun.group.position.set(-0.02, 0.02, 0.06);
    gun.group.traverse((o) => { o.frustumCulled = false; o.castShadow = false; });
    gun.base = Object.fromEntries(Object.entries(gun.parts).map(([k, o]) => [k, o.position.clone()]));
    // Posición del arma que pone la mira en el centro de la pantalla, a 'eye' de distancia.
    gun.ads = gun.sight.clone().add(gun.group.position).multiplyScalar(-VM_SCALE).add(new THREE.Vector3(0, 0, -gun.eye));
    gun.adsRate = 16 - (GUN_INFO[id]?.weight ?? 4);
    this.models.set(id, gun);
    this.vm.add(gun.group);
    return gun;
  }

  // Fogonazo: estrella frontal + dos llamas laterales cruzadas (las armas de energía, solo un resplandor).
  makeFlash(d) {
    const g = new THREE.Group();
    const mat = (map) => new THREE.MeshBasicMaterial({
      map, color: d.tracer, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    });
    const s = d.flash ?? 0.8, energy = d.alien || d.heat;
    const front = new THREE.Mesh(this.flashPlane, mat(energy ? this.flashTex : this.flashStar));
    front.scale.setScalar((energy ? 0.2 : 0.16) * s);
    g.add(front);
    g.userData.sides = [];
    if (!energy) {
      for (const r of [0, Math.PI / 2]) {
        const p = new THREE.Group();
        p.rotation.z = r;
        const m = new THREE.Mesh(this.flashPlane, mat(this.flashSide));
        m.rotation.y = Math.PI / 2;
        p.add(m);
        g.add(p);
        g.userData.sides.push(m);
      }
    }
    g.userData.size = s;
    g.visible = false;
    return g;
  }

  equip() {
    for (const m of this.models.values()) m.group.visible = false;
    this.gun = this.model(this.w.id);
    this.gun.group.visible = true;
    this.muzzleLight.color.setHex(this.w.def.tracer);
    this.gun.muzzle.getWorldPosition(this.muzzleLight.position);
    this.vm.worldToLocal(this.muzzleLight.position);
    this.boltK = this.cycleT = 0;
    this.ejectQueue.length = 0;
  }

  setSkin(skin) {
    this.skin = skin;
    const sm = skinMaterials(skin);
    for (const m of this.skinMeshes) m.material = sm[m.userData.role];
    this.buildSkinArms();
  }

  muzzle() {
    return this.gun.muzzle.getWorldPosition(_m);
  }

  targets() {
    const { world, director, remotes } = this.ctx;
    return [...world.solids, ...director.hitMeshes(), ...(this.pvp ? remotes.hitMeshes() : [])];
  }

  // Impacto a otro jugador (DM): la víctima aplica el daño sobre su propio escudo.
  hitRemote(r, dmg, opts, part, from) {
    const { net, hud, sfx } = this.ctx;
    net.to(r.id, 'hit', { dmg: dmg * this.pvpMult, sm: opts.shieldMult ?? 1, hm: opts.headMult ?? 1, part, from: v3(from) });
    hud.hitMarker(false);
    sfx.hit();
  }

  spread() {
    const p = this.ctx.player, d = this.w.def;
    const moving = Math.hypot(p.vel.x, p.vel.z) > 1 ? 0.008 : 0;
    const air = p.onGround ? 0 : 0.02;
    const crouch = p.crouching ? 0.6 : 1;
    if (this.zoom > 1.5 && d.zoomSpread !== undefined) return d.zoomSpread + air;
    const base = d.spread + (d.sprayGrow ? this.spray : 0) + moving + air;
    return base * crouch * (this.zoom > 1 ? d.adsSpread ?? 0.5 : 1);
  }

  // --- Munición y cambios de arma ---
  wantsAmmo() {
    return !this.infinite && this.slots.some((s) => s.def.mag && s.reserve < s.def.maxReserve);
  }

  addAmmo(mult = 1) {
    let any = false;
    for (const s of this.slots) {
      if (!s.def.mag || s.reserve >= s.def.maxReserve) continue;
      s.reserve = Math.min(s.def.maxReserve, s.reserve + Math.ceil(s.def.pickup * mult));
      any = true;
    }
    return any;
  }

  addGrenade(n) {
    if (this.grenades >= G.max) return false;
    this.grenades = Math.min(G.max, this.grenades + n);
    return true;
  }

  has(id) {
    return this.slots.some((s) => s.id === id);
  }

  // Arma nueva (caja misteriosa): si ya la tienes, munición llena; si no, sustituye la que llevas en la mano.
  give(id) {
    const own = this.slots.find((s) => s.id === id);
    if (own) {
      own.reserve = own.def.maxReserve ?? 0;
      own.mag = own.def.mag ?? 0;
      own.heat = 0;
      own.overT = 0;
      return 'ammo';
    }
    if (this.slots.length < 2) {
      this.slots.push(new Slot(id));
      this.current = this.slots.length - 1;
    } else {
      this.slots[this.current] = new Slot(id);
    }
    this.reloadT = 0;
    this.burstLeft = 0;
    this.zoom = 1;
    this.swapT = CFG.swapTime;
    this.equip();
    return 'new';
  }

  swap(to) {
    if (this.slots.length < 2) return;
    if (to === undefined) to = 1 - this.current;
    if (to === this.current || this.swapT > 0 || !this.slots[to]) return;
    this.current = to;
    this.reloadT = 0;
    this.burstLeft = 0;
    this.zoom = 1;
    this.swapT = CFG.swapTime;
    this.ctx.sfx.swap();
    this.equip();
  }

  // Casquillo desde la ventana de expulsión, hacia la derecha y arriba de la vista.
  ejectCasing(kind) {
    const { camera, fx, player, sfx } = this.ctx;
    if (!this.gun.eject || !this.vm.visible || !player.alive) return;
    const pos = this.gun.eject.getWorldPosition(new THREE.Vector3());
    camera.updateMatrixWorld();
    const vel = new THREE.Vector3()
      .addScaledVector(_d.set(1, 0, 0).transformDirection(camera.matrixWorld), rand(1.6, 2.6))
      .addScaledVector(_n.set(0, 1, 0).transformDirection(camera.matrixWorld), rand(1.2, 2.2))
      .addScaledVector(_c.set(0, 0, 1).transformDirection(camera.matrixWorld), rand(0.2, 0.6))
      .addScaledVector(player.vel, 0.9);
    fx.casing(pos, vel, kind, player.pos.y);
    sfx.casing(0.35 + Math.random() * 0.15, kind === 'shell' || kind === 'big');
  }

  startReload() {
    const s = this.w, d = s.def;
    if (!d.mag || this.reloadT > 0 || this.swapT > 0 || s.mag >= d.mag || s.reserve <= 0) return;
    this.reloadT = d.reload;
    this.zoom = 1;
    this.ctx.sfx.reload(d.shellReload);
  }

  finishReload() {
    const s = this.w, d = s.def;
    if (d.shellReload) {
      s.mag++;
      if (!this.infinite) s.reserve--;
      // Cartucho a cartucho: continúa salvo que el jugador quiera disparar.
      if (s.mag < d.mag && s.reserve > 0 && !this.trigger) { this.reloadT = d.reload; this.ctx.sfx.shell(); }
      return;
    }
    const take = Math.min(d.mag - s.mag, s.reserve);
    s.mag += take;
    if (!this.infinite) s.reserve -= take;
  }

  // Origen y dirección de la mira: la cabeza del jugador (no la cámara, que lleva sacudidas y patada visuales).
  aimRay(o, d) {
    const { camera, player } = this.ctx;
    camera.getWorldPosition(o);
    return d.set(0, 0, -1).applyQuaternion(player.pitch.getWorldQuaternion(_q));
  }

  // --- Disparo ---
  castRay(spread, range) {
    this.aimRay(_o, _d);
    _d.x += rand(-1, 1) * spread;
    _d.y += rand(-1, 1) * spread;
    _d.z += rand(-1, 1) * spread;
    _d.normalize();
    this.ray.set(_o, _d);
    this.ray.far = range;
    const hit = this.ray.intersectObjects(this.targets(), false)[0];
    return { hit, end: hit ? hit.point.clone() : _o.clone().addScaledVector(_d, range), dist: hit ? hit.distance : range };
  }

  applyHit(hit, damage, d) {
    const { fx, hud, sfx, game } = this.ctx;
    const e = hit.object.userData.enemy, r = hit.object.userData.remote;
    const opts = { shieldMult: d.shieldMult ?? 1, headMult: d.headMult ?? 1 };
    // Potencia visual del impacto según el daño de la bala (subfusil ~0,5 … francotirador 2).
    const power = Math.min(2, Math.max(0.5, d.damage / 14)) * (d.kind === 'pellets' ? 0.6 : 1);
    const energy = d.alien || d.heat ? d.tracer : null;
    if (r) {
      const shielded = r.shield > 0;
      this.hitRemote(r, damage, opts, hit.object.userData.part, _o);
      if (shielded) fx.shieldHit(hit.point, 0x7fe7ff, power); else fx.blood(hit.point, _d, power, 0x7a0a0a);
    } else if (e) {
      const res = e.takeDamage(damage, { ...opts, part: hit.object.userData.part });
      hud.hitMarker(res.killed);
      if (res.shieldHit) fx.shieldHit(hit.point, e.cfg.glow, power);
      else fx.blood(hit.point, _d, power * (hit.object.userData.part === 'head' ? 1.5 : 1));
      sfx.hit();
      if (res.killed) {
        sfx.kill();
        if (res.head && game.mode === 'sp') { game.score += 25; hud.toast('DISPARO A LA CABEZA +25'); }
      }
    } else {
      _n.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
      fx.impact(hit.point, _n, hit, power, energy);
    }
  }

  fire() {
    const { player, sfx, hud, fx, net } = this.ctx;
    const s = this.w, d = s.def;
    if (d.heat && s.overT > 0) { if (this.pressed) sfx.empty(); return; }
    if (d.mag) {
      if (this.reloadT > 0) {
        // La escopeta puede interrumpir la recarga para disparar.
        if (!(d.shellReload && s.mag > 0)) return;
        this.reloadT = 0;
      }
      if (s.mag <= 0) {
        if (s.reserve > 0) this.startReload(); else if (this.pressed) sfx.empty();
        return;
      }
      s.mag--;
    }
    this.cooldown = d.interval;
    const muzzle = this.muzzle().clone();
    const ends = [];
    if (d.kind === 'pellets') {
      for (let i = 0; i < d.pellets; i++) {
        const { hit, end, dist } = this.castRay(this.spread(), d.range);
        const [near, far] = d.falloff;
        const k = dist <= near ? 1 : Math.max(0.3, 1 - ((dist - near) / (far - near)) * 0.7);
        if (hit) this.applyHit(hit, d.damage * k, d);
        ends.push(end);
      }
      this.pumpT = 1;
    } else if (d.kind === 'projectile') {
      this.launch(d, s.id);
    } else {
      const { hit, end } = this.castRay(this.spread(), d.range);
      if (hit) this.applyHit(hit, d.damage, d);
      ends.push(end);
      if (d.burst && !this.burstFiring) { this.burstLeft = d.burst - 1; this.burstT = d.burstGap; }
    }
    for (const e of ends) fx.tracer(muzzle, e, d.tracer, d);
    fx.muzzle(muzzle, this.aimRay(_o, _d), d);
    if (net.active && ends.length) net.bcast('fx', { w: s.id, a: v3(muzzle), bs: ends.map(v3) });

    if (d.sprayGrow) this.spray = Math.min(d.sprayMax, this.spray + d.sprayGrow);
    if (d.heat) {
      s.heat += d.heat.perShot;
      if (s.heat >= 1) { s.heat = 1; s.overT = d.heat.overheat; sfx.overheat(); hud.toast('SOBRECALENTADA'); }
    }
    this.recoil = Math.min(1, this.recoil + Math.min(1, d.recoil * 60));
    this.kickFeel(Math.min(1, d.recoil * 60), d);
    this.boltK = 1;
    if (d.boltAction) this.cycleT = BOLT_CYCLE;
    const ej = EJECT[s.id];
    if (ej && !d.boltAction) this.ejectQueue.push(ej[1]);
    player.addRecoil((d.recoil * (0.8 + Math.random() * 0.4)) / Math.sqrt(this.zoom), rand(-0.3, 0.3) * d.recoil);
    this.flash();
    sfx.shot(d.sound);
  }

  // Retroceso visual: el arma salta hacia atrás y arriba con algo de giro aleatorio y vuelve con un rebote;
  // la cámara recibe una patada corta. Apuntando, todo se reduce (el arma va pegada al hombro).
  kickFeel(r, d) {
    const f = this.fk, a = 1 - this.aimK * 0.55, heavy = r > 0.8 ? 1.25 : 1;
    f.z.kick((0.55 + r * 1.1) * a * heavy);
    f.y.kick((0.12 + r * 0.35) * a);
    f.pitch.kick((2.2 + r * 6.5) * a * heavy);
    f.yaw.kick(rand(-1, 1) * (0.6 + r * 1.6) * a);
    f.roll.kick(rand(-1, 1) * (1.2 + r * 3.5) * a);
    this.ctx.player.viewKick?.(r, d.boltAction || d.kind === 'pellets');
  }

  flash() {
    this.flashT = 0.05;
    const f = this.gun.flash, s = f.userData.size;
    f.rotation.z = Math.random() * Math.PI;
    f.children[0].scale.setScalar(f.children[0].scale.x / (f.userData.k ?? 1));
    f.userData.k = rand(0.8, 1.2);
    f.children[0].scale.multiplyScalar(f.userData.k);
    for (const m of f.userData.sides) {
      const len = 0.22 * s * rand(0.7, 1.3);
      m.scale.set(len, 0.07 * s * rand(0.8, 1.2), 1);
      m.position.z = -len / 2;
    }
  }

  // --- Proyectiles (agujas y cañón de arco) ---
  launch(d, id) {
    const { camera, net } = this.ctx;
    this.aimRay(_o, _d);
    // Objetivo para el guiado: lo que haya en la mira.
    this.ray.set(_o, _d);
    this.ray.far = 80;
    const aim = this.ray.intersectObjects(this.targets(), false)[0];
    const target = aim?.object.userData.enemy ?? aim?.object.userData.remote ?? null;
    const dir = _d.clone();
    dir.x += rand(-1, 1) * d.spread;
    dir.y += rand(-1, 1) * d.spread;
    dir.normalize();
    const from = this.muzzle().clone().lerp(_o, 0.4);
    const shot = this.spawnShot(from, dir.multiplyScalar(d.projSpeed), id, null);
    shot.target = target;
    if (net.active) net.bcast('pshot', { p: v3(from), v: v3(shot.vel), w: id });
  }

  spawnShot(pos, vel, id, owner) {
    const d = W[id];
    const mesh = new THREE.Mesh(this.shotGeo, new THREE.MeshBasicMaterial({ color: d.tracer }));
    mesh.scale.setScalar(d.splash ? 2.2 : 1);
    mesh.position.copy(pos);
    mesh.lookAt(_c.copy(pos).add(vel));
    this.ctx.scene.add(mesh);
    const shot = { mesh, vel, life: d.life, def: d, id, owner, target: null };
    this.shots.push(shot);
    return shot;
  }

  // Proyectil de otro jugador: solo visual (el daño lo calcula quien dispara).
  remoteShot(m) {
    this.spawnShot(new THREE.Vector3().fromArray(m.p), new THREE.Vector3().fromArray(m.v), m.w, m.from);
  }

  updateShots(dt) {
    const { world, director, remotes, fx } = this.ctx;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i], d = s.def, p = s.mesh.position;
      s.life -= dt;
      // Guiado suave hacia el objetivo fijado.
      const t = s.target;
      if (d.homing && t && (t.alive || t.dead === false)) {
        const c = t.center ? t.center(_c) : _c.set(t.pos.x, t.pos.y + 1.1, t.pos.z);
        const speed = s.vel.length();
        _d.subVectors(c, p).normalize().multiplyScalar(speed);
        s.vel.lerp(_d, Math.min(1, d.homing * dt)).setLength(speed);
      }
      let done = false;
      for (let k = 0; k < 3 && !done; k++) {
        p.addScaledVector(s.vel, dt / 3);
        if (s.owner === null) {
          for (const e of director.enemies) {
            if (e.dead || e.center(_c).distanceTo(p) > e.radius + 0.35) continue;
            this.shotHit(s, e, null);
            done = true;
            break;
          }
          if (!done && this.pvp) {
            for (const r of remotes.alive()) {
              if (_c.set(r.pos.x, r.pos.y + 1, r.pos.z).distanceTo(p) > 0.6) continue;
              this.shotHit(s, null, r);
              done = true;
              break;
            }
          }
        }
        if (!done && world.pointInSolid(p)) {
          if (d.splash) this.splash(p, d, s.owner); else fx.sparks(p, d.tracer);
          done = true;
        }
      }
      s.mesh.lookAt(_c.copy(p).add(s.vel));
      fx.trail(p, d.tracer, d.splash ? 0.45 : 0.16);
      if (done || s.life <= 0) {
        if (!done && d.splash) this.splash(p, d, s.owner);
        this.ctx.scene.remove(s.mesh);
        s.mesh.material.dispose();
        this.shots.splice(i, 1);
      }
    }
  }

  shotHit(s, enemy, remote) {
    const { fx, hud, sfx } = this.ctx;
    const d = s.def, p = s.mesh.position;
    if (d.splash) { this.splash(p, d, null); return; }
    if (enemy) {
      const res = enemy.takeDamage(d.damage, { shieldMult: d.shieldMult, headMult: d.headMult, part: 'body' });
      hud.hitMarker(res.killed);
      sfx.hit();
      if (res.killed) sfx.kill();
      fx.sparks(p, d.tracer);
    } else if (remote) {
      this.hitRemote(remote, d.damage, d, 'body', p);
      fx.sparks(p, d.tracer);
    }
  }

  // Explosión del cañón de arco. Solo el que dispara (owner null) aplica daño.
  splash(p, d, owner) {
    const { fx, sfx, player, director, remotes, world, hud } = this.ctx;
    fx.explosion(p, d.splash, { color: d.tracer });
    sfx.explosion(p.distanceTo(player.pos));
    if (owner !== null) return;
    let hits = 0, kills = 0;
    const eye = _m.copy(p).setY(p.y + 0.3);
    for (const e of director.enemies) {
      if (e.dead) continue;
      const c = e.center(new THREE.Vector3());
      const dist = c.distanceTo(p);
      if (dist > d.splash || !world.lineOfSight(eye, c)) continue;
      const res = e.takeDamage(d.damage * (0.25 + 0.75 * (1 - dist / d.splash)), { part: 'body' });
      hits++;
      if (res.killed) kills++;
    }
    if (this.pvp) {
      for (const r of remotes.alive()) {
        const dist = _c.set(r.pos.x, r.pos.y + 1, r.pos.z).distanceTo(p);
        if (dist < d.splash) this.hitRemote(r, d.damage * (0.25 + 0.75 * (1 - dist / d.splash)), {}, 'body', p);
      }
    }
    const pc = _c.set(player.pos.x, player.pos.y + 0.9, player.pos.z), dist = pc.distanceTo(p);
    if (dist < d.splash && player.alive) {
      player.damage(d.damage * 0.5 * (1 - dist / d.splash), p);
      player.shake = 1;
    }
    if (hits) { hud.hitMarker(kills > 0); sfx.hit(); }
    if (kills) sfx.kill();
  }

  // --- Granadas ---
  throwGrenade() {
    const { camera, scene, player, sfx } = this.ctx;
    if (this.grenades <= 0 || this.throwT > 0 || this.swapT > 0) return;
    this.grenades--;
    this.throwT = 0.6;
    this.reloadT = 0;
    this.aimRay(_o, _d);
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
        player.damage(G.damage * 0.6 * f * (g.owner !== null ? this.pvpMult : 1), p, g.owner);
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
      const blink = Math.sin(g.fuse * 30) > 0;
      g.mesh.material.emissive.setHex(blink ? 0x88ff44 : 0x000000);
      // Estela de humo y destello del piloto (más rápido al final de la mecha).
      g.trailT = (g.trailT ?? 0) - dt;
      if (g.trailT <= 0 && g.vel.lengthSq() > 1) { g.trailT = 0.035; this.ctx.fx.grenadeTrail(p, false); }
      if (blink && !g.blink) this.ctx.fx.grenadeTrail(p, true);
      g.blink = blink;
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
    this.zoom = 1;
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
        this.hitRemote(r, back ? 9999 : M.damage / this.pvpMult, {}, back ? 'back' : 'body', player.pos);
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
    if (this.fpWanted && hasPlayerModel(this.skin.m)) this.buildSkinArms(); // la skin 3D terminó de cargar
    const { player, camera } = this.ctx;
    const s = this.w, d = s.def;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.meleeT = Math.max(0, this.meleeT - dt);
    this.throwT = Math.max(0, this.throwT - dt);
    this.swapT = Math.max(0, this.swapT - dt);
    this.pumpT = Math.max(0, this.pumpT - dt * 2.2);
    this.spray = Math.max(0, this.spray - dt * (this.trigger ? 0.02 : 0.15));
    // Todas las armas de calor se enfrían, también la que no está en la mano.
    for (const sl of this.slots) {
      if (!sl.def.heat) continue;
      if (sl.overT > 0) {
        sl.overT -= dt;
        sl.heat = Math.max(0, sl.overT / sl.def.heat.overheat);
        if (sl.overT <= 0) { sl.overT = 0; sl.heat = 0; }
      } else {
        sl.heat = Math.max(0, sl.heat - sl.def.heat.cool * dt);
      }
    }
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) { this.reloadT = 0; this.finishReload(); }
    }
    const busy = this.swapT > 0 || this.meleeT > M.cooldown - 0.35 || this.throwT > 0.3;
    // Apuntar (mantener clic derecho): los visores solo amplían cuando la mira llega al ojo.
    const canAim = this.aimHeld && player.alive && !player.sprinting && this.reloadT <= 0 && !busy;
    this.aimK += ((canAim ? 1 : 0) - this.aimK) * Math.min(1, dt * this.gun.adsRate);
    const full = d.zoom ?? d.ads ?? 1.25;
    const zoom = !canAim ? 1 : d.scope && this.aimK < 0.8 ? 1.15 : full;
    if (zoom === full && full > 1.5 && this.zoom !== full) this.ctx.sfx.zoom();
    this.zoom = zoom;
    // Ráfagas (DMR): las balas restantes salen solas.
    if (this.burstLeft > 0 && !busy) {
      this.burstT -= dt;
      if (s.mag <= 0) this.burstLeft = 0;
      else if (this.burstT <= 0) {
        this.burstLeft--;
        this.burstT = d.burstGap;
        this.burstFiring = true;
        this.fire();
        this.burstFiring = false;
      }
    } else if (this.trigger && !busy && this.cooldown <= 0 && player.alive && (d.auto || this.pressed)) {
      this.fire();
    }
    this.pressed = false;
    this.updateGrenades(dt);
    this.updateShots(dt);

    // Casquillos pendientes (escopeta: al bombear; francotirador: al abrir el cerrojo).
    for (let i = this.ejectQueue.length - 1; i >= 0; i--) {
      this.ejectQueue[i] -= dt;
      if (this.ejectQueue[i] <= 0) { this.ejectQueue.splice(i, 1); this.ejectCasing(EJECT[s.id]?.[0]); }
    }

    // Animación del arma: pasos, respiración, inercia, retroceso con muelles, saltos, cambio, recarga, golpe,
    // sprint y apuntado. Todo es visual: la puntería sale de la cabeza (aimRay).
    const f = this.fk;
    const sp = Math.hypot(player.vel.x, player.vel.z), ground = player.onGround;
    const aim = this.aimK, aimE = aim * aim * (3 - 2 * aim), free = 1 - aimE * 0.85;
    this.recoil = Math.max(0, this.recoil - dt * 8);
    const swap = this.swapT / CFG.swapTime;
    const rl = this.reloadT > 0 && d.reload ? Math.sin((1 - this.reloadT / d.reload) * Math.PI) * (d.shellReload ? 0.4 : 1) : 0;
    const mel = this.meleeT > 0 ? Math.sin((1 - this.meleeT / M.cooldown) * Math.PI) ** 2 : 0;
    this.sprintK = damp(this.sprintK, player.sprinting && ground ? 1 : 0, 9, dt);
    const run = this.sprintK * (1 - rl) * (1 - mel);
    // Pasos: fase según la distancia recorrida (mismo ritmo que la cámara); amplitud suave al arrancar/parar.
    this.bobT = player.stepT ?? this.bobT;
    this.bobK = damp(this.bobK, ground ? Math.min(sp / 6.5, 1.25) : 0, 10, dt);
    const bA = this.bobK * free, t = this.bobT;
    const bobX = Math.sin(t) * (0.011 + run * 0.016) * bA;
    const bobY = -(1 - Math.cos(2 * t)) * 0.5 * (0.009 + run * 0.012) * bA;
    const bobR = Math.sin(t) * (0.025 + run * 0.05) * bA;
    // Respiración en reposo (también apuntando, mucho menor).
    this.idleT += dt;
    const br = (1 - this.bobK * 0.8) * (1 - aimE * 0.8);
    const idleY = Math.sin(this.idleT * 1.7) * 0.0035 * br, idleP = Math.sin(this.idleT * 1.1 + 1) * 0.006 * br;
    // Inercia del ratón con muelle (se pasa un poco y vuelve).
    const idt = 1 / Math.max(dt, 1 / 240);
    const mx = (player.lookDX ?? 0) * idt, my = (player.lookDY ?? 0) * idt;
    player.lookDX = player.lookDY = 0;
    const sw = 1 - aimE * 0.8, cl = THREE.MathUtils.clamp;
    this.swayX = f.swayX.update(dt, cl(-mx * 1.8e-5, -0.035, 0.035) * sw);
    this.swayY = f.swayY.update(dt, cl(my * 1.8e-5, -0.03, 0.03) * sw);
    this.swayR = f.swayR.update(dt, cl(-mx * 3.5e-5, -0.08, 0.08) * sw);
    // Movimiento relativo a la vista: inclinación al desplazarse en lateral, empuje al avanzar.
    const yaw = player.yaw.rotation.y, side = player.vel.x * Math.cos(yaw) - player.vel.z * Math.sin(yaw);
    const fwd = -player.vel.x * Math.sin(yaw) - player.vel.z * Math.cos(yaw);
    const tilt = f.tilt.update(dt, cl(-side * 0.011, -0.08, 0.08) * free);
    // Saltos: el arma se queda atrás al subir y sube al caer; al aterrizar, golpe hacia abajo con rebote.
    if (ground && !this.wasGround) f.lift.kick(-Math.min(1.6, (player.landV ?? 4) * 0.12) * (1 - aimE * 0.6));
    this.wasGround = ground;
    const lift = f.lift.update(dt, ground ? 0 : cl(-player.vel.y * 0.0035, -0.035, 0.035) * free);
    // Retroceso.
    const kz = f.z.update(dt), ky = f.y.update(dt), kp = f.pitch.update(dt), kyaw = f.yaw.update(dt), kr = f.roll.update(dt);
    const crouch = player.crouching && !player.sliding ? 1 - aimE : 0;
    this.crouchK = damp(this.crouchK ?? 0, crouch, 8, dt);
    // Cerrojo del francotirador: levantar, atrás, adelante, bajar.
    let boltRot = 0, boltBack = 0;
    if (this.cycleT > 0) {
      const prev = this.cycleT;
      this.cycleT = Math.max(0, this.cycleT - dt);
      const u = 1 - this.cycleT / BOLT_CYCLE, pu = 1 - prev / BOLT_CYCLE;
      boltRot = u < 0.15 ? 0 : u < 0.3 ? (u - 0.15) / 0.15 : u < 0.7 ? 1 : u < 0.85 ? 1 - (u - 0.7) / 0.15 : 0;
      boltBack = u < 0.3 ? 0 : u < 0.5 ? (u - 0.3) / 0.2 : u < 0.7 ? 1 - (u - 0.5) / 0.2 : 0;
      if (pu < 0.3 && u >= 0.3) this.ctx.sfx.bolt(false);
      if (pu < 0.45 && u >= 0.45) this.ejectCasing('big');
      if (pu < 0.55 && u >= 0.55) this.ctx.sfx.bolt(true);
    }
    const cyc = Math.sin(Math.min(1, boltRot + boltBack) * Math.PI * 0.5) * (1 - aim * 0.7);
    const ads = this.gun.ads;
    // Sprint estilo táctico: arma baja, cruzada y girada hacia dentro.
    this.vm.position.set(
      lerp(HIP.x, ads.x, aimE) + bobX - mel * 0.18 + this.swayX - run * 0.05 + tilt * 0.12 - this.crouchK * 0.015,
      lerp(HIP.y, ads.y, aimE) + bobY + idleY + lift - swap * 0.35 - rl * 0.08 - run * 0.055 + this.swayY - cyc * 0.02 + ky * 0.4 - this.crouchK * 0.012,
      lerp(HIP.z, ads.z, aimE) + kz * 0.11 - mel * 0.25 + cl(fwd * 0.0018, -0.012, 0.012) * free + run * 0.03,
    );
    this.vm.rotation.set(
      kp * 0.11 + idleP - rl * 0.6 - run * 0.32 + this.swayY * 1.5 + lift * 1.2,
      mel * 0.6 + run * 0.62 + this.swayR + kyaw * 0.05,
      rl * 0.3 + this.swayR * 0.5 + cyc * 0.12 + bobR + tilt + kr * 0.05 + run * 0.18 + this.crouchK * 0.12,
    );
    // Con visor (DMR, francotirador) no se ve el arma.
    this.vm.visible = !(d.scope && this.zoom > 1.5);

    // Piezas móviles.
    const P = this.gun.parts, B = this.gun.base;
    this.boltK = Math.max(0, this.boltK - dt * 18);
    if (P.pump) P.pump.position.z = B.pump.z + Math.sin(this.pumpT * Math.PI) * 0.09;
    if (P.bolt) {
      if (d.boltAction) {
        P.bolt.rotation.z = boltRot * 1.1;
        P.bolt.position.z = B.bolt.z + boltBack * 0.09;
      } else P.bolt.position.z = B.bolt.z + this.boltK * 0.035;
    }
    if (P.mag) {
      // Recarga: el cargador cae, desaparece y entra el nuevo.
      const t = this.reloadT > 0 && d.reload && !d.shellReload ? 1 - this.reloadT / d.reload : 1;
      const out = t < 0.22 ? t / 0.22 : t < 0.55 ? 1 : t < 0.82 ? 1 - (t - 0.55) / 0.27 : 0;
      P.mag.position.set(B.mag.x, B.mag.y - out * 0.2, B.mag.z + out * 0.04);
      P.mag.rotation.x = out * 0.4;
      P.mag.visible = !(t > 0.3 && t < 0.5);
    }
    if (P.spikes) {
      // Agujas: los cristales del lomo muestran la carga.
      const n = P.spikes.children.length;
      const fill = this.reloadT > 0 && d.reload ? 1 - this.reloadT / d.reload : s.mag / d.mag;
      P.spikes.children.forEach((c, i) => { c.visible = i < Math.ceil(fill * n); });
    }
    const pulse = 0.75 + Math.sin(performance.now() / 160) * 0.25;
    if (P.coil) P.coil.children[0].material.color.setRGB(0.37 + s.heat * 0.63, 0.91 - s.heat * 0.6, 1 - s.heat * 0.8);
    if (P.core) P.core.children[0].material.color.setRGB(1, 0.35 + 0.3 * (1 - s.heat), 0.82 * (1 - s.heat * 0.6)).multiplyScalar(s.overT > 0 ? 0.4 : pulse);
    if (P.rings) for (const r of P.rings.children) r.material.color.setRGB(0.6 * pulse, pulse, 0.4 * pulse).multiplyScalar(this.cooldown > 0 ? 0.5 : 1);

    this.flashT = Math.max(0, this.flashT - dt);
    this.gun.flash.visible = this.flashT > 0;
    this.muzzleLight.intensity = this.flashT > 0 ? 6 * (d.flash ?? 0.8) : 0;

    // ¿Apunta a un enemigo? (retícula roja)
    this.aimRay(_o, _d);
    this.ray.set(_o, _d);
    const scoped = d.scope && this.zoom > 1.5;
    this.ray.far = scoped ? d.range : Math.min(150, d.range ?? 80) * 0.7;
    const hit = this.ray.intersectObjects(this.targets(), false)[0];
    this.aimEnemy = !!(hit?.object.userData.enemy || hit?.object.userData.remote);
    this.aimDist = hit ? hit.distance : null;
  }
}
