import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/three/addons/loaders/GLTFLoader.js';
import { MELEE } from '../shared/melee.js';

// Armas cuerpo a cuerpo: modelos CC0 (vendor/assets/melee, normalizados: mango en el origen, hoja hacia +Y, tamaño
// real en metros) y la animación del golpe en primera persona (cámara) y en tercera (brazo derecho del avatar).
const DIR = new URL('../../vendor/assets/melee/', import.meta.url).href;
const models = new Map();
let loading = null;

// Carga todas (≈250 KB en total); hasta entonces se ve un cuchillo sencillo.
export function loadMelee() {
  loading ??= Promise.all(MELEE.map((m) => new GLTFLoader().loadAsync(`${DIR}${m.id}.glb`).then((g) => {
    g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.shared = true; } });
    models.set(m.id, g.scene);
  }, (e) => console.warn(`Ringfall: no se pudo cargar ${m.id}`, e))));
  return loading;
}
export const meleeLoaded = (k) => models.has(MELEE[k]?.id);

let fallback = null;
function knife() {
  if (!fallback) {
    const steel = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, metalness: 1, roughness: 0.3 });
    const grip = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.7 });
    fallback = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.19, 0.03), steel); blade.position.y = 0.13;
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.11, 0.028), grip);
    fallback.add(blade, handle);
  }
  return fallback.clone(true);
}

// Modelo del arma k (comparte geometría y materiales: no se libera).
export function buildMelee(k) {
  const m = MELEE[k] ?? MELEE[0];
  const g = new THREE.Group();
  g.add(models.has(m.id) ? models.get(m.id).clone(true) : knife());
  g.userData.k = models.has(m.id) ? k : -1;
  return g;
}

// --- Animación ---------------------------------------------------------------------------------------------
// Fotogramas clave [u, x, y, z, rx, ry, rz] en espacio de cámara (mira a -Z; +X derecha). u = 0..1 del golpe.
// El golpe (y el daño) ocurre al principio; el resto es la recuperación hasta salir de la vista.
const FP = {
  slash: [[0, 0.34, -0.62, -0.42, 0.3, 0, -0.9], [0.1, 0.42, 0.08, -0.4, 0.25, 0.2, -1.45], [0.3, -0.3, -0.24, -0.56, -0.7, -0.3, 1.35], [0.55, -0.1, -0.5, -0.5, -0.4, 0, 0.9], [1, 0.3, -0.7, -0.42, 0.2, 0, -0.6]],
  smash: [[0, 0.26, -0.65, -0.4, 0.6, 0, -0.3], [0.12, 0.24, 0.16, -0.32, 1.05, 0, -0.25], [0.3, 0.06, -0.3, -0.62, -1.75, 0, -0.1], [0.55, 0.12, -0.5, -0.5, -1.2, 0, -0.2], [1, 0.26, -0.7, -0.45, -0.4, 0, -0.3]],
  stab: [[0, 0.24, -0.6, -0.34, -1.2, 0.3, 0], [0.1, 0.22, -0.2, -0.28, -1.35, 0.4, 0.15], [0.26, 0.1, -0.14, -0.55, -1.5, 0.5, 0], [0.55, 0.18, -0.28, -0.42, -1.4, 0.4, 0.1], [1, 0.24, -0.65, -0.36, -1.2, 0.3, 0]],
};
// Tercera persona: brazo derecho [u, abrir, al frente, codo] (mismo convenio que los emotes).
const TP = {
  slash: [[0, 0.3, 0.6, 1.2], [0.12, 1.5, 1.1, 1.4], [0.32, -0.35, 1.25, 0.2], [1, 0.16, 0.2, 0.4]],
  smash: [[0, 0.2, 0.8, 1.0], [0.14, 0.25, 2.8, 1.1], [0.32, 0.1, 0.95, 0.1], [1, 0.16, 0.3, 0.4]],
  stab: [[0, 0.2, 0.4, 1.6], [0.12, 0.3, 0.5, 2.1], [0.28, 0.08, 1.5, 0.05], [1, 0.16, 0.3, 0.5]],
};
const ease = (x) => x * x * (3 - 2 * x);
function sample(keys, u, out) {
  let i = 0;
  while (i < keys.length - 2 && u > keys[i + 1][0]) i++;
  const a = keys[i], b = keys[i + 1], k = ease(Math.min(1, Math.max(0, (u - a[0]) / (b[0] - a[0]))));
  for (let n = 1; n < a.length; n++) out[n - 1] = a[n] + (b[n] - a[n]) * k;
  return out;
}
const _fp = [0, 0, 0, 0, 0, 0], _tp = [0, 0, 0];
export const meleeStyle = (k) => (MELEE[k] ?? MELEE[0]).style;
// Coloca el arma de primera persona para el instante u del golpe.
export function poseFP(obj, k, u) {
  const v = sample(FP[meleeStyle(k)], u, _fp);
  obj.position.set(v[0], v[1], v[2]);
  obj.rotation.set(v[3], v[4], v[5]);
}
// Brazo derecho del avatar (abrir, al frente, codo) en el instante u.
export const poseTP = (k, u) => sample(TP[meleeStyle(k)], u, _tp);
