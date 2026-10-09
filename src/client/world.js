import * as THREE from 'three';
import { Q } from './quality.js';
import { CFG, clamp } from './config.js';
import { mapInfo } from '../shared/mapinfo.js';
import { MAP_DEFS } from './maps.js';
import { mergeGeometries } from '../../vendor/three/addons/utils/BufferGeometryUtils.js';

export function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  // Lienzo en CPU: se leen píxeles (normales, ruido) y la lectura desde GPU es muy lenta.
  draw(c.getContext('2d', { willReadFrequently: true }), w, h);
  return c;
}

// Calidad MEDIA/BAJA: las texturas de superficie (cuadradas, ≥512 px) se reducen a Q.tex (menos memoria de vídeo y ancho de banda).
function shrink(c) {
  if (c.width !== c.height || c.width <= Q.tex) return c;
  return canvas(Q.tex, Q.tex, (g, w, h) => { g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, w, h); });
}

function toTex(c, srgb = true) {
  const t = new THREE.CanvasTexture(shrink(c));
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Q.level === 'alta' ? 8 : 2;
  return t;
}

function canvasTex(w, h, draw) {
  return toTex(canvas(w, h, draw));
}

function noiseFill(g, w, h, base, amount, rnd = Math.random) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  const img = g.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * 255 * amount;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

// Mapa de normales (espacio tangente) a partir de un lienzo de alturas en gris.
function normalTex(hc, strength = 2) {
  if (!Q.normals) return null; // calidad BAJA: sin mapas de normales (ahorra carga y coste por píxel)
  hc = shrink(hc);
  const w = hc.width, h = hc.height;
  const src = hc.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const out = canvas(w, h, () => {});
  const g = out.getContext('2d', { willReadFrequently: true });
  const img = g.createImageData(w, h);
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (H(x - 1, y) - H(x + 1, y)) * strength, ny = (H(x, y + 1) - H(x, y - 1)) * strength;
      const l = Math.hypot(nx, ny, 1), i = (y * w + x) * 4;
      img.data[i] = (nx / l * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return toTex(out, false);
}

// Ruido de valor 2D determinista + fbm.
function valueNoise(seed) {
  const perm = new Uint8Array(512), r = mulberry32(seed);
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const v = (x, y) => perm[(perm[x & 255] + y) & 511] / 255;
  const s = (t) => t * t * (3 - 2 * t);
  const n = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = s(x - xi), yf = s(y - yi);
    const a = v(xi, yi), b = v(xi + 1, yi), c = v(xi, yi + 1), d = v(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
  return (x, y, oct = 5) => {
    let sum = 0, amp = 0.5, f = 1;
    for (let i = 0; i < oct; i++) { sum += n(x * f, y * f) * amp; f *= 2.03; amp *= 0.5; }
    return sum;
  };
}

const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  return canvasTex(64, 64, (g, w) => {
    const grd = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    grd.addColorStop(0, inner); grd.addColorStop(1, outer);
    g.fillStyle = grd; g.fillRect(0, 0, w, w);
  });
}

// Mapa de entorno (reflejos del cielo) para metales y visores.
export function skyEnvironment(renderer, env = {}) {
  const { top = 0x3a74c0, bottom = 0xdfeaf2, ground = 0x4a5840, sun = [40, 90, 25], sunColor = 0xfff2d9, sunPower = 25 } = env;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const s = new THREE.Scene();
  const geo = new THREE.SphereGeometry(10, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { top: { value: new THREE.Color(top) }, bottom: { value: new THREE.Color(bottom) }, ground: { value: new THREE.Color(ground) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 ground; varying vec3 vP;
      void main(){ float h = vP.y;
        vec3 c = h > 0.0 ? mix(bottom, top, clamp(h * 1.6, 0.0, 1.0)) : mix(bottom * 0.7, ground, clamp(-h * 5.0, 0.0, 1.0));
        gl_FragColor = vec4(c, 1.0); }`,
  });
  s.add(new THREE.Mesh(geo, mat));
  const sunGeo = new THREE.SphereGeometry(0.7, 16, 8);
  const sunMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(sunColor).multiplyScalar(sunPower) });
  const sunM = new THREE.Mesh(sunGeo, sunMat);
  sunM.position.fromArray(sun).normalize().multiplyScalar(9);
  s.add(sunM);
  const rt = pmrem.fromScene(s, 0.02), tex = rt.texture;
  tex.userData.target = rt; // para liberarlo al cambiar de mapa
  pmrem.dispose();
  geo.dispose(); mat.dispose(); sunGeo.dispose(); sunMat.dispose();
  return tex;
}

// --- Texturas procedurales ------------------------------------------------------
// Paneles de aleación antigua: surcos angulares, vetas luminosas en algunos surcos.
function panelSet(base, rnd, { size = 512, glow = true, style = 'forerunner' } = {}) {
  const lines = [];
  const S = size;
  if (style === 'forerunner') {
    lines.push([[0, S * 0.25], [S * 0.35, S * 0.25], [S * 0.42, S * 0.18], [S, S * 0.18]]);
    lines.push([[0, S * 0.75], [S * 0.58, S * 0.75], [S * 0.65, S * 0.82], [S, S * 0.82]]);
    lines.push([[S * 0.5, S * 0.25], [S * 0.5, S * 0.75]]);
    lines.push([[S * 0.12, S * 0.25], [S * 0.12, 0]]);
    lines.push([[S * 0.88, S * 0.82], [S * 0.88, S]]);
    lines.push([[S * 0.5, S * 0.5], [S * 0.62, S * 0.5], [S * 0.68, S * 0.44], [S, S * 0.44]]);
  } else if (style === 'hull') {
    for (let i = 0; i <= 4; i++) lines.push([[0, (i / 4) * S], [S, (i / 4) * S]]);
    for (let i = 0; i < 4; i++) {
      const x = ((i + (i % 2) * 0.5) / 4) * S;
      lines.push([[x, (i / 4) * S], [x, ((i + 1) / 4) * S]]);
    }
  } else if (style === 'floor') {
    lines.push([[0, S / 2], [S, S / 2]], [[S / 2, 0], [S / 2, S]], [[0, 1], [S, 1]], [[1, 0], [1, S]]);
    lines.push([[S * 0.1, S * 0.1], [S * 0.4, S * 0.1], [S * 0.4, S * 0.4], [S * 0.1, S * 0.4], [S * 0.1, S * 0.1]]);
    lines.push([[S * 0.6, S * 0.6], [S * 0.9, S * 0.6], [S * 0.9, S * 0.9], [S * 0.6, S * 0.9], [S * 0.6, S * 0.6]]);
  }
  const stroke = (g, w, color) => {
    g.strokeStyle = color; g.lineWidth = w; g.lineJoin = 'miter';
    for (const l of lines) { g.beginPath(); g.moveTo(...l[0]); for (const p of l.slice(1)) g.lineTo(...p); g.stroke(); }
  };
  const map = canvas(S, S, (g) => {
    noiseFill(g, S, S, base, 0.05, rnd);
    // Vetas de cepillado y desgaste.
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},${0.02 + rnd() * 0.04})`;
      g.fillRect(rnd() * S, rnd() * S, 20 + rnd() * 120, 1 + rnd() * 2);
    }
    for (let i = 0; i < 40; i++) {
      const x = rnd() * S, y = rnd() * S, r = 10 + rnd() * 50;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(20,20,25,0.12)'); grd.addColorStop(1, 'rgba(20,20,25,0)');
      g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    stroke(g, 7, 'rgba(10,14,20,0.55)');
    g.save(); g.translate(1.5, 1.5); stroke(g, 2, 'rgba(255,255,255,0.18)'); g.restore();
    if (style === 'hull') {
      g.fillStyle = 'rgba(0,0,0,0.35)';
      for (let i = 0; i < 60; i++) { g.beginPath(); g.arc(rnd() * S, rnd() * S, 2.5, 0, 7); g.fill(); }
    }
  });
  const height = canvas(S, S, (g) => {
    noiseFill(g, S, S, '#808080', 0.04, rnd);
    stroke(g, 8, '#202020');
    stroke(g, 3, '#000');
  });
  const out = { map: toTex(map), normalMap: normalTex(height, 3) };
  if (glow) {
    out.emissiveMap = toTex(canvas(S, S, (g) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
      g.shadowColor = '#fff'; g.shadowBlur = 8;
      g.strokeStyle = '#fff'; g.lineWidth = 2.2;
      for (const l of lines.filter((_, i) => i % 2 === 0)) { g.beginPath(); g.moveTo(...l[0]); for (const p of l.slice(1)) g.lineTo(...p); g.stroke(); }
    }));
  }
  return out;
}

function rockSet(base, rnd, { snow = false } = {}) {
  const S = Math.min(512, Q.tex), K = S / 512; // ruido por píxel en JS: se genera ya a la resolución final
  const fb = valueNoise((rnd() * 1e9) | 0);
  const height = canvas(S, S, (g) => {
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        // Ruido periódico (4 muestras mezcladas) para que la textura enlace.
        const u = x / S, v = y / S;
        const f = (a, b) => fb(a * 8, b * 8, 5);
        const n = f(u, v) * (1 - u) * (1 - v) + f(u - 1, v) * u * (1 - v) + f(u, v - 1) * (1 - u) * v + f(u - 1, v - 1) * u * v;
        const strata = Math.sin(v * 40 + n * 6) * 0.08;
        const c = clamp(n + strata, 0, 1) * 255, i = (y * S + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = c; img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 2;
    for (let i = 0; i < 18; i++) {
      let x = rnd() * S, y = rnd() * S;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 60 * K; y += rnd() * 40 * K; g.lineTo(x, y); }
      g.stroke();
    }
  });
  const col = new THREE.Color(base);
  const map = canvas(S, S, (g) => {
    g.drawImage(height, 0, 0);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = `#${col.clone().multiplyScalar(1.6).getHexString()}`; g.fillRect(0, 0, S, S);
    g.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 120; i++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? '255,240,220' : '20,15,10'},${0.04 + rnd() * 0.06})`;
      g.beginPath(); g.arc(rnd() * S, rnd() * S, (4 + rnd() * 26) * K, 0, 7); g.fill();
    }
    if (snow) {
      const d = g.getImageData(0, 0, S, S), hd = height.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, S, S).data;
      for (let i = 0; i < d.data.length; i += 4) {
        const t = smooth(0.55, 0.7, hd[i] / 255);
        d.data[i] += (238 - d.data[i]) * t; d.data[i + 1] += (244 - d.data[i + 1]) * t; d.data[i + 2] += (252 - d.data[i + 2]) * t;
      }
      g.putImageData(d, 0, 0);
    }
  });
  return { map: toTex(map), normalMap: normalTex(height, 4) };
}

function groundSet(kind, rnd) {
  const S = 512;
  let map, height;
  if (kind === 'grass') {
    map = canvas(S, S, (g) => {
      noiseFill(g, S, S, '#56703f', 0.12, rnd);
      for (let i = 0; i < 90; i++) {
        const x = rnd() * S, y = rnd() * S, r = 20 + rnd() * 70;
        const grd = g.createRadialGradient(x, y, 0, x, y, r);
        const c = rnd() < 0.3 ? '120,98,60' : rnd() < 0.5 ? '70,100,50' : '110,130,70';
        grd.addColorStop(0, `rgba(${c},0.35)`); grd.addColorStop(1, `rgba(${c},0)`);
        g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      for (let i = 0; i < 9000; i++) {
        const x = rnd() * S, y = rnd() * S, l = 3 + rnd() * 7;
        g.strokeStyle = `rgba(${60 + rnd() * 80},${90 + rnd() * 80},${30 + rnd() * 40},0.55)`;
        g.lineWidth = 1;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 3, y - l); g.stroke();
      }
    });
    height = canvas(S, S, (g) => { noiseFill(g, S, S, '#808080', 0.35, rnd); });
  } else if (kind === 'snow') {
    map = canvas(S, S, (g) => {
      noiseFill(g, S, S, '#e6edf5', 0.04, rnd);
      for (let i = 0; i < 70; i++) {
        const x = rnd() * S, y = rnd() * S, r = 30 + rnd() * 90;
        const grd = g.createRadialGradient(x, y, 0, x, y, r);
        grd.addColorStop(0, rnd() < 0.5 ? 'rgba(170,195,225,0.25)' : 'rgba(255,255,255,0.4)'); grd.addColorStop(1, 'rgba(200,220,240,0)');
        g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(255,255,255,${0.4 + rnd() * 0.6})`; g.fillRect(rnd() * S, rnd() * S, 1, 1); }
    });
    height = canvas(S, S, (g) => {
      g.fillStyle = '#808080'; g.fillRect(0, 0, S, S);
      for (let y = 0; y < S; y += 2) {
        g.fillStyle = `rgba(255,255,255,${0.08 + 0.08 * Math.sin(y * 0.09 + Math.sin(y * 0.013) * 4)})`;
        g.fillRect(0, y, S, 2);
      }
    });
  } else if (kind === 'sand') {
    map = canvas(S, S, (g) => {
      noiseFill(g, S, S, '#c99a62', 0.1, rnd);
      for (let i = 0; i < 60; i++) {
        const x = rnd() * S, y = rnd() * S, r = 30 + rnd() * 90;
        const grd = g.createRadialGradient(x, y, 0, x, y, r);
        grd.addColorStop(0, rnd() < 0.5 ? 'rgba(150,100,60,0.3)' : 'rgba(240,210,160,0.3)'); grd.addColorStop(1, 'rgba(200,150,100,0)');
        g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '90,60,40' : '250,230,200'},0.5)`; g.beginPath(); g.arc(rnd() * S, rnd() * S, 0.6 + rnd() * 1.6, 0, 7); g.fill(); }
    });
    height = canvas(S, S, (g) => {
      const img = g.createImageData(S, S);
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const v = 128 + 70 * Math.sin((y + Math.sin(x * (Math.PI * 2 / S) * 3) * 14) * (Math.PI * 2 / S) * 22) + (rnd() - 0.5) * 30;
          const i = (y * S + x) * 4;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
    });
  } else {
    const p = panelSet('#4a5262', rnd, { style: 'floor' });
    return { ...p, rough: 0.35, metal: 0.6 };
  }
  // Mezcla la textura de color con su relieve para dar volumen.
  return { map: toTex(map), normalMap: normalTex(height, kind === 'sand' ? 1.5 : 2.5), rough: kind === 'snow' ? 0.7 : 0.95, metal: 0 };
}

// Prisma con esquinas achaflanadas (planta en XZ, extruido hacia arriba). UV en metros.
const geoCache = new Map();
function prismGeo(w, h, d, c = 0, top = 1) {
  const key = `${w.toFixed(2)}|${h.toFixed(2)}|${d.toFixed(2)}|${c.toFixed(2)}|${top}`;
  if (geoCache.has(key)) return geoCache.get(key);
  const s = new THREE.Shape(), x = w / 2, z = d / 2;
  c = Math.min(c, x * 0.9, z * 0.9);
  if (c > 0.001) {
    s.moveTo(-x + c, -z); s.lineTo(x - c, -z); s.lineTo(x, -z + c); s.lineTo(x, z - c);
    s.lineTo(x - c, z); s.lineTo(-x + c, z); s.lineTo(-x, z - c); s.lineTo(-x, -z + c);
  } else {
    s.moveTo(-x, -z); s.lineTo(x, -z); s.lineTo(x, z); s.lineTo(-x, z);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  if (top !== 1) {
    // Estrecha la parte superior (pilares y agujas).
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i) / h, k = 1 + (top - 1) * t;
      p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k);
    }
    g.computeVertexNormals();
  }
  geoCache.set(key, g);
  return g;
}

// =============================================================================
export function createWorld(scene, mapId) {
  const info = mapInfo(mapId);
  const def = MAP_DEFS[info.id];
  const H = def.half;
  const STEP = CFG.player.step;
  const rng = mulberry32(def.seed ?? 1337);
  const root = new THREE.Group();
  root.name = `map:${info.id}`;
  scene.add(root);
  const colliders = [], solids = [], animators = [], lifts = [], keep = [];
  const disposables = new Set();
  let heightAt = () => 0;
  const M = {};
  let glowColor = new THREE.Color(0x5fe1ff);
  let pointLights = 0;

  const add = (o) => { root.add(o); return o; };
  const track = (t) => { if (t) disposables.add(t); return t; };
  // Decorado según calidad: se omiten piezas (fracción f) sin dejar de consumir el generador aleatorio,
  // así el resto del mapa (rocas, estructuras, colisiones) es idéntico en todos los niveles y entre jugadores.
  const thin = (f) => { let a = 0; return () => { const prev = a; a += f; return Math.floor(a) > Math.floor(prev); }; };

  const k = {
    H, rng, root, THREE, glowTexture, add,
    keep(x, z, r) { keep.push([x, z, r]); },
    animate(fn) { animators.push(fn); },
    get heightAt() { return heightAt; },

    // --- Cielo y luz ---------------------------------------------------------
    sky({ top, mid, bottom, sun = [40, 90, 25], sunColor = 0xfff1d6, sunSize = 0.0012, haze = 1, stars = 0, nebula = 0x000000, nebulaStrength = 0, fog }) {
      const sunDir = new THREE.Vector3().fromArray(sun).normalize();
      const mat = new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: {
          top: { value: new THREE.Color(top) }, mid: { value: new THREE.Color(mid) }, bottom: { value: new THREE.Color(bottom) },
          sunDir: { value: sunDir }, sunColor: { value: new THREE.Color(sunColor) }, sunSize: { value: sunSize }, haze: { value: haze },
          stars: { value: stars }, nebula: { value: new THREE.Color(nebula) }, nebulaStrength: { value: nebulaStrength },
        },
        vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform vec3 top, mid, bottom, sunColor, nebula; uniform vec3 sunDir; uniform float sunSize, haze, stars, nebulaStrength;
          varying vec3 vP;
          float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
          void main(){
            vec3 d = normalize(vP); float h = d.y;
            vec3 c = h > 0.0 ? mix(mid, top, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(mid, bottom, clamp(-h * 4.0, 0.0, 1.0));
            float s = max(dot(d, sunDir), 0.0);
            c += sunColor * (pow(s, 6.0) * 0.22 * haze + pow(s, 48.0) * 0.5);
            c += sunColor * smoothstep(1.0 - sunSize, 1.0 - sunSize * 0.55, s) * 12.0;
            if (nebulaStrength > 0.0) {
              float n = 0.5 + 0.5 * sin(d.x * 4.0 + sin(d.z * 3.0 + d.y * 6.0) * 2.0) * sin(d.y * 5.0 + d.z * 2.0 + sin(d.x * 7.0));
              c += nebula * pow(n, 3.0) * nebulaStrength;
            }
            if (stars > 0.0) {
              vec3 q = floor(d * 420.0); float n = hash(q);
              float st = smoothstep(1.0 - 0.004 * stars, 1.0, n) * (0.4 + 0.6 * hash(q + 3.1));
              c += vec3(st * 3.0) * clamp(h * 4.0 + 0.4, 0.0, 1.0);
            }
            gl_FragColor = vec4(c, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      });
      const sky = add(new THREE.Mesh(new THREE.SphereGeometry(1800, Q.level === 'alta' ? 48 : 32, Q.level === 'alta' ? 24 : 16), mat));
      sky.renderOrder = -3;
      if (fog) scene.fog = fog[1] ? new THREE.Fog(fog[0], fog[1], fog[2]) : new THREE.FogExp2(fog[0], fog[2]);
      k.sunDir = sunDir;
    },

    lights({ hemi = [0xd6eaff, 0x4a5a3a, 0.6], sun = [0xfff1d6, 2.4], fill }) {
      add(new THREE.HemisphereLight(...hemi));
      const l = new THREE.DirectionalLight(...sun);
      l.position.copy(k.sunDir).multiplyScalar(140);
      l.castShadow = true;
      l.shadow.mapSize.set(Q.shadowSize, Q.shadowSize);
      const E = H + 16;
      Object.assign(l.shadow.camera, { left: -E, right: E, top: E, bottom: -E, near: 1, far: 360 });
      l.shadow.bias = -0.0005;
      l.shadow.normalBias = 0.03;
      add(l); add(l.target);
      if (fill) {
        const f = new THREE.DirectionalLight(...fill.slice(0, 2));
        f.position.fromArray(fill[2]);
        add(f);
      }
    },

    light(x, y, z, color, intensity = 30, distance = 26) {
      if (pointLights >= Q.lights) return;
      pointLights++;
      const l = add(new THREE.PointLight(color, intensity, distance, 2));
      l.position.set(x, y, z);
      return l;
    },

    // Banda del anillo cruzando el cielo.
    ring({ pos = [420, 880, -120], rot = [0, 0, Math.PI / 2], radius = 1000, width = 110, tint = 0xd6e4f5, seed = 3 } = {}) {
      const r = mulberry32(seed);
      const tex = track(canvasTex(2048, 128, (g, w, h) => {
        const grd = g.createLinearGradient(0, 0, w, 0);
        grd.addColorStop(0, '#5f8250'); grd.addColorStop(0.5, '#7b8c5a'); grd.addColorStop(1, '#5f8250');
        g.fillStyle = grd; g.fillRect(0, 0, w, h);
        const land = ['#58784a', '#8aa070', '#a89c78', '#6d7f4c', '#b8a77c'];
        for (let i = 0; i < 700; i++) {
          g.fillStyle = land[(r() * land.length) | 0];
          g.beginPath(); g.ellipse(r() * w, 14 + r() * (h - 28), 6 + r() * 40, 3 + r() * 12, 0, 0, 7); g.fill();
        }
        g.fillStyle = '#3f6f99';
        for (let i = 0; i < 24; i++) { g.beginPath(); g.ellipse(r() * w, 30 + r() * (h - 60), 30 + r() * 90, 8 + r() * 16, 0, 0, 7); g.fill(); }
        for (let i = 0; i < 260; i++) {
          g.fillStyle = `rgba(255,255,255,${0.25 + r() * 0.5})`;
          g.beginPath(); g.ellipse(r() * w, 12 + r() * (h - 24), 8 + r() * 50, 1.5 + r() * 5, (r() - 0.5) * 0.4, 0, 7); g.fill();
        }
        g.fillStyle = '#2f3846'; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10);
        g.fillStyle = '#a7b8c8'; g.fillRect(0, 10, w, 2); g.fillRect(0, h - 12, w, 2);
        for (let x = 0; x < w; x += 32) { g.fillStyle = '#58687a'; g.fillRect(x, 0, 3, 10); g.fillRect(x, h - 10, 3, 10); }
      }));
      tex.repeat.set(8, 1);
      const ring = add(new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, width, 256, 1, true),
        new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, fog: false, color: tint, depthWrite: false }),
      ));
      ring.rotation.set(...rot);
      ring.position.fromArray(pos);
      ring.renderOrder = -2;
      // Bordes metálicos (muros del anillo).
      const rimMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(tint).multiplyScalar(0.55), side: THREE.DoubleSide, fog: false, depthWrite: false });
      for (const s of [-1, 1]) {
        const rim = new THREE.Mesh(new THREE.RingGeometry(radius - width * 0.12, radius + 2, 256, 1), rimMat);
        rim.rotation.x = Math.PI / 2;
        rim.position.y = (s * width) / 2;
        rim.renderOrder = -2;
        ring.add(rim);
      }
      return ring;
    },

    planet({ pos, radius, colors, atmo = 0x9ad8ff, bands = 22, seed = 7, ringed = false }) {
      const r = mulberry32(seed);
      const tex = track(canvasTex(1024, 512, (g, w, h) => {
        for (let y = 0; y < h; y++) {
          const t = y / h + Math.sin(y * 0.05) * 0.01;
          const c = colors[Math.floor((Math.sin(t * bands) * 0.5 + 0.5) * (colors.length - 0.01))];
          g.fillStyle = c; g.fillRect(0, y, w, 1);
        }
        g.globalAlpha = 0.25;
        for (let i = 0; i < 140; i++) {
          g.fillStyle = colors[(r() * colors.length) | 0];
          g.beginPath(); g.ellipse(r() * w, r() * h, 20 + r() * 120, 2 + r() * 8, 0, 0, 7); g.fill();
        }
        g.globalAlpha = 0.6;
        g.fillStyle = colors[colors.length - 1];
        g.beginPath(); g.ellipse(w * 0.62, h * 0.58, 46, 22, 0, 0, 7); g.fill();
        g.globalAlpha = 1;
      }));
      const pl = add(new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 32), new THREE.MeshStandardMaterial({ map: tex, roughness: 1, fog: false, emissive: 0x111522, emissiveMap: tex, emissiveIntensity: 0.25 })));
      pl.position.fromArray(pos);
      pl.rotation.z = 0.35;
      pl.renderOrder = -2;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: track(glowTexture('rgba(255,255,255,0.6)', 'rgba(255,255,255,0)')), color: atmo, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
      glow.scale.setScalar(radius * 2.9);
      glow.position.copy(pl.position);
      glow.renderOrder = -2;
      add(glow);
      if (ringed) {
        const rt = track(canvasTex(512, 8, (g, w) => {
          for (let x = 0; x < w; x++) { g.fillStyle = `rgba(220,210,190,${(0.2 + 0.6 * Math.abs(Math.sin(x * 0.07) * Math.sin(x * 0.013))).toFixed(2)})`; g.fillRect(x, 0, 1, 8); }
        }));
        const geo = new THREE.RingGeometry(radius * 1.3, radius * 2.1, 128, 1);
        const uv = geo.attributes.uv, p = geo.attributes.position;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, (Math.hypot(p.getX(i), p.getY(i)) - radius * 1.3) / (radius * 0.8), 0.5);
        const rg = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: rt, transparent: true, side: THREE.DoubleSide, fog: false, depthWrite: false }));
        rg.rotation.set(1.25, 0.2, 0);
        pl.add(rg);
      }
      return pl;
    },

    clouds({ count = 18, color = 0xffffff, opacity = 0.7, height = [140, 280], dist = [500, 950], size = [220, 420] } = {}) {
      const tex = track(canvasTex(256, 128, (g, w, h) => {
        for (let i = 0; i < 26; i++) {
          const x = w * (0.15 + Math.random() * 0.7), y = h * (0.35 + Math.random() * 0.35), r = 18 + Math.random() * 40;
          const grd = g.createRadialGradient(x, y, 0, x, y, r);
          grd.addColorStop(0, 'rgba(255,255,255,0.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = grd; g.fillRect(0, 0, w, h);
        }
      }));
      const show = thin(Q.clouds);
      for (let i = 0; i < count; i++) {
        const a = rng() * Math.PI * 2, d = dist[0] + rng() * (dist[1] - dist[0]);
        const op = opacity * (0.6 + rng() * 0.4), sz = size[0] + rng() * (size[1] - size[0]);
        const y = height[0] + rng() * (height[1] - height[0]), v = 1.5 + rng() * 2;
        if (!show()) continue;
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity: op, depthWrite: false, fog: false }));
        s.scale.set(sz, sz * 0.45, 1);
        s.position.set(Math.cos(a) * d, y, Math.sin(a) * d);
        s.renderOrder = -1;
        add(s);
        animators.push((dt) => { s.position.x += v * dt; if (s.position.x > 1000) s.position.x = -1000; });
      }
    },

    // --- Materiales ------------------------------------------------------------
    materials({ metal = '#9aa3ad', dark = '#5f6874', glow = 0x5fe1ff, rock = '#7d7b70', crate = '#56604a', alien = '#5a3a78', alienGlow = 0xd36bff, hull = '#3d434c', rockSnow = false, glowIntensity = 1.6 } = {}) {
      glowColor = new THREE.Color(glow);
      const unit = (set, u) => { for (const t of Object.values(set)) if (t?.isTexture) { t.repeat.set(1 / u, 1 / u); track(t); } return set; };
      const pm = (set, o) => new THREE.MeshStandardMaterial({ ...set, ...o });
      const fr = unit(panelSet(metal, rng), 4);
      M.struct = pm(fr, { roughness: 0.38, metalness: 0.6, emissive: glow, emissiveIntensity: glowIntensity });
      const dk = unit(panelSet(dark, rng), 4);
      M.dark = pm(dk, { roughness: 0.45, metalness: 0.55, emissive: glow, emissiveIntensity: glowIntensity * 0.8 });
      const rk = unit(rockSet(rock, rng, { snow: rockSnow }), 5);
      M.rock = pm(rk, { roughness: 0.92, metalness: 0 });
      M.rockFlat = pm(rk, { roughness: 0.95, metalness: 0, flatShading: true });
      const hl = unit(panelSet(hull, rng, { style: 'hull', glow: false }), 3);
      M.hull = pm(hl, { roughness: 0.55, metalness: 0.65 });
      const al = unit(panelSet(alien, rng, { style: 'hull' }), 2.5);
      M.alien = pm(al, { roughness: 0.25, metalness: 0.8, emissive: alienGlow, emissiveIntensity: 1.2 });
      const crt = track(canvasTex(256, 256, (g, w, h) => {
        noiseFill(g, w, h, crate, 0.08);
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, w, 18); g.fillRect(0, h - 18, w, 18); g.fillRect(0, 0, 18, h); g.fillRect(w - 18, 0, 18, h);
        g.strokeStyle = 'rgba(255,255,255,0.15)'; g.lineWidth = 2; g.strokeRect(19, 19, w - 38, h - 38);
        g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(40, h / 2 - 12, w - 80, 24);
        g.fillStyle = '#d9b44a'; g.fillRect(30, 30, 44, 12);
        g.fillStyle = 'rgba(230,230,220,0.75)'; g.font = 'bold 22px monospace'; g.fillText('SUP-07', w - 120, h - 34);
        for (const [x, y] of [[10, 10], [w - 10, 10], [10, h - 10], [w - 10, h - 10]]) { g.fillStyle = '#2a2e26'; g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); }
      }));
      const crh = canvas(256, 256, (g, w, h) => {
        g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#b0b0b0'; g.fillRect(0, 0, w, 18); g.fillRect(0, h - 18, w, 18); g.fillRect(0, 0, 18, h); g.fillRect(w - 18, 0, 18, h);
        g.fillStyle = '#505050'; g.fillRect(40, h / 2 - 12, w - 80, 24);
      });
      M.crate = new THREE.MeshStandardMaterial({ map: crt, normalMap: track(normalTex(crh, 4)), roughness: 0.7, metalness: 0.15 });
      M.ice = new THREE.MeshStandardMaterial({ color: 0xa8dcff, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.82, emissive: 0x2a6a9a, emissiveIntensity: 0.5 });
      M.glow = new THREE.MeshBasicMaterial({ color: glowColor.clone().multiplyScalar(1.6), toneMapped: false });
      M.glowAlien = new THREE.MeshBasicMaterial({ color: new THREE.Color(alienGlow).multiplyScalar(1.4), toneMapped: false });
      // Las vetas luminosas laten despacio.
      animators.push((dt, t) => {
        M.struct.emissiveIntensity = glowIntensity * (0.8 + 0.2 * Math.sin(t * 1.3));
        M.dark.emissiveIntensity = glowIntensity * 0.8 * (0.8 + 0.2 * Math.sin(t * 1.3 + 1));
        M.alien.emissiveIntensity = 1.2 * (0.75 + 0.25 * Math.sin(t * 2.1));
      });
      k.M = M;
    },

    // --- Suelo y terreno --------------------------------------------------------
    ground({ kind = 'grass', tint = 0xffffff, tile = 6, variation = 0.25 }) {
      const s = groundSet(kind, rng);
      for (const key of ['map', 'normalMap', 'emissiveMap']) if (s[key]) { s[key].repeat.set(1, 1); track(s[key]); }
      const size = H * 2 + 16, seg = 64;
      const geo = new THREE.PlaneGeometry(size, size, seg, seg);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * size) / tile, (uv.getY(i) * size) / tile);
      // Variación a gran escala (evita que se note la repetición).
      const fb = valueNoise(99 + (def.seed ?? 0));
      const col = new Float32Array(uv.count * 3), p = geo.attributes.position, base = new THREE.Color(tint);
      for (let i = 0; i < uv.count; i++) {
        const n = 1 - variation + fb(p.getX(i) * 0.03, p.getY(i) * 0.03, 3) * variation * 2;
        col[i * 3] = base.r * n; col[i * 3 + 1] = base.g * n; col[i * 3 + 2] = base.b * n;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const mat = new THREE.MeshStandardMaterial({ map: s.map, normalMap: s.normalMap, vertexColors: true, roughness: s.rough, metalness: s.metal });
      if (s.emissiveMap) Object.assign(mat, { emissiveMap: s.emissiveMap, emissive: glowColor, emissiveIntensity: 0.9 });
      const ground = add(new THREE.Mesh(geo, mat));
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      // Rayos (balas, línea de visión, retícula): el suelo es un plano, así que la intersección es analítica
      // en vez de recorrer sus 8 192 triángulos (era el grueso del coste de cada disparo).
      const half = size / 2, hitNormal = new THREE.Vector3(0, 0, 1);
      ground.raycast = (raycaster, hits) => {
        const r = raycaster.ray, gy = ground.position.y;
        if (r.direction.y >= -1e-6 || r.origin.y < gy) return; // solo desde arriba (cara frontal)
        const t = (gy - r.origin.y) / r.direction.y;
        if (t < raycaster.near || t > raycaster.far) return;
        const x = r.origin.x + r.direction.x * t, z = r.origin.z + r.direction.z * t;
        if (Math.abs(x) > half || Math.abs(z) > half) return;
        const a = Math.round(((half + z) / size) * seg) * (seg + 1) + Math.round(((half + x) / size) * seg); // vértice más cercano (color)
        hits.push({ distance: t, point: new THREE.Vector3(x, gy, z), object: ground, face: { a, b: a, c: a, normal: hitNormal, materialIndex: 0 }, faceIndex: 0 });
      };
      solids.push(ground);
      return ground;
    },

    // Relieve fuera de la arena (colinas, cordilleras, acantilados).
    terrain({ start = 6, rise = 50, base = 8, amp = 50, freq = 0.006, far = 0.05, terrace = 0, colors = ['#4f6a3c', '#6d7457', '#8a8a82', '#f0f4f8'], levels = [0.15, 0.45, 0.8], steep = '#6b6660', tex = '#bdb8ae', size = 1800, seg = 150, tile = 18 }) {
      seg = Math.min(seg, Q.seg);
      const fb = valueNoise(7 + (def.seed ?? 0));
      heightAt = (x, z) => {
        const d = Math.max(Math.abs(x), Math.abs(z)) - (H + start);
        if (d <= 0) return -2;
        let h = smooth(0, rise, d) * (base + amp * fb(x * freq + 50, z * freq + 50, 5)) + d * far;
        if (terrace) h = Math.round(h / terrace) * terrace * 0.75 + h * 0.25;
        return h;
      };
      const geo = new THREE.PlaneGeometry(size, size, seg, seg);
      geo.rotateX(-Math.PI / 2);
      const p = geo.attributes.position, uv = geo.attributes.uv;
      const cols = colors.map((c) => new THREE.Color(c)), rockC = new THREE.Color(steep);
      const col = new Float32Array(p.count * 3);
      let maxH = 1;
      for (let i = 0; i < p.count; i++) { const h = heightAt(p.getX(i), p.getZ(i)); p.setY(i, h); maxH = Math.max(maxH, h); }
      geo.computeVertexNormals();
      const nrm = geo.attributes.normal;
      const c = new THREE.Color();
      for (let i = 0; i < p.count; i++) {
        const t = Math.max(0, p.getY(i)) / maxH + (fb(p.getX(i) * 0.05, p.getZ(i) * 0.05, 2) - 0.5) * 0.12;
        const [a, b, l0, l1] = t < levels[0] ? [0, 0, 0, 1] : t < levels[1] ? [0, 1, levels[0], levels[1]] : t < levels[2] ? [1, 2, levels[1], levels[2]] : [2, 3, levels[2], levels[2] + 0.04];
        c.copy(cols[a]).lerp(cols[b], smooth(l0, l1, t));
        c.lerp(rockC, 1 - smooth(0.55, 0.85, nrm.getY(i))); // laderas empinadas: roca
        col.set([c.r, c.g, c.b], i * 3);
        uv.setXY(i, p.getX(i) / tile, p.getZ(i) / tile);
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      // tex: color base de la roca; 'snow' = textura clara (domina el color de los vértices).
      const gs = tex === 'snow' ? (() => {
        const hc = canvas(256, 256, (g, w, h) => {
          noiseFill(g, w, h, '#d8d8d8', 0.12, rng);
          for (let i = 0; i < 90; i++) {
            const x = rng() * w, y = rng() * h, r = 6 + rng() * 30;
            const grd = g.createRadialGradient(x, y, 0, x, y, r);
            grd.addColorStop(0, `rgba(${rng() < 0.5 ? '255,255,255' : '150,150,150'},0.4)`); grd.addColorStop(1, 'rgba(200,200,200,0)');
            g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
          }
        });
        return { map: toTex(hc), normalMap: normalTex(hc, 2) };
      })() : rockSet(tex, rng);
      track(gs.map); track(gs.normalMap);
      const t = add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: gs.map, normalMap: gs.normalMap, vertexColors: true, roughness: 0.95 })));
      t.receiveShadow = true;
      return heightAt;
    },

    trees({ count = 120, rmin = 6, rmax = 160, crown = 0x2f4a2c, trunk = 0x4a3a2a, snow = false, maxSlope = 0.9 }) {
      const prof = [[0, 9], [1.3, 6.6], [0.75, 6.6], [2.0, 4.0], [1.1, 4.0], [2.6, 1.4], [0, 1.4]].map(([x, y]) => new THREE.Vector2(x, y));
      const cg = new THREE.LatheGeometry(prof, 8);
      const cm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true });
      const crowns = new THREE.InstancedMesh(cg, cm, count);
      const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.4, 2, 6).translate(0, 1, 0), new THREE.MeshStandardMaterial({ color: trunk, roughness: 1 }), count);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
      const base = new THREE.Color(crown), white = new THREE.Color(0xeef4fa), c = new THREE.Color();
      const show = thin(Q.trees);
      let n = 0, placed = 0;
      for (let tries = 0; placed < count && tries < count * 20; tries++) {
        const x = (rng() * 2 - 1) * (H + rmax), z = (rng() * 2 - 1) * (H + rmax);
        const d = Math.max(Math.abs(x), Math.abs(z)) - H;
        if (d < rmin || d > rmax) continue;
        const y = heightAt(x, z);
        if (Math.abs(heightAt(x + 2, z) - y) + Math.abs(heightAt(x, z + 2) - y) > maxSlope * 4) continue;
        const s = 0.8 + rng() * 0.9;
        q.setFromAxisAngle(up, rng() * 6);
        sc.set(s, s * (0.9 + rng() * 0.4), s);
        c.copy(base).multiplyScalar(0.75 + rng() * 0.5);
        if (snow) c.lerp(white, 0.35 + rng() * 0.35);
        placed++;
        if (!show()) continue;
        crowns.setMatrixAt(n, m.compose(p.set(x, y + 0.3, z), q, sc));
        trunks.setMatrixAt(n, m.compose(p.set(x, y - 0.3, z), q, sc));
        crowns.setColorAt(n, c);
        n++;
      }
      crowns.count = trunks.count = n;
      crowns.castShadow = true;
      add(crowns); add(trunks);
    },

    // Matas de hierba dentro de la arena (sin colisión; evitan estructuras).
    grass({ count = 2600, color = 0x6f8f45, height = 0.45 }) {
      const tex = track(canvasTex(128, 128, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        for (let i = 0; i < 26; i++) {
          const x = 10 + Math.random() * (w - 20), lean = (Math.random() - 0.5) * 30, top = 10 + Math.random() * 50;
          g.fillStyle = '#fff';
          g.beginPath(); g.moveTo(x - 3, h); g.quadraticCurveTo(x + lean * 0.3, (h + top) / 2, x + lean, top); g.lineTo(x + 3, h); g.fill();
        }
      }));
      const a = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), b = a.clone().rotateY(Math.PI / 3), c2 = a.clone().rotateY(-Math.PI / 3);
      const geo = new THREE.BufferGeometry();
      const merge = (attr) => {
        const arrs = [a, b, c2].map((g) => g.attributes[attr].array);
        const out = new Float32Array(arrs.reduce((s, x) => s + x.length, 0));
        let o = 0; for (const x of arrs) { out.set(x, o); o += x.length; }
        return new THREE.BufferAttribute(out, a.attributes[attr].itemSize);
      };
      for (const attr of ['position', 'normal', 'uv']) geo.setAttribute(attr, merge(attr));
      geo.setIndex([0, 2, 1, 2, 3, 1, 4, 6, 5, 6, 7, 5, 8, 10, 9, 10, 11, 9]);
      // Normales hacia arriba: la hierba se ilumina como el suelo.
      const nr = geo.attributes.normal; for (let i = 0; i < nr.count; i++) nr.setXYZ(i, 0, 1, 0);
      // Solo forma (alphaMap): el color sale del material, sin bordes oscuros al filtrar.
      const mat = new THREE.MeshStandardMaterial({ alphaMap: tex, color, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1 });
      const inst = new THREE.InstancedMesh(geo, mat, count);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
      const fb = valueNoise(5);
      const show = thin(Q.grass);
      let n = 0, placed = 0;
      for (let tries = 0; placed < count && tries < count * 6; tries++) {
        const x = (rng() * 2 - 1) * (H - 1), z = (rng() * 2 - 1) * (H - 1);
        if (fb(x * 0.08, z * 0.08, 2) < 0.42) continue; // en manchas
        if (colliders.some((bx) => bx.min.y < 0.3 && x > bx.min.x - 0.3 && x < bx.max.x + 0.3 && z > bx.min.z - 0.3 && z < bx.max.z + 0.3)) continue;
        const s = height * (0.7 + rng() * 0.8);
        q.setFromAxisAngle(up, rng() * 6);
        sc.set(s * 1.4, s, s * 1.4);
        c.set(0xffffff).multiplyScalar(0.75 + rng() * 0.45);
        placed++;
        if (!show()) continue;
        inst.setMatrixAt(n, m.compose(p.set(x, 0, z), q, sc));
        inst.setColorAt(n, c);
        n++;
      }
      inst.count = n;
      inst.receiveShadow = true;
      if (n) add(inst); else { inst.dispose(); geo.dispose(); mat.dispose(); } // calidad BAJA: sin hierba
    },

    // Partículas ambientales: nieve, polvo, motas de energía.
    particles({ kind = 'dust', count = 1200, color = 0xffffff, size = 0.12, opacity = 0.8, top = 30 }) {
      const pos = new Float32Array(count * 3), seed = new Float32Array(count);
      const E = H + 10;
      for (let i = 0; i < count; i++) { pos.set([(rng() * 2 - 1) * E, rng() * top, (rng() * 2 - 1) * E], i * 3); seed[i] = rng() * 10; }
      count = Math.round(count * Q.particles); // se generan todas (misma secuencia aleatoria) y se usan las primeras
      if (!count) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, count * 3), 3));
      const mat = new THREE.PointsMaterial({
        map: track(glowTexture()), color, size, transparent: true, opacity, depthWrite: false, sizeAttenuation: true,
        blending: kind === 'motes' ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      const pts = add(new THREE.Points(geo, mat));
      pts.frustumCulled = false;
      const fall = kind === 'snow' ? -1.6 : kind === 'motes' ? 0.5 : -0.15, wind = kind === 'dust' ? 2.6 : kind === 'snow' ? 0.9 : 0.2;
      animators.push((dt, t) => {
        for (let i = 0; i < count; i++) {
          const j = i * 3, s = seed[i];
          pos[j] += (wind + Math.sin(t * 0.7 + s) * 0.6) * dt;
          pos[j + 1] += (fall + Math.sin(t + s * 3) * 0.2) * dt;
          pos[j + 2] += Math.cos(t * 0.5 + s) * 0.5 * dt;
          if (pos[j] > E) pos[j] -= E * 2;
          if (pos[j + 1] < 0) pos[j + 1] += top; else if (pos[j + 1] > top) pos[j + 1] -= top;
        }
        geo.attributes.position.needsUpdate = true;
      });
    },

    // --- Piezas de construcción -------------------------------------------------
    // y = base. o: mat, cham (chaflán), collide, top (estrechamiento), glowTop.
    block(x, y, z, w, h, d, o = {}) {
      const { mat = 'struct', cham = 0, collide = true, top = 1, glowTop = false, rotY = 0, shadow = true } = o;
      const mesh = new THREE.Mesh(prismGeo(w, h, d, cham, top), typeof mat === 'string' ? M[mat] : mat);
      mesh.position.set(x, y, z);
      mesh.rotation.y = rotY;
      mesh.castShadow = shadow; mesh.receiveShadow = true;
      add(mesh);
      solids.push(mesh);
      if (collide) {
        const b = new THREE.Box3(new THREE.Vector3(x - w / 2, y, z - d / 2), new THREE.Vector3(x + w / 2, y + h, z + d / 2));
        if (rotY && Math.abs(Math.sin(rotY * 2)) < 0.01 && Math.abs(Math.sin(rotY)) > 0.5) { b.min.set(x - d / 2, y, z - w / 2); b.max.set(x + d / 2, y + h, z + w / 2); }
        colliders.push(b);
      }
      if (glowTop) k.strip(x, y + h - 0.25, z, w + 0.04, 0.08, d + 0.04);
      return mesh;
    },

    // Caja de colisión sin malla (muros invisibles, acantilados).
    collider(minX, minY, minZ, maxX, maxY, maxZ) {
      colliders.push(new THREE.Box3(new THREE.Vector3(minX, minY, minZ), new THREE.Vector3(maxX, maxY, maxZ)));
    },

    strip(x, y, z, w, h, d, mat = M.glow) {
      const s = add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat));
      s.position.set(x, y, z);
      return s;
    },

    deco(obj, solid = false) {
      add(obj);
      if (solid) obj.traverse((o) => o.isMesh && solids.push(o));
      return obj;
    },

    // Escalera desde el borde (x, z) hacia dir ('n' = -z, 's' = +z, 'e' = +x, 'w' = -x) hasta la altura h.
    stairs(x, z, dir, w, h, mat = 'struct') {
      const n = Math.max(1, Math.ceil(h / 0.45) - 1), rise = h / (n + 1);
      const [dx, dz] = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[dir];
      for (let i = 1; i <= n; i++) {
        const off = n - i + 0.5;
        const sw = dx ? 1 : w, sd = dx ? w : 1;
        k.block(x + dx * off, 0, z + dz * off, sw, rise * i, sd, { mat });
      }
      return n;
    },

    // Plataforma con escaleras, parapetos y luces de borde.
    platform(x, z, w, d, h, { stairs = [], stairW = 4, parapet = true, mat = 'struct', cham = 0.8 } = {}) {
      k.block(x, 0, z, w, h, d, { mat, cham });
      const gaps = { n: [], s: [], e: [], w: [] };
      for (const s of stairs) {
        const [dir, off = 0] = Array.isArray(s) ? s : [s, 0];
        const ex = dir === 'e' ? x + w / 2 : dir === 'w' ? x - w / 2 : x + off;
        const ez = dir === 's' ? z + d / 2 : dir === 'n' ? z - d / 2 : z + off;
        k.stairs(ex, ez, dir, stairW, h, mat);
        gaps[dir].push(off);
      }
      const ph = 0.9, pt = 0.5;
      const edge = (dir) => {
        const along = dir === 'n' || dir === 's' ? w : d;
        const segs = [[-along / 2 + cham + 0.2, along / 2 - cham - 0.2]];
        for (const g of gaps[dir]) {
          const a = g - stairW / 2 - 0.1, b = g + stairW / 2 + 0.1;
          for (let i = segs.length - 1; i >= 0; i--) {
            const [s0, s1] = segs[i];
            if (b <= s0 || a >= s1) continue;
            segs.splice(i, 1, ...[[s0, a], [b, s1]].filter(([p, q]) => q - p > 0.8));
          }
        }
        for (const [s0, s1] of segs) {
          const c = (s0 + s1) / 2, len = s1 - s0;
          if (dir === 'n' || dir === 's') k.block(x + c, h, z + (dir === 's' ? 1 : -1) * (d / 2 - pt / 2 - 0.1), len, ph, pt, { mat: 'dark', cham: 0.12 });
          else k.block(x + (dir === 'e' ? 1 : -1) * (w / 2 - pt / 2 - 0.1), h, z + c, pt, ph, len, { mat: 'dark', cham: 0.12 });
        }
      };
      if (parapet) for (const dir of ['n', 's', 'e', 'w']) edge(dir);
      for (const sx of [-1, 1]) {
        k.strip(x + sx * (w / 2 + 0.01), h - 0.3, z, 0.04, 0.1, d - cham * 2);
        k.strip(x, h - 0.3, z + sx * (d / 2 + 0.01), w - cham * 2, 0.1, 0.04);
      }
    },

    // Monolito: pilar achaflanado que se estrecha, con remate y banda luminosa.
    pillar(x, z, h, s = 2, { mat = 'dark', y = 0, cap = true } = {}) {
      k.block(x, y, z, s, h, s, { mat, cham: s * 0.22, top: 0.82 });
      if (cap) {
        const c = add(new THREE.Mesh(prismGeo(s * 1.15, s * 0.6, s * 1.15, s * 0.3, 0.35), M.struct));
        c.position.set(x, y + h, z);
        c.castShadow = true;
        solids.push(c);
        k.strip(x, y + h - 0.6, z, s * 0.86, 0.14, s * 0.86);
      }
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        k.strip(x + dx * (s * 0.45), y + h * 0.45, z + dz * (s * 0.45), dx ? 0.04 : 0.12, h * 0.55, dz ? 0.04 : 0.12);
      }
    },

    // Arco: dos pilares unidos por un dintel (se puede pasar por debajo).
    arch(x, z, span, h, axis = 'x', s = 1.6) {
      const ax = axis === 'x';
      for (const sg of [-1, 1]) k.pillar(x + (ax ? sg * span / 2 : 0), z + (ax ? 0 : sg * span / 2), h, s, { cap: false });
      const bw = ax ? span + s : s * 1.1, bd = ax ? s * 1.1 : span + s;
      k.block(x, h, z, bw, 1.1, bd, { mat: 'struct', cham: 0.3 });
      k.strip(x, h - 0.05, z, ax ? span - s : s * 0.5, 0.08, ax ? s * 0.5 : span - s);
      // Remate en punta.
      const tip = add(new THREE.Mesh(prismGeo(ax ? span * 0.5 : s, 1.2, ax ? s : span * 0.5, 0.2, 0.2), M.dark));
      tip.position.set(x, h + 1.1, z);
      tip.castShadow = true;
    },

    wall(x, z, w, d, h = 1.6, o = {}) {
      k.block(x, 0, z, w, h, d, { mat: 'dark', cham: Math.min(w, d) * 0.3, ...o });
      k.strip(x, h - 0.2, z, w + 0.02, 0.06, d + 0.02);
    },

    bunker(x, z, sx, sz) {
      k.block(x, 0, z, 9, 3.2, 1.2, { mat: 'struct', cham: 0.4 });
      k.block(x + sx * 3.9, 0, z - sz * 3.6, 1.2, 3.2, 6, { mat: 'struct', cham: 0.4 });
      k.block(x, 3.2, z, 9.4, 0.35, 1.6, { mat: 'dark', cham: 0.3 });
      k.block(x + sx * 3.9, 3.2, z - sz * 3.6, 1.6, 0.35, 6.4, { mat: 'dark', cham: 0.3 });
      k.strip(x, 2.6, z + sz * 0.62, 7.5, 0.08, 0.04);
    },

    // Aguja alienígena (orgánica, violeta).
    spire(x, z, h, r = 1.1) {
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        pts.push(new THREE.Vector2(r * (1 - t * 0.85) * (1 + 0.25 * Math.sin(t * 9)), t * h));
      }
      pts.push(new THREE.Vector2(0, h + 1.5));
      const sp = add(new THREE.Mesh(new THREE.LatheGeometry(pts, 10), M.alien));
      sp.position.set(x, 0, z);
      sp.castShadow = true;
      solids.push(sp);
      colliders.push(new THREE.Box3(new THREE.Vector3(x - r * 0.75, 0, z - r * 0.75), new THREE.Vector3(x + r * 0.75, h, z + r * 0.75)));
      const orb = add(new THREE.Mesh(new THREE.SphereGeometry(r * 0.35, 16, 8), M.glowAlien));
      orb.position.set(x, h * 0.72, z);
      for (let i = 0; i < 3; i++) {
        const fin = add(new THREE.Mesh(new THREE.ConeGeometry(r * 0.25, h * 0.5, 4), M.alien));
        const a = (i / 3) * Math.PI * 2;
        fin.position.set(x + Math.cos(a) * r * 0.8, h * 0.3, z + Math.sin(a) * r * 0.8);
        fin.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
      }
      animators.push((dt, t) => orb.scale.setScalar(1 + 0.15 * Math.sin(t * 3 + x)));
    },

    crystal(x, z, s = 1.5) {
      const g = new THREE.Group();
      const n = 3 + ((rng() * 3) | 0);
      for (let i = 0; i < n; i++) {
        const c = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), M.ice);
        const hh = s * (1.2 + rng() * 1.6);
        c.scale.set(s * 0.35, hh, s * 0.35);
        c.position.set((rng() - 0.5) * s * 0.9, hh * 0.6, (rng() - 0.5) * s * 0.9);
        c.rotation.set((rng() - 0.5) * 0.7, rng() * 6, (rng() - 0.5) * 0.7);
        c.castShadow = true;
        g.add(c);
      }
      g.position.set(x, 0, z);
      k.deco(g, true);
      colliders.push(new THREE.Box3(new THREE.Vector3(x - s * 0.55, 0, z - s * 0.55), new THREE.Vector3(x + s * 0.55, s * 2.2, z + s * 0.55)));
    },

    rock(x, z, s, { mat = 'rockFlat', y = 0, squash = 0.65, collide = true } = {}) {
      const geo = new THREE.IcosahedronGeometry(1, 2);
      const p = geo.attributes.position, fb = valueNoise((rng() * 1e6) | 0);
      for (let i = 0; i < p.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(p, i);
        const n = 0.75 + fb(v.x * 1.5 + 9, v.y * 1.5 + v.z * 1.3 + 9, 3) * 0.55;
        p.setXYZ(i, v.x * n, v.y * n, v.z * n);
      }
      geo.computeVertexNormals();
      const r = add(new THREE.Mesh(geo, M[mat]));
      r.scale.set(s * (0.9 + rng() * 0.3), s * squash, s * (0.9 + rng() * 0.3));
      r.position.set(x, y + s * squash * 0.45, z);
      r.rotation.y = rng() * 6;
      r.castShadow = r.receiveShadow = true;
      solids.push(r);
      if (collide) {
        const b = new THREE.Box3().setFromObject(r);
        const sh = s * 0.25;
        b.min.x += sh; b.max.x -= sh; b.min.z += sh; b.max.z -= sh; b.max.y -= s * 0.1; b.min.y = Math.max(b.min.y, 0);
        colliders.push(b);
      }
      return r;
    },

    // Reparte cajas, rocas o cristales evitando estructuras y zonas reservadas.
    scatter(kind, count, { rmin = 10, rmax = H - 4, size = [1.2, 2.4] } = {}) {
      const placed = colliders.map((b) => b.clone().expandByScalar(1.5));
      const tmp = new THREE.Box3();
      let n = 0, tries = 0;
      while (n < count && tries++ < count * 40) {
        const a = rng() * Math.PI * 2, r = rmin + rng() * (rmax - rmin);
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (Math.abs(x) > H - 3 || Math.abs(z) > H - 3) continue;
        if (keep.some(([kx, kz, kr]) => Math.hypot(x - kx, z - kz) < kr)) continue;
        const s = size[0] + rng() * (size[1] - size[0]);
        tmp.min.set(x - s / 2 - 1.2, 0, z - s / 2 - 1.2); tmp.max.set(x + s / 2 + 1.2, 10, z + s / 2 + 1.2);
        if (placed.some((b) => b.intersectsBox(tmp))) continue;
        if (kind === 'crate') {
          const w = s, d = 1.4 + rng() * 1.0, h = 1.2 + rng() * 0.4;
          const c = k.box(x, 0, z, w, h, d, M.crate);
          c.rotation.y = 0;
          if (rng() < 0.3) k.box(x + (rng() - 0.5) * 0.3, h, z + (rng() - 0.5) * 0.3, w * 0.8, 1.1, d * 0.8, M.crate);
        } else if (kind === 'rock') k.rock(x, z, s);
        else if (kind === 'crystal') k.crystal(x, z, s);
        placed.push(tmp.clone());
        n++;
      }
    },

    // Caja simple (UV por cara; para cajas de suministros).
    box(x, y, z, w, h, d, mat) {
      const mesh = add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat));
      mesh.position.set(x, y + h / 2, z);
      mesh.castShadow = mesh.receiveShadow = true;
      solids.push(mesh);
      colliders.push(new THREE.Box3().setFromObject(mesh));
      return mesh;
    },

    // Muro perimetral. style: forerunner | rock | barrier
    perimeter({ style = 'forerunner', h = 7 } = {}) {
      const L = H * 2 + 4;
      for (const sg of [-1, 1]) {
        k.collider(-L / 2, 0, sg * H + (sg < 0 ? -2 : 0), L / 2, h + 4, sg * H + (sg > 0 ? 2 : 0));
        k.collider(sg * H + (sg < 0 ? -2 : 0), 0, -L / 2, sg * H + (sg > 0 ? 2 : 0), h + 4, L / 2);
      }
      if (style === 'forerunner') {
        const segN = Math.round(L / 12), seg = L / segN;
        for (const sg of [-1, 1]) {
          for (let i = 0; i < segN; i++) {
            const c = -L / 2 + seg * (i + 0.5);
            const hh = h - 0.6 + ((i * 7) % 3) * 0.3;
            k.block(c, 0, sg * (H + 1), seg - 0.3, hh, 2, { mat: 'struct', cham: 0.5, collide: false });
            k.block(sg * (H + 1), 0, c, 2, hh, seg - 0.3, { mat: 'struct', cham: 0.5, collide: false });
            const b = -L / 2 + seg * i;
            k.block(b, 0, sg * (H + 1.6), 1.6, h + 1.4, 2.4, { mat: 'dark', cham: 0.5, top: 0.75, collide: false });
            k.block(sg * (H + 1.6), 0, b, 2.4, h + 1.4, 1.6, { mat: 'dark', cham: 0.5, top: 0.75, collide: false });
          }
          for (const sz of [-1, 1]) k.block(sg * (H + 1.2), 0, sz * (H + 1.2), 4, h + 2, 4, { mat: 'dark', cham: 1, top: 0.7, collide: false });
          k.strip(0, h - 1.2, sg * (H - 0.02), H * 2, 0.12, 0.05);
          k.strip(sg * (H - 0.02), h - 1.2, 0, 0.05, 0.12, H * 2);
          k.strip(0, 0.5, sg * (H - 0.02), H * 2, 0.06, 0.05);
          k.strip(sg * (H - 0.02), 0.5, 0, 0.05, 0.06, H * 2);
        }
      } else if (style === 'rock') {
        for (const sg of [-1, 1]) {
          for (let t = -H - 6; t <= H + 6; t += 9 + rng() * 5) {
            const s = 3 + rng() * 4;
            const o = H + 1.5 + s * 0.8;
            k.rock(t, sg * o, s, { mat: 'rock', squash: 0.7 + rng() * 0.5, collide: false });
            k.rock(sg * o, -t, s, { mat: 'rock', squash: 0.7 + rng() * 0.5, collide: false });
          }
        }
      } else if (style === 'barrier') {
        const fieldTex = track(canvasTex(256, 256, (g, w, hh) => {
          g.clearRect(0, 0, w, hh);
          g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1.5;
          const r = 18;
          for (let y = 0; y < hh + r; y += r * 1.5) {
            for (let x = 0; x < w + r; x += r * Math.sqrt(3)) {
              const ox = x + ((y / (r * 1.5)) % 2 ? (r * Math.sqrt(3)) / 2 : 0);
              g.beginPath();
              for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; g.lineTo(ox + Math.cos(a) * r, y + Math.sin(a) * r); }
              g.stroke();
            }
          }
          const grd = g.createLinearGradient(0, hh, 0, 0);
          grd.addColorStop(0, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = grd; g.fillRect(0, 0, w, hh);
        }));
        fieldTex.repeat.set(H / 4, 1);
        const fm = new THREE.MeshBasicMaterial({ map: fieldTex, color: glowColor, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
        animators.push((dt) => { fieldTex.offset.y -= dt * 0.08; fieldTex.offset.x += dt * 0.02; });
        for (const sg of [-1, 1]) {
          k.block(0, 0, sg * (H + 0.6), H * 2 + 2.4, 1.3, 1.2, { mat: 'dark', cham: 0.4, collide: false });
          k.block(sg * (H + 0.6), 0, 0, 1.2, 1.3, H * 2 + 2.4, { mat: 'dark', cham: 0.4, collide: false });
          for (const rotY of [0, Math.PI / 2]) {
            const f = add(new THREE.Mesh(new THREE.PlaneGeometry(H * 2 + 2, h), fm));
            f.position.set(rotY ? sg * (H + 0.6) : 0, 1.3 + h / 2, rotY ? 0 : sg * (H + 0.6));
            f.rotation.y = rotY;
          }
          k.strip(0, 1.32, sg * (H + 0.6), H * 2 + 2, 0.1, 0.3);
          k.strip(sg * (H + 0.6), 1.32, 0, 0.3, 0.1, H * 2 + 2);
          for (let t = -H; t <= H; t += H / 3) {
            k.block(t, 0, sg * (H + 0.8), 1.4, h + 1.5, 1.6, { mat: 'struct', cham: 0.4, top: 0.6, collide: false });
            k.block(sg * (H + 0.8), 0, t, 1.6, h + 1.5, 1.4, { mat: 'struct', cham: 0.4, top: 0.6, collide: false });
          }
        }
      }
    },

    // Ascensor gravitatorio: lanza al jugador hacia `to` [x, y, z].
    lift(x, z, to, r = 1.1) {
      const g = CFG.player.gravity, apex = to[1] + 1.6;
      const vy = Math.sqrt(2 * g * apex), T = vy / g + Math.sqrt((2 * (apex - to[1])) / g);
      lifts.push({ x, z, r, t: T, vel: [(to[0] - x) / T, vy, (to[2] - z) / T] });
      keep.push([x, z, r + 1.5]);
      const pad = add(new THREE.Mesh(new THREE.CylinderGeometry(r + 0.35, r + 0.55, 0.16, 24), M.dark));
      pad.position.set(x, 0.08, z);
      pad.receiveShadow = true;
      const disc = add(new THREE.Mesh(new THREE.CircleGeometry(r, 32), M.glow));
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(x, 0.17, z);
      const beamTex = track(canvasTex(64, 128, (gg, w, hh) => {
        for (let y = 0; y < hh; y += 16) { gg.fillStyle = 'rgba(255,255,255,0.7)'; gg.fillRect(0, y, w, 3); }
        const grd = gg.createLinearGradient(0, 0, 0, hh);
        grd.addColorStop(0, 'rgba(0,0,0,1)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
        gg.globalCompositeOperation = 'destination-out'; gg.fillStyle = grd; gg.fillRect(0, 0, w, hh);
      }));
      beamTex.repeat.set(3, 1);
      const beam = add(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r, apex * 0.8, 24, 1, true),
        new THREE.MeshBasicMaterial({ map: beamTex, color: glowColor, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })));
      beam.position.set(x, apex * 0.4 + 0.1, z);
      animators.push((dt) => { beamTex.offset.y -= dt * 1.4; });
    },

    // Emblema holográfico giratorio (decorativo).
    holo(x, y, z, s = 3) {
      const g = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const rings = [0, 1, 2].map((i) => {
        const r = new THREE.Mesh(new THREE.TorusGeometry(s * (1 - i * 0.22), 0.05 + i * 0.02, 6, 64), mat);
        g.add(r);
        return r;
      });
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(s * 0.22, 0), mat);
      g.add(core);
      g.position.set(x, y, z);
      add(g);
      animators.push((dt, t) => {
        rings[0].rotation.set(t * 0.4, t * 0.3, 0);
        rings[1].rotation.set(-t * 0.5, 0, t * 0.35);
        rings[2].rotation.set(0, t * 0.7, t * 0.2);
        core.rotation.y = t;
        core.position.y = Math.sin(t * 1.5) * 0.2;
      });
    },
  };

  def.build(k);
  const batched = batchStatic();

  // Fusiona las piezas estáticas que comparten material en una sola malla por grupo: menos llamadas de dibujo
  // (el cuello de botella en móvil). Las originales salen de la escena pero siguen en `solids` para los rayos
  // (balas, línea de visión), así que impactos y colisiones no cambian.
  function batchStatic() {
    root.updateMatrixWorld(true);
    const cands = [];
    root.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || Array.isArray(o.material) || !o.visible || o.renderOrder) return;
      if (o.material.transparent || !o.geometry.attributes.position) return;
      cands.push(o);
    });
    // Lo que se mueve (anillos, orbes, hologramas...) se detecta ejecutando las animaciones en instantes de prueba.
    const before = cands.map((o) => o.matrixWorld.clone());
    for (const t of [0.37, 1.9, 4.3]) for (const fn of animators) fn(0, t);
    root.updateMatrixWorld(true);
    const groups = new Map();
    cands.forEach((o, i) => {
      if (!o.matrixWorld.equals(before[i]) || o.matrixWorld.determinant() < 0) return; // móvil o espejado: se deja
      const g = o.geometry, attrs = Object.keys(g.attributes).sort().join(',');
      const key = `${o.material.uuid}|${attrs}|${g.index ? 1 : 0}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(o);
    });
    const removed = [];
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const geos = list.map((o) => {
        const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
        for (const name of Object.keys(g.morphAttributes)) delete g.morphAttributes[name];
        return g;
      });
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      const m = new THREE.Mesh(merged, list[0].material);
      m.castShadow = list[0].castShadow; m.receiveShadow = list[0].receiveShadow;
      m.matrixAutoUpdate = false;
      root.add(m);
      for (const o of list) { o.parent.remove(o); removed.push(o); }
    }
    root.updateMatrixWorld(true);
    return removed;
  }

  // --- API de colisiones ----------------------------------------------------
  function groundHeightAt(x, z, r, feetY, step = STEP) {
    let h = 0;
    for (const b of colliders) {
      if (x + r <= b.min.x || x - r >= b.max.x || z + r <= b.min.z || z - r >= b.max.z) continue;
      if (b.max.y <= feetY + step && b.max.y > h) h = b.max.y;
    }
    return h;
  }

  // Empuja un círculo (plano XZ) fuera de las cajas que interseca en altura.
  function resolveHorizontal(pos, r, feetY, headY, step = STEP) {
    let hit = false;
    for (const b of colliders) {
      if (b.max.y <= feetY + step || b.min.y >= headY) continue;
      const cx = clamp(pos.x, b.min.x, b.max.x), cz = clamp(pos.z, b.min.z, b.max.z);
      const dx = pos.x - cx, dz = pos.z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      hit = true;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pos.x += (dx / d) * (r - d); pos.z += (dz / d) * (r - d);
      } else {
        const pen = [pos.x - b.min.x, b.max.x - pos.x, pos.z - b.min.z, b.max.z - pos.z];
        const i = pen.indexOf(Math.min(...pen));
        if (i === 0) pos.x = b.min.x - r; else if (i === 1) pos.x = b.max.x + r;
        else if (i === 2) pos.z = b.min.z - r; else pos.z = b.max.z + r;
      }
    }
    return hit;
  }

  function clampToArena(pos, r) {
    const L = H - r;
    pos.x = clamp(pos.x, -L, L);
    pos.z = clamp(pos.z, -L, L);
  }

  const ray = new THREE.Raycaster(), dir = new THREE.Vector3();
  function lineOfSight(a, b) {
    dir.subVectors(b, a);
    const d = dir.length();
    if (d < 1e-3) return true;
    ray.set(a, dir.divideScalar(d));
    ray.far = d - 0.2;
    return ray.intersectObjects(solids, false).length === 0;
  }

  function pointInSolid(p) {
    if (p.y <= 0) return true;
    for (const b of colliders) if (b.containsPoint(p)) return true;
    return false;
  }

  function liftAt(pos) {
    for (const l of lifts) if (pos.y < 0.6 && Math.hypot(pos.x - l.x, pos.z - l.z) < l.r) return l;
    return null;
  }

  // Puntos de aparición junto a los muros, fuera de obstáculos.
  const spawnPoints = [];
  const probe = new THREE.Vector3(), grown = colliders.map((b) => b.clone().expandByScalar(1.2));
  const E = H - 6, T = Math.floor((H - 13) / 9) * 9;
  for (let t = -T; t <= T; t += 9) {
    for (const [x, z] of [[t, -E], [t, E], [-E, t], [E, t]]) {
      probe.set(x, 0.5, z);
      if (!grown.some((b) => b.containsPoint(probe)) && !lifts.some((l) => Math.hypot(x - l.x, z - l.z) < l.r + 1)) spawnPoints.push(new THREE.Vector3(x, 0, z));
    }
  }

  let time = 0;
  function update(dt) {
    time += dt;
    for (const fn of animators) fn(dt, time);
  }

  function dispose() {
    scene.remove(root);
    root.traverse((o) => {
      if (o.isLight || o.isInstancedMesh) o.dispose(); // mapas de sombras, búferes de instancias
      if (o.geometry && ![...geoCache.values()].includes(o.geometry)) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) { for (const key of ['map', 'normalMap', 'emissiveMap', 'alphaMap']) m[key]?.dispose(); m.dispose(); }
    });
    const cached = new Set(geoCache.values());
    for (const o of batched) if (!cached.has(o.geometry)) o.geometry.dispose();
    for (const t of disposables) t.dispose();
  }

  return {
    id: info.id, info, half: H, root, colliders, solids, spawnPoints, lifts,
    spawn: def.spawn, boxSpots: def.boxes, menuCam: def.menuCam ?? [0, 9, 34], env: def.env, exposure: def.exposure ?? 1,
    groundHeightAt, resolveHorizontal, clampToArena, lineOfSight, pointInSolid, liftAt, update, dispose,
  };
}
