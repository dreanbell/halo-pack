import * as THREE from 'three';
import { Avatar } from './avatar.js';
import { studio } from './gunview.js';
import { requestPlayerModel } from './playermodels.js';
import { buildGun } from './guns.js';
import { finishOf } from '../shared/shop.js';

// Miniaturas 3D de la tienda: el artículo puesto en un soldado con tus colores.
// Modelos: cuerpo entero · cascos: primer plano de la cabeza · patrones: torso · acabados: el arma de perfil. Se generan en segundo plano
// (una por turno, con un renderer temporal que se libera al acabar) y se guardan por artículo + colores.
const SIZE = 192;
const cache = new Map(); // clave → dataURL
const waiting = new Map(); // clave → [callbacks]
const queue = [];
let r = null, scene = null, cam = null, idleT = null, busy = false;

const keyOf = (kind, i, skin) => (kind === 'w' ? `w|${i}` : `${kind}|${i}|${skin.p}|${skin.s}|${skin.v}${kind === 'm' ? `|${skin.h}|${skin.t}` : ''}`);

// Pide la miniatura; cb(url) se llama al tenerla (al momento si ya estaba hecha).
export function shopThumb(kind, i, skin, cb, prio = false) {
  const key = keyOf(kind, i, skin);
  if (cache.has(key)) { cb(cache.get(key)); return; }
  if (waiting.has(key)) { waiting.get(key).push(cb); return; }
  waiting.set(key, [cb]);
  // Cascos y patrones sobre el soldado clásico (son piezas suyas); los modelos, con su propio cuerpo.
  const look = kind === 'm' ? { ...skin, m: i } : { ...skin, m: 0, [kind]: i };
  // prio: va delante (p. ej. el premio de una caja, que tiene que estar listo al pararse la ruleta).
  const job = { key, kind, i, skin: kind === 'w' ? { m: 0 } : look };
  if (prio) queue.unshift(job); else queue.push(job);
  pump();
}

function setup() {
  if (r) return true;
  try {
    r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch {
    return false;
  }
  r.setSize(SIZE, SIZE, false);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.2;
  r.setClearColor(0x000000, 0);
  scene = new THREE.Scene();
  studio(scene, r);
  cam = new THREE.PerspectiveCamera(28, 1, 0.05, 20);
  return true;
}

function release() {
  if (!r) return;
  r.dispose();
  r.forceContextLoss();
  r = scene = cam = null;
}

const later = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 120 }) : setTimeout(fn, 16));

function pump() {
  if (busy || !queue.length) return;
  busy = true;
  clearTimeout(idleT);
  later(async () => {
    const job = queue.shift();
    try {
      if (job.skin.m) await requestPlayerModel(job.skin.m); // los modelos 3D se cargan bajo demanda
      const url = render(job);
      cache.set(job.key, url);
      for (const cb of waiting.get(job.key) ?? []) cb(url);
    } catch (e) {
      console.warn('Ringfall: miniatura de la tienda', e);
    }
    waiting.delete(job.key);
    busy = false;
    if (queue.length) pump();
    else idleT = setTimeout(release, 3000); // sin trabajo: se libera el contexto WebGL
  });
}

const _b = new THREE.Box3(), _c = new THREE.Vector3(), _s = new THREE.Vector3(), _h = new THREE.Vector3();
function render({ kind, i, skin }) {
  if (!setup()) return '';
  if (kind === 'w') return renderGun(i);
  const a = new Avatar(skin);
  a.root.rotation.y = Math.PI - 0.45; // tres cuartos, mirando a la cámara
  scene.add(a.root);
  a.animate(1 / 60, { speed: 0, pitch: 0, alive: true });
  a.root.updateMatrixWorld(true);
  _b.setFromObject(a.root, true);
  _b.getCenter(_c);
  _b.getSize(_s);
  let target, dist;
  const fit = (h) => h / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * 1.12;
  if (kind === 'h') {
    a.head.getWorldPosition(_h);
    target = _h.add(new THREE.Vector3(0, 0.14, 0));
    dist = fit(0.5);
  } else if (kind === 't') { // pecho y hombros, cerca: que se vea el dibujo
    a.head.getWorldPosition(_h);
    target = _h.add(new THREE.Vector3(0, -0.32, 0));
    dist = fit(0.62);
  } else {
    target = _c.clone();
    dist = fit(Math.max(_s.y, _s.x * 1.1));
  }
  cam.position.set(target.x + dist * 0.12, target.y + dist * 0.08, target.z + dist);
  cam.lookAt(target);
  r.render(scene, cam);
  const url = r.domElement.toDataURL('image/png');
  a.dispose();
  return url;
}

// Arma con su acabado, de perfil (cañón a la derecha) y algo picada.
function renderGun(i) {
  const { gun, f } = finishOf(i);
  const g = buildGun(gun, f).group, holder = new THREE.Group();
  holder.add(g);
  holder.rotation.set(0.12, -Math.PI / 2 + 0.25, 0);
  scene.add(holder);
  holder.updateMatrixWorld(true);
  _b.setFromObject(holder, true);
  _b.getCenter(_c);
  _b.getSize(_s);
  const half = Math.max(_s.x, _s.y, _s.z * 0.6) * 0.6;
  const dist = half / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
  cam.position.set(_c.x, _c.y + dist * 0.12, _c.z + dist);
  cam.lookAt(_c);
  r.render(scene, cam);
  const url = r.domElement.toDataURL('image/png');
  scene.remove(holder);
  return url;
}
