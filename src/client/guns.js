import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/three/addons/loaders/GLTFLoader.js';
import { plate } from './avatar.js';

// Armas (apuntan a -Z): modelos 3D descargados (CC0, vendor/assets/guns) con el pack de texturas generado por
// código; si un modelo no carga, se usa el modelo procedural de respaldo.
// Los usan la vista en primera persona, los avatares, la caja misteriosa y el menú de armas.
// buildGun(id) → { group, muzzle, eject, grips: { r, l }, sight, eye, parts }
//   sight: punto (local) que se alinea con el centro de la pantalla al apuntar; eye: distancia ojo-mira.

export const GUN_INFO = {
  rifle: { cls: 'FUSIL DE ASALTO', caliber: '6,8 mm', optic: 'PUNTO ROJO', weight: 3.4, desc: 'Carabina automática con mira de punto rojo y empuñadura angulada. Fiable a cualquier distancia media.' },
  pistol: { cls: 'PISTOLA DE IONES', caliber: 'CÉLULA IÓNICA', optic: 'MIRAS TRITIO', weight: 1.1, desc: 'Arma de energía semiautomática. Destroza escudos (×2) y castiga los disparos a la cabeza (×3). No usa munición: se sobrecalienta.' },
  smg: { cls: 'SUBFUSIL', caliber: '4,6 mm', optic: 'HOLOGRÁFICA', weight: 2.6, desc: 'Cadencia altísima, empuñadura vertical y mira holográfica. Letal a corta distancia; la dispersión crece si mantienes el gatillo.' },
  shotgun: { cls: 'ESCOPETA DE CORREDERA', caliber: 'CAL. 12', optic: 'ANILLO FANTASMA', weight: 3.6, desc: '9 perdigones por disparo. Recarga cartucho a cartucho y puedes interrumpirla disparando.' },
  dmr: { cls: 'FUSIL DE TIRADOR', caliber: '7,6 mm', optic: 'VISOR', weight: 4.4, desc: 'Ráfagas de 3 con visor de combate. Precisión quirúrgica a media y larga distancia.' },
  sniper: { cls: 'FRANCOTIRADOR', caliber: '.408', optic: 'VISOR + TELÉMETRO', weight: 7.2, desc: 'Cerrojo manual, cañón estriado y bípode. 95 de daño y ×2,5 a la cabeza: un disparo, una baja.' },
  plasma: { cls: 'ALIENÍGENA · PLASMA', caliber: 'PLASMA', optic: 'RETÍCULA DE ENERGÍA', weight: 3, desc: 'Lanza de plasma automática. ×1,8 contra escudos. Se sobrecalienta si no sueltas el gatillo.' },
  needler: { cls: 'ALIENÍGENA · AGUJAS', caliber: 'CRISTAL', optic: 'MUESCA DE CRISTAL', weight: 2.8, desc: 'Dispara agujas de cristal que persiguen al objetivo de la mira. Los cristales del lomo indican la carga.' },
  arc: { cls: 'ALIENÍGENA · PESADA', caliber: 'NÚCLEO DE ARCO', optic: 'ANILLO HOLO', weight: 8.5, desc: 'Cañón de energía con proyectil explosivo y daño en área de 4,5 m. Cuidado de cerca.' },
  battle: { cls: 'FUSIL DE BATALLA', caliber: '7,62 mm', optic: 'MIRAS DE HIERRO', weight: 4.1, desc: 'Automático de calibre pesado: más daño por bala que la carabina a cambio de cadencia y retroceso.' },
  revolver: { cls: 'REVÓLVER MAGNUM', caliber: '.50 MAG', optic: 'MIRAS DE HIERRO', weight: 1.9, desc: 'Seis balas de gran calibre. Un tiro a la cabeza tumba a casi cualquier tropa.' },
  sawed: { cls: 'ESCOPETA RECORTADA', caliber: 'CAL. 12 · 2 CAÑONES', optic: '—', weight: 2.4, desc: '12 perdigones por cañón y dos disparos antes de recargar. Devastadora a quemarropa, inútil de lejos.' },
  carbine: { cls: 'ALIENÍGENA · CARABINA', caliber: 'ESQUIRLA RADIACTIVA', optic: 'VISOR DE ENERGÍA', weight: 3.2, desc: 'Semiautomática de precisión con visor ×2. Rápida y certera a media distancia; ×2,5 a la cabeza.' },
};

// --- Pack de texturas procedurales ----------------------------------------------
// Texturas en escala de grises (se tiñen con el color del material): albedo, rugosidad y relieve.
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Ruido de valor periódico (enlosable) suma de octavas, en [0, 1].
function fbm(S, r, cells, oct) {
  const out = new Float32Array(S * S);
  let amp = 1, total = 0;
  for (let o = 0; o < oct; o++, cells *= 2, amp *= 0.5) {
    const n = cells, grid = new Float32Array(n * n).map(() => r());
    for (let y = 0; y < S; y++) {
      const gy = (y / S) * n, y0 = Math.floor(gy), fy = gy - y0, sy = fy * fy * (3 - 2 * fy);
      const r0 = (y0 % n) * n, r1 = ((y0 + 1) % n) * n;
      for (let x = 0; x < S; x++) {
        const gx = (x / S) * n, x0 = Math.floor(gx), fx = gx - x0, sx = fx * fx * (3 - 2 * fx);
        const a = grid[r0 + (x0 % n)], b = grid[r0 + ((x0 + 1) % n)], c = grid[r1 + (x0 % n)], d = grid[r1 + ((x0 + 1) % n)];
        out[y * S + x] += amp * (a + (b - a) * sx + (c - a + (a - b - c + d) * sx) * sy);
      }
    }
    total += amp;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function toTexture(S, data, color) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d'), img = g.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    const v = Math.max(0, Math.min(255, data[i] * 255));
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Trazo (arañazo) sobre los mapas, con envoltura en los bordes.
function stroke(S, r, len, angle, fn) {
  let x = r() * S, y = r() * S;
  const dx = Math.cos(angle), dy = Math.sin(angle);
  for (let i = 0; i < len; i++, x += dx, y += dy) fn((((y | 0) % S + S) % S) * S + (((x | 0) % S + S) % S), i / len);
}

const SURF = {};
function surface(name) {
  if (SURF[name]) return SURF[name];
  const S = name === 'alien' ? 256 : 512;
  const r = mulberry32(name.split('').reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261));
  const N = S * S, alb = new Float32Array(N), rgh = new Float32Array(N), hgt = new Float32Array(N);
  let emi = null;
  const n = () => r() - 0.5;
  if (name === 'metal') {
    // Acero pavonado: cepillado, manchas, arañazos brillantes y picaduras.
    const f = fbm(S, r, 4, 4), rows = fbm(S, r, 64, 2);
    for (let i = 0; i < N; i++) {
      const row = rows[(i / S | 0) * S] - 0.5;
      alb[i] = 0.84 + (f[i] - 0.5) * 0.16 + row * 0.08 + n() * 0.05;
      rgh[i] = 0.42 + (f[i] - 0.5) * 0.3 + row * 0.1;
      hgt[i] = 0.5 + n() * 0.12 + row * 0.1;
    }
    for (let k = 0; k < 320; k++) {
      stroke(S, r, 8 + r() * 70, (r() < 0.7 ? 0 : r() * Math.PI) + n() * 0.3, (i, t) => {
        const w = Math.sin(t * Math.PI);
        alb[i] += 0.14 * w; rgh[i] -= 0.22 * w; hgt[i] -= 0.3 * w;
      });
    }
    for (let k = 0; k < 500; k++) { const i = (r() * N) | 0; alb[i] -= 0.2; hgt[i] -= 0.35; }
  } else if (name === 'poly') {
    // Polímero granulado con rozaduras.
    const f = fbm(S, r, 6, 3);
    for (let i = 0; i < N; i++) {
      const s = n();
      alb[i] = 0.9 + (f[i] - 0.5) * 0.1 + s * 0.05;
      rgh[i] = 0.72 + (f[i] - 0.5) * 0.12 + s * 0.08;
      hgt[i] = 0.5 + s * 0.55;
    }
    for (let k = 0; k < 90; k++) stroke(S, r, 10 + r() * 50, r() * Math.PI * 2, (i) => { alb[i] += 0.08; rgh[i] -= 0.18; });
  } else if (name === 'paint') {
    // Cerámica pintada (tipo cerakote) con desconchones que dejan ver el metal oscuro.
    const f = fbm(S, r, 5, 4), chip = fbm(S, r, 12, 3);
    for (let i = 0; i < N; i++) {
      const c = chip[i] > 0.75, s = n();
      alb[i] = c ? 0.42 + s * 0.05 : 0.92 + (f[i] - 0.5) * 0.12 + s * 0.03;
      rgh[i] = c ? 0.32 : 0.62 + (f[i] - 0.5) * 0.12 + s * 0.05;
      hgt[i] = c ? 0.3 : 0.55 + s * 0.08;
    }
    for (let k = 0; k < 120; k++) stroke(S, r, 6 + r() * 40, r() * Math.PI * 2, (i) => { alb[i] = 0.55; rgh[i] = 0.3; hgt[i] = 0.35; });
  } else if (name === 'wood') {
    // Nogal: vetas onduladas a lo largo de la pieza y poros.
    const warp = fbm(S, r, 3, 3), pores = fbm(S, r, 48, 2);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const g = Math.pow(0.5 + 0.5 * Math.sin(Math.PI * 2 * ((y / S) * 34 + warp[i] * 1.6)), 3);
      alb[i] = 0.74 + 0.26 * (1 - g) + (pores[i] - 0.5) * 0.12 + n() * 0.03;
      rgh[i] = 0.45 + g * 0.2 + (pores[i] - 0.5) * 0.1;
      hgt[i] = 0.5 - g * 0.25 + (pores[i] - 0.5) * 0.3;
    }
  } else if (name === 'grip') {
    // Goma con moleteado en rombos.
    const P = 14;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x, a = (x + y) % P, b = ((x - y) % P + P) % P;
      const groove = Math.min(a, P - a, b, P - b) < 2.2;
      const s = n();
      alb[i] = groove ? 0.55 : 0.92 + s * 0.05;
      rgh[i] = 0.82 + s * 0.08;
      hgt[i] = groove ? 0.05 : 0.75 + s * 0.15;
    }
  } else if (name === 'carbon') {
    // Fibra de carbono: tejido cruzado.
    const C = 16;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x, par = ((x / C | 0) + (y / C | 0)) & 1;
      const t = par ? (x % C) / C : (y % C) / C;
      const band = Math.sin(t * Math.PI);
      alb[i] = 0.55 + band * 0.35 * (par ? 1 : 0.8) + n() * 0.03;
      rgh[i] = 0.3 + (1 - band) * 0.25;
      hgt[i] = 0.3 + band * 0.5;
    }
  } else if (name === 'alien') {
    // Caparazón orgánico: celdas de Voronoi con venas que brillan.
    const pts = Array.from({ length: 34 }, () => [r() * S, r() * S]);
    const f = fbm(S, r, 4, 3);
    emi = new Float32Array(N);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let d1 = 1e9, d2 = 1e9;
      for (const [px, py] of pts) {
        let dx = Math.abs(x - px), dy = Math.abs(y - py);
        if (dx > S / 2) dx = S - dx;
        if (dy > S / 2) dy = S - dy;
        const d = dx * dx + dy * dy;
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
      }
      const i = y * S + x, e = Math.sqrt(d2) - Math.sqrt(d1);
      const vein = Math.max(0, 1 - e / 4);
      const cell = Math.min(1, Math.sqrt(d1) / 30);
      alb[i] = 0.95 - cell * 0.3 - vein * 0.35 + (f[i] - 0.5) * 0.15;
      rgh[i] = 0.22 + vein * 0.35 + cell * 0.1;
      hgt[i] = 0.75 - cell * 0.4 - vein * 0.35;
      emi[i] = vein * (0.45 + f[i] * 0.8);
    }
  }
  SURF[name] = {
    map: toTexture(S, alb, true), rough: toTexture(S, rgh, false), bump: toTexture(S, hgt, false),
    emissive: emi ? toTexture(S, emi, true) : null,
  };
  // Celdas alienígenas más grandes que la baldosa estándar.
  if (name === 'alien') for (const t of Object.values(SURF[name])) t?.repeat.setScalar(0.5);
  return SURF[name];
}

// Rótulo grabado (texto con sombra) sobre fondo transparente.
function engraving(lines, w, h) {
  const k = 512 / w;
  const c = document.createElement('canvas');
  c.width = 512; c.height = Math.max(16, Math.round(h * k));
  const g = c.getContext('2d');
  const fs = c.height / (lines.length + 0.4);
  g.font = `700 ${fs * 0.82}px Rajdhani, system-ui, sans-serif`;
  g.textBaseline = 'middle';
  lines.forEach((t, i) => {
    const y = fs * (i + 0.7);
    g.fillStyle = 'rgba(0,0,0,0.75)';
    g.fillText(t, 3, y + 2);
    g.fillStyle = 'rgba(225,228,230,0.85)';
    g.fillText(t, 2, y);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Retícula luminosa (punto rojo, holográfica, anillo alienígena).
const RET = {};
export function reticleTexture(kind) {
  if (RET[kind]) return RET[kind];
  const S = 128, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.translate(S / 2, S / 2);
  g.strokeStyle = g.fillStyle = '#fff';
  g.shadowColor = '#fff';
  g.shadowBlur = 6;
  if (kind === 'dot') {
    g.shadowBlur = 14;
    g.beginPath(); g.arc(0, 0, 11, 0, Math.PI * 2); g.fill();
  } else if (kind === 'holo') {
    g.lineWidth = 4;
    g.beginPath(); g.arc(0, 0, 44, 0, Math.PI * 2); g.stroke();
    for (const a of [0, 1, 2, 3]) { g.save(); g.rotate((a * Math.PI) / 2); g.fillRect(-2, -56, 4, 10); g.restore(); }
    g.beginPath(); g.arc(0, 0, 5, 0, Math.PI * 2); g.fill();
  } else {
    g.lineWidth = 5;
    for (let a = 0; a < 3; a++) { g.beginPath(); g.arc(0, 0, 40, a * 2.094 + 0.3, a * 2.094 + 1.75); g.stroke(); }
    g.beginPath(); g.moveTo(0, -12); g.lineTo(10, 8); g.lineTo(-10, 8); g.closePath(); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return (RET[kind] = t);
}

// --- Materiales -----------------------------------------------------------------
let M = null;
function mats() {
  if (M) return M;
  const std = (surf, color, metalness, extra = {}) => {
    const s = surface(surf);
    return new THREE.MeshStandardMaterial({
      color, metalness, roughness: 1, map: s.map, roughnessMap: s.rough, bumpMap: s.bump, bumpScale: 0.9, ...extra,
    });
  };
  const alien = (color, glow, extra = {}) => {
    const s = surface('alien');
    return new THREE.MeshPhysicalMaterial({
      color, metalness: 0.55, roughness: 1, map: s.map, roughnessMap: s.rough, bumpMap: s.bump, bumpScale: 1.2,
      emissive: glow, emissiveMap: s.emissive, emissiveIntensity: 0.9,
      iridescence: 0.85, iridescenceIOR: 1.7, iridescenceThicknessRange: [180, 600], clearcoat: 0.8, clearcoatRoughness: 0.15, ...extra,
    });
  };
  const glow = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: false });
  M = {
    blk: std('metal', 0x2b2f34, 0.9),
    steel: std('metal', 0xa3abb3, 1),
    park: std('metal', 0x3d423f, 0.75, { bumpScale: 1.4 }),
    polyBlk: std('poly', 0x222528, 0.05),
    polyGrey: std('poly', 0x52585e, 0.05),
    polyFde: std('poly', 0xa08a66, 0.05),
    od: std('paint', 0x56613f, 0.3),
    tan: std('paint', 0xb39d75, 0.3),
    white: std('paint', 0xdfe3e7, 0.25),
    walnut: std('wood', 0x8a5530, 0.05),
    walnutDark: std('wood', 0x4e2f1a, 0.05),
    rubber: std('grip', 0x1e2023, 0.05),
    gripFde: std('grip', 0x9a8460, 0.05),
    carbon: std('carbon', 0x34373c, 0.35, { bumpScale: 0.5 }),
    brass: std('metal', 0xd2a64e, 1, { bumpScale: 0.3 }),
    hull: std('poly', 0xb0261c, 0.05),
    hole: new THREE.MeshStandardMaterial({ color: 0x060708, roughness: 1, metalness: 0 }),
    lens: new THREE.MeshPhysicalMaterial({
      color: 0x6fb6d8, metalness: 0, roughness: 0.02, transparent: true, opacity: 0.16, depthWrite: false,
      clearcoat: 1, iridescence: 1, iridescenceThicknessRange: [250, 500], side: THREE.DoubleSide,
    }),
    lensDark: new THREE.MeshPhysicalMaterial({ color: 0x0e2a3a, metalness: 0.7, roughness: 0.04, clearcoat: 1, iridescence: 0.9 }),
    alPurple: alien(0x6a3aa0, 0xff5ad1),
    alTeal: alien(0x247578, 0xff8af0),
    alGreen: alien(0x356d2e, 0x9dff6a),
    alBone: alien(0x2a2433, 0x7a4cff, { emissiveIntensity: 0.6 }),
    // Acentos de las armas alienígenas (modelos): caparazón con mucho brillo de venas.
    alPinkGlow: alien(0x7a2a66, 0xff3fd2, { emissiveIntensity: 1.6 }),
    alGreenGlow: alien(0x3d6a24, 0x6aff3a, { emissiveIntensity: 1.6 }),
    alEmeraldGlow: alien(0x1f6a52, 0x20ff90, { emissiveIntensity: 1.6 }),
    crystal: new THREE.MeshPhysicalMaterial({
      color: 0xff7be8, emissive: 0xff3fd2, emissiveIntensity: 0.9, roughness: 0.08, metalness: 0,
      transparent: true, opacity: 0.88, clearcoat: 1, iridescence: 0.6,
    }),
    glowCyan: glow(0x7fe7ff),
    glowAmber: glow(0xffb347),
    glowRed: glow(0xff4d5e),
    glowPink: glow(0xff5ad1),
    glowGreen: glow(0x9dff6a),
    glowEmerald: glow(0x3dffa0),
    glowTritium: glow(0xa8ff6a),
  };
  return M;
}

// --- Geometría --------------------------------------------------------------------
const UVS = 6; // repeticiones de textura por metro (~17 cm por baldosa)
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

// Proyección de UV por caras dominantes (triplanar simplificada): densidad de textura uniforme en todas las piezas.
function prep(g) {
  if (g.userData.prepped) return g;
  if (g.index) g = g.toNonIndexed();
  if (!g.attributes.normal) g.computeVertexNormals();
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i += 3) {
    _a.fromBufferAttribute(p, i);
    _b.fromBufferAttribute(p, i + 1).sub(_a);
    _c.fromBufferAttribute(p, i + 2).sub(_a);
    const nx = Math.abs(_b.y * _c.z - _b.z * _c.y), ny = Math.abs(_b.z * _c.x - _b.x * _c.z), nz = Math.abs(_b.x * _c.y - _b.y * _c.x);
    for (let k = 0; k < 3; k++) {
      const x = p.getX(i + k), y = p.getY(i + k), z = p.getZ(i + k);
      const [u, v] = nx >= ny && nx >= nz ? [z, y] : ny >= nz ? [x, z] : [x, y];
      uv[(i + k) * 2] = u * UVS;
      uv[(i + k) * 2 + 1] = v * UVS;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  g.userData.prepped = true;
  return g;
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
// Cilindro a lo largo de Z: rRear = radio trasero (+Z), rFront = radio delantero (-Z).
const cyl = (rRear, rFront, len, seg = 16) => new THREE.CylinderGeometry(rRear, rFront, len, seg).rotateX(Math.PI / 2);
const cylY = (rt, rb, h, seg = 14) => new THREE.CylinderGeometry(rt, rb, h, seg);
// Torno a lo largo de Z: puntos [radio, z].
const lathe = (pts, seg = 24) => new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(r, z)), seg).rotateX(Math.PI / 2);

// Perfil lateral [z, y] extruido a lo ancho (X), con bisel. holes: perfiles de huecos.
function profile(pts, w, bevel = 0.004, holes = []) {
  const shape = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([z, y]) => new THREE.Vector2(z, y))));
  const depth = Math.max(0.001, w - bevel * 2);
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 2, curveSegments: 8 });
  g.translate(0, 0, -depth / 2);
  g.rotateY(-Math.PI / 2);
  return g;
}

// Marco rectangular que mira a Z (capuchón de mira holográfica, guardamonte frontal…).
function frameZ(w, h, t, d) {
  const s = new THREE.Shape([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => new THREE.Vector2(x, y)));
  s.holes.push(new THREE.Path([[-w / 2 + t, -h / 2 + t], [-w / 2 + t, h / 2 - t], [w / 2 - t, h / 2 - t], [w / 2 - t, -h / 2 + t]].map(([x, y]) => new THREE.Vector2(x, y))));
  return new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2);
}

// Une geometrías ya preparadas (posiciones en el mismo espacio).
function concat(list) {
  list = list.map(prep);
  const total = list.reduce((s, g) => s + g.attributes.position.count, 0);
  const out = new THREE.BufferGeometry();
  for (const [k, n] of [['position', 3], ['normal', 3], ['uv', 2]]) {
    const arr = new Float32Array(total * n);
    let o = 0;
    for (const g of list) { arr.set(g.attributes[k].array, o); o += g.attributes[k].array.length; }
    out.setAttribute(k, new THREE.BufferAttribute(arr, n));
  }
  out.userData.prepped = true;
  return out;
}

// Raíl picatinny: base + dientes.
function rail(len, w = 0.022) {
  const parts = [prep(box(w, 0.006, len))];
  for (let z = -len / 2 + 0.005; z < len / 2 - 0.004; z += 0.01) parts.push(prep(box(w + 0.003, 0.004, 0.005).translate(0, 0.005, z)));
  return concat(parts);
}

// --- Construcción y horneado ------------------------------------------------------
let lastGroup = null;
function kit() {
  const m = mats(), group = (lastGroup = new THREE.Group());
  const add = (g, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, parent = group) => {
    const mesh = new THREE.Mesh(prep(g), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    parent.add(mesh);
    return mesh;
  };
  // Pieza móvil (no se hornea): grupo con nombre.
  const part = (name, x = 0, y = 0, z = 0, parent = group) => {
    const p = new THREE.Group();
    p.name = name;
    p.userData.keep = true;
    p.position.set(x, y, z);
    parent.add(p);
    return p;
  };
  // Rótulo grabado en un costado (side: 1 = derecha, -1 = izquierda).
  const decal = (lines, w, h, x, y, z, side = -1) => {
    const mat = new THREE.MeshStandardMaterial({
      map: engraving(lines, w, h), transparent: true, depthWrite: false, roughness: 0.5, metalness: 0.4,
      polygonOffset: true, polygonOffsetFactor: -2,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.set(x * side, y, z);
    mesh.rotation.y = side * Math.PI / 2;
    mesh.userData.noBake = true;
    group.add(mesh);
    return mesh;
  };
  // Plano de retícula (mira hacia la cámara, +Z).
  const reticle = (kind, color, size, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({
      map: reticleTexture(kind), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    mesh.position.set(x, y, z);
    mesh.userData.noBake = true;
    mesh.renderOrder = 2;
    group.add(mesh);
    return mesh;
  };
  const point = (name, x, y, z) => {
    const o = new THREE.Object3D();
    o.name = name;
    o.position.set(x, y, z);
    group.add(o);
    return o;
  };
  return { m, group, add, part, decal, reticle, point };
}

// Une las piezas estáticas por material: pocas llamadas de dibujo por arma.
function bake(root) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const buckets = new Map();
  const walk = (o) => {
    for (const c of [...o.children]) {
      if (c.userData.keep) continue;
      if (c.isMesh && !c.userData.noBake) {
        if (!buckets.has(c.material)) buckets.set(c.material, []);
        buckets.get(c.material).push(c);
      }
      walk(c);
    }
  };
  walk(root);
  const _m = new THREE.Matrix4();
  for (const [mat, list] of buckets) {
    if (list.length < 2) continue;
    const geos = list.map((mesh) => {
      _m.multiplyMatrices(inv, mesh.matrixWorld);
      const g = mesh.geometry.clone().applyMatrix4(_m);
      mesh.parent.remove(mesh);
      return g;
    });
    root.add(new THREE.Mesh(concat(geos), mat));
  }
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = !o.material.isMeshBasicMaterial && !o.material.transparent;
    o.receiveShadow = false;
  });
}

const BUILDERS = {
  rifle() {
    const { m, add, part, decal, reticle, point } = kit();
    // Receptor superior e inferior.
    add(plate(0.072, 0.058, 0.31, 0.012), m.blk, 0, 0.03, 0.015);
    add(profile([[-0.13, 0], [0.16, 0], [0.16, -0.04], [0.06, -0.045], [-0.005, -0.045], [-0.005, -0.082], [-0.082, -0.082], [-0.082, -0.045], [-0.13, -0.035]], 0.066), m.blk);
    add(rail(0.56), m.blk, 0, 0.062, -0.13);
    // Guardamanos octogonal con ranuras.
    add(cyl(0.037, 0.037, 0.27, 8), m.blk, 0, 0.022, -0.275, 0, 0, Math.PI / 8);
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) add(box(0.004, 0.012, 0.034), m.hole, s * 0.0335, 0.02, -0.19 - i * 0.055);
    add(cyl(0.012, 0.012, 0.16), m.blk, 0, 0.022, -0.47);
    add(cyl(0.017, 0.016, 0.055, 12), m.blk, 0, 0.022, -0.56);
    for (let a = 0; a < 3; a++) add(box(0.004, 0.035, 0.03), m.hole, 0, 0.022, -0.565, 0, 0, (a * Math.PI) / 3);
    // Empuñadura delantera angulada, gatillo, empuñadura y cargador curvo.
    add(profile([[-0.3, -0.012], [-0.215, -0.012], [-0.25, -0.052], [-0.29, -0.052]], 0.042, 0.005), m.polyFde);
    add(profile([[0.0, -0.045], [0.07, -0.045], [0.072, -0.052], [0.05, -0.085], [0.0, -0.085]], 0.012, 0.002, [[[0.006, -0.05], [0.06, -0.05], [0.045, -0.078], [0.006, -0.078]]]), m.blk);
    add(profile([[0.028, -0.045], [0.034, -0.045], [0.038, -0.068], [0.031, -0.074]], 0.006, 0.0015), m.steel);
    add(profile([[0.075, -0.04], [0.125, -0.04], [0.175, -0.155], [0.165, -0.167], [0.115, -0.167], [0.1, -0.13], [0.095, -0.112], [0.09, -0.095], [0.082, -0.07]], 0.05, 0.007), m.gripFde);
    const mag = part('mag', 0, -0.06, -0.04);
    add(profile([[-0.035, 0], [0.032, 0], [0.028, -0.06], [0.014, -0.12], [-0.004, -0.165], [-0.074, -0.152], [-0.058, -0.105], [-0.045, -0.055]], 0.05, 0.005), m.polyFde, 0, 0, 0, 0, 0, 0, mag);
    add(box(0.056, 0.012, 0.075), m.polyBlk, 0, -0.163, -0.04, -0.3, 0, 0, mag);
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) add(box(0.003, 0.004, 0.05), m.polyFde, s * 0.025, -0.03 - i * 0.025, -0.006 - i * 0.006, -0.12 - i * 0.08, 0, 0, mag);
    // Culata ajustable sobre tubo.
    add(cyl(0.017, 0.017, 0.2, 14), m.blk, 0, 0.026, 0.26);
    add(profile([[0.2, 0.05], [0.4, 0.056], [0.41, -0.072], [0.39, -0.077], [0.33, -0.022], [0.22, 0.0]], 0.05, 0.006), m.polyFde);
    add(box(0.054, 0.132, 0.016), m.rubber, 0, -0.01, 0.414);
    // Detalles: maneta de carga, ventana de expulsión, asistente, selector, contador de munición.
    add(box(0.05, 0.012, 0.03), m.blk, 0, 0.052, 0.178);
    add(box(0.003, 0.022, 0.062), m.hole, 0.0362, 0.03, 0.02);
    const bolt = part('bolt', 0.0372, 0.03, 0.02);
    add(box(0.002, 0.016, 0.05), m.steel, 0, 0, 0, 0, 0, 0, bolt);
    add(cyl(0.008, 0.008, 0.02, 10), m.blk, 0.034, 0.038, 0.09, 0, 0.5, 0);
    add(box(0.006, 0.006, 0.018), m.steel, -0.035, -0.015, 0.085, 0, 0, 0.4);
    add(box(0.004, 0.016, 0.04), m.glowCyan, -0.0375, 0.032, 0.09);
    // Mira de punto rojo.
    add(box(0.03, 0.012, 0.05), m.blk, 0, 0.073, 0.03);
    add(lathe([[0.017, 0.03], [0.023, 0.03], [0.023, -0.03], [0.017, -0.03], [0.017, 0.03]], 22), m.blk, 0, 0.1, 0.03);
    add(box(0.012, 0.012, 0.012), m.blk, 0.024, 0.1, 0.035);
    add(new THREE.CircleGeometry(0.0172, 22), m.lens, 0, 0.1, 0.002);
    reticle('dot', 0xff3040, 0.011, 0, 0.1, 0.004);
    decal(['AR-9 CARBINE', 'CAL 6.8 · SAFE/AUTO'], 0.11, 0.028, 0.0341, -0.02, 0.06, -1);
    decal(['RFX ARMS · 0451-7'], 0.08, 0.012, 0.0341, -0.015, 0.06, 1);
    point('eject', 0.04, 0.03, 0.02);
    return { muzzle: [0, 0.022, -0.59], grips: { r: [0, -0.1, 0.13], l: [0, -0.045, -0.255] }, sight: [0, 0.1, 0.03], eye: 0.28 };
  },

  pistol() {
    const { m, add, part, decal, point } = kit();
    add(profile([[-0.2, 0], [-0.2, 0.034], [-0.17, 0.05], [0.07, 0.05], [0.085, 0.036], [0.085, 0]], 0.05, 0.005), m.white);
    for (let i = 0; i < 6; i++) add(box(0.052, 0.03, 0.003), m.hole, 0, 0.026, 0.035 + i * 0.008);
    add(profile([[-0.185, 0.002], [0.08, 0.002], [0.08, -0.022], [-0.16, -0.026], [-0.185, -0.016]], 0.046, 0.004), m.polyBlk);
    add(rail(0.06, 0.02), m.polyBlk, 0, -0.03, -0.12, 0, 0, Math.PI);
    const coil = part('coil', 0, 0.022, -0.07);
    add(box(0.054, 0.012, 0.16), m.glowCyan, 0, 0, 0, 0, 0, 0, coil);
    // Emisor frontal con anillos.
    add(cyl(0.016, 0.018, 0.04, 18), m.steel, 0, 0.025, -0.215);
    add(new THREE.TorusGeometry(0.0175, 0.0035, 8, 24), m.glowCyan, 0, 0.025, -0.236);
    add(new THREE.TorusGeometry(0.0175, 0.003, 8, 24), m.blk, 0, 0.025, -0.2);
    add(new THREE.CircleGeometry(0.012, 18), m.glowCyan, 0, 0.025, -0.2365, 0, Math.PI, 0);
    // Empuñadura de goma, guardamonte y gatillo.
    add(profile([[0.02, -0.02], [0.08, -0.02], [0.108, -0.142], [0.097, -0.153], [0.042, -0.153], [0.032, -0.13], [0.026, -0.1]], 0.048, 0.007), m.rubber);
    add(box(0.05, 0.012, 0.06), m.polyBlk, 0, -0.152, 0.07, -0.22);
    add(profile([[-0.035, -0.02], [0.03, -0.02], [0.03, -0.058], [-0.02, -0.058], [-0.035, -0.04]], 0.012, 0.002, [[[-0.026, -0.026], [0.022, -0.026], [0.022, -0.051], [-0.016, -0.051], [-0.026, -0.04]]]), m.polyBlk);
    add(profile([[0.0, -0.02], [0.006, -0.02], [0.009, -0.042], [0.003, -0.046]], 0.006, 0.0015), m.steel);
    // Miras con puntos de tritio.
    for (const s of [-1, 1]) {
      add(box(0.011, 0.012, 0.008), m.blk, s * 0.0085, 0.056, 0.062);
      add(box(0.003, 0.003, 0.002), m.glowTritium, s * 0.0085, 0.057, 0.0665);
    }
    add(box(0.004, 0.012, 0.006), m.blk, 0, 0.056, -0.17);
    add(box(0.0032, 0.0032, 0.002), m.glowTritium, 0, 0.0585, -0.1665);
    decal(['ION-7 SIDEARM'], 0.08, 0.012, 0.0251, 0.036, -0.1, -1);
    decal(['CELL · 3.2 kJ'], 0.06, 0.01, 0.0251, 0.036, -0.12, 1);
    point('eject', 0.03, 0.03, 0);
    return { muzzle: [0, 0.025, -0.245], grips: { r: [0, -0.1, 0.062], l: [-0.03, -0.11, 0.06] }, sight: [0, 0.0615, 0.06], eye: 0.36 };
  },

  smg() {
    const { m, add, part, decal, reticle, point } = kit();
    add(profile([[-0.18, 0.05], [0.12, 0.05], [0.14, 0.03], [0.14, -0.04], [-0.05, -0.045], [-0.12, -0.04], [-0.18, -0.02]], 0.068, 0.008), m.polyGrey);
    add(rail(0.26), m.blk, 0, 0.056, -0.03);
    for (const s of [-1, 1]) add(box(0.004, 0.006, 0.18), m.glowEmerald, s * 0.0345, -0.025, -0.05);
    add(box(0.012, 0.012, 0.04), m.blk, -0.038, 0.03, -0.08);
    add(cylY(0.006, 0.006, 0.02), m.polyBlk, -0.05, 0.03, -0.1, 0, 0, Math.PI / 2);
    // Camisa del cañón con respiraderos y compensador.
    add(cyl(0.022, 0.022, 0.09, 18), m.blk, 0, 0.015, -0.225);
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) add(box(0.004, 0.008, 0.012), m.hole, s * 0.021, 0.015, -0.195 - i * 0.02);
    add(cyl(0.019, 0.02, 0.045, 12), m.blk, 0, 0.015, -0.29);
    for (const s of [-1, 1]) add(box(0.004, 0.012, 0.008), m.hole, s * 0.019, 0.022, -0.293);
    // Cargador recto (pieza móvil), empuñaduras y gatillo.
    const mag = part('mag', 0, -0.04, -0.02);
    add(profile([[-0.03, 0], [0.016, 0], [0.012, -0.2], [-0.028, -0.2]], 0.04, 0.004), m.polyBlk, 0, 0, 0, 0, 0, 0, mag);
    add(box(0.046, 0.012, 0.05), m.polyGrey, 0, -0.2, -0.008, 0, 0, 0, mag);
    add(profile([[0.06, -0.04], [0.105, -0.04], [0.14, -0.15], [0.13, -0.16], [0.09, -0.16], [0.075, -0.1]], 0.046, 0.007), m.rubber);
    add(profile([[0.02, -0.045], [0.07, -0.045], [0.07, -0.08], [0.03, -0.08]], 0.011, 0.002, [[[0.026, -0.05], [0.064, -0.05], [0.064, -0.074], [0.032, -0.074]]]), m.polyBlk);
    add(cylY(0.017, 0.02, 0.11, 14), m.polyBlk, 0, -0.1, -0.15);
    for (let i = 0; i < 4; i++) add(new THREE.TorusGeometry(0.0185, 0.002, 6, 16), m.rubber, 0, -0.075 - i * 0.02, -0.15, Math.PI / 2, 0, 0);
    // Culata de alambre plegable.
    add(box(0.03, 0.03, 0.03), m.blk, 0, 0.0, 0.15);
    for (const s of [-1, 1]) add(cyl(0.006, 0.006, 0.2, 8), m.blk, s * 0.026, 0.0, 0.25);
    add(cyl(0.006, 0.006, 0.2, 8), m.blk, 0, -0.04, 0.25, -0.2, 0, 0);
    add(plate(0.075, 0.09, 0.022, 0.008), m.rubber, 0, -0.015, 0.35);
    // Mira holográfica.
    add(box(0.034, 0.012, 0.06), m.blk, 0, 0.066, -0.0);
    add(frameZ(0.042, 0.036, 0.004, 0.05), m.blk, 0, 0.09, 0.0);
    add(box(0.044, 0.006, 0.05), m.blk, 0, 0.11, 0.0);
    add(new THREE.PlaneGeometry(0.034, 0.028), m.lens, 0, 0.09, -0.018);
    reticle('holo', 0xff3048, 0.024, 0, 0.09, -0.017);
    add(box(0.004, 0.012, 0.012), m.glowEmerald, 0.023, 0.08, 0.02);
    decal(['VIPER SMG', '4.6 × 30'], 0.08, 0.024, 0.0341, 0.02, 0.06, -1);
    point('eject', 0.036, 0.03, -0.03);
    return { muzzle: [0, 0.015, -0.315], grips: { r: [0, -0.1, 0.1], l: [0, -0.11, -0.15] }, sight: [0, 0.09, 0.0], eye: 0.27 };
  },

  shotgun() {
    const { m, add, part, decal, point } = kit();
    add(plate(0.07, 0.09, 0.26, 0.012), m.park, 0, 0.01, 0.03);
    add(box(0.003, 0.03, 0.08), m.hole, 0.0352, 0.025, 0.02);
    add(box(0.03, 0.003, 0.09), m.hole, 0, -0.0352, 0.0);
    // Cañón con banda ventilada, punto de mira y tubo cargador.
    add(cyl(0.019, 0.019, 0.56, 18), m.blk, 0, 0.03, -0.38);
    add(box(0.01, 0.006, 0.5), m.blk, 0, 0.052, -0.39);
    for (let i = 0; i < 12; i++) add(box(0.008, 0.004, 0.006), m.hole, 0, 0.0505, -0.16 - i * 0.04);
    add(box(0.004, 0.012, 0.01), m.blk, 0, 0.058, -0.635);
    add(new THREE.SphereGeometry(0.0035, 10, 8), m.glowAmber, 0, 0.066, -0.637);
    add(cyl(0.016, 0.016, 0.48, 16), m.blk, 0, -0.018, -0.34);
    add(cyl(0.019, 0.019, 0.02, 16), m.blk, 0, -0.018, -0.588);
    add(box(0.022, 0.05, 0.018), m.blk, 0, 0.006, -0.55);
    // Corredera (pieza móvil) de nogal con estrías.
    const pump = part('pump', 0, -0.015, -0.3);
    add(cyl(0.03, 0.03, 0.18, 18), m.walnut, 0, 0, 0, 0, 0, 0, pump);
    for (let i = 0; i < 7; i++) add(new THREE.TorusGeometry(0.0298, 0.0035, 6, 20), m.hole, 0, 0, -0.065 + i * 0.022, 0, 0, 0, pump);
    // Culata y empuñadura de nogal, cantonera.
    add(profile([[0.15, 0.04], [0.44, 0.028], [0.45, -0.1], [0.42, -0.106], [0.25, -0.036], [0.15, -0.03]], 0.055, 0.008), m.walnut);
    add(box(0.058, 0.138, 0.022), m.rubber, 0, -0.036, 0.453, 0.05, 0, 0);
    add(profile([[0.13, -0.03], [0.182, -0.03], [0.215, -0.15], [0.2, -0.166], [0.152, -0.166], [0.14, -0.1]], 0.048, 0.007), m.walnut);
    add(profile([[0.07, -0.035], [0.14, -0.035], [0.14, -0.072], [0.08, -0.072]], 0.012, 0.002, [[[0.077, -0.04], [0.134, -0.04], [0.134, -0.066], [0.085, -0.066]]]), m.blk);
    add(profile([[0.098, -0.035], [0.104, -0.035], [0.108, -0.06], [0.101, -0.064]], 0.006, 0.0015), m.steel);
    // Portacartuchos lateral con cartuchos rojos.
    add(plate(0.012, 0.045, 0.12, 0.004), m.polyBlk, -0.042, 0.005, 0.02);
    for (let i = 0; i < 4; i++) {
      add(cylY(0.0095, 0.0095, 0.05, 12), m.hull, -0.053, 0.012, -0.022 + i * 0.027);
      add(cylY(0.0098, 0.0098, 0.012, 12), m.brass, -0.053, -0.018, -0.022 + i * 0.027);
    }
    // Anillo fantasma trasero con orejetas.
    add(new THREE.TorusGeometry(0.0085, 0.0022, 8, 20), m.blk, 0, 0.067, 0.12);
    for (const s of [-1, 1]) add(box(0.004, 0.022, 0.012), m.blk, s * 0.015, 0.064, 0.12);
    add(box(0.034, 0.006, 0.02), m.blk, 0, 0.056, 0.12);
    decal(['BREACHER-12', '12 GA · 3" CHAMBER'], 0.1, 0.026, 0.0352, -0.015, 0.03, 1);
    point('eject', 0.04, 0.025, 0.02);
    return { muzzle: [0, 0.03, -0.665], grips: { r: [0, -0.1, 0.172], l: [0, -0.048, -0.3] }, sight: [0, 0.067, 0.12], eye: 0.24 };
  },

  dmr() {
    const { m, add, part, decal, point } = kit();
    add(plate(0.07, 0.058, 0.32, 0.012), m.tan, 0, 0.03, 0.01);
    add(profile([[-0.14, 0], [0.16, 0], [0.16, -0.04], [0.06, -0.045], [-0.01, -0.045], [-0.01, -0.08], [-0.085, -0.08], [-0.085, -0.045], [-0.14, -0.035]], 0.064), m.tan);
    add(rail(0.62), m.blk, 0, 0.062, -0.16);
    add(plate(0.068, 0.07, 0.32, 0.014), m.tan, 0, 0.022, -0.31);
    for (let i = 0; i < 5; i++) for (const s of [-1, 1]) add(box(0.004, 0.022, 0.03), m.hole, s * 0.0335, 0.018, -0.2 - i * 0.05);
    add(cyl(0.014, 0.013, 0.14, 14), m.blk, 0, 0.022, -0.54);
    add(plate(0.04, 0.032, 0.06, 0.006), m.blk, 0, 0.022, -0.62);
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) add(box(0.004, 0.018, 0.008), m.hole, s * 0.0198, 0.022, -0.6 - i * 0.016);
    const mag = part('mag', 0, -0.06, -0.045);
    add(profile([[-0.038, 0], [0.034, 0], [0.03, -0.075], [0.018, -0.115], [-0.05, -0.11], [-0.04, -0.06]], 0.05, 0.005), m.polyBlk, 0, 0, 0, 0, 0, 0, mag);
    add(profile([[0.0, -0.045], [0.07, -0.045], [0.072, -0.052], [0.05, -0.085], [0.0, -0.085]], 0.012, 0.002, [[[0.006, -0.05], [0.06, -0.05], [0.045, -0.078], [0.006, -0.078]]]), m.blk);
    add(profile([[0.028, -0.045], [0.034, -0.045], [0.038, -0.068], [0.031, -0.074]], 0.006, 0.0015), m.steel);
    add(profile([[0.075, -0.04], [0.125, -0.04], [0.17, -0.155], [0.16, -0.167], [0.112, -0.167], [0.098, -0.12], [0.085, -0.07]], 0.05, 0.007), m.rubber);
    // Culata de precisión con carrillera.
    add(profile([[0.17, 0.055], [0.42, 0.06], [0.43, -0.08], [0.4, -0.086], [0.36, -0.032], [0.3, -0.032], [0.27, -0.062], [0.24, -0.062], [0.2, -0.012], [0.17, -0.002]], 0.052, 0.006), m.tan);
    add(plate(0.044, 0.022, 0.13, 0.006), m.polyBlk, 0, 0.07, 0.32);
    add(box(0.056, 0.15, 0.018), m.rubber, 0, -0.012, 0.435);
    add(box(0.003, 0.022, 0.06), m.hole, 0.0352, 0.03, 0.02);
    const bolt = part('bolt', 0.0362, 0.03, 0.02);
    add(box(0.002, 0.016, 0.05), m.steel, 0, 0, 0, 0, 0, 0, bolt);
    add(box(0.05, 0.012, 0.03), m.blk, 0, 0.052, 0.18);
    // Visor ×2 con torretas y anillas.
    add(lathe([[0.0001, 0.125], [0.024, 0.125], [0.026, 0.11], [0.026, 0.07], [0.018, 0.05], [0.018, -0.09], [0.026, -0.11], [0.03, -0.125], [0.03, -0.15], [0.0001, -0.15]], 26), m.blk, 0, 0.1, 0);
    add(new THREE.CircleGeometry(0.022, 24), m.lens, 0, 0.1, 0.1252);
    add(new THREE.CircleGeometry(0.027, 24), m.lensDark, 0, 0.1, -0.1502, 0, Math.PI, 0);
    for (const z of [0.035, -0.06]) {
      add(new THREE.TorusGeometry(0.0195, 0.005, 8, 22), m.blk, 0, 0.1, z);
      add(box(0.026, 0.026, 0.016), m.blk, 0, 0.077, z);
    }
    add(cylY(0.012, 0.012, 0.022, 16), m.blk, 0, 0.125, -0.012);
    add(cylY(0.012, 0.012, 0.02, 16), m.blk, 0.026, 0.1, -0.012, 0, 0, Math.PI / 2);
    decal(['DMR-3 MARKSMAN', '7.6 × 51 · SEMI/BURST'], 0.12, 0.026, 0.0331, -0.02, 0.06, -1);
    point('eject', 0.04, 0.03, 0.02);
    return { muzzle: [0, 0.022, -0.655], grips: { r: [0, -0.1, 0.135], l: [0, -0.03, -0.3] }, sight: [0, 0.1, 0.125], eye: 0.13 };
  },

  sniper() {
    const { m, add, part, decal, point } = kit();
    add(cyl(0.03, 0.03, 0.24, 20), m.blk, 0, 0.03, 0);
    add(cyl(0.024, 0.024, 0.04, 18), m.blk, 0, 0.03, 0.14);
    add(rail(0.22), m.blk, 0, 0.064, -0.01);
    // Chasis verde oliva con guardamanos ventilado.
    add(profile([[-0.44, 0.022], [-0.12, 0.022], [-0.12, 0.004], [0.14, 0.004], [0.165, -0.03], [0.165, -0.042], [-0.06, -0.042], [-0.44, -0.028]], 0.072, 0.007), m.od);
    for (let i = 0; i < 6; i++) for (const s of [-1, 1]) add(box(0.004, 0.018, 0.035), m.hole, s * 0.0355, -0.004, -0.16 - i * 0.045);
    // Cañón estriado y freno de boca.
    add(cyl(0.018, 0.014, 0.66, 20), m.blk, 0, 0.03, -0.45);
    for (let a = 0; a < 6; a++) add(box(0.004, 0.003, 0.32), m.hole, Math.cos(a * 1.047) * 0.0158, 0.03 + Math.sin(a * 1.047) * 0.0158, -0.6, 0, 0, a * 1.047);
    add(plate(0.052, 0.042, 0.1, 0.008), m.blk, 0, 0.03, -0.83);
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) add(box(0.004, 0.024, 0.014), m.hole, s * 0.026, 0.03, -0.8 - i * 0.026);
    // Cerrojo (pieza móvil): gira sobre el eje del ánima y retrocede.
    const bolt = part('bolt', 0, 0.03, 0.06);
    add(box(0.044, 0.008, 0.008), m.steel, 0.042, -0.006, 0, 0, 0, -0.35, bolt);
    add(new THREE.SphereGeometry(0.013, 14, 10), m.polyBlk, 0.066, -0.018, 0.004, 0, 0, 0, bolt);
    add(cyl(0.0105, 0.0105, 0.06, 12), m.steel, 0.0, 0.0, 0.0, 0, 0, 0, bolt);
    add(box(0.003, 0.022, 0.07), m.hole, 0.0302, 0.03, -0.02);
    // Cargador, empuñadura y culata esqueletizada.
    const mag = part('mag', 0, -0.04, -0.03);
    add(plate(0.05, 0.08, 0.09, 0.008), m.polyBlk, 0, -0.03, 0, 0, 0, 0, mag);
    add(profile([[0.12, -0.03], [0.17, -0.03], [0.2, -0.155], [0.19, -0.166], [0.142, -0.166], [0.13, -0.1]], 0.05, 0.007), m.rubber);
    add(profile([[0.06, -0.042], [0.12, -0.042], [0.12, -0.075], [0.07, -0.075]], 0.012, 0.002, [[[0.067, -0.047], [0.114, -0.047], [0.114, -0.069], [0.075, -0.069]]]), m.blk);
    add(profile([[0.085, -0.042], [0.091, -0.042], [0.095, -0.064], [0.088, -0.068]], 0.006, 0.0015), m.steel);
    add(profile([[0.16, 0.004], [0.48, 0.04], [0.49, -0.122], [0.46, -0.128], [0.4, -0.064], [0.24, -0.052], [0.2, -0.042], [0.16, -0.042]], 0.052, 0.006,
      [[[0.27, -0.008], [0.42, 0.016], [0.42, -0.042], [0.28, -0.036]]]), m.od);
    add(plate(0.046, 0.022, 0.15, 0.006), m.carbon, 0, 0.066, 0.36);
    for (const z of [0.31, 0.41]) add(box(0.01, 0.03, 0.01), m.blk, 0, 0.045, z);
    add(box(0.055, 0.17, 0.02), m.rubber, 0, -0.04, 0.495);
    add(cylY(0.007, 0.007, 0.07), m.blk, 0, -0.1, 0.43);
    // Bípode plegado.
    add(box(0.05, 0.02, 0.03), m.blk, 0, -0.045, -0.42);
    for (const s of [-1, 1]) {
      add(cyl(0.006, 0.005, 0.24, 8), m.blk, s * 0.022, -0.055, -0.3);
      add(new THREE.SphereGeometry(0.009, 8, 6), m.rubber, s * 0.022, -0.055, -0.18);
    }
    // Visor ×5 con parasol, torretas y paralaje.
    add(lathe([[0.0001, 0.17], [0.028, 0.17], [0.03, 0.15], [0.03, 0.11], [0.02, 0.08], [0.02, -0.12], [0.03, -0.15], [0.042, -0.19], [0.042, -0.25], [0.0001, -0.25]], 28), m.blk, 0, 0.115, 0);
    add(lathe([[0.038, -0.25], [0.043, -0.25], [0.043, -0.3], [0.038, -0.3], [0.038, -0.25]], 28), m.blk, 0, 0.115, 0);
    add(new THREE.CircleGeometry(0.026, 24), m.lens, 0, 0.115, 0.1702);
    add(new THREE.CircleGeometry(0.039, 28), m.lensDark, 0, 0.115, -0.2502, 0, Math.PI, 0);
    for (const z of [0.05, -0.08]) {
      add(new THREE.TorusGeometry(0.0215, 0.006, 8, 22), m.blk, 0, 0.115, z);
      add(box(0.03, 0.04, 0.02), m.blk, 0, 0.085, z);
    }
    add(cylY(0.016, 0.016, 0.03, 18), m.rubber, 0, 0.148, -0.02);
    add(new THREE.TorusGeometry(0.0162, 0.0018, 6, 18), m.glowRed, 0, 0.152, -0.02, Math.PI / 2, 0, 0);
    add(cylY(0.014, 0.014, 0.024, 18), m.rubber, 0.03, 0.115, -0.02, 0, 0, Math.PI / 2);
    add(cylY(0.02, 0.02, 0.018, 18), m.blk, -0.03, 0.115, -0.02, 0, 0, Math.PI / 2);
    decal(['LONGSHOT SR-2', '.408 CT · 1:13'], 0.12, 0.026, 0.0371, -0.02, 0.03, -1);
    point('eject', 0.035, 0.03, -0.02);
    return { muzzle: [0, 0.03, -0.885], grips: { r: [0, -0.1, 0.165], l: [0, -0.06, -0.3] }, sight: [0, 0.115, 0.17], eye: 0.12 };
  },

  plasma() {
    const { m, add, part, reticle } = kit();
    const shell = add(new THREE.SphereGeometry(0.1, 32, 20), m.alPurple, 0, 0, -0.08);
    shell.scale.set(0.8, 0.62, 2.1);
    for (let i = 0; i < 4; i++) add(new THREE.TorusGeometry(0.07 - Math.abs(i - 1.5) * 0.008, 0.005, 6, 28), m.alBone, 0, 0, -0.18 + i * 0.07).scale.set(1.15, 0.9, 1);
    const core = part('core', 0, 0.035, -0.12);
    add(new THREE.SphereGeometry(0.05, 18, 12), m.glowPink, 0, 0, 0, 0, 0, 0, core).scale.set(0.7, 0.5, 1.8);
    for (const s of [-1, 1]) {
      const arc = Math.PI * 0.7;
      const prong = add(new THREE.TorusGeometry(0.11, 0.016, 10, 24, arc), m.alPurple, s * 0.05, 0, -0.26, 0, Math.PI / 2, s > 0 ? Math.PI * 0.65 : -Math.PI * 0.35);
      for (const a of [0, arc]) add(new THREE.SphereGeometry(0.02, 12, 10), m.glowPink, Math.cos(a) * 0.11, Math.sin(a) * 0.11, 0, 0, 0, 0, prong);
      add(new THREE.ConeGeometry(0.012, 0.06, 8).rotateX(-Math.PI / 2), m.alBone, s * 0.07, -0.03, -0.2);
    }
    add(profile([[0.0, -0.03], [0.07, -0.03], [0.1, -0.15], [0.085, -0.16], [0.04, -0.14], [0.02, -0.08]], 0.05, 0.012), m.alTeal);
    add(plate(0.015, 0.06, 0.16, 0.006), m.alTeal, 0, 0.07, 0.02);
    // Retícula de energía sobre el lomo.
    for (const s of [-1, 1]) add(new THREE.ConeGeometry(0.006, 0.03, 6), m.alBone, s * 0.014, 0.072, 0.02);
    reticle('alien', 0xff6ad8, 0.026, 0, 0.088, 0.02);
    return { muzzle: [0, 0.02, -0.36], grips: { r: [0, -0.1, 0.06], l: [0, -0.08, -0.18] }, sight: [0, 0.088, 0.02], eye: 0.32 };
  },

  needler() {
    const { m, add, part } = kit();
    const body = add(new THREE.SphereGeometry(0.1, 28, 18), m.alTeal, 0, 0, -0.06);
    body.scale.set(0.75, 0.7, 2);
    add(new THREE.TorusGeometry(0.075, 0.008, 8, 28), m.alBone, 0, 0, -0.04).scale.set(1, 0.95, 1);
    const spikes = part('spikes');
    for (let i = 0; i < 9; i++) {
      const a = (i / 8 - 0.5) * 1.6;
      add(new THREE.ConeGeometry(0.012, 0.11, 6), m.crystal, Math.sin(a) * 0.04, 0.07 + Math.cos(a) * 0.01, -0.21 + i * 0.034, -0.5, 0, a * 0.6, spikes);
    }
    add(profile([[0.02, -0.04], [0.085, -0.04], [0.12, -0.16], [0.1, -0.17], [0.06, -0.15], [0.04, -0.09]], 0.05, 0.012), m.alPurple);
    add(lathe([[0.03, 0.0], [0.042, -0.01], [0.038, -0.05], [0.026, -0.05]], 16), m.alPurple, 0, 0, -0.24);
    add(new THREE.CircleGeometry(0.026, 14), m.glowPink, 0, 0, -0.289, 0, Math.PI, 0);
    // Muesca de cristal trasera (alza) y punto delantero.
    for (const s of [-1, 1]) add(new THREE.ConeGeometry(0.007, 0.04, 6), m.crystal, s * 0.012, 0.09, 0.09, 0, 0, s * 0.35);
    add(new THREE.SphereGeometry(0.004, 8, 6), m.glowPink, 0, 0.106, -0.2);
    return { muzzle: [0, 0, -0.3], grips: { r: [0, -0.1, 0.08], l: [0, -0.09, -0.16] }, sight: [0, 0.106, 0.09], eye: 0.42 };
  },

  arc() {
    const { m, add, part, reticle } = kit();
    add(plate(0.14, 0.16, 0.5, 0.04), m.alGreen, 0, 0, 0.02);
    add(lathe([[0.0001, 0.18], [0.07, 0.18], [0.07, -0.06], [0.06, -0.16], [0.062, -0.18], [0.04, -0.18], [0.0001, -0.18]], 24), m.alGreen, 0, 0.03, -0.36);
    add(new THREE.CircleGeometry(0.04, 20), m.glowGreen, 0, 0.03, -0.541, 0, Math.PI, 0);
    const rings = part('rings', 0, 0.03, 0);
    for (const z of [-0.52, -0.42, -0.32]) add(new THREE.TorusGeometry(0.07, 0.011, 8, 24), m.glowGreen, 0, 0, z, 0, 0, 0, rings);
    for (let a = 0; a < 6; a++) add(box(0.01, 0.01, 0.22), m.alBone, Math.cos(a * 1.047) * 0.075, 0.03 + Math.sin(a * 1.047) * 0.075, -0.42, 0, 0, a * 1.047);
    add(plate(0.06, 0.08, 0.16, 0.015), m.glowGreen, 0.075, -0.02, 0.06);
    add(plate(0.02, 0.1, 0.18, 0.008), m.alBone, 0.09, -0.02, 0.06);
    add(profile([[0.11, -0.06], [0.17, -0.06], [0.2, -0.18], [0.18, -0.19], [0.14, -0.17], [0.125, -0.11]], 0.05, 0.01), m.alBone);
    add(plate(0.04, 0.1, 0.05, 0.012), m.alBone, 0, -0.12, -0.2);
    add(plate(0.02, 0.08, 0.3, 0.008), m.alBone, 0, 0.11, 0.02);
    // Anillo holo de puntería.
    add(new THREE.TorusGeometry(0.022, 0.003, 6, 20), m.alBone, 0, 0.165, 0.09);
    add(box(0.008, 0.02, 0.01), m.alBone, 0, 0.145, 0.09);
    reticle('alien', 0x9dff6a, 0.034, 0, 0.165, 0.091);
    return { muzzle: [0, 0.03, -0.56], grips: { r: [0, -0.12, 0.15], l: [0, -0.12, -0.2] }, sight: [0, 0.165, 0.09], eye: 0.36 };
  },
};

// --- Modelos descargados ------------------------------------------------------------
// GLB normalizados en Blender (largo 1, cañón hacia +X, arriba +Y, cargador como nodo «mag») y guns.json con los
// anclajes (boca, mira, empuñaduras) en esas coordenadas. Aquí se escalan al largo real, se giran a -Z, se colocan
// con la empuñadura donde la mano del arma procedural equivalente, y se visten con el pack de texturas por nombre
// de material. Créditos y licencias: vendor/assets/guns/ATTRIBUTION.md.
const GUN_URL = new URL('../../vendor/assets/guns/', import.meta.url);
// len: largo en metros · at: posición de la mano derecha (empuñadura) · eye: distancia ojo-mira al apuntar ·
// pal: paleta (alienígenas: claro / oscuro / acento) · oneHand: pistolas (la izquierda sujeta bajo la derecha).
const GUN_MODELS = {
  rifle: { len: 1.0, at: [0, -0.1, 0.13], eye: 0.24 },
  pistol: { len: 0.27, at: [0, -0.1, 0.062], eye: 0.5, oneHand: true, tint: { Metal: 'blk' } },
  smg: { len: 0.68, at: [0, -0.1, 0.1], eye: 0.22 },
  shotgun: { len: 1.05, at: [0, -0.1, 0.172], eye: 0.3, sightU: 0.62 },
  dmr: { len: 0.82, at: [0, -0.1, 0.135], eye: 0.3 },
  sniper: { len: 1.22, at: [0, -0.1, 0.165], eye: 0.25 },
  battle: { len: 1.0, at: [0, -0.1, 0.13], eye: 0.24 },
  revolver: { len: 0.33, at: [0, -0.1, 0.062], eye: 0.5, oneHand: true },
  sawed: { len: 0.72, at: [0, -0.1, 0.13], eye: 0.24, sightU: 0.62 },
  plasma: { len: 0.62, at: [0, -0.1, 0.06], eye: 0.3, pal: ['alPurple', 'alBone', 'alPinkGlow'] },
  needler: { len: 0.58, at: [0, -0.1, 0.08], eye: 0.3, pal: ['alTeal', 'alBone', 'alPinkGlow'] },
  arc: { len: 0.92, at: [0, -0.12, 0.15], eye: 0.34, pal: ['alGreen', 'alBone', 'alGreenGlow'] },
  carbine: { len: 0.95, at: [0, -0.1, 0.12], eye: 0.3, pal: ['alTeal', 'alBone', 'alEmeraldGlow'] },
};
// Materiales de los modelos de Quaternius → pack de texturas.
const HUMAN_MATS = {
  Black: 'polyBlk', Black2: 'rubber', DarkMetal: 'blk', Metal: 'park', LightMetal: 'steel', Grey: 'polyGrey',
  Main: 'blk', MainDark: 'polyBlk', MainLight: 'polyGrey', Wood: 'walnut', DarkWood: 'walnutDark', Green: 'od', Glass: 'lensDark',
};
const MODELS = new Map(); // id → { scene, meta }
let modelsReady = null;
export function loadGunModels() {
  if (modelsReady) return modelsReady;
  modelsReady = (async () => {
    try {
      const meta = await (await fetch(new URL('guns.json', GUN_URL))).json();
      const loader = new GLTFLoader();
      await Promise.all(Object.keys(GUN_MODELS).filter((id) => meta[id]).map(async (id) => {
        try {
          const g = await loader.loadAsync(new URL(`${id}.glb`, GUN_URL).href);
          MODELS.set(id, { scene: g.scene, meta: meta[id] });
        } catch (e) { console.warn(`arma ${id}: sin modelo`, e); }
      }));
    } catch (e) { console.warn('modelos de armas no disponibles', e); }
    TPL.clear(); // las plantillas procedurales creadas antes de cargar se rehacen con el modelo
  })();
  return modelsReady;
}
export const hasGunModel = (id) => MODELS.has(id);

function buildFromModel(id) {
  const { scene, meta } = MODELS.get(id), cfg = GUN_MODELS[id], m = mats();
  const group = (lastGroup = new THREE.Group());
  const k = cfg.len;
  // Modelo (x adelante, y arriba, z lateral) → arma (-z adelante): giro de 90° en Y, escala y desplazamiento.
  const rot = new THREE.Matrix4().makeRotationY(Math.PI / 2);
  const off = new THREE.Vector3().fromArray(cfg.at).sub(new THREE.Vector3().fromArray(meta.r).multiplyScalar(k).applyMatrix4(rot));
  const xf = new THREE.Matrix4().makeTranslation(off.x, off.y, off.z).multiply(rot).multiply(new THREE.Matrix4().makeScale(k, k, k));
  const pt = (a) => new THREE.Vector3().fromArray(a).applyMatrix4(xf);
  const matFor = (name) => {
    if (cfg.pal) return m[cfg.pal[name === 'Accent' ? 2 : name === 'Dark' ? 1 : 0]];
    return m[cfg.tint?.[name] ?? HUMAN_MATS[name] ?? 'blk'];
  };
  scene.updateMatrixWorld(true);
  const body = new Map(), mag = new Map();
  scene.traverse((o) => {
    if (!o.isMesh) return;
    let inMag = false;
    for (let p = o; p; p = p.parent) if (p.name === 'mag') inMag = true;
    const g = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(xf, o.matrixWorld));
    const mat = matFor(o.material?.name ?? '');
    const bucket = inMag ? mag : body;
    if (!bucket.has(mat)) bucket.set(mat, []);
    bucket.get(mat).push(prep(g));
  });
  for (const [mat, list] of body) group.add(new THREE.Mesh(concat(list), mat));
  if (mag.size) {
    // Cargador: pieza móvil con el origen en su centro (la recarga lo desplaza y gira).
    const part = new THREE.Group();
    part.name = 'mag';
    part.userData.keep = true;
    const all = [...mag.values()].flat(), box3 = new THREE.Box3();
    for (const g of all) { g.computeBoundingBox(); box3.union(g.boundingBox); }
    const c = box3.getCenter(new THREE.Vector3());
    part.position.copy(c);
    for (const [mat, list] of mag) part.add(new THREE.Mesh(concat(list.map((g) => g.clone().translate(-c.x, -c.y, -c.z))), mat));
    group.add(part);
  }
  // Línea de mira: por encima de todo lo que queda entre la mira y el ojo (culata, alza), para que al apuntar
  // nada del arma tape el centro de la pantalla.
  const sight = pt(meta.sight);
  if (cfg.sightU) sight.z = pt([cfg.sightU - 0.5, 0, 0]).z; // u: fracción del largo desde la culata
  let top = sight.y;
  for (const list of body.values()) for (const g of list) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i);
      if (z > sight.z - 0.03 && z < sight.z + cfg.eye && Math.abs(p.getX(i)) < 0.035) top = Math.max(top, p.getY(i));
    }
  }
  sight.y = top + (cfg.oneHand ? 0.006 : 0.012);
  const r = cfg.at, l = cfg.oneHand ? [r[0] - 0.03, r[1] - 0.012, r[2] - 0.004] : pt(meta.l).add(new THREE.Vector3(0, -0.01, 0)).toArray();
  const ej = new THREE.Object3D();
  ej.name = 'eject';
  ej.position.set(0.035, sight.y - 0.035, (sight.z + r[2]) / 2 - 0.03);
  group.add(ej);
  const muzzle = pt(meta.muzzle);
  return { muzzle: [muzzle.x, muzzle.y, muzzle.z - 0.005], grips: { r, l }, sight: sight.toArray(), eye: cfg.eye };
}

// Piezas con material propio por instancia (el brillo cambia con el calor de cada arma).
const OWN_MAT = ['coil', 'core', 'rings'];
const TPL = new Map();
function buildTemplate(id) {
  if (TPL.has(id)) return TPL.get(id);
  const spec = MODELS.has(id) ? buildFromModel(id) : (BUILDERS[id] ?? BUILDERS.rifle)();
  const group = lastGroup;
  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle';
  muzzle.position.fromArray(spec.muzzle);
  group.add(muzzle);
  bake(group);
  const tpl = { group, grips: spec.grips, sight: spec.sight, eye: spec.eye };
  TPL.set(id, tpl);
  return tpl;
}

export function buildGun(id, finish = 0) {
  if (!BUILDERS[id] && !MODELS.has(id)) id = 'rifle';
  const tpl = buildTemplate(id);
  const group = tpl.group.clone();
  group.traverse((o) => { if (o.isMesh) o.userData.shared = true; });
  const parts = {};
  for (const name of ['mag', 'bolt', 'pump', 'coil', 'core', 'spikes', 'rings']) {
    const o = group.getObjectByName(name);
    if (!o) continue;
    if (OWN_MAT.includes(name)) o.traverse((c) => { if (c.isMesh) c.material = c.material.clone(); });
    parts[name] = o;
  }
  if (finish) applyFinish(group, finish);
  return {
    group, parts, grips: tpl.grips, sight: new THREE.Vector3().fromArray(tpl.sight), eye: tpl.eye,
    muzzle: group.getObjectByName('muzzle'), eject: group.getObjectByName('eject'),
  };
}


// --- Acabados de arma (cajas de la tienda) -------------------------------------------------------------------
// Repintan las piezas de carcasa (metal, polímero, pintura, madera, caparazón alienígena); miras, lentes,
// brillos y empuñaduras de goma se quedan como están. El índice es el de FINISHES (src/shared/shop.js).
const FIN_BASE = ['blk', 'park', 'steel', 'polyBlk', 'polyGrey', 'polyFde', 'od', 'tan', 'white', 'walnut', 'walnutDark', 'carbon', 'hull', 'alPurple', 'alTeal', 'alGreen', 'alBone'];
// color · metal · rough · tex: dibujo (canvas) · glow: color de lo que brilla · emi: intensidad · gloss · anim
const FIN_LOOK = {
  1: { color: 0xe6ebf0, metal: 0.15, rough: 0.6 }, // ÁRTICO
  2: { color: 0xc4a06a, metal: 0.1, rough: 0.7 }, // DESIERTO
  3: { color: 0x4d6a39, metal: 0.1, rough: 0.65 }, // BOSQUE
  4: { color: 0x5a6570, metal: 0.55, rough: 0.45 }, // PIZARRA
  5: { tex: 'rust', metal: 0.4, rough: 0.85 }, // ÓXIDO
  6: { tex: 'urban', metal: 0.15, rough: 0.6 }, // URBANO
  7: { tex: 'jungle', metal: 0.1, rough: 0.65 }, // SELVA
  8: { tex: 'tiger', metal: 0.2, rough: 0.5 }, // TIGRE
  9: { tex: 'digital', metal: 0.15, rough: 0.55 }, // DIGITAL
  10: { tex: 'neon', metal: 0.5, rough: 0.35, glow: 0x3ff2ff, emi: 2.2 }, // NEÓN
  11: { tex: 'magma', metal: 0.2, rough: 0.8, glow: 0xff6a1a, emi: 2.6, anim: 'pulse' }, // MAGMA
  12: { tex: 'ice', metal: 0.1, rough: 0.12, gloss: true }, // HIELO
  13: { tex: 'carbonRed', metal: 0.45, rough: 0.35, gloss: true }, // CARBONO ROJO
  14: { color: 0xffc23a, metal: 1, rough: 0.2, gloss: true }, // ORO
  15: { color: 0xf4f6fa, metal: 1, rough: 0.04, gloss: true }, // CROMO
  16: { tex: 'plasma', metal: 0.3, rough: 0.3, glow: 0xff4dff, emi: 2.4, anim: 'flow', gloss: true }, // PLASMA
  17: { tex: 'dragon', metal: 0.6, rough: 0.35, glow: 0xffb020, emi: 1.8, anim: 'pulse', gloss: true }, // DRAGÓN
};
const FIN_TEX = new Map(), FIN_MATS = new Map(), FIN_ANIM = [];
let finBase = null;

// Dibujo del acabado: { map (color), emi (máscara de brillo) }. Enlosables (ruido periódico) a 256 px.
function finishTex(kind) {
  if (FIN_TEX.has(kind)) return FIN_TEX.get(kind);
  const S = 256, N = S * S, r = mulberry32(kind.length * 7919 + kind.charCodeAt(0));
  const col = new Uint8ClampedArray(N * 4), emi = new Float32Array(N);
  let glows = false;
  const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
  const put = (i, c, k = 1) => { col[i * 4] = c[0] * k; col[i * 4 + 1] = c[1] * k; col[i * 4 + 2] = c[2] * k; col[i * 4 + 3] = 255; };
  // Camuflaje por umbrales de ruido: paleta de oscuro a claro.
  const camo = (cells, pal, cuts) => {
    const f = fbm(S, r, cells, 3);
    for (let i = 0; i < N; i++) { let k = 0; while (k < cuts.length && f[i] > cuts[k]) k++; put(i, hex(pal[k])); }
  };
  if (kind === 'rust') camo(4, [0x3b2418, 0x6d3a1c, 0x8f5428, 0x5a4a40], [0.42, 0.52, 0.6]);
  else if (kind === 'urban') camo(3, [0x1d2024, 0x5d646c, 0x9aa1a8, 0xd6dade], [0.4, 0.5, 0.6]);
  else if (kind === 'jungle') camo(3, [0x1f2a17, 0x3e5a28, 0x6a7a3a, 0x5a4026], [0.42, 0.52, 0.6]);
  else if (kind === 'tiger') {
    const f = fbm(S, r, 4, 3);
    for (let i = 0; i < N; i++) {
      const x = i % S, y = (i / S) | 0, w = Math.sin((x / S) * Math.PI * 2 * 5 + f[i] * 9 + (y / S) * Math.PI * 2);
      put(i, w > 0.55 ? hex(0x14100c) : hex(0xe0761e), 0.85 + f[i] * 0.3);
    }
  } else if (kind === 'digital') {
    const f = fbm(S, r, 3, 3), B = 8;
    for (let i = 0; i < N; i++) {
      const x = i % S, y = (i / S) | 0, v = f[((y / B | 0) * B) * S + (x / B | 0) * B];
      put(i, hex(v > 0.6 ? 0xcfe2f2 : v > 0.5 ? 0x4f86c6 : v > 0.42 ? 0x23476e : 0x0f1d30));
    }
  } else if (kind === 'neon') {
    glows = true;
    for (let i = 0; i < N; i++) {
      const x = i % S, y = (i / S) | 0, gx = Math.min(x % 64, 64 - (x % 64)), gy = Math.min(y % 64, 64 - (y % 64));
      const line = Math.max(0, 1 - Math.min(gx, gy) / 3), diag = Math.max(0, 1 - Math.abs(((x + y) % 128) - 64) / 2.5) * ((y / 64 | 0) % 2);
      const e = Math.min(1, line + diag);
      emi[i] = e;
      put(i, e > 0.1 ? [140, 245, 255] : [12, 16, 22], e > 0.1 ? e : 1);
    }
  } else if (kind === 'magma') {
    glows = true;
    const f = fbm(S, r, 5, 4);
    for (let i = 0; i < N; i++) {
      const crack = Math.max(0, 1 - Math.abs(f[i] - 0.5) * 22);
      emi[i] = crack;
      put(i, crack > 0.15 ? [255, 120 + crack * 100, 30] : [28 + f[i] * 30, 22 + f[i] * 16, 20]);
    }
  } else if (kind === 'ice') {
    const f = fbm(S, r, 6, 4);
    for (let i = 0; i < N; i++) {
      const crack = Math.max(0, 1 - Math.abs(f[i] - 0.5) * 30);
      put(i, [150 + crack * 100 + f[i] * 40, 205 + crack * 50, 240 + crack * 15]);
    }
  } else if (kind === 'carbonRed') {
    for (let i = 0; i < N; i++) {
      const x = i % S, y = (i / S) | 0, cx = (x / 16) | 0, cy = (y / 16) | 0, u = (x % 16) / 16, v = (y % 16) / 16;
      const t = (cx + cy) % 2 ? Math.sin(u * Math.PI) : Math.sin(v * Math.PI);
      put(i, (cx + cy) % 4 < 2 ? [150 * t + 30, 18, 22] : [30 * t + 12, 30 * t + 12, 34 * t + 14]);
    }
  } else if (kind === 'plasma') {
    glows = true;
    const f = fbm(S, r, 3, 4), g2 = fbm(S, r, 6, 2);
    for (let i = 0; i < N; i++) {
      const band = Math.max(0, 1 - Math.abs(Math.sin((f[i] * 6 + g2[i]) * Math.PI)) * 3.2);
      emi[i] = band;
      put(i, [40 + band * 215, 10 + band * 120, 70 + band * 185]);
    }
  } else if (kind === 'dragon') {
    glows = true;
    for (let i = 0; i < N; i++) {
      const x = i % S, y = (i / S) | 0, row = (y / 32) | 0, sx = (x + (row % 2) * 16) % 32, sy = y % 32;
      const d = Math.hypot(sx - 16, sy) / 22; // escamas: arcos solapados
      const edge = Math.max(0, 1 - Math.abs(d - 0.92) * 14);
      emi[i] = edge;
      put(i, edge > 0.2 ? [255, 190, 70] : [90 - d * 50, 14, 18]);
    }
  }
  const mk = (data) => {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    c.getContext('2d').putImageData(new ImageData(data, S, S), 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  };
  const map = mk(col);
  map.colorSpace = THREE.SRGBColorSpace;
  let emiTex = null;
  if (glows) {
    const e = new Uint8ClampedArray(N * 4);
    for (let i = 0; i < N; i++) { e[i * 4] = e[i * 4 + 1] = e[i * 4 + 2] = emi[i] * 255; e[i * 4 + 3] = 255; }
    emiTex = mk(e);
  }
  const out = { map, emi: emiTex };
  FIN_TEX.set(kind, out);
  return out;
}

function finishMat(base, f) {
  const key = `${base.uuid}|${f}`;
  if (FIN_MATS.has(key)) return FIN_MATS.get(key);
  const L = FIN_LOOK[f], m = base.clone();
  if (L.tex) {
    const t = finishTex(L.tex);
    m.map = t.map;
    m.color.set(0xffffff);
    if (t.emi) { m.emissive.set(L.glow); m.emissiveMap = t.emi; m.emissiveIntensity = L.emi; }
  } else m.color.set(L.color);
  if (!L.glow) { m.emissive.set(0x000000); m.emissiveMap = null; m.emissiveIntensity = 0; }
  m.metalness = L.metal;
  m.roughness = L.rough;
  if (m.isMeshPhysicalMaterial) { m.iridescence = 0; m.clearcoat = L.gloss ? 0.8 : 0; }
  if (L.gloss) m.bumpScale = (m.bumpScale ?? 1) * 0.35; // acabados pulidos: menos relieve
  if (L.anim) FIN_ANIM.push({ m, kind: L.anim, base: L.emi });
  m.needsUpdate = true;
  FIN_MATS.set(key, m);
  return m;
}

// Pone el acabado f (0 = de fábrica) en un arma ya construida.
export function applyFinish(group, f = 0) {
  finBase ??= new Set(FIN_BASE.map((k) => mats()[k]));
  if (f && !FIN_LOOK[f]) f = 0;
  group.traverse((o) => {
    if (!o.isMesh) return;
    const orig = o.userData.baseMat ?? o.material;
    if (!finBase.has(orig)) return;
    o.userData.baseMat = orig;
    o.material = f ? finishMat(orig, f) : orig;
  });
}

// Acabados animados (magma y dragón laten; el plasma fluye).
export function tickFinishes(t) {
  for (const a of FIN_ANIM) {
    if (a.kind === 'pulse') a.m.emissiveIntensity = a.base * (0.7 + 0.3 * Math.sin(t * 2.2));
    else if (a.m.emissiveMap) { a.m.emissiveMap.offset.set(t * 0.06, t * 0.025); a.m.map.offset.copy(a.m.emissiveMap.offset); }
  }
}
