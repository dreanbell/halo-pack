import * as THREE from 'three';
import { sanitizeSkin } from '../shared/skins.js';
import { buildGun } from './guns.js';
import { PlayerModel, hasPlayerModel, requestPlayerModel } from './playermodels.js';

// Soldado acorazado procedural (diseño original): esqueleto de grupos + piezas compartidas.
// Mira hacia -Z, como la cámara. Pies en y = 0.
const HIP_Y = 0.98;
const TAU = Math.PI * 2;
const UPPER = 0.28, LOWER = 0.27; // longitudes de brazo y antebrazo
const DOWN = new THREE.Vector3(0, -1, 0);
const _t = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Vector3(), _u = new THREE.Vector3(), _q = new THREE.Quaternion();

// --- Texturas y materiales (cacheados por skin) --------------------------------
const texCache = new Map();
const matCache = new Map();

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

function shade(hex, l) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, l);
  return `#${c.getHexString()}`;
}

function finishTexture(c, repeat) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.repeat.set(repeat, repeat);
  return t;
}

function armorTexture(skin) {
  const key = `${skin.p}|${skin.s}|${skin.t}${skin.t === 8 ? `|${skin.v}` : ''}`;
  if (texCache.has(key)) return texCache.get(key);
  const S = 512;
  const [c, g] = canvas(S);
  g.fillStyle = skin.p;
  g.fillRect(0, 0, S, S);
  if (skin.t === 1) { // camuflaje
    const cols = [shade(skin.p, -0.1), shade(skin.p, 0.07), shade(skin.s, 0.04), shade(skin.p, -0.04)];
    for (let i = 0; i < 170; i++) {
      g.fillStyle = cols[i % cols.length];
      g.beginPath();
      g.ellipse(Math.random() * S, Math.random() * S, 18 + Math.random() * 60, 10 + Math.random() * 34, Math.random() * Math.PI, 0, TAU);
      g.fill();
    }
  } else if (skin.t === 2) { // rayas diagonales
    g.save();
    g.translate(S / 2, S / 2);
    g.rotate(-0.65);
    g.fillStyle = skin.s;
    for (let x = -S; x < S; x += 96) g.fillRect(x, -S, 30, S * 2);
    g.fillStyle = shade(skin.s, 0.15);
    for (let x = -S; x < S; x += 96) g.fillRect(x + 34, -S, 6, S * 2);
    g.restore();
  } else if (skin.t === 3) { // hexágonos
    g.strokeStyle = shade(skin.s, 0.08);
    g.lineWidth = 3;
    const r = 22, w = r * Math.sqrt(3);
    for (let row = -1; row < S / (r * 1.5) + 1; row++) {
      for (let col = -1; col < S / w + 1; col++) {
        const cx = col * w + (row % 2 ? w / 2 : 0), cy = row * r * 1.5;
        g.beginPath();
        for (let k = 0; k <= 6; k++) {
          const a = Math.PI / 6 + (k * Math.PI) / 3;
          g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        }
        g.stroke();
      }
    }
  } else if (skin.t === 4) { // digital: píxeles en tres tonos
    const cols = [shade(skin.p, -0.12), shade(skin.s, 0.05), shade(skin.p, 0.08)];
    for (let i = 0; i < 900; i++) {
      g.fillStyle = cols[i % 3];
      const x = Math.floor(Math.random() * 32) * 16, y = Math.floor(Math.random() * 32) * 16;
      g.fillRect(x, y, 16 * (1 + (Math.random() * 3 | 0)), 16 * (1 + (Math.random() * 2 | 0)));
    }
  } else if (skin.t === 5) { // tigre: franjas onduladas
    g.fillStyle = skin.s;
    for (let y = -20; y < S + 40; y += 44) {
      g.beginPath();
      const th = 10 + Math.random() * 10;
      for (let x = 0; x <= S; x += 16) g.lineTo(x, y + Math.sin(x / 40 + y) * 12 + Math.sin(x / 13) * 4);
      for (let x = S; x >= 0; x -= 16) g.lineTo(x, y + th + Math.sin(x / 40 + y) * 12 - Math.abs(Math.sin(x / 23)) * th * 0.8);
      g.fill();
    }
  } else if (skin.t === 6) { // fibra de carbono: tejido en diagonal
    const a = shade(skin.p, -0.18), b = shade(skin.p, 0.06);
    for (let y = 0; y < S; y += 16) {
      for (let x = 0; x < S; x += 16) {
        const grd = (x / 16 + y / 16) % 2 ? g.createLinearGradient(x, y, x + 16, y) : g.createLinearGradient(x, y, x, y + 16);
        grd.addColorStop(0, a); grd.addColorStop(0.5, b); grd.addColorStop(1, a);
        g.fillStyle = grd;
        g.fillRect(x, y, 16, 16);
      }
    }
  } else if (skin.t === 7) { // circuito: pistas y nodos en el color secundario
    g.strokeStyle = shade(skin.s, 0.2);
    g.fillStyle = shade(skin.s, 0.3);
    g.lineWidth = 4;
    for (let i = 0; i < 60; i++) {
      let x = Math.floor(Math.random() * 16) * 32, y = Math.floor(Math.random() * 16) * 32;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        if (Math.random() < 0.5) x += (Math.random() < 0.5 ? -1 : 1) * 32 * (1 + (Math.random() * 3 | 0));
        else y += (Math.random() < 0.5 ? -1 : 1) * 32 * (1 + (Math.random() * 3 | 0));
        g.lineTo(x, y);
      }
      g.stroke();
      g.beginPath(); g.arc(x, y, 7, 0, TAU); g.fill();
    }
  } else if (skin.t === 8) { // neón: fondo oscuro con rejilla y trazos luminosos (brillan: emissiveMap)
    g.fillStyle = '#05080c';
    g.fillRect(0, 0, S, S);
    g.strokeStyle = shade(skin.v, 0.1);
    g.shadowColor = skin.v;
    g.shadowBlur = 10;
    g.lineWidth = 3;
    for (let p = 0; p < S; p += 64) {
      g.beginPath(); g.moveTo(p, 0); g.lineTo(p, S); g.stroke();
      g.beginPath(); g.moveTo(0, p); g.lineTo(S, p); g.stroke();
    }
    g.lineWidth = 5;
    for (let i = 0; i < 14; i++) {
      const x = Math.floor(Math.random() * 8) * 64, y = Math.floor(Math.random() * 8) * 64;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 64, y + 64); g.stroke();
    }
    g.shadowBlur = 0;
  } else if (skin.t === 9) { // oro: dorado con grabado de volutas
    const grd = g.createLinearGradient(0, 0, S, S);
    grd.addColorStop(0, '#b8862b'); grd.addColorStop(0.5, '#f3cf6a'); grd.addColorStop(1, '#a8761f');
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(90,55,10,0.45)';
    g.lineWidth = 2.5;
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * S, y = Math.random() * S, rr = 14 + Math.random() * 26;
      g.beginPath();
      for (let a = 0; a < TAU * 1.6; a += 0.2) g.lineTo(x + Math.cos(a) * rr * (a / 10), y + Math.sin(a) * rr * (a / 10));
      g.stroke();
    }
  }
  // Ruido de fabricación.
  const img = g.getImageData(0, 0, S, S);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 18;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  // Juntas de paneles y remaches.
  g.strokeStyle = 'rgba(0,0,0,0.38)';
  g.lineWidth = 2;
  for (let p = 64; p < S; p += 128) {
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, S); g.stroke();
    g.beginPath(); g.moveTo(0, p + 32); g.lineTo(S, p + 32); g.stroke();
  }
  g.fillStyle = 'rgba(0,0,0,0.45)';
  for (let p = 64; p < S; p += 128) for (let q = 20; q < S; q += 64) { g.beginPath(); g.arc(p + 7, q, 2.2, 0, TAU); g.fill(); }
  // Desgaste: arañazos claros y bordes gastados.
  for (let i = 0; i < 140; i++) {
    g.strokeStyle = `rgba(255,255,255,${0.06 + Math.random() * 0.12})`;
    g.lineWidth = 1 + Math.random();
    const x = Math.random() * S, y = Math.random() * S, a = Math.random() * TAU, l = 4 + Math.random() * 16;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  const t = finishTexture(c, 2.5);
  texCache.set(key, t);
  return t;
}

let suitTex = null;
function suitTexture() {
  if (suitTex) return suitTex;
  const S = 256;
  const [c, g] = canvas(S);
  g.fillStyle = '#23272c';
  g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(0,0,0,0.55)';
  g.lineWidth = 2;
  for (let p = 0; p <= S; p += 16) {
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p + S / 4, S); g.stroke();
    g.beginPath(); g.moveTo(0, p); g.lineTo(S, p - S / 4); g.stroke();
  }
  g.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 600; i++) g.fillRect(Math.random() * S, Math.random() * S, 1, 1);
  suitTex = finishTexture(c, 4);
  return suitTex;
}

export function skinMaterials(skinIn) {
  const skin = sanitizeSkin(skinIn);
  const key = JSON.stringify({ ...skin, f: 0 }); // los acabados de arma no cambian la armadura
  if (matCache.has(key)) return matCache.get(key);
  const visorCol = new THREE.Color(skin.v);
  const m = {
    armor: new THREE.MeshStandardMaterial({ map: armorTexture(skin), metalness: 0.45, roughness: 0.38 }),
    trim: new THREE.MeshStandardMaterial({ color: skin.s, metalness: 0.65, roughness: 0.3 }),
    suit: new THREE.MeshStandardMaterial({ map: suitTexture(), metalness: 0.15, roughness: 0.82 }),
    visor: new THREE.MeshPhysicalMaterial({
      color: visorCol, metalness: 1, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.04,
      emissive: visorCol, emissiveIntensity: 0.12, envMapIntensity: 1.6,
    }),
    glow: new THREE.MeshBasicMaterial({ color: visorCol.clone().multiplyScalar(1.15) }),
    gun: new THREE.MeshStandardMaterial({ color: 0x2b3036, metalness: 0.75, roughness: 0.32 }),
  };
  // Patrones de caja: ORO metálico y pulido; NEÓN con líneas que brillan.
  if (skin.t === 9) Object.assign(m.armor, { metalness: 0.95, roughness: 0.22 });
  if (skin.t === 8) Object.assign(m.armor, { emissive: new THREE.Color(0xffffff), emissiveMap: m.armor.map, emissiveIntensity: 0.55 });
  matCache.set(key, m);
  return m;
}

// --- Geometrías compartidas --------------------------------------------------
// Placa con bordes biselados (ExtrudeGeometry de un rectángulo redondeado).
export function plate(w, h, d, r = Math.min(w, h, d) * 0.25) {
  const s = new THREE.Shape();
  const x = -w / 2 + r * 0.6, y = -h / 2 + r * 0.6, W = w - r * 1.2, H = h - r * 1.2, c = Math.min(W, H) * 0.25;
  s.moveTo(x + c, y);
  s.lineTo(x + W - c, y); s.quadraticCurveTo(x + W, y, x + W, y + c);
  s.lineTo(x + W, y + H - c); s.quadraticCurveTo(x + W, y + H, x + W - c, y + H);
  s.lineTo(x + c, y + H); s.quadraticCurveTo(x, y + H, x, y + H - c);
  s.lineTo(x, y + c); s.quadraticCurveTo(x, y, x + c, y);
  const depth = Math.max(0.002, d - r * 1.2);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: r * 0.6, bevelSize: r * 0.6, bevelSegments: 3, curveSegments: 4 });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return g;
}

let G = null;
function geos() {
  if (G) return G;
  const cap = (r, l) => new THREE.CapsuleGeometry(r, l, 6, 14);
  const domePts = [[0.118, 0], [0.15, 0.04], [0.165, 0.12], [0.16, 0.2], [0.132, 0.262], [0.075, 0.298], [0, 0.31]].map(([x, y]) => new THREE.Vector2(x, y));
  const visor = (t0, t1, width) => new THREE.SphereGeometry(0.169, 32, 16, Math.PI * 1.5 - width / 2, width, t0, t1 - t0);
  G = {
    pelvis: cap(0.13, 0.12).rotateZ(Math.PI / 2),
    belt: new THREE.TorusGeometry(0.168, 0.017, 8, 32).rotateX(Math.PI / 2),
    buckle: plate(0.11, 0.07, 0.04),
    abdomen: cap(0.14, 0.14),
    abPlate: plate(0.12, 0.07, 0.05),
    chest: plate(0.46, 0.3, 0.27, 0.06),
    chestTrim: plate(0.44, 0.045, 0.285, 0.015),
    collar: new THREE.TorusGeometry(0.095, 0.022, 8, 20).rotateX(Math.PI / 2),
    backpack: plate(0.34, 0.38, 0.13, 0.04),
    vent: new THREE.BoxGeometry(0.06, 0.012, 0.02),
    strip: new THREE.BoxGeometry(0.07, 0.014, 0.01),
    neck: cap(0.06, 0.05),
    dome: new THREE.LatheGeometry(domePts, 28),
    visorWide: visor(1.2, 1.82, 1.7),
    visorSlit: visor(1.4, 1.68, 2.0),
    visorBox: visor(1.22, 1.78, 1.6),
    chin: plate(0.17, 0.07, 0.08, 0.02),
    jaw: plate(0.26, 0.11, 0.15, 0.03),
    crest: plate(0.03, 0.09, 0.26, 0.012),
    cheek: plate(0.03, 0.12, 0.17, 0.012),
    ear: new THREE.CylinderGeometry(0.035, 0.042, 0.035, 16).rotateZ(Math.PI / 2),
    antenna: new THREE.CylinderGeometry(0.006, 0.01, 0.24, 6),
    pauldron: new THREE.SphereGeometry(0.12, 22, 10, 0, TAU, 0, Math.PI / 2),
    pauldronRim: new THREE.TorusGeometry(0.118, 0.012, 6, 22).rotateX(Math.PI / 2),
    upperArm: cap(0.064, 0.17),
    bicep: new THREE.CylinderGeometry(0.078, 0.07, 0.14, 14),
    elbow: new THREE.SphereGeometry(0.055, 12, 8),
    forearm: cap(0.055, 0.15),
    gauntlet: new THREE.CylinderGeometry(0.072, 0.06, 0.18, 14),
    hand: plate(0.075, 0.1, 0.09, 0.02),
    thigh: cap(0.085, 0.27),
    thighPlate: plate(0.16, 0.24, 0.07, 0.02),
    knee: plate(0.12, 0.13, 0.07, 0.025),
    shin: cap(0.068, 0.29),
    shinGuard: new THREE.CylinderGeometry(0.083, 0.068, 0.3, 14),
    boot: plate(0.13, 0.11, 0.28, 0.03),
    toe: plate(0.12, 0.05, 0.1, 0.02),
    gunBody: plate(0.07, 0.11, 0.5, 0.015),
    gunMag: plate(0.05, 0.14, 0.07, 0.012),
    gunBarrel: new THREE.CylinderGeometry(0.014, 0.014, 0.28, 10).rotateX(Math.PI / 2),
    gunStock: plate(0.06, 0.09, 0.16, 0.015),
    sight: new THREE.BoxGeometry(0.03, 0.02, 0.05),
    hitHead: new THREE.SphereGeometry(0.2, 8, 6),
    hitTorso: new THREE.BoxGeometry(0.54, 0.64, 0.4),
    hitLegs: new THREE.BoxGeometry(0.4, 0.94, 0.32),
  };
  return G;
}

const HIT_MAT = new THREE.MeshBasicMaterial({ visible: false });

// --- Avatar ------------------------------------------------------------------
export class Avatar {
  constructor(skin) {
    this.skin = sanitizeSkin(skin);
    this.m = skinMaterials(this.skin);
    this.meshes = [];
    this.hitboxes = [];
    this.phase = 0;
    this.amp = 0;
    this.crouchK = 0;
    this.airK = 0;
    this.deadK = 0;
    this.sprintK = 0;
    this.slideK = 0;
    this.t = Math.random() * 10;
    this.root = new THREE.Group();
    this.hipY = HIP_Y;
    this.lowerArm = LOWER;
    this.build();
    this.syncModel();
  }

  // Skin 3D (modelo importado) o soldado procedural. El esqueleto procedural se queda (invisible con
  // modelo): sigue animando, lleva el arma y las hitboxes, y el modelo copia su pose.
  syncModel() {
    if (this.skin.m) requestPlayerModel(this.skin.m); // si no está cargado, se pone solo al terminar (animate)
    const want = hasPlayerModel(this.skin.m) ? this.skin.m : 0;
    if (this.model && this.model.m === want) this.model.applySkin(this.skin);
    else {
      this.model?.dispose();
      this.model = want ? new PlayerModel(this, want) : null;
    }
    for (const m of this.meshes) m.visible = !this.model;
  }

  mesh(parent, geo, role, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(geo, this.m[role]);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = role !== 'glow';
    m.userData.role = role;
    parent.add(m);
    this.meshes.push(m);
    return m;
  }

  hitbox(parent, geo, part, y) {
    const h = new THREE.Mesh(geo, HIT_MAT);
    h.position.y = y;
    h.userData.part = part;
    parent.add(h);
    this.hitboxes.push(h);
    return h;
  }

  build() {
    const g = geos();
    const body = (this.body = new THREE.Group());
    this.root.add(body);

    // Cadera
    const hips = (this.hips = new THREE.Group());
    hips.position.y = HIP_Y;
    body.add(hips);
    this.mesh(hips, g.pelvis, 'suit');
    this.mesh(hips, g.belt, 'trim', 0, 0.04, 0);
    this.mesh(hips, g.buckle, 'trim', 0, 0.04, -0.17);
    this.mesh(hips, g.strip, 'glow', 0, 0.04, -0.195);
    this.hitbox(hips, g.hitLegs, 'body', -0.47);

    // Torso
    const spine = (this.spine = new THREE.Group());
    spine.position.y = 0.06;
    hips.add(spine);
    this.mesh(spine, g.abdomen, 'suit', 0, 0.13, 0);
    for (const [x, y] of [[-0.065, 0.1], [0.065, 0.1], [-0.065, 0.185], [0.065, 0.185]]) this.mesh(spine, g.abPlate, 'armor', x, y, -0.115);
    this.mesh(spine, g.chest, 'armor', 0, 0.37, -0.01);
    this.mesh(spine, g.chestTrim, 'trim', 0, 0.235, -0.01);
    for (const x of [-0.13, 0.13]) this.mesh(spine, g.strip, 'glow', x, 0.43, -0.152);
    this.mesh(spine, g.collar, 'trim', 0, 0.53, 0);
    this.mesh(spine, g.backpack, 'trim', 0, 0.34, 0.2);
    for (const y of [0.24, 0.3, 0.36]) this.mesh(spine, g.vent, 'glow', 0, y, 0.272);
    this.hitbox(spine, g.hitTorso, 'body', 0.3);

    // Cabeza
    const neck = (this.neck = new THREE.Group());
    neck.position.y = 0.55;
    spine.add(neck);
    this.mesh(neck, g.neck, 'suit', 0, 0.03, 0);
    const head = (this.head = new THREE.Group());
    head.position.y = 0.06;
    neck.add(head);
    this.hitbox(head, g.hitHead, 'head', 0.15);
    this.buildHelmet();

    // Brazos
    this.arms = {};
    for (const side of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(side * 0.26, 0.45, 0);
      spine.add(sh);
      this.mesh(spine, g.pauldron, 'armor', side * 0.29, 0.47, 0, 0, 0, -side * 0.42).scale.set(1, 0.62, 1.1);
      this.mesh(spine, g.pauldronRim, 'trim', side * 0.29, 0.47, 0, 0, 0, -side * 0.42).scale.set(1, 1, 1.1);
      this.mesh(sh, g.upperArm, 'suit', 0, -0.13, 0);
      this.mesh(sh, g.bicep, 'armor', 0, -0.12, 0);
      const el = new THREE.Group();
      el.position.y = -0.28;
      sh.add(el);
      this.mesh(el, g.elbow, 'trim', 0, 0, 0.01);
      this.mesh(el, g.forearm, 'suit', 0, -0.12, 0);
      this.mesh(el, g.gauntlet, 'armor', 0, -0.13, 0);
      this.mesh(el, g.hand, 'suit', 0, -0.27, 0);
      this.arms[side] = { sh, el };
    }

    // Piernas
    this.legs = {};
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.11, -0.04, 0);
      hips.add(hip);
      this.mesh(hip, g.thigh, 'suit', 0, -0.2, 0);
      this.mesh(hip, g.thighPlate, 'armor', side * 0.01, -0.19, -0.07, 0.05, 0, 0);
      const knee = new THREE.Group();
      knee.position.y = -0.44;
      hip.add(knee);
      this.mesh(knee, g.knee, 'armor', 0, 0.005, -0.07, -0.15, 0, 0);
      this.mesh(knee, g.shin, 'suit', 0, -0.21, 0);
      this.mesh(knee, g.shinGuard, 'armor', 0, -0.22, -0.012).scale.set(1, 1, 0.92);
      const ankle = new THREE.Group();
      ankle.position.y = -0.45;
      knee.add(ankle);
      this.mesh(ankle, g.boot, 'trim', 0, -0.025, -0.05);
      this.mesh(ankle, g.toe, 'armor', 0, 0.01, -0.15);
      this.legs[side] = { hip, knee, ankle };
    }

    // Fusil en las manos (sigue la inclinación del torso).
    const gun = (this.gun = new THREE.Group());
    gun.position.set(0.12, 0.27, -0.34);
    spine.add(gun);
    this.setWeapon('rifle');
  }

  // Cambia el arma que lleva en las manos (las manos se recolocan por IK en sus empuñaduras).
  setWeapon(id, finish = 0) {
    if (this.weaponId === id && this.finish === finish) return;
    this.weaponId = id;
    this.finish = finish;
    this.gun.clear();
    const model = buildGun(id, finish);
    this.gun.add(model.group);
    this.grips = model.grips;
  }

  buildHelmet() {
    const g = geos();
    if (this.helmet) {
      this.head.remove(this.helmet);
      this.meshes = this.meshes.filter((m) => !m.userData.helmet);
    }
    const h = (this.helmet = new THREE.Group());
    this.head.add(h);
    const add = (...a) => { const m = this.mesh(h, ...a); m.userData.helmet = true; return m; };
    const type = this.skin.h;
    const dome = add(g.dome, 'armor', 0, 0, 0);
    if (type === 0) { // CENTINELA: visor amplio, mentonera y discos laterales
      add(g.visorWide, 'visor', 0, 0.13, -0.008);
      add(g.chin, 'armor', 0, 0.045, -0.115, 0.55, 0, 0);
      for (const s of [-1, 1]) add(g.ear, 'trim', s * 0.163, 0.12, 0.015);
    } else if (type === 1) { // HALCÓN: visor rasgado, cresta y mejillas afiladas
      dome.scale.set(0.96, 1.05, 1.08);
      add(g.visorSlit, 'visor', 0, 0.135, -0.012);
      add(g.crest, 'trim', 0, 0.3, 0.02);
      for (const s of [-1, 1]) add(g.cheek, 'armor', s * 0.13, 0.07, -0.06, 0.25, s * 0.35, 0);
      add(g.chin, 'trim', 0, 0.04, -0.115, 0.6, 0, 0).scale.set(0.85, 0.85, 1);
    } else if (type === 3) { // ESPECTRO: casco alargado, visor rasgado brillante, doble cresta y aletas traseras
      dome.scale.set(0.94, 1.1, 1.14);
      add(g.visorSlit, 'visor', 0, 0.14, -0.014).scale.set(1.02, 1.15, 1.02);
      for (const s of [-1, 1]) {
        add(g.crest, 'trim', s * 0.045, 0.29, 0.03);
        add(g.cheek, 'trim', s * 0.12, 0.18, 0.11, -0.5, s * 0.25, 0);
        add(g.vent, 'glow', s * 0.155, 0.16, -0.04, 0, 0, Math.PI / 2);
      }
      add(g.chin, 'armor', 0, 0.035, -0.11, 0.7, 0, 0).scale.set(0.7, 1, 1.1);
    } else if (type === 4) { // CORSARIO: visor amplio, mandíbula blindada, orejeras y doble antena
      dome.scale.set(1.05, 1, 1.05);
      add(g.visorWide, 'visor', 0, 0.13, -0.01).scale.set(1.03, 0.9, 1.03);
      add(g.jaw, 'armor', 0, 0.035, -0.095, 0.25, 0, 0).scale.set(0.95, 0.9, 1);
      for (const s of [-1, 1]) {
        add(g.ear, 'trim', s * 0.17, 0.12, 0.01).scale.set(1.2, 1.2, 1.2);
        add(g.antenna, 'trim', s * 0.12, 0.33, 0.09, 0, 0, s * 0.2);
      }
      add(g.vent, 'glow', 0, 0.255, -0.09);
    } else { // BASTIÓN: casco ancho, mandíbula pesada, antena y respiraderos
      dome.scale.set(1.12, 0.96, 1.08);
      add(g.visorBox, 'visor', 0, 0.135, -0.01).scale.set(1.1, 0.92, 1);
      add(g.jaw, 'trim', 0, 0.03, -0.1, 0.2, 0, 0);
      add(g.antenna, 'trim', 0.13, 0.33, 0.08);
      for (const s of [-1, 1]) add(g.vent, 'glow', s * 0.17, 0.1, 0.02, 0, 0, Math.PI / 2);
    }
  }

  setSkin(skin) {
    const next = sanitizeSkin(skin);
    const helmetChanged = next.h !== this.skin.h;
    this.skin = next;
    this.m = skinMaterials(next);
    for (const m of this.meshes) m.material = this.m[m.userData.role];
    if (helmetChanged) this.buildHelmet();
    this.syncModel();
  }

  // Asocia las cajas de impacto a un jugador remoto.
  setOwner(owner) {
    for (const h of this.hitboxes) h.userData = { remote: owner, part: h.userData.part };
  }

  // s: { speed, air, crouch (0..1), pitch, alive, sprint, slide }
  animate(dt, s) {
    const k = 1 - Math.exp(-dt * 10);
    this.t += dt;
    this.amp += (Math.min(1.35, s.speed / 6) - this.amp) * k;
    this.crouchK += ((s.crouch ?? 0) - this.crouchK) * k;
    this.airK += ((s.air ? 1 : 0) - this.airK) * k;
    this.sprintK += ((s.sprint ? 1 : 0) - this.sprintK) * k;
    this.slideK += ((s.slide ? 1 : 0) - this.slideK) * (1 - Math.exp(-dt * 14));
    this.deadK += ((s.alive === false ? 1 : 0) - this.deadK) * (1 - Math.exp(-dt * 5));
    const a = this.amp * (1 - this.airK);
    if (this.amp > 0.04) this.phase += dt * (3 + s.speed * 1.05);
    const sw = Math.sin(this.phase), cw = Math.cos(this.phase);
    const breathe = Math.sin(this.t * 1.8) * 0.012 * (1 - this.amp);

    for (const side of [-1, 1]) {
      const L = this.legs[side];
      const s1 = side < 0 ? sw : -sw, c1 = side < 0 ? cw : -cw;
      L.hip.rotation.x = s1 * 0.62 * a + this.crouchK * 1.05 + this.airK * 0.6;
      L.knee.rotation.x = -(Math.max(0, c1) * 1.05 * a + 0.04) - this.crouchK * 1.8 - this.airK * 1.0;
      L.ankle.rotation.x = -(L.hip.rotation.x + L.knee.rotation.x) * 0.85;
      L.hip.rotation.z = side * 0.03;
      // Deslizamiento: pierna derecha estirada al frente, izquierda plegada debajo.
      const sk = this.slideK;
      if (sk > 0.01) {
        L.hip.rotation.x += ((side > 0 ? 1.45 : 0.35) - L.hip.rotation.x) * sk;
        L.knee.rotation.x += ((side > 0 ? -0.12 : -2.0) - L.knee.rotation.x) * sk;
        L.ankle.rotation.x += ((side > 0 ? -0.5 : 0.9) - L.ankle.rotation.x) * sk;
      }
    }
    this.hips.position.y = HIP_Y - this.crouchK * 0.4 * (1 - this.slideK) - this.slideK * 0.62 - Math.abs(sw) * 0.035 * a * (1 - this.slideK) + breathe;
    this.hips.rotation.y = sw * 0.06 * a;

    const pitch = s.pitch ?? 0;
    this.spine.rotation.x = pitch * 0.45 - this.sprintK * 0.22 * this.amp - this.crouchK * 0.12 * (1 - this.slideK) + this.slideK * 0.38;
    this.spine.rotation.y = -sw * 0.1 * a;
    this.head.rotation.x = pitch * 0.4;

    // Fusil: se baja al esprintar; las manos lo siguen con IK.
    const low = this.sprintK;
    this.gun.position.set(0.11 - low * 0.05, 0.27 - low * 0.12 + sw * 0.01 * a, -0.33 + low * 0.08);
    this.gun.rotation.set(-low * 0.5, low * 0.55, low * 0.2);
    this.solveArm(this.arms[1], ...this.grips.r, 1);
    this.solveArm(this.arms[-1], ...this.grips.l, -1);

    // Muerte: cae de bruces.
    this.body.rotation.x = -this.deadK * Math.PI / 2;
    this.body.position.y = this.deadK * 0.16;

    // Si el modelo de la skin terminó de cargar después de crear el avatar, se pone ahora.
    if (!this.model && this.skin.m && hasPlayerModel(this.skin.m)) this.syncModel();
    this.model?.update();
  }

  // IK de dos huesos: lleva la mano al punto (x, y, z) del fusil; el codo apunta hacia fuera y abajo.
  solveArm(arm, x, y, z, side) {
    const S = arm.sh.position;
    _t.set(x, y, z).applyEuler(this.gun.rotation).add(this.gun.position);
    _d.subVectors(_t, S);
    const len = Math.min(Math.max(_d.length(), 0.08), UPPER + LOWER - 0.002);
    _d.normalize();
    const cosA = (UPPER * UPPER + len * len - LOWER * LOWER) / (2 * UPPER * len);
    const A = Math.acos(Math.min(1, Math.max(-1, cosA)));
    _p.set(side * 0.7, -1, 0.35);
    _p.addScaledVector(_d, -_p.dot(_d)).normalize(); // polo perpendicular a la dirección
    _e.copy(S).addScaledVector(_d, Math.cos(A) * UPPER).addScaledVector(_p, Math.sin(A) * UPPER);
    _u.subVectors(_e, S).normalize();
    arm.sh.quaternion.setFromUnitVectors(DOWN, _u);
    _u.subVectors(_t, _e).normalize().applyQuaternion(_q.copy(arm.sh.quaternion).invert());
    arm.el.quaternion.setFromUnitVectors(DOWN, _u);
  }

  dispose() {
    this.model?.dispose();
    this.root.parent?.remove(this.root);
  }
}
