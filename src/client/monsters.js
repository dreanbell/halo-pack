import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from '../../vendor/three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import { Q } from './quality.js';

// Criaturas de carne: modelos CC0 (vendor/assets/monsters, ver ATTRIBUTION.md) con material orgánico,
// animación y añadidos procedurales (boca, ojos, tentáculos, bultos, hueso) anclados a sus huesos.
// Solo es la parte visual: las hitboxes y la animación del rig procedural (aliens.js) siguen igual;
// la hitbox de la cabeza se desplaza a la cabeza del modelo para que los disparos a la cabeza cuadren.
// Ejes del cuerpo: +Z delante, +Y arriba, medidas en metros sin la escala del tipo.

const DIR = new URL('../../vendor/assets/monsters/', import.meta.url).href;
const PI = Math.PI;
const models = new Map();
const standTimes = new Map();
const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _w = new THREE.Vector3();

// --- Texturas ------------------------------------------------------------------
function canvas(S, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  draw(c.getContext('2d', { willReadFrequently: true }), S);
  return c;
}
function texture(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function normalFrom(hc, k = 3) {
  const S = hc.width, src = hc.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, S, S).data;
  return texture(canvas(S, (g) => {
    const img = g.createImageData(S, S), H = (x, y) => src[(((y + S) % S) * S + ((x + S) % S)) * 4] / 255;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const nx = (H(x - 1, y) - H(x + 1, y)) * k, ny = (H(x, y + 1) - H(x, y - 1)) * k, l = Math.hypot(nx, ny, 1), i = (y * S + x) * 4;
        img.data[i] = (nx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[i + 2] = (0.5 / l + 0.5) * 255; img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  }), false);
}

let TEX = null;
function textures() {
  if (TEX) return TEX;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const veins = (g, S, color, width, n) => {
    g.strokeStyle = color; g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      let x = rnd() * S, y = rnd() * S, a = rnd() * PI * 2, w = width * (0.5 + rnd());
      for (let k = 0; k < 14 && w > 0.3; k++) {
        const nx = x + Math.cos(a) * 12, ny = y + Math.sin(a) * 12;
        g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
        x = nx; y = ny; a += (rnd() - 0.5) * 1.1; w *= 0.88;
        if (rnd() < 0.15) { const b = a + (rnd() < 0.5 ? 0.9 : -0.9); g.lineWidth = w * 0.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(b) * 18, y + Math.sin(b) * 18); g.stroke(); }
      }
    }
  };
  const blotches = (g, S, cols, n, rmin, rmax) => {
    for (let i = 0; i < n; i++) {
      const x = rnd() * S, y = rnd() * S, r = rmin + rnd() * (rmax - rmin);
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, cols[(rnd() * cols.length) | 0]); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  };
  // Carne enferma: rojo oscuro, morado y marrón con venas y pústulas.
  const fleshH = canvas(256, (g, S) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, S, S);
    blotches(g, S, ['rgba(255,255,255,0.35)', 'rgba(0,0,0,0.35)'], 160, 4, 22);
    veins(g, S, 'rgba(255,255,255,0.55)', 3, 26);
  });
  const flesh = canvas(256, (g, S) => {
    g.fillStyle = '#7a3a3a'; g.fillRect(0, 0, S, S);
    blotches(g, S, ['rgba(110,40,70,0.55)', 'rgba(90,55,35,0.5)', 'rgba(150,70,60,0.45)', 'rgba(60,20,30,0.5)'], 140, 8, 40);
    veins(g, S, 'rgba(60,20,55,0.75)', 3, 26);
    blotches(g, S, ['rgba(210,190,110,0.6)'], 18, 2, 5); // pústulas
  });
  // Detalle que se mezcla con la piel del modelo (tono neutro ~1 en promedio).
  const detail = canvas(256, (g, S) => {
    g.fillStyle = '#b0a0a0'; g.fillRect(0, 0, S, S);
    blotches(g, S, ['rgba(190,90,90,0.5)', 'rgba(120,70,120,0.45)', 'rgba(255,230,220,0.25)'], 120, 8, 36);
    veins(g, S, 'rgba(70,25,60,0.6)', 2.4, 22);
  });
  const boneH = canvas(128, (g, S) => {
    g.fillStyle = '#909090'; g.fillRect(0, 0, S, S);
    blotches(g, S, ['rgba(0,0,0,0.3)', 'rgba(255,255,255,0.3)'], 50, 3, 14);
    g.strokeStyle = 'rgba(0,0,0,0.7)'; g.lineWidth = 1.2;
    for (let i = 0; i < 10; i++) { g.beginPath(); let x = rnd() * S, y = rnd() * S; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (rnd() - 0.5) * 30; y += rnd() * 20; g.lineTo(x, y); } g.stroke(); }
  });
  const bone = canvas(128, (g, S) => {
    g.drawImage(boneH, 0, 0);
    g.globalCompositeOperation = 'multiply'; g.fillStyle = '#e8d9b8'; g.fillRect(0, 0, S, S);
    g.globalCompositeOperation = 'source-over';
    blotches(g, S, ['rgba(110,60,40,0.35)', 'rgba(90,30,30,0.3)'], 16, 4, 18); // sangre seca
  });
  TEX = {
    flesh: texture(flesh), fleshN: normalFrom(fleshH, 4), detail: texture(detail),
    bone: texture(bone), boneN: normalFrom(boneH, 3),
  };
  return TEX;
}

// --- Geometría orgánica (cacheada) -------------------------------------------------
const geoCache = new Map();
const cached = (k, make) => { if (!geoCache.has(k)) geoCache.set(k, make()); return geoCache.get(k); };

// Esfera deformada con ruido: bultos, tumores, placas.
function blob(seed, amp = 0.28, detail = 2) {
  return cached(`blob${seed}|${amp}|${detail}`, () => {
    const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position, v = new THREE.Vector3();
    const a = seed * 1.7, b = seed * 2.3, c = seed * 0.9;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = Math.sin(v.x * 3.1 + a) * Math.sin(v.y * 2.7 + b) * Math.sin(v.z * 3.3 + c) + 0.5 * Math.sin(v.x * 7 + v.y * 5 + a);
      v.multiplyScalar(1 + n * amp * 0.5);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  });
}
// Segmento de tentáculo: tronco que se estrecha, con base en 0 y crecimiento en +Y.
const segGeo = (r0, r1, len) => cached(`seg${r0.toFixed(3)}|${r1.toFixed(3)}|${len.toFixed(3)}`, () => {
  const g = new THREE.CylinderGeometry(r1, r0, len, 10, 3, false);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i) / len + 0.5, k = 1 + Math.sin(y * PI) * 0.12; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
  g.translate(0, len / 2, 0);
  g.computeVertexNormals();
  return g;
});
const sphGeo = (r, w = 14, h = 10) => cached(`s${r}|${w}`, () => new THREE.SphereGeometry(r, w, h));
const coneGeo = (r, h, s = 6) => cached(`c${r}|${h}|${s}`, () => new THREE.ConeGeometry(r, h, s).translate(0, h / 2, 0));
// Cuerno/espina curvada hacia atrás (para hueso).
const hornGeo = (r, h) => cached(`h${r}|${h}`, () => {
  const pts = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector3(0, t * h, -t * t * h * 0.45)); }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, r, 7, false).scale(1, 1, 1);
});

// Tentáculo con pesos de piel: se estrecha, ondula y se dobla por n huesos.
const tentacleGeo = (r, len, n) => cached(`t${r.toFixed(3)}|${len.toFixed(3)}|${n}`, () => {
  const g = new THREE.CylinderGeometry(1, 1, len, 10, n * 4, false).translate(0, len / 2, 0);
  const p = g.attributes.position, cnt = p.count, idx = new Uint16Array(cnt * 4), wt = new Float32Array(cnt * 4);
  for (let i = 0; i < cnt; i++) {
    const t = p.getY(i) / len, rr = r * (1 - t * 0.85) * (1 + Math.sin(t * n * PI) * 0.1);
    p.setX(i, p.getX(i) * rr); p.setZ(i, p.getZ(i) * rr);
    const sF = t * n - 0.5, a = Math.max(0, Math.min(n - 1, Math.floor(sF))), b = Math.min(n - 1, a + 1), k = Math.max(0, Math.min(1, sF - a));
    idx[i * 4] = a; idx[i * 4 + 1] = b; wt[i * 4] = 1 - k; wt[i * 4 + 1] = k;
  }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wt, 4));
  g.computeVertexNormals();
  return g;
});

// --- Definiciones ---------------------------------------------------------------------
// file: modelo; height (o size para voladores): tamaño visual; rotY: giro para mirar a +Z;
// clips: nombres de animación; head: hueso de la cabeza + desplazamiento de su hitbox.
const DEFS = {
  ravager: { file: 'giant-mutant', height: 1.85, rotY: 0, tint: [2.7, 1.35, 1.25], mix: 0.7, eye: 0xe0c060, clips: { run: 'Giant Run', idle: 'idle', attack: 'Right Punch' }, runRef: 5.5, head: ['mixamorigHead', [0, 0.02, 0.1]], feet: ['mixamorigLeftToeBase', 'mixamorigRightToeBase'], build: fleshMutant },
  warlord: { file: 'giant-mutant', height: 2.05, rotY: 0, tint: [2.2, 1.2, 1.3], mix: 0.75, eye: 0xff6a3a, clips: { run: 'Giant Run', idle: 'idle', attack: 'Left Punch', telegraph: 'Jump Slam' }, runRef: 4.5, head: ['mixamorigHead', [0, 0.0, 0.3]], feet: ['mixamorigLeftToeBase', 'mixamorigRightToeBase'], build: warlord },
  warden: { file: 'horror-run', height: 1.8, rotY: 0, tint: [1.15, 0.95, 0.95], mix: 0.35, eye: 0xc8e060, clips: { run: 'Run' }, runRef: 5, head: ['joint4', [0, 0.04, 0.05]], feet: ['joint8', 'joint8001'], build: parasiteSoldier },
  skitter: { file: 'horror-run', height: 1.5, rotY: 0, tint: [1.25, 0.9, 0.85], mix: 0.5, eye: 0xffd070, clips: { run: 'Run' }, runRef: 6, head: ['joint4', [0, 0.04, 0.05]], feet: ['joint8', 'joint8001'], lean: 0.25, build: skitter },
  stalker: { file: 'horror-run', height: 1.95, rotY: 0, stretch: [0.78, 1, 0.82], tint: [0.75, 0.62, 0.78], mix: 0.6, eye: 0x9cf0d0, clips: { run: 'Run' }, runRef: 6.4, head: ['joint4', [0, 0.04, 0.06]], feet: ['joint8', 'joint8001'], build: stalker },
  bombardier: { file: 'darsh', height: 1.05, rotY: PI, stretch: [1.35, 1, 1.25], tint: [1.25, 0.95, 0.9], mix: 0.55, eye: 0xf0e070, clips: { idle: 'Idle' }, feet: ['Bone014', 'Bone017'], build: bombardier },
  drone: { file: 'angler', size: 0.95, fly: true, rotY: PI / 2, tint: [1.4, 1.0, 1.0], mix: 0.4, eye: 0xe8f070, build: floater },
  overseer: { file: 'angler', size: 2.1, fly: true, rotY: PI / 2, tint: [1.1, 0.85, 1.1], mix: 0.5, eye: 0xff5050, build: overseer },
};

let monstersLoading = null;
// Idempotente: se llama en segundo plano tras abrir el menú y otra vez al empezar una partida con oleadas.
export function loadMonsters() {
  monstersLoading ??= loadAll();
  return monstersLoading;
}

async function loadAll() {
  const loader = new GLTFLoader();
  const files = [...new Set(Object.values(DEFS).map((d) => d.file))];
  await Promise.all(files.map(async (f) => {
    try {
      const g = await loader.loadAsync(`${DIR}${f}.glb`);
      for (const clip of g.animations) { inPlace(clip, g.scene); dropConstant(clip, g.scene); }
      models.set(f, g);
    } catch (e) {
      console.warn(`Ringfall: no se pudo cargar el modelo ${f}`, e);
    }
  }));
}

export const hasMonster = (type) => !!DEFS[type] && models.has(DEFS[type].file);

// Pistas que no cambian (escalas, posiciones fijas): se aplican una vez al modelo y se quitan del clip.
function dropConstant(clip, scene) {
  clip.tracks = clip.tracks.filter((t) => {
    const n = t.getValueSize(), v = t.values;
    for (let i = n; i < v.length; i++) if (Math.abs(v[i] - v[i % n]) > 1e-4) return true;
    const dot = t.name.lastIndexOf('.'), node = scene.getObjectByName(t.name.slice(0, dot)), prop = t.name.slice(dot + 1);
    if (node?.[prop]?.fromArray) node[prop].fromArray(v, 0);
    return !node;
  });
  clip.resetDuration?.();
}

// Sin desplazamiento de raíz: la posición horizontal de cada hueso queda en la de reposo
// (la posición la decide la IA, no la animación). La altura sí se anima.
function inPlace(clip, scene) {
  for (const t of clip.tracks) {
    if (!t.name.endsWith('.position')) continue;
    const node = scene.getObjectByName(t.name.slice(0, -'.position'.length));
    if (!node) continue;
    const v = t.values, { x, z } = node.position;
    for (let i = 0; i < v.length; i += 3) { v[i] = x; v[i + 2] = z; }
  }
}

// =====================================================================================
class Monster {
  constructor(rig, type) {
    const def = (this.def = DEFS[type]);
    const gltf = models.get(def.file);
    const T = textures();
    this.rig = rig;
    this.t = Math.random() * 10;
    this.mats = [];
    this.sway = [];
    this.anchors = new Map();
    this.fixed = [];
    this.open = 0;

    // Piel del modelo: su textura + detalle de venas, sin brillo metálico.
    const tint = new THREE.Color(...def.tint);
    this.skin = this.mat(new THREE.MeshStandardMaterial({ color: tint, roughness: 0.82, metalness: 0 }));
    const mix = def.mix;
    this.skin.onBeforeCompile = (sh) => {
      sh.uniforms.fleshDetail = { value: T.detail };
      sh.fragmentShader = `uniform sampler2D fleshDetail;\n${sh.fragmentShader}`.replace('#include <map_fragment>', `#include <map_fragment>
        #ifdef USE_MAP
          diffuseColor.rgb *= mix(vec3(1.0), texture2D(fleshDetail, vMapUv * 3.0).rgb * 1.25, ${mix.toFixed(2)});
        #endif`);
    };
    this.flesh = this.mat(new THREE.MeshStandardMaterial({ map: T.flesh, normalMap: T.fleshN, roughness: 0.78, metalness: 0, color: tint.clone().multiplyScalar(0.62) }));
    this.wet = this.mat(new THREE.MeshStandardMaterial({ map: T.flesh, normalMap: T.fleshN, color: 0xd04040, roughness: 0.28, metalness: 0, emissive: 0x200000 }));
    this.bone = this.mat(new THREE.MeshStandardMaterial({ map: T.bone, normalMap: T.boneN, roughness: 0.72, metalness: 0 }));
    this.teeth = this.mat(new THREE.MeshStandardMaterial({ color: 0xe8dcb0, roughness: 0.45, metalness: 0 }));
    this.mawMat = this.mat(new THREE.MeshStandardMaterial({ color: 0x2a0508, roughness: 0.35, metalness: 0 }));
    this.eyeMat = this.mat(new THREE.MeshStandardMaterial({ color: 0xa88a52, roughness: 0.18, metalness: 0, emissive: def.eye, emissiveIntensity: 0.35 }));
    this.pupil = this.mat(new THREE.MeshStandardMaterial({ color: 0x080404, roughness: 0.15, metalness: 0 }));
    this.armor = this.mat(new THREE.MeshStandardMaterial({ color: 0x3b4238, roughness: 0.62, metalness: 0.45 }));

    const model = (this.model = cloneSkinned(gltf.scene));
    model.traverse((o) => {
      if (!o.isMesh) return;
      const src = o.material;
      if (src?.name === 'Eyes' || src?.name === 'LightBulb') { o.material = src.name === 'Eyes' ? this.eyeMat : this.wet; return; }
      const m = this.skin.clone();
      m.onBeforeCompile = this.skin.onBeforeCompile;
      m.customProgramCacheKey = () => `flesh${mix}`;
      m.map = src?.map ?? T.flesh;
      m.normalMap = src?.normalMap ?? null;
      o.material = this.mat(m);
      o.castShadow = o.receiveShadow = true;
      if (o.isSkinnedMesh) o.frustumCulled = false;
    });
    this.skins = this.mats.filter((m) => m !== this.skin && m.onBeforeCompile === this.skin.onBeforeCompile);

    // Animaciones.
    this.mixer = gltf.animations.length ? new THREE.AnimationMixer(model) : null;
    this.actions = {};
    if (this.mixer) {
      for (const [key, name] of Object.entries(def.clips ?? {})) {
        const clip = gltf.animations.find((a) => a.name === name) ?? gltf.animations.find((a) => a.name.split('|').includes(name));
        if (!clip) continue;
        const a = this.mixer.clipAction(clip);
        a.play();
        a.setEffectiveWeight(0);
        this.actions[key] = a;
      }
      // Pose de referencia (la de reposo puede tener otra escala que las animaciones).
      const ref = this.actions.idle ?? this.actions.run;
      ref?.setEffectiveWeight(1);
      this.mixer.update(0);
    }

    // Encaje en el tamaño del rig: pies en el suelo (o centrado si vuela) y mirando a +Z.
    const fit = (this.fit = new THREE.Group());
    const spin = new THREE.Group();
    spin.rotation.y = def.rotY;
    spin.add(model);
    fit.add(spin);
    fit.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(fit, true), size = box.getSize(_s), c = box.getCenter(_p);
    const k = def.fly ? def.size / Math.max(size.x, size.y, size.z) : def.height / size.y;
    const st = def.stretch ?? [1, 1, 1];
    fit.scale.set(k * st[0], k * st[1], k * st[2]);
    fit.position.set(-c.x * k * st[0], def.fly ? -c.y * k : -box.min.y * k, -c.z * k * st[2]);
    this.holder = new THREE.Group(); // inclinación y respiración sin tocar el encaje
    this.holder.add(fit);
    rig.body.add(this.holder);
    if (def.lean) this.holder.rotation.x = def.lean;
    for (const a of Object.values(this.actions)) a.time = Math.random() * a.getClip().duration;

    this.bones = new Map();
    model.traverse((o) => { if (o.isBone) this.bones.set(o.name, o); });
    rig.root.updateMatrixWorld(true);
    this.baked = [];
    def.build.call(this, this);
    for (const a of this.anchors.values()) this.bake(a.obj);
    for (const g of this.fixed) this.bake(g);

    // Altura de referencia de los pies (para mantenerlos en el suelo).
    this.feet = def.feet?.map((n) => this.bones.get(n)).filter(Boolean);
    if (!this.feet?.length) this.feet = null;
    else {
      _inv.copy(rig.body.matrixWorld).invert();
      this.footY = Math.min(...this.feet.map((f) => _m.multiplyMatrices(_inv, f.matrixWorld).elements[13]));
      this.ground = 0;
      // Sin animación de reposo: fotograma de la carrera con los dos pies apoyados (se calcula una vez por modelo).
      const run = this.actions.run;
      if (run && !this.actions.idle) {
        const key = `${def.file}:${run.getClip().name}`;
        if (!standTimes.has(key)) {
          const t0 = run.time, dur = run.getClip().duration;
          run.setEffectiveWeight(1);
          let best = 0, bestH = Infinity;
          for (let i = 0; i < 24; i++) {
            run.time = (dur * i) / 24;
            this.mixer.update(0);
            rig.root.updateMatrixWorld(true);
            const h = Math.max(...this.feet.map((f) => _m.multiplyMatrices(_inv, f.matrixWorld).elements[13]));
            if (h < bestH) { bestH = h; best = run.time; }
          }
          run.time = t0;
          standTimes.set(key, best);
        }
        this.standTime = standTimes.get(key);
      }
    }

    // La hitbox de la cabeza sigue al hueso de la cabeza del modelo.
    if (def.head) {
      const a = this.anchor(def.head[0]);
      if (a) this.headHits = rig.hitMeshes.filter((m) => m.userData.part === 'head').map((m) => ({ m, a, off: new THREE.Vector3(...def.head[1]) }));
    }
    for (const m of this.mats) rig.mats.push(m);
  }

  mat(m) { this.mats.push(m); return m; }

  // Punto anclado a un hueso: se mueve y gira con él (en ejes del cuerpo y sin la escala del hueso).
  anchor(name) {
    if (this.anchors.has(name)) return this.anchors.get(name).obj;
    const bone = this.bones.get(name);
    if (!bone) return null;
    const obj = new THREE.Group();
    this.rig.body.add(obj);
    _inv.copy(this.rig.body.matrixWorld).invert();
    _m.multiplyMatrices(_inv, bone.matrixWorld).decompose(_p, _q, _s);
    obj.position.copy(_p);
    this.anchors.set(name, { obj, bone, bindInv: _q.clone().invert() });
    return obj;
  }

  // Ancla fija al cuerpo (modelos sin huesos).
  at(x = 0, y = 0, z = 0) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    this.holder.add(g);
    this.fixed.push(g);
    return g;
  }

  mesh(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.scale.set(sx, sy, sz);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  // Bulto de carne (opcionalmente con herida abierta y húmeda).
  tumor(parent, x, y, z, r, seed, wound = false) {
    const b = this.mesh(parent, blob(seed, 0.35), this.flesh, x, y, z, seed, seed * 2, 0, r, r * 0.85, r);
    if (wound) this.mesh(parent, blob(seed + 50, 0.5, 1), this.wet, x + r * 0.35, y + r * 0.2, z + r * 0.55, 0, 0, 0, r * 0.55, r * 0.4, r * 0.3);
    return b;
  }

  // Placa o espina de hueso.
  plate(parent, x, y, z, w, h, d, rx = 0, ry = 0, rz = 0, seed = 3) {
    return this.mesh(parent, blob(seed, 0.25, 1), this.bone, x, y, z, rx, ry, rz, w, h, d);
  }
  horn(parent, x, y, z, r, h, rx = 0, ry = 0, rz = 0) {
    return this.mesh(parent, hornGeo(r, h), this.bone, x, y, z, rx, ry, rz);
  }

  // Ojo con párpado de carne; mira a +Z del padre.
  eye(parent, x, y, z, r, ry = 0, rx = 0) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.set(rx, ry, 0);
    parent.add(g);
    this.mesh(g, sphGeo(1, 16, 12), this.eyeMat, 0, 0, 0, 0, 0, 0, r);
    this.mesh(g, sphGeo(1, 12, 8), this.pupil, 0, 0, r * 0.5, 0, 0, 0, r * 0.32, r * 0.62, r * 0.55); // pupila rasgada
    this.mesh(g, blob((r * 140) | 0, 0.25, 1), this.flesh, 0, r * 0.55, r * 0.15, -0.5, 0, 0, r * 1.15, r * 0.55, r * 1.0); // párpado
    this.mesh(g, blob(r * 100 | 0, 0.3, 1), this.flesh, 0, 0, -r * 0.25, 0, 0, 0, r * 1.35, r * 1.3, r * 1.1);
    return g;
  }

  // Tentáculo grueso articulado (dir: rotación inicial de la base). Se balancea solo.
  tentacle(parent, x, y, z, { r = 0.07, len = 1, n = 6, rx = 0, ry = 0, rz = 0, amp = 0.35, f = 1.6, droop = 0.12, tip = true } = {}) {
    // Una sola malla con esqueleto (una llamada de dibujo) que se curva suavemente.
    const base = new THREE.Group();
    base.position.set(x, y, z);
    base.rotation.set(rx, ry, rz);
    base.userData.dynamic = true;
    parent.add(base);
    const seg = len / n, o = Math.random() * 10, bones = [];
    for (let i = 0; i < n; i++) {
      const b = new THREE.Bone();
      if (i) { b.position.y = seg; bones[i - 1].add(b); }
      bones.push(b);
      this.sway.push({ obj: b, i, n, amp, f, o, droop });
    }
    const mesh = new THREE.SkinnedMesh(tentacleGeo(r, len, n), this.flesh);
    mesh.add(bones[0]);
    mesh.bind(new THREE.Skeleton(bones));
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    base.add(mesh);
    if (tip) this.mesh(bones[n - 1], coneGeo(r * 0.22, r * 1.4), this.bone, 0, seg * 0.95, 0);
    return bones[n - 1];
  }

  // Fusiona los añadidos estáticos de cada ancla por material: muchas menos llamadas de dibujo.
  bake(root) {
    root.updateMatrixWorld(true);
    _inv.copy(root.matrixWorld).invert();
    const groups = new Map(), drop = [];
    const visit = (o) => {
      for (const ch of [...o.children]) {
        if (ch.userData.dynamic) { this.bake(ch); continue; }
        if (ch.isMesh && !ch.isSkinnedMesh) {
          let g = ch.geometry.index ? ch.geometry.toNonIndexed() : ch.geometry.clone();
          for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
          if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
          g.applyMatrix4(_m.multiplyMatrices(_inv, ch.matrixWorld));
          if (!groups.has(ch.material)) groups.set(ch.material, []);
          groups.get(ch.material).push(g);
          drop.push(ch);
        }
        if (!ch.isSkinnedMesh) visit(ch);
      }
    };
    visit(root);
    for (const m of drop) m.parent.remove(m);
    for (const [mat, list] of groups) {
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = mesh.receiveShadow = true;
      root.add(mesh);
      this.baked.push(merged);
    }
  }

  // Boca vertical: dos labios que se abren hacia los lados, dientes irregulares y lengua colgante.
  maw(parent, x, y, z, h, w, { tongue = true, teeth = 7 } = {}) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    this.mesh(g, sphGeo(1, 14, 10), this.mawMat, 0, 0, -w * 0.3, 0, 0, 0, w * 0.55, h * 0.5, w * 0.5);
    const lips = [];
    for (const s of [-1, 1]) {
      const lip = new THREE.Group();
      lip.userData.dynamic = true;
      g.add(lip);
      this.mesh(lip, blob(s > 0 ? 11 : 12, 0.3, 2), this.flesh, s * w * 0.45, 0, 0, 0, 0, 0, w * 0.32, h * 0.55, w * 0.38);
      for (let i = 0; i < teeth; i++) {
        const t = (i + 0.5) / teeth, ty = (t - 0.5) * h * 0.85, len = (0.35 + ((i * 37 + (s > 0 ? 5 : 0)) % 7) / 7 * 0.8) * w * 0.32;
        this.mesh(lip, coneGeo(w * 0.04, len, 5), this.teeth, s * w * 0.18, ty, w * 0.12, 0.2 * (i % 2 ? 1 : -1), 0, s * PI / 2 + (i % 3 - 1) * 0.25);
      }
      lips.push({ obj: lip, s });
    }
    if (tongue) this.tentacle(g, 0, -h * 0.4, w * 0.05, { r: w * 0.11, len: h * 1.1, n: 5, rx: PI * 0.92, amp: 0.25, f: 2.2, droop: 0.05, tip: false });
    this.mawParts = { lips, w };
    return g;
  }

  dispose() {
    for (const g of this.baked) g.dispose();
  }

  update(dt, s) {
    this.t += dt;
    const def = this.def, sp = s.speed ?? 0;
    if (this.mixer) {
      const run = this.actions.run, idle = this.actions.idle, atk = this.actions.attack, tel = this.actions.telegraph;
      const moving = Math.min(1, sp / 1.2);
      const special = tel && s.telegraph ? 'tel' : atk && s.attack ? 'atk' : null;
      this.wAtk = THREE.MathUtils.damp(this.wAtk ?? 0, special === 'atk' ? 1 : 0, 10, dt);
      this.wTel = THREE.MathUtils.damp(this.wTel ?? 0, special === 'tel' ? 1 : 0, 10, dt);
      const rest = 1 - Math.max(this.wAtk, this.wTel);
      if (run) {
        run.setEffectiveWeight(idle ? rest * moving : rest);
        run.timeScale = Math.min(1.6, Math.max(0.6, sp / def.runRef));
        if (!idle && this.standTime !== undefined && moving < 0.15) {
          // Quieto: se queda de pie (la respiración y los tentáculos ponen el movimiento).
          run.timeScale = 0;
          run.time += (this.standTime - run.time) * Math.min(1, dt * 6);
        }
      }
      if (idle) idle.setEffectiveWeight(rest * (run ? 1 - moving : 1));
      if (atk) atk.setEffectiveWeight(this.wAtk);
      if (tel) tel.setEffectiveWeight(this.wTel);
      // Calidad BAJA: el esqueleto se evalúa un fotograma sí y otro no (mitad de CPU en animación).
      this.mixDt = (this.mixDt ?? 0) + dt;
      if (!Q.halfAnim || (this.mixF = !this.mixF)) { this.mixer.update(this.mixDt); this.mixDt = 0; }
    }
    // Una extremidad más grande que la otra.
    if (this.bigArm) this.bigArm.scale.setScalar(this.bigArmK);

    // Respiración, inclinación irregular y temblores.
    const breath = Math.sin(this.t * (s.enraged ? 4 : 1.6));
    this.holder.scale.set(1 + breath * 0.012, 1 - breath * 0.008, 1 + breath * 0.015);
    this.holder.rotation.z = Math.sin(this.t * 0.7) * 0.035 + Math.sin(this.t * 2.9) * 0.012;
    if (def.fly) {
      this.holder.position.y = Math.sin(this.t * 1.7) * 0.06;
      this.holder.rotation.x = Math.sin(this.t * 1.1) * 0.08;
    } else {
      this.holder.rotation.x = (def.lean ?? 0) + Math.sin(this.t * 1.3) * 0.02;
    }
    for (const w of this.sway) {
      const ph = this.t * w.f + w.o - w.i * 0.7, a = w.amp * (0.4 + w.i / w.n) * (s.attack ? 1.8 : 1);
      w.obj.rotation.x = Math.sin(ph) * a * 0.6 + w.droop;
      w.obj.rotation.z = Math.cos(ph * 0.8) * a * 0.5;
    }
    // Boca: se abre al atacar o avisar un ataque; si no, jadea.
    if (this.mawParts) {
      const target = s.attack || s.telegraph ? 1 : 0.15 + Math.max(0, Math.sin(this.t * 2.3)) * 0.2;
      this.open += (target - this.open) * Math.min(1, dt * 8);
      for (const l of this.mawParts.lips) l.obj.position.x = l.s * this.open * this.mawParts.w * 0.35;
    }

    // Brillo limitado: solo ojos (más al avisar un ataque o enfurecido) y un toque rojo al recibir daño.
    this.eyeMat.emissiveIntensity = 0.35 + (s.telegraph ? 1.6 + Math.sin(this.t * 25) * 0.6 : 0) + (s.enraged ? 0.9 : 0);
    if (s.enraged) this.eyeMat.emissive.setHex(0xff2a10);
    const hit = s.hit ?? 0;
    for (const m of [...this.skins, this.flesh]) m.emissive.setRGB(hit * 0.55, 0, 0);
    // Camuflaje (Stalker).
    if (s.cloak !== undefined) {
      const o = 0.05 + s.cloak * 0.95;
      for (const m of this.mats) { m.transparent = o < 0.99; m.opacity = o; m.depthWrite = o > 0.5; }
    }

    // Anclas y hitbox de la cabeza siguen al esqueleto (solo se recalcula el modelo, no todo el rig).
    this.holder.updateWorldMatrix(true, true);
    _inv.copy(this.rig.body.matrixWorld).invert();
    if (this.anchors.size) {
      for (const a of this.anchors.values()) {
        _m.multiplyMatrices(_inv, a.bone.matrixWorld).decompose(_p, _q, _s);
        a.obj.position.copy(_p);
        a.obj.quaternion.multiplyQuaternions(_q, a.bindInv);
        a.obj.updateMatrixWorld(true);
      }
    }
    // Pies en el suelo: compensa el sube y baja de la cadera de las animaciones.
    if (this.feet) {
      let low = Infinity;
      for (const f of this.feet) { _m.multiplyMatrices(_inv, f.matrixWorld); low = Math.min(low, _m.elements[13]); }
      this.ground += (this.ground + this.footY - low - this.ground) * Math.min(1, dt * 12);
      this.holder.position.y = this.ground;
    }
    if (this.headHits) {
      for (const h of this.headHits) {
        h.a.localToWorld(_w.copy(h.off));
        h.m.parent.updateWorldMatrix(true, false);
        h.m.parent.worldToLocal(_w);
        h.m.position.copy(_w);
        h.m.updateMatrixWorld(true);
      }
    }
  }
}

// --- Diseños --------------------------------------------------------------------------
// Mutante de Carne (Ravager): encorvado, cabeza hundida en el pecho, boca vertical, 5 ojos,
// tentáculos de la espalda y el cuello, bultos y heridas, brazo derecho hipertrofiado, placas de hueso.
function fleshMutant(M) {
  M.bigArm = M.bones.get('mixamorigRightArm');
  M.bigArmK = 1.38;
  const head = M.anchor('mixamorigHead'), neck = M.anchor('mixamorigNeck'), chest = M.anchor('mixamorigSpine2'), mid = M.anchor('mixamorigSpine1');
  const rsh = M.anchor('mixamorigRightShoulder'), lsh = M.anchor('mixamorigLeftShoulder'), rarm = M.anchor('mixamorigRightForeArm');
  M.maw(head, 0, -0.1, 0.2, 0.42, 0.28);
  M.eye(head, -0.15, 0.1, 0.17, 0.065, -0.35);
  M.eye(head, 0.07, 0.17, 0.17, 0.04, 0.2);
  M.eye(head, 0.18, 0.04, 0.15, 0.075, 0.6);
  M.eye(neck, -0.24, -0.02, 0.18, 0.04, -0.7);
  M.eye(head, -0.02, 0.24, 0.12, 0.03, 0, -0.4);
  M.eye(chest, 0.2, 0.0, 0.3, 0.035, 0.5);
  M.tentacle(chest, -0.12, 0.12, -0.18, { r: 0.09, len: 1.2, n: 7, rx: -0.6, rz: 0.35, amp: 0.4, f: 1.3 });
  M.tentacle(chest, 0.1, 0.16, -0.2, { r: 0.075, len: 1.0, n: 6, rx: -0.85, rz: -0.4, amp: 0.45, f: 1.7 });
  M.tentacle(mid, 0.02, 0.05, -0.22, { r: 0.06, len: 0.8, n: 5, rx: -1.6, amp: 0.5, f: 2.1 });
  M.tentacle(neck, 0.2, 0.0, 0.1, { r: 0.05, len: 0.65, n: 5, rx: 2.4, rz: -0.5, amp: 0.3, f: 1.9, tip: false });
  M.tumor(chest, -0.26, 0.04, 0.2, 0.17, 4, true);
  M.tumor(lsh, 0.08, 0.1, 0.02, 0.15, 6);
  M.tumor(mid, 0.2, -0.04, 0.22, 0.12, 8, true);
  M.tumor(chest, 0.22, 0.24, -0.1, 0.14, 9);
  M.tumor(mid, -0.18, -0.12, -0.25, 0.13, 10, true);
  M.plate(rsh, -0.08, 0.12, -0.02, 0.24, 0.1, 0.2, 0.3, 0, -0.4, 5);
  M.plate(chest, 0, 0.22, -0.22, 0.26, 0.09, 0.18, 0.5, 0, 0.1, 7);
  M.plate(rarm, 0, 0.0, 0.0, 0.09, 0.15, 0.09, 0, 0, 0.3, 2);
  for (let i = 0; i < 4; i++) M.horn(chest, -0.04 + i * 0.02, 0.12 - i * 0.12, -0.26 + i * 0.03, 0.03, 0.22 - i * 0.03, -0.6, 0, 0.1 * i);
}

// Jefe: el Mutante de Carne mucho más grande, acorazado de hueso y con una corona de tentáculos.
function warlord(M) {
  fleshMutant(M);
  M.bigArm = M.bones.get('mixamorigLeftArm');
  M.bigArmK = 1.32;
  const head = M.anchor('mixamorigHead'), chest = M.anchor('mixamorigSpine2'), hips = M.anchor('mixamorigHips');
  for (let i = 0; i < 6; i++) {
    const a = (i / 5 - 0.5) * 2.4;
    M.horn(head, Math.sin(a) * 0.16, 0.16, -0.04 + Math.cos(a) * 0.02, 0.03, 0.28 + (i % 2) * 0.1, -0.3, 0, -a * 0.5);
  }
  for (let i = 0; i < 4; i++) M.tentacle(chest, (i - 1.5) * 0.12, 0.2, -0.22, { r: 0.08, len: 1.4, n: 8, rx: -0.4, rz: (i - 1.5) * 0.35, amp: 0.35, f: 1 + i * 0.2 });
  M.plate(chest, 0, 0.0, 0.2, 0.3, 0.25, 0.12, -0.2, 0, 0, 11);
  M.plate(hips, 0, 0.05, 0.16, 0.26, 0.14, 0.1, 0.2, 0, 0, 13);
  M.tumor(chest, 0.24, -0.05, 0.1, 0.14, 15, true);
}

// Soldado parasitado (Warden): restos de armadura cubiertos de tejido y tumores.
function parasiteSoldier(M) {
  const head = M.anchor('joint4'), chest = M.anchor('joint3'), spine = M.anchor('joint2'), lsh = M.anchor('Clav_L'), rsh = M.anchor('Clav_R');
  M.mesh(chest, blob(21, 0.12, 2), M.armor, 0, -0.05, 0.1, 0, 0, 0, 0.2, 0.2, 0.09);
  M.mesh(spine, blob(22, 0.12, 2), M.armor, 0, 0.05, 0.11, 0, 0, 0, 0.17, 0.12, 0.08);
  M.mesh(lsh, blob(23, 0.15, 1), M.armor, 0.12, 0.02, 0, 0, 0, -0.4, 0.11, 0.06, 0.12);
  M.mesh(head, new THREE.SphereGeometry(0.15, 16, 10, 0, PI * 2, 0, PI * 0.55), M.armor, 0, 0.02, -0.02, -0.4, 0, 0.15);
  M.tumor(chest, 0.1, 0.02, 0.17, 0.08, 24, true);
  M.tumor(head, 0.08, 0.09, -0.02, 0.08, 25);
  M.tumor(rsh, -0.1, 0.05, 0.0, 0.09, 26, true);
  M.eye(head, -0.06, 0.04, 0.12, 0.03, -0.3);
  M.eye(head, 0.05, 0.08, 0.11, 0.02, 0.3);
  M.eye(chest, -0.1, 0.0, 0.17, 0.025, -0.4);
  M.tentacle(chest, -0.05, 0.08, -0.12, { r: 0.045, len: 0.6, n: 5, rx: -0.7, rz: 0.3, amp: 0.35 });
  M.tentacle(chest, 0.07, 0.06, -0.12, { r: 0.035, len: 0.5, n: 5, rx: -0.9, rz: -0.4, amp: 0.4 });
}

// Skitter: corredor encorvado con mandíbula abierta y espinas.
function skitter(M) {
  const head = M.anchor('joint4'), chest = M.anchor('joint3');
  M.maw(head, 0, -0.02, 0.12, 0.17, 0.12, { teeth: 5 });
  M.eye(head, -0.07, 0.07, 0.1, 0.025, -0.4);
  M.eye(head, 0.07, 0.08, 0.1, 0.02, 0.4);
  M.eye(head, 0.0, 0.12, 0.08, 0.016, 0, -0.3);
  for (let i = 0; i < 3; i++) M.horn(chest, 0, 0.05 - i * 0.12, -0.12, 0.018, 0.12, -0.7);
  M.tumor(chest, 0.1, 0.0, 0.12, 0.07, 31, true);
  M.tentacle(chest, 0.0, 0.06, -0.1, { r: 0.04, len: 0.55, n: 5, rx: -0.9, amp: 0.5, f: 2.2 });
}

// Stalker: alargado y delgado, cresta de hueso, racimo de ojos y tentáculos sobre los hombros.
function stalker(M) {
  const head = M.anchor('joint4'), chest = M.anchor('joint3'), spine = M.anchor('joint2');
  M.horn(head, 0, 0.1, -0.04, 0.03, 0.3, -0.9);
  for (const [x, y, r] of [[-0.05, 0.05, 0.022], [0.05, 0.06, 0.018], [-0.02, 0.1, 0.014], [0.03, 0.0, 0.016]]) M.eye(head, x, y, 0.11, r, x * 6);
  M.tentacle(chest, -0.1, 0.06, -0.1, { r: 0.04, len: 0.95, n: 7, rx: -0.3, rz: 0.4, amp: 0.4, f: 1.4 });
  M.tentacle(chest, 0.1, 0.06, -0.1, { r: 0.04, len: 0.95, n: 7, rx: -0.3, rz: -0.4, amp: 0.4, f: 1.5 });
  for (let i = 0; i < 5; i++) M.horn(spine, 0, 0.25 - i * 0.1, -0.1, 0.012, 0.09, -0.8);
}

// Bombardier: masa jorobada con sacos de ácido en la espalda (su arma de artillería).
// Su hitbox de cabeza sigue donde estaba (delante y abajo): ahí brota una cabeza-boca sobre un tallo de carne.
function bombardier(M) {
  const back = M.anchor('Bone002'), head = M.rig.head;
  M.maw(head, 0, 0, 0.04, 0.22, 0.17, { teeth: 6 });
  M.tumor(head, 0, 0.02, -0.08, 0.13, 45);
  M.eye(head, -0.1, 0.08, 0.04, 0.035, -0.4);
  M.eye(head, 0.1, 0.09, 0.03, 0.04, 0.4);
  M.eye(head, 0.0, 0.14, 0.0, 0.025, 0, -0.3);
  const stalk = M.at(0, 0.6, 0.32);
  M.mesh(stalk, blob(46, 0.3, 2), M.flesh, 0, 0, 0, 0.25, 0, 0, 0.12, 0.11, 0.3);
  M.tumor(back, -0.12, 0.08, -0.16, 0.16, 41, true);
  M.tumor(back, 0.13, 0.1, -0.14, 0.14, 42);
  M.tumor(back, 0.0, 0.2, -0.18, 0.12, 43, true);
  M.plate(back, 0, 0.0, -0.22, 0.22, 0.1, 0.14, 0.4, 0, 0, 44);
  M.tentacle(back, 0.0, 0.18, -0.15, { r: 0.05, len: 0.5, n: 5, rx: -0.4, amp: 0.3, f: 1.2, tip: false });
}

// Drone: organismo flotante con ojo, boca y tentáculos colgantes.
function floater(M) {
  const s = M.def.size;
  const c = M.at(0, 0, 0);
  M.eye(c, 0, 0.02 * s, 0.3 * s, 0.12 * s);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + 0.4;
    M.tentacle(c, Math.cos(a) * 0.14 * s, -0.25 * s, Math.sin(a) * 0.12 * s, { r: 0.05 * s, len: 0.75 * s, n: 6, rx: PI, amp: 0.3, f: 1.5 + i * 0.2, droop: 0.05 });
  }
  M.tumor(c, 0.2 * s, 0.15 * s, -0.05 * s, 0.1 * s, 51, true);
}

// Overseer: masa orgánica flotante con corona de tentáculos y muchos ojos.
function overseer(M) {
  const s = M.def.size;
  const c = M.at(0, 0, 0);
  M.eye(c, 0, -0.05 * s, 0.3 * s, 0.11 * s);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * PI * 2;
    M.eye(c, Math.cos(a) * 0.3 * s, 0.12 * s + Math.sin(i * 1.7) * 0.05 * s, Math.sin(a) * 0.3 * s, (0.03 + (i % 3) * 0.012) * s, a + PI / 2);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2;
    M.tentacle(c, Math.cos(a) * 0.25 * s, -0.2 * s, Math.sin(a) * 0.25 * s, { r: 0.05 * s, len: 0.9 * s, n: 7, rx: PI - 0.3, rz: Math.cos(a) * 0.4, amp: 0.35, f: 1 + i * 0.15, droop: 0.05 });
  }
  for (let i = 0; i < 5; i++) M.horn(c, Math.cos(i) * 0.15 * s, 0.3 * s, Math.sin(i) * 0.15 * s, 0.025 * s, 0.25 * s, -0.3, i, 0);
  M.tumor(c, -0.25 * s, 0.1 * s, 0.1 * s, 0.12 * s, 61, true);
}

export function attachMonster(rig, type) {
  if (!hasMonster(type)) return null;
  // El rig procedural queda como esqueleto invisible: hitboxes y cañón siguen funcionando.
  rig.body.traverse((o) => { if (o.isMesh && !o.material?.isShaderMaterial) o.visible = false; });
  return new Monster(rig, type);
}
