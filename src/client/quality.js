// Calidad gráfica: preajustes (ALTA/MEDIA/BAJA) y AUTO según el dispositivo, más resolución dinámica por FPS.
// Solo afecta a lo visual: colisiones, hitboxes y reglas son idénticas en todos los niveles.
import * as THREE from 'three';
import { TOUCH } from './touch.js';

const KEY = 'ringfall.quality';
export const QUALITY_LEVELS = ['auto', 'alta', 'media', 'baja'];

const PRESETS = {
  // pr: densidad de píxeles máx. · minPr: suelo de la resolución dinámica · halfShadow: sombras a 30 Hz · halfAnim: esqueletos a 30 Hz
  alta: { pr: 2, shadows: true, shadowSize: 2048, soft: true, grass: 1, particles: 1, trees: 1, clouds: 1, lights: 6, seg: 150, tex: 512, normals: true, fx: 1, aa: true, halfAnim: false, halfShadow: false, minPr: 0.75 },
  media: { pr: 1.25, shadows: true, shadowSize: 1024, soft: false, grass: 0.45, particles: 0.45, trees: 0.7, clouds: 0.6, lights: 3, seg: 96, tex: 256, normals: true, fx: 0.7, aa: false, halfAnim: false, halfShadow: true, minPr: 0.65 },
  baja: { pr: 1, shadows: false, shadowSize: 512, soft: false, grass: 0, particles: 0.2, trees: 0.45, clouds: 0.35, lights: 1, seg: 64, tex: 256, normals: false, fx: 0.45, aa: false, halfAnim: true, halfShadow: false, minPr: 0.55 },
};

const params = new URLSearchParams(location.search);

function stored() {
  const q = params.get('q');
  if (QUALITY_LEVELS.includes(q)) return q;
  try { const v = localStorage.getItem(KEY); return QUALITY_LEVELS.includes(v) ? v : 'auto'; } catch { return 'auto'; }
}

// AUTO: escritorio → ALTA; móvil/tableta → MEDIA, o BAJA si es modesto (<4 GB o <6 núcleos).
// Safari (iPhone/iPad) no informa de la memoria: se asume suficiente. La resolución dinámica ajusta el resto.
export function autoLevel() {
  if (!TOUCH) return 'alta';
  const mem = navigator.deviceMemory ?? 8, cores = navigator.hardwareConcurrency ?? 8;
  return mem < 4 || cores < 6 ? 'baja' : 'media';
}

export const Q = { choice: stored(), level: 'alta', ...PRESETS.alta };
function resolve() { Q.level = Q.choice === 'auto' ? autoLevel() : Q.choice; Object.assign(Q, PRESETS[Q.level]); }
resolve();
const startAa = Q.aa; // el antialias del lienzo se fija al crearlo
export const needsReload = () => Q.aa !== startAa;

export function setQuality(choice) {
  if (!QUALITY_LEVELS.includes(choice)) return false;
  Q.choice = choice;
  try { localStorage.setItem(KEY, choice); } catch { /* sin almacenamiento */ }
  resolve();
  return true;
}

// Aplica sombras y densidad de píxeles al renderer (el resto se aplica al construir el mapa).
let renderer = null, scale = 1;
export function applyRenderer(r) {
  renderer = r;
  scale = 1;
  r.shadowMap.enabled = Q.shadows;
  r.shadowMap.type = Q.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  r.shadowMap.autoUpdate = !Q.halfShadow;
  r.shadowMap.needsUpdate = true;
  setPr();
}
const maxPr = () => Math.min(devicePixelRatio || 1, Q.pr);
function setPr() {
  const pr = Math.max(Q.minPr, maxPr() * scale);
  if (Math.abs(renderer.getPixelRatio() - pr) > 0.01) renderer.setPixelRatio(pr);
}

// Resolución dinámica: si la media de FPS cae por debajo de ~45, se reducen los píxeles (hasta minPr);
// si sobra rendimiento de forma sostenida, se recuperan. Ventanas de 2 s; ignora pausas y pestañas ocultas.
let acc = 0, frames = 0, good = 0, bad = 0;
export function trackFrame(dtMs) {
  if (!renderer || dtMs > 1000) return; // pestaña oculta o carga de mapa: no cuenta
  acc += dtMs; frames++;
  if (acc < 2000) return;
  const fps = (frames * 1000) / acc;
  acc = 0; frames = 0;
  // Cada cambio de resolución reasigna el lienzo (un tirón): solo tras dos ventanas lentas seguidas (o una muy
  // lenta), y para subir hacen falta 4 buenas (8 s). Un pico breve al disparar no cambia nada.
  if (fps < 45 && maxPr() * scale > Q.minPr + 0.01) {
    good = 0;
    if (++bad >= 2 || fps < 25) { scale = Math.max(Q.minPr / maxPr(), scale * (fps < 30 ? 0.8 : 0.9)); bad = 0; setPr(); }
  } else if (fps > 57 && scale < 1) {
    bad = 0;
    if (++good >= 4) { scale = Math.min(1, scale * 1.1); good = 0; setPr(); }
  } else { good = 0; bad = 0; }
}
export const renderScale = () => (renderer ? renderer.getPixelRatio() : 1);

// Antes de cada render: con halfShadow el mapa de sombras se recalcula un fotograma de cada dos.
let shadowF = false;
export function beforeRender() {
  if (Q.shadows && Q.halfShadow && (shadowF = !shadowF)) renderer.shadowMap.needsUpdate = true;
}
