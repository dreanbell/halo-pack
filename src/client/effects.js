// Efectos visuales: partículas por GPU (dos mallas instanciadas: aditiva y normal), trazadoras con perspectiva,
// impactos según la superficie, sangre, explosiones por capas, onda de choque y marcas (agujeros, quemaduras).
// Todo es visual: no afecta a daño ni colisiones. La cantidad de partículas se escala con la calidad (Q.fx).
import * as THREE from 'three';
import { Q } from './quality.js';
import { S } from './settings.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const _s = new THREE.Vector3(), _c = new THREE.Color(), _c2 = new THREE.Color();
const Z = new THREE.Vector3(0, 0, 1), _q2 = new THREE.Quaternion();
// Colores temporales (emit copia los valores al momento): evitan crear objetos en cada impacto.
const _t = [0, 1, 2, 3, 4, 5].map(() => new THREE.Color());
const tint = (k, hex, mul = 1) => _t[k].set(hex).multiplyScalar(mul);
const rnd = (a, b) => a + Math.random() * (b - a);
const n = (k) => Math.max(1, Math.round(k * Q.fx)); // número de partículas según calidad

// Atlas 2×2: 0 resplandor · 1 humo · 2 fuego · 3 estela (brillante a la derecha = cabeza).
const GLOW = 0, SMOKE = 1, FIRE = 2, STREAK = 3;
function atlas() {
  const S = 128, c = document.createElement('canvas');
  c.width = c.height = S * 2;
  const g = c.getContext('2d');
  // Celda f: columna f%2, fila desde abajo floor(f/2) (la textura se voltea en Y).
  const cell = (f, draw) => { g.save(); g.translate((f % 2) * S, (1 - Math.floor(f / 2)) * S); g.beginPath(); g.rect(0, 0, S, S); g.clip(); draw(); g.restore(); };
  const blob = (x, y, r, a) => {
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(255,255,255,${a})`); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
  };
  cell(GLOW, () => {
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,0.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
  });
  cell(SMOKE, () => {
    for (let i = 0; i < 26; i++) { const a = Math.random() * 6.28, d = Math.random() * 26; blob(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 18 + Math.random() * 22, 0.32); }
    blob(64, 64, 60, 0.4);
  });
  cell(FIRE, () => {
    blob(64, 64, 58, 0.5);
    for (let i = 0; i < 30; i++) { const a = Math.random() * 6.28, d = Math.random() * 30; blob(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 8 + Math.random() * 20, 0.35); }
    blob(64, 64, 24, 0.8);
  });
  cell(STREAK, () => {
    const grd = g.createLinearGradient(0, 0, S, 0);
    grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.75, 'rgba(255,255,255,0.55)'); grd.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = grd;
    for (let y = 0; y < S; y++) { const k = Math.exp(-(((y - 64) / 22) ** 2)); g.globalAlpha = k; g.fillRect(0, y, S, 1); }
    g.globalAlpha = 1;
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const VS = `
attribute vec3 iPos; attribute vec4 iCol; attribute vec4 iMisc; attribute vec3 iStr;
varying vec2 vUv; varying vec4 vCol; varying float vFogDepth;
void main() {
  vec2 c = position.xy;
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  float size = iMisc.x;
  if (iMisc.w > 0.5) {
    // Estela: cuadrilátero entre la cola y la cabeza, cada extremo a su profundidad (perspectiva correcta).
    vec4 tail = modelViewMatrix * vec4(iPos - iStr, 1.0);
    if (tail.z > -0.05) { float t = (mv.z + 0.05) / (mv.z - tail.z); tail = mix(mv, tail, clamp(t, 0.0, 1.0)); }
    vec2 a = mv.xy / max(-mv.z, 0.05), b = tail.xy / max(-tail.z, 0.05), d = a - b;
    float l = length(d);
    vec2 dir = l > 1e-6 ? d / l : vec2(1.0, 0.0);
    vec4 p = mix(tail, mv, c.x + 0.5);
    p.xy += vec2(-dir.y, dir.x) * c.y * size;
    mv = p;
  } else {
    float s = sin(iMisc.y), k = cos(iMisc.y);
    mv.xy += vec2(c.x * k - c.y * s, c.x * s + c.y * k) * size;
  }
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
  vUv = (uv + vec2(mod(iMisc.z, 2.0), floor(iMisc.z / 2.0))) * 0.5;
  vCol = iCol;
}`;
const FS = `
uniform sampler2D map; uniform float additive;
uniform vec3 fogColor; uniform float fogNear, fogFar, fogDensity;
varying vec2 vUv; varying vec4 vCol; varying float vFogDepth;
void main() {
  vec4 t = texture2D(map, vUv);
  vec4 c = vec4(vCol.rgb * t.rgb, vCol.a * t.a);
  if (c.a < 0.004) discard;
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float ff = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      float ff = smoothstep(fogNear, fogFar, vFogDepth);
    #endif
    if (additive > 0.5) c.rgb *= 1.0 - ff; else c.rgb = mix(c.rgb, fogColor, ff);
  #endif
  gl_FragColor = c;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// Sistema de partículas: estructura de arrays (sin objetos por partícula) y una sola llamada de dibujo.
class Particles {
  constructor(scene, map, additive, cap) {
    this.cap = cap;
    this.n = 0;
    const F = (k) => new Float32Array(cap * k);
    Object.assign(this, {
      p: F(3), v: F(3), str: F(3), age: F(1), life: F(1), s0: F(1), s1: F(1), c0: F(3), c1: F(3), a: F(1), fi: F(1),
      rot: F(1), rv: F(1), grav: F(1), drag: F(1), frame: F(1), sk: F(1), trav: F(1), max: F(1), floor: F(1), mode: F(1),
    });
    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    geo.setAttribute('uv', quad.attributes.uv);
    const ia = (k) => new THREE.InstancedBufferAttribute(new Float32Array(cap * k), k).setUsage(THREE.DynamicDrawUsage);
    this.aPos = ia(3); this.aCol = ia(4); this.aMisc = ia(4); this.aStr = ia(3);
    geo.setAttribute('iPos', this.aPos); geo.setAttribute('iCol', this.aCol); geo.setAttribute('iMisc', this.aMisc); geo.setAttribute('iStr', this.aStr);
    geo.instanceCount = 0;
    this.geo = geo;
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: map }, additive: { value: additive ? 1 : 0 }, ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog) },
      vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, fog: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 2 : 1;
    scene.add(this.mesh);
  }

  // o: { p, v, life, s0, s1, c0, c1 (THREE.Color), a, fi, rot, rv, grav, drag, frame, stretch, str (estela fija), max, floor }
  emit(o) {
    if (this.n >= this.cap) return;
    const i = this.n++, j = i * 3;
    this.p[j] = o.p.x; this.p[j + 1] = o.p.y; this.p[j + 2] = o.p.z;
    const v = o.v; this.v[j] = v ? v.x : 0; this.v[j + 1] = v ? v.y : 0; this.v[j + 2] = v ? v.z : 0;
    this.age[i] = 0; this.life[i] = o.life;
    this.s0[i] = o.s0; this.s1[i] = o.s1 ?? o.s0;
    const c0 = o.c0, c1 = o.c1 ?? o.c0;
    this.c0[j] = c0.r; this.c0[j + 1] = c0.g; this.c0[j + 2] = c0.b;
    this.c1[j] = c1.r; this.c1[j + 1] = c1.g; this.c1[j + 2] = c1.b;
    this.a[i] = o.a ?? 1; this.fi[i] = o.fi ?? 0.04;
    this.rot[i] = o.rot ?? Math.random() * 6.28; this.rv[i] = o.rv ?? 0;
    this.grav[i] = o.grav ?? 0; this.drag[i] = o.drag ?? 0; this.frame[i] = o.frame ?? GLOW;
    this.floor[i] = o.floor ?? -1e9;
    // mode 0: normal · 1: estela que sigue a la velocidad · 2: estela fija (str)
    this.mode[i] = o.str ? 2 : o.stretch ? 1 : 0;
    this.sk[i] = o.stretch ?? 0; this.trav[i] = 0; this.max[i] = o.max ?? 1e9;
    if (o.str) { this.str[j] = o.str.x; this.str[j + 1] = o.str.y; this.str[j + 2] = o.str.z; }
  }

  kill(i) {
    const last = --this.n;
    if (i === last) return;
    for (const k of ['age', 'life', 's0', 's1', 'a', 'fi', 'rot', 'rv', 'grav', 'drag', 'frame', 'sk', 'trav', 'max', 'floor', 'mode']) this[k][i] = this[k][last];
    for (const k of ['p', 'v', 'str', 'c0', 'c1']) { const a = this[k]; a[i * 3] = a[last * 3]; a[i * 3 + 1] = a[last * 3 + 1]; a[i * 3 + 2] = a[last * 3 + 2]; }
  }

  update(dt) {
    const P = this.p, V = this.v;
    for (let i = this.n - 1; i >= 0; i--) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) { this.kill(i); continue; }
      const j = i * 3, dr = Math.exp(-this.drag[i] * dt);
      V[j] *= dr; V[j + 2] *= dr; V[j + 1] = V[j + 1] * dr - this.grav[i] * dt;
      const dx = V[j] * dt, dy = V[j + 1] * dt, dz = V[j + 2] * dt;
      P[j] += dx; P[j + 1] += dy; P[j + 2] += dz;
      if (P[j + 1] < this.floor[i]) { P[j + 1] = this.floor[i]; if (V[j + 1] < 0) { V[j + 1] *= -0.35; V[j] *= 0.5; V[j + 2] *= 0.5; } }
      this.rot[i] += this.rv[i] * dt;
      if (this.mode[i] === 1) {
        // Estela: longitud = velocidad × sk, sin pasar de lo ya recorrido (no asoma por detrás del cañón).
        const sp = Math.hypot(V[j], V[j + 1], V[j + 2]);
        this.trav[i] += sp * dt;
        if (this.trav[i] >= this.max[i]) { this.kill(i); continue; }
        const k = sp > 1e-5 ? Math.min(this.sk[i], this.trav[i] / sp) : 0;
        this.str[j] = V[j] * k; this.str[j + 1] = V[j + 1] * k; this.str[j + 2] = V[j + 2] * k;
      }
    }
    const ap = this.aPos.array, ac = this.aCol.array, am = this.aMisc.array, as = this.aStr.array;
    for (let i = 0; i < this.n; i++) {
      const j = i * 3, t = this.age[i] / this.life[i], fi = this.fi[i];
      const alpha = this.a[i] * (t < fi ? t / fi : 1 - (t - fi) / (1 - fi));
      const e = 1 - (1 - t) * (1 - t);
      ap[j] = P[j]; ap[j + 1] = P[j + 1]; ap[j + 2] = P[j + 2];
      ac[i * 4] = this.c0[j] + (this.c1[j] - this.c0[j]) * t;
      ac[i * 4 + 1] = this.c0[j + 1] + (this.c1[j + 1] - this.c0[j + 1]) * t;
      ac[i * 4 + 2] = this.c0[j + 2] + (this.c1[j + 2] - this.c0[j + 2]) * t;
      ac[i * 4 + 3] = alpha;
      am[i * 4] = this.s0[i] + (this.s1[i] - this.s0[i]) * e;
      am[i * 4 + 1] = this.rot[i]; am[i * 4 + 2] = this.frame[i]; am[i * 4 + 3] = this.mode[i] ? 1 : 0;
      as[j] = this.str[j]; as[j + 1] = this.str[j + 1]; as[j + 2] = this.str[j + 2];
    }
    // Solo se sube la parte usada de los búferes.
    if (this.n) {
      for (const a of [this.aPos, this.aCol, this.aMisc, this.aStr]) {
        if (a.addUpdateRange) { a.clearUpdateRanges(); a.addUpdateRange(0, this.n * a.itemSize); } else a.updateRange = { offset: 0, count: this.n * a.itemSize };
        a.needsUpdate = true;
      }
    }
    this.geo.instanceCount = this.n;
  }

  clear() { this.n = 0; this.geo.instanceCount = 0; }
}

// Marcas en superficies (agujeros de bala, quemaduras): una malla instanciada en anillo, una llamada de dibujo.
class Decals {
  constructor(scene, tex, cap, opacity = 1) {
    this.cap = cap;
    this.i = 0;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 0;
    this.clear();
    scene.add(this.mesh);
  }

  add(point, normal, size, color = 0xffffff) {
    _q.setFromUnitVectors(Z, normal);
    _q.multiply(_q2.setFromAxisAngle(Z, Math.random() * 6.28));
    _m.compose(_v.copy(point).addScaledVector(normal, 0.012), _q, _s.set(size, size, 1));
    this.mesh.setMatrixAt(this.i, _m);
    this.mesh.setColorAt(this.i, _c.set(color));
    this.i = (this.i + 1) % this.cap;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }

  clear() {
    _m.makeScale(0, 0, 0);
    for (let k = 0; k < this.cap; k++) { this.mesh.setMatrixAt(k, _m); this.mesh.setColorAt(k, _c.set(0xffffff)); }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.i = 0;
  }
}

function decalTexture(kind) {
  const S = kind === 'hole' ? 64 : 128, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d'), h = S / 2;
  if (kind === 'hole') {
    // Agujero: desconchado claro alrededor, anillo de hollín y cráter negro, con grietas.
    let grd = g.createRadialGradient(h, h, 0, h, h, h);
    grd.addColorStop(0, 'rgba(40,36,32,0.9)'); grd.addColorStop(0.5, 'rgba(60,54,48,0.6)'); grd.addColorStop(0.8, 'rgba(150,140,128,0.25)'); grd.addColorStop(1, 'rgba(150,140,128,0)');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(10,8,6,0.85)'; g.lineWidth = 1.4;
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * 6.28; let x = h, y = h;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 3; k++) { x += Math.cos(a + rnd(-0.5, 0.5)) * rnd(5, 10); y += Math.sin(a + rnd(-0.5, 0.5)) * rnd(5, 10); g.lineTo(x, y); }
      g.stroke();
    }
    grd = g.createRadialGradient(h, h, 0, h, h, h * 0.45);
    grd.addColorStop(0, 'rgba(0,0,0,1)'); grd.addColorStop(0.75, 'rgba(8,6,5,1)'); grd.addColorStop(1, 'rgba(8,6,5,0)');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
  } else {
    // Quemadura de explosión: mancha negra irregular con salpicaduras.
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * 6.28, d = Math.random() * h * 0.6, x = h + Math.cos(a) * d, y = h + Math.sin(a) * d, r = rnd(10, 30);
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(8,6,5,0.35)'); grd.addColorStop(1, 'rgba(8,6,5,0)');
      g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * 6.28, d = rnd(h * 0.4, h * 0.95);
      g.fillStyle = 'rgba(10,8,6,0.5)'; g.beginPath(); g.arc(h + Math.cos(a) * d, h + Math.sin(a) * d, rnd(1, 3.5), 0, 7); g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Color lineal a partir de hex (las partículas trabajan en lineal; el shader convierte al final).
const col = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);
const C = {
  white: col(0xffffff), spark: col(0xffd27a, 3), sparkEnd: col(0xff6a1a, 0.6), flash: col(0xfff0c8, 2.5),
  fire0: col(0xffd890, 1.5), fire1: col(0xff6a14, 1.1), fire2: col(0x5a1a08, 0.4), smoke0: col(0x2a2826), smoke1: col(0x6a6662),
  muzzleSmoke: col(0xb8b4ae), beacon: col(0x88ff44, 2), blood: col(0x6e0a08), bloodMist: col(0x8a1410), debris: col(0x1c1814), vapor: col(0xd8dde4),
};

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.ground = null; // (x, z, y) → altura del suelo; lo asigna main al cargar mapa
    this._p = new THREE.Vector3();
    const tex = atlas();
    this.add_ = new Particles(scene, tex, true, 2400);
    this.norm = new Particles(scene, tex, false, 1200);
    this.holes = new Decals(scene, decalTexture('hole'), 160);
    this.scorch = new Decals(scene, decalTexture('scorch'), 24, 0.9);
    this.ringGeo = new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2);
    // Luz reutilizable: añadir/quitar luces fuerza recompilar shaders.
    this.light = new THREE.PointLight(0xffa040, 0, 35, 2);
    this.lightT = 0;
    this.lightMax = 0.35;
    scene.add(this.light);
  }

  // Mallas temporales con los materiales que aparecen al disparar (casquillos, granada, proyectil, anillo),
  // para compilar sus shaders al cargar el mapa y no en el primer disparo.
  warmObjects() {
    this.initCasings();
    return [
      new THREE.Mesh(this.casingGeo.rifle, this.casingMat.brass), new THREE.Mesh(this.casingGeo.shell, this.casingMat.hull),
      new THREE.Mesh(this.casingGeo.rifle, new THREE.MeshStandardMaterial({ color: 0x3f5a2c, emissive: 0x000000, roughness: 0.5 })),
      new THREE.Mesh(this.casingGeo.rifle, new THREE.MeshBasicMaterial({ color: 0xffffff })),
      new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })),
    ].map((m) => { m.castShadow = true; return m; });
  }

  initCasings() {
    if (this.casingGeo) return;
    const c = (r, l) => new THREE.CylinderGeometry(r, r * 0.92, l, 8);
    this.casingGeo = { rifle: c(0.0036, 0.026), small: c(0.003, 0.018), big: c(0.0052, 0.036), shell: c(0.0098, 0.032) };
    this.casingMat = {
      brass: new THREE.MeshStandardMaterial({ color: 0xd2a64e, metalness: 1, roughness: 0.28 }),
      hull: new THREE.MeshStandardMaterial({ color: 0xb0261c, metalness: 0.1, roughness: 0.5 }),
    };
  }

  add(obj, life, tick, shared = false) {
    this.scene.add(obj);
    this.items.push({ obj, life, max: life, tick, shared });
  }

  flashLight(pos, color, power = 1, dur = 0.35) {
    this.light.position.set(pos.x, pos.y + 1, pos.z);
    this.light.color.set(color);
    this.lightT = this.lightMax = dur;
    this.lightPow = 400 * power * S.flashes;
  }

  groundAt(p) {
    return this.ground ? this.ground(p.x, p.z, p.y + 0.5) : -1e9;
  }

  // --- Disparo ------------------------------------------------------------------
  // Trazadora: una estela que viaja del cañón al impacto (balas rápidas y finas; energía más lenta y gruesa).
  tracer(a, b, color, d = {}) {
    const dist = a.distanceTo(b);
    if (dist < 0.3) return;
    const dir = _w.subVectors(b, a).divideScalar(dist);
    const energy = !!(d.alien || d.heat || d.kind === 'projectile');
    const sniper = !!d.boltAction, pellet = d.kind === 'pellets';
    const speed = energy ? 160 : sniper ? 900 : 520;
    const c = energy ? tint(0, color, 2.2) : tint(0, color).lerp(C.white, 0.55).multiplyScalar(sniper ? 4 : 3);
    this.add_.emit({
      p: a, v: _v.copy(dir).multiplyScalar(speed), life: dist / speed + 0.02, max: dist, s0: energy ? 0.08 : sniper ? 0.05 : pellet ? 0.02 : 0.03,
      c0: c, a: pellet ? 0.8 : 1, fi: 0, frame: STREAK, stretch: energy ? 0.025 : sniper ? 0.02 : 0.016,
    });
    if (energy) this.add_.emit({ p: a, v: _v.copy(dir).multiplyScalar(speed), life: dist / speed, s0: 0.22, c0: tint(1, color, 1.2), a: 0.6, fi: 0, frame: GLOW });
    // Francotirador: estela de vapor que queda flotando.
    if (sniper) this.norm.emit({ p: b, str: _v.subVectors(b, a), life: 1.6, s0: 0.04, s1: 0.14, c0: C.vapor, a: 0.4, fi: 0.02, frame: GLOW, stretch: 1 });
  }

  // Fogonazo en el mundo: destello, chispas hacia delante y humo del cañón.
  muzzle(pos, dir, d = {}) {
    const energy = !!(d.alien || d.heat), k = d.flash ?? 0.8;
    const c = energy ? tint(0, d.tracer, 1.6) : C.flash;
    this.add_.emit({ p: pos, life: 0.05, s0: 0.35 * k, s1: 0.5 * k, c0: c, a: 0.9, fi: 0, frame: energy ? GLOW : FIRE });
    if (!energy) {
      for (let i = 0; i < n(3 * k); i++) {
        _v.copy(dir).multiplyScalar(rnd(8, 16)).add(_w.randomDirection().multiplyScalar(2));
        this.add_.emit({ p: pos, v: _v, life: rnd(0.05, 0.11), s0: 0.012, c0: C.spark, c1: C.sparkEnd, fi: 0, frame: STREAK, stretch: 0.02, drag: 4 });
      }
      for (let i = 0; i < n(1 + k); i++) {
        _v.copy(dir).multiplyScalar(rnd(0.8, 2)).add(_w.set(rnd(-0.3, 0.3), rnd(0.2, 0.6), rnd(-0.3, 0.3)));
        this.norm.emit({ p: _s.copy(pos).addScaledVector(dir, 0.08), v: _v, life: rnd(0.6, 1.1), s0: 0.04, s1: rnd(0.18, 0.3) * k, c0: C.muzzleSmoke, a: 0.13, fi: 0.1, frame: SMOKE, drag: 2.5, grav: -0.3, rv: rnd(-1, 1) });
      }
    }
  }

  // --- Impactos -------------------------------------------------------------------
  // Superficie a partir del material golpeado: metal → chispas; resto → polvo del color de la superficie.
  surface(hit) {
    const m = hit.object.material, g = hit.object.geometry;
    const out = { metal: (m.metalness ?? 0) >= 0.5, color: _c.set(0x8a7a66) };
    if (m.color) out.color.copy(m.color);
    const vc = g?.attributes?.color;
    if (m.vertexColors && vc && hit.face) out.color.setRGB(vc.getX(hit.face.a), vc.getY(hit.face.a), vc.getZ(hit.face.a)).multiply(m.color);
    if (m.map && !m.vertexColors) out.color.lerp(_c2.set(0x6a6a6a), 0.4);
    return out;
  }

  // power: ~0.5 (subfusil) … 2 (francotirador). energy: color del arma de energía o null.
  impact(point, normal, hit = null, power = 1, energy = null) {
    const s = hit ? this.surface(hit) : { metal: false, color: _c.set(0x8a7a66) };
    const dust = _t[2].copy(s.color).multiplyScalar(1.25), chip = _t[3].copy(s.color).multiplyScalar(0.6);
    const p = this._p.copy(point).addScaledVector(normal, 0.03);
    if (energy) {
      const ec = tint(0, energy, 2), ecEnd = tint(1, energy, 0.3);
      this.add_.emit({ p, life: 0.12, s0: 0.25 * power, s1: 0.5 * power, c0: ec, a: 0.9, fi: 0, frame: GLOW });
      for (let i = 0; i < n(8 * power); i++) {
        _v.copy(normal).multiplyScalar(rnd(2, 5)).add(_w.randomDirection().multiplyScalar(3));
        this.add_.emit({ p, v: _v, life: rnd(0.2, 0.4), s0: 0.02, c0: ec, c1: ecEnd, fi: 0, frame: STREAK, stretch: 0.03, grav: 6, drag: 2 });
      }
      this.norm.emit({ p, v: _v.copy(normal).multiplyScalar(0.6), life: 0.8, s0: 0.1, s1: 0.45 * power, c0: C.smoke0, a: 0.35, fi: 0.1, frame: SMOKE, drag: 2, grav: -0.4 });
      this.holes.add(point, normal, rnd(0.14, 0.2) * Math.max(0.75, Math.min(1.6, power)), 0x3a2016);
      return;
    }
    // Destello del impacto.
    this.add_.emit({ p, life: 0.07, s0: 0.25 * power, s1: 0.4 * power, c0: s.metal ? C.flash : C.spark, a: s.metal ? 1 : 0.7, fi: 0, frame: GLOW });
    if (s.metal) {
      for (let i = 0; i < n(8 + 6 * power); i++) {
        _v.copy(normal).multiplyScalar(rnd(3, 8)).add(_w.randomDirection().multiplyScalar(4));
        this.add_.emit({ p, v: _v, life: rnd(0.25, 0.55), s0: 0.022, c0: C.spark, c1: C.sparkEnd, fi: 0, frame: STREAK, stretch: 0.035, grav: 9.8, drag: 0.8, floor: this.groundAt(p) });
      }
      for (let i = 0; i < n(1 + power); i++) this.norm.emit({ p, v: _v.copy(normal).multiplyScalar(rnd(0.6, 1.4)).add(_w.randomDirection().multiplyScalar(0.3)), life: rnd(0.8, 1.2), s0: 0.12, s1: rnd(0.45, 0.7) * Math.max(0.8, power), c0: C.smoke1, a: 0.4, fi: 0.08, frame: SMOKE, drag: 2.5, grav: -0.3, rv: rnd(-1, 1) });
    } else {
      // Polvo: chorro a lo largo de la normal que se abre y cae; esquirlas del material.
      for (let i = 0; i < n(3 + power * 2); i++) {
        _v.copy(normal).multiplyScalar(rnd(1, 3.2)).add(_w.randomDirection().multiplyScalar(0.7));
        this.norm.emit({ p, v: _v, life: rnd(0.7, 1.3), s0: 0.18, s1: rnd(0.55, 0.9) * Math.max(0.8, power), c0: dust, a: 0.6, fi: 0.05, frame: SMOKE, drag: 3, grav: 0.6, rv: rnd(-1.5, 1.5) });
      }
      for (let i = 0; i < n(7 * power); i++) {
        _v.copy(normal).multiplyScalar(rnd(2, 5.5)).add(_w.randomDirection().multiplyScalar(2.2));
        this.norm.emit({ p, v: _v, life: rnd(0.5, 0.9), s0: rnd(0.03, 0.06), c0: chip, a: 1, fi: 0, frame: GLOW, grav: 12, drag: 0.5, floor: this.groundAt(p) });
      }
    }
    this.holes.add(point, normal, rnd(0.12, 0.17) * Math.max(0.75, Math.min(1.6, power)), 0xffffff);
  }

  // Sangre (criaturas de carne y jugadores sin escudo): niebla en el punto y gotas en la dirección de la bala.
  blood(point, dir, power = 1, hex = 0x6e0a08) {
    const c = tint(0, hex), mist = tint(1, hex, 1.4);
    for (let i = 0; i < n(2 + power); i++) {
      _v.copy(dir).multiplyScalar(rnd(0.5, 1.6)).add(_w.randomDirection().multiplyScalar(0.5));
      this.norm.emit({ p: point, v: _v, life: rnd(0.35, 0.6), s0: 0.2, s1: rnd(0.5, 0.8) * power, c0: mist, a: 0.7, fi: 0.03, frame: SMOKE, drag: 4, grav: 0.5, rv: rnd(-2, 2) });
    }
    for (let i = 0; i < n(9 * power); i++) {
      _v.copy(dir).multiplyScalar(rnd(1.5, 4.5)).add(_w.randomDirection().multiplyScalar(1.8));
      this.norm.emit({ p: point, v: _v, life: rnd(0.4, 0.8), s0: rnd(0.03, 0.06), c0: c, a: 1, fi: 0, frame: GLOW, grav: 9.8, drag: 0.6, stretch: 0.015, floor: this.groundAt(point) });
    }
  }

  // Escudo de energía: chispazo del color del escudo.
  shieldHit(point, color, power = 1) {
    const c = tint(0, color, 1.6), cEnd = tint(1, color, 0.3);
    this.add_.emit({ p: point, life: 0.14, s0: 0.35 * power, s1: 0.7 * power, c0: c, a: 0.7, fi: 0, frame: GLOW });
    for (let i = 0; i < n(9 * power); i++) {
      _v.randomDirection().multiplyScalar(rnd(2, 6));
      this.add_.emit({ p: point, v: _v, life: rnd(0.15, 0.35), s0: 0.022, c0: c, c1: cEnd, fi: 0, frame: STREAK, stretch: 0.03, drag: 3 });
    }
  }

  // Muerte de una criatura de carne: estallido de sangre y vísceras.
  gore(point, scale = 1, hex = 0x5a0806) {
    const c = col(hex), dark = col(hex, 0.5);
    for (let i = 0; i < n(6 * scale); i++) {
      _v.randomDirection().multiplyScalar(rnd(0.5, 2)).setY(Math.abs(_v.y) + 0.5);
      this.norm.emit({ p: point, v: _v, life: rnd(0.6, 1.1), s0: 0.2 * scale, s1: rnd(0.8, 1.3) * scale, c0: c, a: 0.55, fi: 0.04, frame: SMOKE, drag: 3, grav: 0.8, rv: rnd(-1, 1) });
    }
    for (let i = 0; i < n(26 * scale); i++) {
      _v.randomDirection().multiplyScalar(rnd(2, 7)).setY(Math.abs(_v.y) * 1.2 + 1);
      this.norm.emit({ p: point, v: _v, life: rnd(0.7, 1.3), s0: rnd(0.03, 0.09) * Math.sqrt(scale), c0: i % 3 ? c : dark, a: 1, fi: 0, frame: GLOW, grav: 12, drag: 0.4, floor: this.groundAt(point) });
    }
  }

  // Compatibilidad: estallido simple de partículas brillantes (aparición de enemigos, invocaciones).
  burst(pos, color, count = 10, speed = 5, life = 0.35, size = 0.08, gravity = 12) {
    const c = tint(0, color, 1.8);
    for (let i = 0; i < n(count); i++) {
      _v.randomDirection().multiplyScalar(speed * rnd(0.3, 1));
      this.add_.emit({ p: pos, v: _v, life: life * rnd(0.6, 1), s0: size * 1.4, s1: size * 0.4, c0: c, a: 1, fi: 0, frame: GLOW, grav: gravity, drag: 1 });
    }
    this.add_.emit({ p: pos, life: life * 0.5, s0: size * 8, s1: size * 14, c0: c, a: 0.5, fi: 0, frame: GLOW });
  }

  sparks(point, color) {
    this.shieldHit(point, color, 0.7);
  }

  // Estela de proyectiles (agujas, cañón de arco, plasma enemigo).
  trail(pos, color, size = 0.15) {
    this.add_.emit({ p: pos, life: 0.22, s0: size, s1: size * 0.3, c0: tint(0, color, 1.6), a: 0.7, fi: 0, frame: GLOW });
  }

  // Estela de humo de la granada en vuelo + parpadeo.
  grenadeTrail(pos, blink) {
    this.norm.emit({ p: pos, v: _v.set(rnd(-0.2, 0.2), 0.3, rnd(-0.2, 0.2)), life: 0.7, s0: 0.05, s1: 0.28, c0: C.smoke1, a: 0.22, fi: 0.1, frame: SMOKE, drag: 2 });
    if (blink) this.add_.emit({ p: pos, life: 0.05, s0: 0.35, c0: C.beacon, a: 0.9, fi: 0, frame: GLOW });
  }

  // --- Explosiones ------------------------------------------------------------------
  // Granada / cohete: destello, bola de fuego, metralla incandescente, escombros, polvo a ras de suelo,
  // humo que sube y se expande, onda y quemadura. opts.color: explosión de energía (sin humo negro ni escombros).
  explosion(pos, radius, opts = {}) {
    const R = radius, energy = opts.color ?? null;
    const gy = this.groundAt(pos), nearGround = pos.y - gy < 1.5;
    const fire0 = energy ? col(energy, 1.4) : C.fire0, fire1 = energy ? col(energy, 0.9) : C.fire1, fire2 = energy ? col(energy, 0.3) : C.fire2;
    this.add_.emit({ p: pos, life: 0.1, s0: R * 1.1, s1: R * 1.6, c0: energy ? col(energy, 1.5) : C.flash, a: 0.85 * S.flashes, fi: 0, frame: GLOW });
    for (let i = 0; i < n(12); i++) {
      _v.randomDirection().multiplyScalar(rnd(1.5, 5) * R / 7).add(_w.set(0, 1.2, 0));
      this.add_.emit({ p: _s.copy(pos).add(_w.randomDirection().multiplyScalar(R * 0.15)), v: _v, life: rnd(0.45, 0.8), s0: R * 0.22, s1: R * rnd(0.5, 0.8), c0: fire0, c1: fire2, a: 1, fi: 0.02, frame: FIRE, drag: 4, rv: rnd(-2, 2) });
    }
    for (let i = 0; i < n(6); i++) {
      _v.randomDirection().multiplyScalar(rnd(1, 3)).add(_w.set(0, 1.5, 0));
      this.add_.emit({ p: pos, v: _v, life: rnd(0.8, 1.2), s0: R * 0.15, s1: R * 0.35, c0: fire1, c1: fire2, a: 0.8, fi: 0.1, frame: FIRE, drag: 3, grav: -1, rv: rnd(-1, 1) });
    }
    // Metralla incandescente que rebota en el suelo.
    for (let i = 0; i < n(45); i++) {
      _v.randomDirection().multiplyScalar(rnd(8, 22)); _v.y = Math.abs(_v.y) * 0.8 + 2;
      this.add_.emit({ p: pos, v: _v, life: rnd(0.5, 1.3), s0: 0.03, c0: fire0, c1: fire1, a: 1, fi: 0, frame: STREAK, stretch: 0.035, grav: 9.8, drag: 0.7, floor: gy });
    }
    if (!energy) {
      for (let i = 0; i < n(18); i++) {
        _v.randomDirection().multiplyScalar(rnd(5, 13)); _v.y = Math.abs(_v.y) + 3;
        this.norm.emit({ p: pos, v: _v, life: rnd(1, 1.6), s0: rnd(0.05, 0.12), c0: C.debris, a: 1, fi: 0, frame: GLOW, grav: 16, drag: 0.4, floor: gy });
      }
      // Columna de humo.
      for (let i = 0; i < n(14); i++) {
        _v.randomDirection().multiplyScalar(rnd(0.5, 2.5)).add(_w.set(0, rnd(1, 2.6), 0));
        this.norm.emit({ p: _s.copy(pos).add(_w.randomDirection().multiplyScalar(R * 0.2)), v: _v, life: rnd(2.2, 3.6), s0: R * 0.25, s1: R * rnd(0.8, 1.2), c0: C.smoke0, c1: C.smoke1, a: 0.7, fi: 0.12, frame: SMOKE, drag: 1.6, grav: -0.5, rv: rnd(-0.6, 0.6) });
      }
    } else {
      for (let i = 0; i < n(6); i++) {
        _v.randomDirection().multiplyScalar(rnd(0.5, 1.5)).add(_w.set(0, 1, 0));
        this.norm.emit({ p: pos, v: _v, life: rnd(1.2, 1.8), s0: R * 0.2, s1: R * 0.7, c0: C.smoke0, c1: C.smoke1, a: 0.35, fi: 0.15, frame: SMOKE, drag: 1.6, grav: -0.4 });
      }
    }
    if (nearGround) {
      // Polvo que sale disparado a ras de suelo + onda + quemadura.
      for (let i = 0; i < n(12); i++) {
        const a = (i / 12) * Math.PI * 2 + rnd(-0.2, 0.2);
        _v.set(Math.cos(a), 0.15, Math.sin(a)).multiplyScalar(rnd(6, 10));
        this.norm.emit({ p: _s.set(pos.x, gy + 0.3, pos.z), v: _v, life: rnd(1.2, 1.8), s0: 0.4, s1: R * 0.5, c0: col(0x7a6e5e), c1: col(0x9a9084), a: 0.45, fi: 0.05, frame: SMOKE, drag: 3.2, rv: rnd(-1, 1) });
      }
      this.ring(_s.set(pos.x, gy, pos.z), R * 1.15, energy ?? 0xfff0d0, 0.28);
      this.scorch.add(_s.set(pos.x, gy, pos.z), _w.set(0, 1, 0), R * 0.65, 0xffffff);
    }
    this.flashLight(pos, energy ?? 0xffa040, 1, 0.35);
  }

  // Anillo expansivo sobre el suelo.
  ring(pos, radius, color, life = 0.6) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const ring = new THREE.Mesh(this.ringGeo, mat);
    ring.position.set(pos.x, pos.y + 0.08, pos.z);
    this.add(ring, life, (it, k) => {
      ring.scale.setScalar(Math.max(0.05, radius * (1 - k * k)));
      mat.opacity = k * 0.8;
    }, true);
  }

  // Onda expansiva (golpe de jefe): anillo, polvo levantado en círculo y escombros.
  shockwave(pos, radius, color = 0xff6a3d) {
    this.ring(pos, radius, color, 0.6);
    for (let i = 0; i < n(20); i++) {
      const a = (i / 20) * Math.PI * 2 + rnd(-0.15, 0.15);
      _v.set(Math.cos(a), 0.2, Math.sin(a)).multiplyScalar(rnd(7, 11));
      this.norm.emit({ p: _s.set(pos.x, pos.y + 0.3, pos.z), v: _v, life: rnd(1.1, 1.6), s0: 0.5, s1: rnd(1.4, 2.2), c0: col(0x6a6a5a), c1: col(0x8a8a7a), a: 0.5, fi: 0.05, frame: SMOKE, drag: 2.6, rv: rnd(-1, 1) });
    }
    for (let i = 0; i < n(24); i++) {
      _v.randomDirection().multiplyScalar(rnd(4, 9)); _v.y = Math.abs(_v.y) + 4;
      this.norm.emit({ p: _s.set(pos.x, pos.y + 0.2, pos.z), v: _v, life: rnd(0.8, 1.3), s0: rnd(0.05, 0.12), c0: C.debris, a: 1, fi: 0, frame: GLOW, grav: 16, floor: pos.y });
    }
    this.burst(_s.set(pos.x, pos.y + 0.3, pos.z), color, 30, 9, 0.6, 0.1, 10);
    this.flashLight(pos, color, 0.8, 0.35);
  }

  // Casquillo expulsado: cae, rebota una vez en floorY y desaparece. kind: rifle | small | big | shell.
  casing(pos, vel, kind, floorY) {
    this.initCasings();
    const mesh = new THREE.Mesh(this.casingGeo[kind] ?? this.casingGeo.rifle, kind === 'shell' ? this.casingMat.hull : this.casingMat.brass);
    mesh.position.copy(pos);
    mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.PI / 2);
    const spin = new THREE.Vector3((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 30);
    this.add(mesh, 1.1, (it, k, dt) => {
      vel.y -= 9.8 * dt;
      mesh.position.addScaledVector(vel, dt);
      if (mesh.position.y < floorY + 0.01) {
        mesh.position.y = floorY + 0.01;
        if (vel.y < 0) { vel.y *= -0.3; vel.x *= 0.45; vel.z *= 0.45; spin.multiplyScalar(0.4); }
      }
      mesh.rotation.x += spin.x * dt;
      mesh.rotation.y += spin.y * dt;
      mesh.rotation.z += spin.z * dt;
    }, 'all');
  }

  clear() {
    for (const it of this.items) this.dispose(it);
    this.items.length = 0;
    this.add_.clear();
    this.norm.clear();
    this.holes.clear();
    this.scorch.clear();
    this.lightT = 0;
    this.light.intensity = 0;
  }

  dispose(it) {
    this.scene.remove(it.obj);
    if (!it.shared) it.obj.geometry.dispose();
    if (it.shared !== 'all') it.obj.material.dispose();
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      if (it.life <= 0) { this.dispose(it); this.items.splice(i, 1); continue; }
      it.tick?.(it, it.life / it.max, dt);
    }
    this.add_.update(dt);
    this.norm.update(dt);
    this.lightT = Math.max(0, this.lightT - dt);
    const k = this.lightT / this.lightMax;
    this.light.intensity = k * k * (this.lightPow ?? 400);
  }
}
