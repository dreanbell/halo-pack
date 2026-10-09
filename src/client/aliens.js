import * as THREE from 'three';
import { CFG } from './config.js';
import { plate } from './avatar.js';
import { attachMonster } from './monsters.js';

// Modelos procedurales de los alienígenas (miran a +Z). Cada constructor devuelve un "rig":
// { root, hitMeshes, muzzle, bodyMat, shieldMat?, legs[], arms[], head, torso, extras } y animate() lo mueve.
const TAU = Math.PI * 2;
const texCache = new Map();
const geoCache = new Map();
const geo = (key, make) => {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
};
const cap = (r, l) => new THREE.CapsuleGeometry(r, l, 5, 12);
const sph = (r, w = 18, h = 12, ...rest) => new THREE.SphereGeometry(r, w, h, ...rest);
const cone = (r, h, s = 8) => new THREE.ConeGeometry(r, h, s);

// Quitina: escamas superpuestas + venas luminosas (mapa emisivo).
function chitin(type) {
  if (texCache.has(type)) return texCache.get(type);
  const c = CFG.enemies[type];
  const S = 256;
  const mk = () => { const cv = document.createElement('canvas'); cv.width = cv.height = S; return [cv, cv.getContext('2d')]; };
  const [cv, g] = mk(), [ev, e] = mk();
  const base = new THREE.Color(c.body);
  const tone = (l) => { const k = base.clone(); k.offsetHSL(0, 0, l); return `#${k.getHexString()}`; };
  g.fillStyle = tone(0);
  g.fillRect(0, 0, S, S);
  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 10; col++) {
      const x = col * 28 + (row % 2) * 14, y = row * 22;
      const grd = g.createRadialGradient(x, y - 6, 2, x, y, 18);
      grd.addColorStop(0, tone(0.08));
      grd.addColorStop(1, tone(-0.1));
      g.fillStyle = grd;
      g.beginPath(); g.arc(x, y, 16, 0, Math.PI); g.fill();
      g.strokeStyle = tone(-0.18);
      g.lineWidth = 1.5;
      g.stroke();
    }
  }
  e.fillStyle = '#000';
  e.fillRect(0, 0, S, S);
  const glow = `#${new THREE.Color(c.glow).getHexString()}`;
  for (let i = 0; i < 9; i++) {
    for (const [ctx2, w, a] of [[e, 3, 1], [g, 2, 0.5]]) {
      ctx2.strokeStyle = glow;
      ctx2.globalAlpha = a;
      ctx2.lineWidth = w;
      let x = Math.random() * S, y = Math.random() * S;
      ctx2.beginPath();
      ctx2.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        const nx = x + (Math.random() - 0.5) * 120, ny = y + (Math.random() - 0.5) * 120;
        ctx2.quadraticCurveTo((x + nx) / 2 + (Math.random() - 0.5) * 40, (y + ny) / 2 + (Math.random() - 0.5) * 40, nx, ny);
        x = nx; y = ny;
      }
      ctx2.stroke();
      ctx2.globalAlpha = 1;
    }
  }
  const map = new THREE.CanvasTexture(cv), emap = new THREE.CanvasTexture(ev);
  for (const t of [map, emap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.repeat.set(1.5, 1.5); }
  const out = { map, emap };
  texCache.set(type, out);
  return out;
}

// Escudo de energía con brillo de borde (Fresnel).
export function shieldMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, opacity: { value: 0 }, time: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 color; uniform float opacity; uniform float time; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.2);
        float hex = 0.5 + 0.5 * sin(vP.y * 40.0 + time * 3.0) * sin(vP.x * 40.0);
        gl_FragColor = vec4(color, (f * 0.9 + hex * 0.08 + 0.04) * opacity); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
}

class Rig {
  constructor(type) {
    const c = CFG.enemies[type];
    this.type = type;
    this.cfg = c;
    this.root = new THREE.Group();
    this.body = new THREE.Group(); // todo lo que cae al morir
    this.root.add(this.body);
    const tex = chitin(type);
    this.bodyMat = new THREE.MeshStandardMaterial({
      map: tex.map, emissiveMap: tex.emap, emissive: c.glow, emissiveIntensity: 0.9, roughness: 0.42, metalness: 0.35,
    });
    this.darkMat = new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.5, metalness: 0.6 });
    this.glowMat = new THREE.MeshBasicMaterial({ color: c.glow });
    this.mats = [this.bodyMat, this.darkMat, this.glowMat];
    this.hitMeshes = [];
    this.legs = [];
    this.arms = [];
    this.spin = [];
    this.sway = [];
    this.phase = Math.random() * TAU;
    this.t = Math.random() * 10;
    this.muzzle = new THREE.Object3D();
  }

  mesh(parent, g, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = !mat.isMeshBasicMaterial && !mat.isShaderMaterial;
    parent.add(m);
    return m;
  }

  hit(m, part) {
    m.userData.part = part;
    this.hitMeshes.push(m);
    return m;
  }

  group(parent, x = 0, y = 0, z = 0) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  }

  shield(parent, r, y, sy = 1.3) {
    this.shieldMat = shieldMaterial(this.cfg.glow);
    this.mats.push(this.shieldMat);
    const s = this.mesh(parent, geo(`shield${r}`, () => sph(r, 28, 18)), this.shieldMat, 0, y, 0);
    s.scale.y = sy;
    s.renderOrder = 5;
    return s;
  }

  // Pata articulada: cadera → rodilla → pie. knee > 0 = rodilla hacia delante (humano); < 0 = hacia atrás (digitígrada).
  leg(parent, side, x, y, z, thigh, shin, r, knee = 1, phase = 0) {
    const hip = this.group(parent, x, y, z);
    this.mesh(hip, geo(`th${thigh}${r}`, () => cap(r, thigh)), this.bodyMat, 0, -thigh / 2, 0);
    const kn = this.group(hip, 0, -thigh, 0);
    this.mesh(kn, geo(`kn${r}`, () => sph(r * 1.15, 10, 8)), this.darkMat);
    this.mesh(kn, geo(`sh${shin}${r}`, () => cap(r * 0.8, shin)), this.darkMat, 0, -shin / 2, 0);
    const foot = this.group(kn, 0, -shin, 0);
    this.mesh(foot, geo(`ft${r}`, () => plate(r * 2.4, r * 0.9, r * 3.4, r * 0.3)), this.bodyMat, 0, 0, r * 0.8);
    this.legs.push({ hip, kn, foot, side, knee, phase });
  }

  // Animación genérica: andar, inclinación, brillo al recibir daño, muerte.
  animate(dt, s) {
    this.t += dt;
    const sp = Math.min(1.4, (s.speed ?? 0) / Math.max(1, this.cfg.speed));
    if (sp > 0.05) this.phase += dt * (4 + (s.speed ?? 0) * 1.1);
    const sw = Math.sin(this.phase);
    for (const L of this.legs) {
      const p = this.phase + L.phase + (L.side > 0 ? Math.PI : 0);
      const a = Math.sin(p) * 0.6 * sp;
      L.hip.rotation.x = a + (L.knee < 0 ? 0.35 : 0);
      L.kn.rotation.x = (L.knee > 0 ? -1 : 1) * (Math.max(0, Math.cos(p)) * 0.9 * sp + 0.15) + (L.knee < 0 ? 0.5 : 0);
      L.foot.rotation.x = -(L.hip.rotation.x + L.kn.rotation.x);
    }
    if (this.torso) {
      this.torso.position.y = this.torsoY + Math.abs(sw) * 0.04 * sp + Math.sin(this.t * 2) * 0.01;
      this.torso.rotation.y = sw * 0.08 * sp;
    }
    for (const r of this.spin) r.obj.rotation[r.axis] += dt * r.speed * (s.telegraph ? 4 : 1);
    for (const t of this.sway) t.obj.rotation.x = t.base + Math.sin(this.t * t.f + t.o) * t.a;
    if (this.head) this.head.rotation.x = (s.pitch ?? 0) * 0.5;
    if (this.jaw) this.jaw.rotation.x = 0.1 + (s.attack ? 0.5 : Math.abs(Math.sin(this.t * 3)) * 0.12);
    if (this.core) this.core.scale.setScalar(1 + Math.sin(this.t * (s.enraged ? 12 : 4)) * 0.12);
    // Brillo: más intenso al recibir daño, al avisar un ataque o enfurecido.
    const hit = s.hit ?? 0;
    this.bodyMat.emissiveIntensity = 0.9 + hit * 2.5 + (s.telegraph ? 1.5 + Math.sin(this.t * 30) : 0) + (s.enraged ? 0.8 : 0);
    this.bodyMat.color.setRGB(1 + hit * 0.8, 1 - hit * 0.3, 1 - hit * 0.3);
    if (this.shieldMat) {
      this.shieldMat.uniforms.opacity.value = s.shield > 0 ? 0.35 + (s.flash ?? 0) * 0.9 : (s.flash ?? 0) * 0.6;
      this.shieldMat.uniforms.time.value = this.t;
    }
    // Camuflaje (Stalker): casi invisible salvo al atacar o recibir daño.
    if (s.cloak !== undefined) {
      const o = 0.06 + s.cloak * 0.94;
      for (const m of [this.bodyMat, this.darkMat]) { m.transparent = o < 0.99; m.opacity = o; m.depthWrite = o > 0.5; }
      this.glowMat.opacity = 0.35 + s.cloak * 0.65;
      this.glowMat.transparent = true;
    }
    this.monster?.update(dt, s);
  }

  dispose() {
    this.monster?.dispose();
    this.root.parent?.remove(this.root);
    for (const m of this.mats) m.dispose();
  }
}

// --- Modelos por tipo ----------------------------------------------------------
const BUILD = {
  // Depredador bípedo de patas digitígradas con pistola de plasma.
  skitter(r) {
    const hips = this.group(r.body, 0, 0.82, 0);
    const torso = (this.torso = this.group(hips, 0, 0.05, 0));
    this.torsoY = 0.05;
    const chest = this.hit(this.mesh(torso, geo('sk.body', () => sph(0.3, 22, 16)), this.bodyMat, 0, 0.25, 0.05, 0.4), 'body');
    chest.scale.set(0.85, 0.78, 1.3);
    for (let i = 0; i < 4; i++) this.mesh(torso, geo('sk.spine', () => cone(0.05, 0.22, 6)), this.darkMat, 0, 0.47 - i * 0.06, -0.12 - i * 0.1, -0.9);
    const head = (this.head = this.group(torso, 0, 0.5, 0.33));
    this.hit(this.mesh(head, geo('sk.head', () => sph(0.17, 18, 12)), this.bodyMat, 0, 0, 0.05), 'head').scale.set(1, 0.82, 1.35);
    for (const s of [-1, 1]) {
      this.mesh(head, geo('sk.eye', () => new THREE.BoxGeometry(0.07, 0.025, 0.03)), this.glowMat, s * 0.07, 0.04, 0.24, 0, s * 0.3);
      this.mesh(head, geo('sk.mand', () => cone(0.03, 0.18, 6)), this.darkMat, s * 0.07, -0.08, 0.24, 1.9, 0, s * 0.3);
    }
    for (const s of [-1, 1]) {
      const sh = this.group(torso, s * 0.2, 0.32, 0.22);
      this.mesh(sh, geo('sk.arm', () => cap(0.045, 0.2)), this.darkMat, 0, -0.08, 0.08, 1.1);
      if (s > 0) {
        this.mesh(sh, geo('sk.gun', () => plate(0.08, 0.08, 0.26, 0.02)), this.bodyMat, 0, -0.13, 0.26);
        this.mesh(sh, geo('sk.gunGlow', () => sph(0.03, 8, 6)), this.glowMat, 0, -0.13, 0.4);
        sh.add(this.muzzle);
        this.muzzle.position.set(0, -0.13, 0.42);
      }
      this.arms.push({ sh, side: s });
    }
    for (const s of [-1, 1]) this.leg(hips, s, s * 0.15, 0, -0.05, 0.42, 0.42, 0.065, -1);
  },

  // Guerrero alto con armadura, hombreras, cresta y cañón de brazo.
  warden(r) {
    const hips = this.group(r.body, 0, 0.92, 0);
    const torso = (this.torso = this.group(hips, 0, 0.08, 0));
    this.torsoY = 0.08;
    this.hit(this.mesh(torso, geo('wd.chest', () => plate(0.56, 0.5, 0.36, 0.08)), this.bodyMat, 0, 0.32, 0), 'body');
    this.mesh(torso, geo('wd.abs', () => cap(0.18, 0.18)), this.darkMat, 0, 0.02, 0);
    this.mesh(torso, geo('wd.pack', () => plate(0.4, 0.42, 0.18, 0.05)), this.darkMat, 0, 0.36, -0.24);
    for (let i = 0; i < 3; i++) this.mesh(torso, geo('wd.vent', () => new THREE.BoxGeometry(0.28, 0.025, 0.02)), this.glowMat, 0, 0.26 + i * 0.07, -0.34);
    for (const s of [-1, 1]) {
      const p = this.mesh(torso, geo('wd.pad', () => sph(0.17, 18, 10, 0, TAU, 0, Math.PI / 2)), this.bodyMat, s * 0.35, 0.53, 0, 0, 0, -s * 0.45);
      p.scale.set(1.1, 0.75, 1.2);
      this.mesh(torso, geo('wd.padRim', () => new THREE.TorusGeometry(0.17, 0.018, 6, 20).rotateX(Math.PI / 2)), this.glowMat, s * 0.35, 0.53, 0, 0, 0, -s * 0.45);
    }
    const head = (this.head = this.group(torso, 0, 0.62, 0.02));
    this.hit(this.mesh(head, geo('wd.head', () => sph(0.16, 18, 12)), this.bodyMat, 0, 0.06, 0), 'head').scale.set(0.9, 1.1, 1.2);
    this.mesh(head, geo('wd.crest', () => plate(0.04, 0.16, 0.36, 0.015)), this.darkMat, 0, 0.2, -0.04);
    this.mesh(head, geo('wd.visor', () => new THREE.BoxGeometry(0.22, 0.04, 0.06)), this.glowMat, 0, 0.07, 0.16);
    // Cañón en el brazo derecho.
    const sh = this.group(torso, 0.36, 0.4, 0.05);
    this.mesh(sh, geo('wd.upper', () => cap(0.07, 0.22)), this.darkMat, 0, -0.12, 0);
    this.mesh(sh, geo('wd.cannon', () => new THREE.CylinderGeometry(0.08, 0.1, 0.5, 14).rotateX(Math.PI / 2)), this.bodyMat, 0, -0.24, 0.2);
    for (const z of [0.1, 0.25, 0.4]) this.mesh(sh, geo('wd.ring', () => new THREE.TorusGeometry(0.09, 0.012, 6, 16)), this.glowMat, 0, -0.24, z);
    sh.add(this.muzzle);
    this.muzzle.position.set(0, -0.24, 0.48);
    const lsh = this.group(torso, -0.36, 0.4, 0.05);
    this.mesh(lsh, geo('wd.upper', () => cap(0.07, 0.22)), this.darkMat, 0, -0.12, 0);
    this.mesh(lsh, geo('wd.fore', () => cap(0.06, 0.22)), this.bodyMat, 0, -0.3, 0.12, 0.8);
    this.arms.push({ sh, side: 1 }, { sh: lsh, side: -1 });
    for (const s of [-1, 1]) this.leg(hips, s, s * 0.14, 0, 0, 0.44, 0.46, 0.08, 1);
    this.shield(r.body, 0.62, 0.95);
  },

  // Bestia encorvada con antebrazos enormes y cuchillas.
  ravager(r) {
    const hips = this.group(r.body, 0, 0.72, -0.1);
    const torso = (this.torso = this.group(hips, 0, 0.1, 0));
    this.torsoY = 0.1;
    const t = this.hit(this.mesh(torso, geo('rv.body', () => sph(0.42, 24, 16)), this.bodyMat, 0, 0.3, 0.12, 0.5), 'body');
    t.scale.set(1.15, 0.85, 1.25);
    for (let i = 0; i < 5; i++) this.mesh(torso, geo('rv.spike', () => cone(0.06, 0.3, 6)), this.glowMat, (i % 2 ? 1 : -1) * 0.12, 0.62 - i * 0.04, -0.05 - i * 0.1, -0.6);
    const head = (this.head = this.group(torso, 0, 0.32, 0.55));
    this.hit(this.mesh(head, geo('rv.head', () => sph(0.2, 16, 12)), this.bodyMat, 0, 0, 0.05), 'head').scale.set(1.2, 0.8, 1.1);
    for (const s of [-1, 1]) this.mesh(head, geo('rv.tusk', () => cone(0.035, 0.26, 6)), this.darkMat, s * 0.14, -0.08, 0.16, 1.2, 0, -s * 0.5);
    this.jaw = this.mesh(head, geo('rv.jaw', () => plate(0.24, 0.06, 0.2, 0.02)), this.darkMat, 0, -0.12, 0.08);
    for (const s of [-1, 1]) this.mesh(head, geo('rv.eye', () => sph(0.03, 8, 6)), this.glowMat, s * 0.1, 0.04, 0.2);
    for (const s of [-1, 1]) {
      const sh = this.group(torso, s * 0.45, 0.42, 0.25);
      this.mesh(sh, geo('rv.upper', () => cap(0.1, 0.3)), this.bodyMat, 0, -0.2, 0.05, 0.3);
      this.mesh(sh, geo('rv.fore', () => cap(0.13, 0.32)), this.darkMat, 0, -0.52, 0.18, 0.2);
      this.mesh(sh, geo('rv.blade', () => cone(0.05, 0.55, 4)), this.glowMat, 0, -0.62, 0.42, 1.4);
      this.arms.push({ sh, side: s, swing: true });
    }
    for (const s of [-1, 1]) this.leg(hips, s, s * 0.22, 0, -0.1, 0.34, 0.34, 0.1, -1);
  },

  // Dron flotante: núcleo, ojo, anillo giratorio y aletas.
  drone(r) {
    const torso = (this.torso = this.group(r.body, 0, 0, 0));
    this.torsoY = 0;
    this.hit(this.mesh(torso, geo('dr.core', () => sph(0.32, 24, 16)), this.bodyMat), 'body');
    this.hit(this.mesh(torso, geo('dr.eye', () => sph(0.12, 14, 10)), this.glowMat, 0, 0, 0.26), 'head');
    const ring = this.mesh(torso, geo('dr.ring', () => new THREE.TorusGeometry(0.46, 0.035, 8, 32)), this.darkMat, 0, 0, 0, Math.PI / 2);
    this.spin.push({ obj: ring, axis: 'z', speed: 3 });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      this.mesh(torso, geo('dr.fin', () => plate(0.06, 0.32, 0.22, 0.02)), this.bodyMat, Math.cos(a) * 0.32, Math.sin(a) * 0.32 - 0.05, -0.12, 0, 0, a);
    }
    for (const s of [-1, 1]) this.mesh(torso, geo('dr.gun', () => new THREE.CylinderGeometry(0.03, 0.03, 0.22, 8).rotateX(Math.PI / 2)), this.darkMat, s * 0.2, -0.18, 0.2);
    this.mesh(torso, geo('dr.thr', () => sph(0.1, 10, 8)), this.glowMat, 0, -0.28, -0.08).scale.set(1, 0.5, 1);
    torso.add(this.muzzle);
    this.muzzle.position.set(0, -0.18, 0.34);
  },

  // Cazador delgado de extremidades largas y garras; se camufla.
  stalker(r) {
    const hips = this.group(r.body, 0, 0.98, 0);
    const torso = (this.torso = this.group(hips, 0, 0.06, 0));
    this.torsoY = 0.06;
    this.hit(this.mesh(torso, geo('st.body', () => cap(0.15, 0.42)), this.bodyMat, 0, 0.32, 0.05, 0.25), 'body');
    for (let i = 0; i < 3; i++) this.mesh(torso, geo('st.rib', () => new THREE.TorusGeometry(0.15, 0.015, 6, 14, Math.PI)), this.darkMat, 0, 0.22 + i * 0.1, 0.06, -Math.PI / 2 + 0.25);
    const head = (this.head = this.group(torso, 0, 0.66, 0.16));
    this.hit(this.mesh(head, geo('st.head', () => sph(0.12, 16, 12)), this.bodyMat, 0, 0, 0.06), 'head').scale.set(0.8, 0.9, 1.9);
    for (const s of [-1, 1]) this.mesh(head, geo('st.eye', () => new THREE.BoxGeometry(0.05, 0.015, 0.06)), this.glowMat, s * 0.05, 0.02, 0.22, 0, s * 0.4);
    for (const s of [-1, 1]) {
      const sh = this.group(torso, s * 0.2, 0.52, 0.06);
      this.mesh(sh, geo('st.upper', () => cap(0.04, 0.3)), this.darkMat, 0, -0.18, 0.08, 0.5);
      this.mesh(sh, geo('st.fore', () => cap(0.035, 0.32)), this.bodyMat, 0, -0.38, 0.32, 1.3);
      for (const k of [-1, 0, 1]) this.mesh(sh, geo('st.claw', () => cone(0.015, 0.22, 4)), this.glowMat, k * 0.03, -0.42, 0.58, 1.6);
      this.arms.push({ sh, side: s, swing: true });
    }
    for (const s of [-1, 1]) this.leg(hips, s, s * 0.12, 0, 0, 0.5, 0.5, 0.05, -1);
  },

  // Cangrejo blindado con mortero a la espalda.
  bombardier(r) {
    const hips = this.group(r.body, 0, 0.62, 0);
    const torso = (this.torso = this.group(hips, 0, 0, 0));
    this.torsoY = 0;
    this.hit(this.mesh(torso, geo('bb.shell', () => sph(0.5, 26, 14, 0, TAU, 0, Math.PI / 1.8)), this.bodyMat, 0, -0.05, 0), 'body').scale.set(1.25, 0.8, 1.4);
    this.mesh(torso, geo('bb.belly', () => sph(0.45, 20, 10)), this.darkMat, 0, -0.08, 0).scale.set(1.1, 0.35, 1.3);
    const head = (this.head = this.group(torso, 0, 0.02, 0.62));
    this.hit(this.mesh(head, geo('bb.head', () => sph(0.15, 14, 10)), this.bodyMat), 'head').scale.set(1.3, 0.7, 1);
    for (const s of [-1, 1]) this.mesh(head, geo('bb.eye', () => sph(0.035, 8, 6)), this.glowMat, s * 0.1, 0.05, 0.1);
    const mortar = this.group(torso, 0, 0.38, -0.1);
    mortar.rotation.x = -0.75;
    this.mesh(mortar, geo('bb.tube', () => new THREE.CylinderGeometry(0.12, 0.15, 0.6, 16, 1, true)), this.darkMat, 0, 0.25, 0).material.side = THREE.DoubleSide;
    this.mesh(mortar, geo('bb.ring', () => new THREE.TorusGeometry(0.13, 0.02, 6, 18).rotateX(Math.PI / 2)), this.glowMat, 0, 0.52, 0);
    this.mesh(mortar, geo('bb.base', () => sph(0.2, 14, 10)), this.bodyMat, 0, 0, 0);
    mortar.add(this.muzzle);
    this.muzzle.position.set(0, 0.6, 0);
    for (const z of [-0.35, 0, 0.35]) for (const s of [-1, 1]) this.leg(hips, s, s * 0.45, -0.05, z, 0.32, 0.4, 0.05, -1, z * 3);
    for (const L of this.legs) L.hip.rotation.z = L.side * 0.6;
    this.shield(r.body, 0.85, 0.7, 0.8);
  },

  // Jefe: coloso con corona de púas, núcleo en el pecho y martillo.
  warlord(r) {
    BUILD.warden.call(this, r);
    const torso = this.torso;
    this.core = this.mesh(torso, geo('wl.core', () => sph(0.09, 16, 12)), this.glowMat, 0, 0.36, 0.2);
    for (let i = 0; i < 7; i++) {
      const a = (i / 6 - 0.5) * 2.2;
      this.mesh(this.head, geo('wl.crown', () => cone(0.03, 0.22, 6)), this.glowMat, Math.sin(a) * 0.14, 0.24 + Math.cos(a) * 0.04, Math.cos(a) * 0.02 - 0.02, -0.2, 0, -a * 0.6);
    }
    for (const s of [-1, 1]) this.mesh(torso, geo('wl.horn', () => cone(0.05, 0.35, 6)), this.darkMat, s * 0.42, 0.72, -0.05, 0, 0, -s * 0.5);
    const lsh = this.arms[1].sh;
    this.mesh(lsh, geo('wl.haft', () => new THREE.CylinderGeometry(0.025, 0.025, 0.9, 8)), this.darkMat, 0, -0.5, 0.3, 1.2);
    this.mesh(lsh, geo('wl.hammer', () => plate(0.3, 0.24, 0.2, 0.05)), this.bodyMat, 0, -0.28, 0.72);
    this.mesh(lsh, geo('wl.hglow', () => new THREE.BoxGeometry(0.32, 0.04, 0.22)), this.glowMat, 0, -0.28, 0.72);
  },

  // Jefe volador: caparazón, ojo central y tentáculos.
  overseer(r) {
    const torso = (this.torso = this.group(r.body, 0, 0, 0));
    this.torsoY = 0;
    this.hit(this.mesh(torso, geo('ov.shell', () => sph(0.7, 32, 16, 0, TAU, 0, Math.PI / 2)), this.bodyMat), 'body').scale.set(1.3, 0.55, 1.5);
    this.mesh(torso, geo('ov.under', () => new THREE.CircleGeometry(0.88, 32).rotateX(Math.PI / 2)), this.glowMat, 0, -0.01, 0).scale.set(1, 1, 1.15);
    this.hit(this.mesh(torso, geo('ov.eye', () => sph(0.22, 20, 14)), this.darkMat, 0, -0.12, 0.55), 'head');
    this.core = this.mesh(torso, geo('ov.pupil', () => sph(0.12, 14, 10)), this.glowMat, 0, -0.12, 0.7);
    const ring = this.mesh(torso, geo('ov.ring', () => new THREE.TorusGeometry(1.0, 0.04, 8, 40)), this.darkMat, 0, 0.05, 0, Math.PI / 2);
    this.spin.push({ obj: ring, axis: 'z', speed: 0.6 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const t = this.group(torso, Math.cos(a) * 0.6, -0.05, Math.sin(a) * 0.7);
      this.mesh(t, geo('ov.tent', () => cap(0.06, 0.8)), this.bodyMat, 0, -0.45, 0);
      this.mesh(t, geo('ov.tip', () => sph(0.05, 8, 6)), this.glowMat, 0, -0.92, 0);
      this.sway.push({ obj: t, base: 0, a: 0.35, f: 1.6, o: i });
    }
    torso.add(this.muzzle);
    this.muzzle.position.set(0, -0.2, 0.8);
    this.shield(r.body, 1.25, 0, 0.7);
  },
};

export function buildAlien(type) {
  const rig = new Rig(type);
  BUILD[type].call(rig, rig);
  rig.root.scale.setScalar(rig.cfg.scale);
  rig.root.traverse((o) => { if (o.isMesh && o.userData.part) o.castShadow = true; });
  // Si el modelo de criatura está cargado, sustituye la apariencia (el rig sigue como esqueleto de hitboxes).
  rig.monster = attachMonster(rig, type);
  return rig;
}
