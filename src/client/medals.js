import * as THREE from 'three';
import { S } from './settings.js';

// Medallas en partida (doble baja, rachas, tiro a la cabeza…), locutor y recompensas por racha de bajas.
// Solo DOM + WebAudio + síntesis de voz del navegador: no cuesta nada al render. Las recompensas por racha
// (un jugador y cooperativo) son reabastecimiento (5), ataque orbital (10) y dron de apoyo (15).
const MULTI_WINDOW = 4; // s entre bajas para encadenar dobles, triples…
const MULTI = [null, null, 'DOBLE BAJA', 'TRIPLE BAJA', 'MULTIBAJA', 'MASACRE'];
const SPREES = { 5: 'EN RACHA', 10: 'IMPARABLE', 15: 'INCONTENIBLE', 25: 'LEYENDA' };
const STREAKS = { 5: 'supply', 10: 'orbital', 15: 'drone' };
// tier: 0 normal · 1 bueno · 2 épico (color y sonido); say: lo que dice el locutor (null = solo la medalla).
const ICON = { multi: '✦', spree: '★', head: '⦿', boss: '♛', melee: '✊', grenade: '✸', far: '◎', first: '❶', revenge: '↺', streak: '▲' };

export class Medals {
  constructor(ctx) {
    this.ctx = ctx;
    this.el = document.getElementById('medals');
    this.reset();
    this.voice = null;
    const pickVoice = () => {
      const vs = window.speechSynthesis?.getVoices?.() ?? [];
      this.voice = vs.find((v) => /^es(-|_)ES/i.test(v.lang)) ?? vs.find((v) => /^es/i.test(v.lang)) ?? null;
    };
    pickVoice();
    window.speechSynthesis?.addEventListener?.('voiceschanged', pickVoice);
  }

  reset() {
    this.streak = 0;
    this.multi = 0;
    this.lastKill = -1e9;
    this.firstBlood = false;
    this.nemesis = null; // quién te mató la última vez (todos contra todos)
    this.drone?.dispose();
    this.drone = null;
    this.el?.replaceChildren();
  }

  // Muerte del jugador local: se corta la racha.
  onDeath(killerId = null) {
    this.streak = 0;
    this.multi = 0;
    this.nemesis = killerId;
  }

  // Baja del jugador local. dist: metros hasta la víctima · victim: id (todos contra todos).
  onKill({ head = false, boss = false, src = null, dist = 0, dm = false, victim = null, first = false } = {}) {
    const now = performance.now() / 1000;
    this.multi = now - this.lastKill < MULTI_WINDOW ? this.multi + 1 : 1;
    this.lastKill = now;
    this.streak++;
    const got = [];
    if (this.multi >= 2) got.push({ name: MULTI[Math.min(this.multi, 5)], icon: ICON.multi, tier: this.multi >= 4 ? 2 : 1, say: true });
    if (SPREES[this.streak]) got.push({ name: SPREES[this.streak], icon: ICON.spree, tier: this.streak >= 15 ? 2 : 1, say: true });
    if (first) got.push({ name: 'PRIMERA SANGRE', icon: ICON.first, tier: 1, say: true });
    if (dm && victim !== null && victim === this.nemesis) { got.push({ name: 'VENGANZA', icon: ICON.revenge, tier: 1, say: true }); this.nemesis = null; }
    if (boss) got.push({ name: 'CAZAJEFES', icon: ICON.boss, tier: 2, say: true });
    if (src === 'melee') got.push({ name: 'CUERPO A CUERPO', icon: ICON.melee, tier: 0 });
    else if (src === 'grenade') got.push({ name: 'GRANADERO', icon: ICON.grenade, tier: 0 });
    if (head) got.push({ name: 'A LA CABEZA', icon: ICON.head, tier: 0 });
    if (dist >= 50) got.push({ name: 'TIRO LEJANO', icon: ICON.far, tier: 1 });
    for (const m of got) this.show(m);
    const said = got.find((m) => m.say);
    if (said) this.say(said.name);
    else if (got.length) this.ctx.sfx.medal?.(got[0].tier);
    // Recompensas por racha (no en todos contra todos).
    if (!dm && STREAKS[this.streak]) this.reward(STREAKS[this.streak]);
  }

  show({ name, icon, tier }) {
    if (!this.el) return;
    const m = document.createElement('div');
    m.className = `medal t${tier}`;
    m.innerHTML = `<i>${icon}</i><b>${name}</b>`;
    this.el.prepend(m);
    while (this.el.children.length > 4) this.el.lastChild.remove();
    setTimeout(() => m.classList.add('out'), 2300);
    setTimeout(() => m.remove(), 2800);
  }

  // Locutor: voz del navegador (si hay) + golpe sonoro. Se salta si ya está hablando (no se acumula).
  say(text) {
    this.ctx.sfx.medal?.(2);
    const vol = S.volMaster * S.volUi;
    if (!S.announcer || !window.speechSynthesis || vol <= 0) return;
    if (speechSynthesis.speaking) return;
    const u = new SpeechSynthesisUtterance(`¡${text.toLowerCase()}!`);
    u.lang = this.voice?.lang ?? 'es-ES';
    if (this.voice) u.voice = this.voice;
    u.rate = 1.12;
    u.pitch = 0.55;
    u.volume = Math.min(1, vol * 1.2);
    speechSynthesis.speak(u);
  }

  // --- Recompensas por racha ---
  reward(kind) {
    const { hud, arsenal, sfx } = this.ctx;
    if (kind === 'supply') {
      arsenal.addAmmo(3);
      arsenal.addGrenade(2);
      hud.banner('REABASTECIMIENTO', '5 BAJAS SEGUIDAS · MUNICIÓN Y 2 GRANADAS', 2.2);
      sfx.pickup();
      this.say('Reabastecimiento');
    } else if (kind === 'orbital') {
      hud.banner('ATAQUE ORBITAL', '10 BAJAS SEGUIDAS · ¡A CUBIERTO!', 2.2);
      this.say('Ataque orbital');
      this.orbital();
    } else if (kind === 'drone') {
      hud.banner('DRON DE APOYO', '15 BAJAS SEGUIDAS · TE CUBRE 25 S', 2.2);
      this.say('Dron de apoyo');
      this.drone?.dispose();
      this.drone = new Drone(this.ctx);
    }
  }

  // Tres impactos desde órbita sobre el enemigo más cercano a la mira (o 25 m delante).
  orbital() {
    const { director, player, camera, world } = this.ctx;
    const eye = player.eye ? player.eye() : camera.getWorldPosition(new THREE.Vector3());
    const dir = camera.getWorldDirection(new THREE.Vector3());
    let best = null, bestDot = 0.8;
    for (const e of director.alive()) {
      const c = e.center(new THREE.Vector3()), d = c.clone().sub(eye);
      const dist = d.length();
      if (dist > 90) continue;
      const dot = d.normalize().dot(dir);
      if (dot > bestDot) { bestDot = dot; best = c; }
    }
    const target = best ?? eye.clone().addScaledVector(dir.setY(0).normalize(), 25);
    target.y = world.groundHeightAt(target.x, target.z, 0.3, target.y + 3);
    const beam = beamMesh(this.ctx.scene, target);
    for (let k = 0; k < 3; k++) {
      setTimeout(() => {
        const p = target.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6));
        strike(this.ctx, p);
        if (k === 2) beam.remove();
      }, 1200 + k * 380);
    }
  }

  update(dt) {
    if (this.drone && !this.drone.update(dt)) { this.drone.dispose(); this.drone = null; }
  }
}

// Haz de aviso del ataque orbital (se crea al momento: material básico, compila en nada).
let beamGeo = null, beamMat = null;
function beamMesh(scene, at) {
  beamGeo ??= new THREE.CylinderGeometry(0.35, 0.35, 120, 12, 1, true).translate(0, 60, 0);
  beamMat ??= new THREE.MeshBasicMaterial({ color: 0xff5a3a, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const m = new THREE.Mesh(beamGeo, beamMat);
  m.position.copy(at);
  scene.add(m);
  return { remove: () => scene.remove(m) };
}

// Un impacto orbital: explosión grande y daño en área a los enemigos (también como cliente en cooperativo:
// takeDamage de una réplica se lo manda al anfitrión).
function strike(ctx, p) {
  const { fx, sfx, director, player } = ctx;
  fx.explosion(p, 8);
  fx.shockwave?.(p, 10);
  sfx.explosion(p.distanceTo(player.pos));
  if (p.distanceTo(player.pos) < 30) player.shake = Math.min(1, (player.shake ?? 0) + 0.6);
  ctx.killSrc = 'orbital';
  for (const e of director.alive()) {
    const d = e.center(new THREE.Vector3()).distanceTo(p);
    if (d < 8) e.takeDamage(500 * (1 - d / 10), { part: 'body' });
  }
  ctx.killSrc = null;
}

// Dron de apoyo: flota sobre el hombro y dispara al enemigo visible más cercano.
class Drone {
  constructor(ctx) {
    this.ctx = ctx;
    this.t = 0;
    this.life = 25;
    this.cool = 1;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshStandardMaterial({ color: 0x2b3440, metalness: 0.8, roughness: 0.3 }));
    body.scale.set(1.3, 0.6, 1.3);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: 0x7fe7ff, toneMapped: false }));
    eye.position.set(0, -0.05, -0.2);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.015, 6, 24).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x7fe7ff, toneMapped: false }));
    g.add(body, eye, ring);
    this.group = g;
    this.ring = ring;
    this.muzzle = eye;
    g.position.copy(ctx.player.pos).add(new THREE.Vector3(0, 2.4, 0));
    ctx.scene.add(g);
  }

  update(dt) {
    const { player, director, world, fx, sfx } = this.ctx;
    this.t += dt;
    this.life -= dt;
    if (this.life <= 0 || !player.alive) return false;
    // Flota detrás y por encima del jugador, con balanceo.
    const yaw = player.yaw.rotation.y;
    const want = new THREE.Vector3(player.pos.x + Math.sin(yaw) * 1.2 + Math.cos(yaw) * 0.9, player.pos.y + 2.5 + Math.sin(this.t * 2.2) * 0.12, player.pos.z + Math.cos(yaw) * 1.2 - Math.sin(yaw) * 0.9);
    this.group.position.lerp(want, 1 - Math.exp(-dt * 4));
    this.ring.rotation.y += dt * 9;
    this.cool -= dt;
    if (this.cool > 0) return true;
    // Objetivo: el enemigo vivo más cercano a la vista (40 m).
    const from = this.muzzle.getWorldPosition(new THREE.Vector3());
    let target = null, best = 40;
    for (const e of director.alive()) {
      const c = e.center(new THREE.Vector3()), d = c.distanceTo(from);
      if (d < best && world.lineOfSight(from, c)) { best = d; target = { e, c }; }
    }
    if (!target) { this.cool = 0.3; return true; }
    this.group.lookAt(target.c);
    this.cool = 0.45;
    fx.tracer(from, target.c, 0x7fe7ff, { kind: 'projectile' });
    fx.sparks(target.c, 0x7fe7ff);
    sfx.arc?.(from.distanceTo(player.pos) * 0.6);
    this.ctx.killSrc = 'drone';
    target.e.takeDamage(22, { part: 'body' });
    this.ctx.killSrc = null;
    return true;
  }

  dispose() {
    this.ctx.scene.remove(this.group);
    this.group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  }
}
