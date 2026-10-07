import * as THREE from 'three';
import { createWorld } from './world.js';
import { Player } from './player.js';
import { Arsenal } from './weapons.js';
import { Director } from './enemies.js';
import { Hud } from './hud.js';
import { Sfx } from './audio.js';
import { Effects } from './effects.js';
import { NavGrid } from './nav.js';

const BEST_KEY = 'ringfall.best';

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(78, innerWidth / innerHeight, 0.03, 3000);

const game = { state: 'menu', wave: 0, kills: 0, score: 0, time: 0, deathT: -1 };
const ctx = { scene, camera, renderer, game };
ctx.sfx = new Sfx();
ctx.hud = new Hud();
ctx.world = createWorld(scene);
ctx.nav = new NavGrid(ctx.world);
ctx.fx = new Effects(scene);
ctx.player = new Player(ctx);
ctx.director = new Director(ctx);
ctx.arsenal = new Arsenal(ctx);
const { sfx, hud, fx, player, director, arsenal } = ctx;

function readBest() {
  try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; }
}
function writeBest(v) {
  try { localStorage.setItem(BEST_KEY, String(v)); } catch { /* almacenamiento no disponible */ }
}

function lock() {
  const el = renderer.domElement;
  if (!el.requestPointerLock) return false;
  try {
    const p = el.requestPointerLock();
    if (p?.catch) p.catch(() => {});
  } catch { /* el navegador puede rechazar el bloqueo; el jugador reintenta con clic */ }
  return true;
}

function newGame() {
  sfx.unlock();
  Object.assign(game, { wave: 0, kills: 0, score: 0, time: 0, deathT: -1, state: 'playing' });
  player.reset();
  arsenal.reset();
  director.reset();
  fx.clear();
  hud.reset();
  hud.showOverlay(null);
  lock();
}

function resume() {
  sfx.unlock();
  if (!lock()) { game.state = 'playing'; hud.showOverlay(null); }
}

game.onPlayerDeath = () => {
  game.deathT = 0;
  arsenal.trigger = false;
  sfx.death();
  hud.banner('HAS CAÍDO', '', 1.8);
};

function gameOver() {
  game.state = 'over';
  const best = Math.max(readBest(), game.score);
  writeBest(best);
  if (document.pointerLockElement) document.exitPointerLock();
  hud.showGameOver({ ...game, best });
}

document.getElementById('btn-start').addEventListener('click', newGame);
document.getElementById('btn-retry').addEventListener('click', newGame);
document.getElementById('pause').addEventListener('click', resume);
document.getElementById('best').textContent = readBest().toLocaleString('es-ES');
if (matchMedia('(pointer: coarse)').matches) document.getElementById('touch-warn').classList.remove('hidden');

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === renderer.domElement;
  if (locked && game.state === 'paused') {
    game.state = 'playing';
    hud.showOverlay(null);
  } else if (!locked && game.state === 'playing' && player.alive) {
    game.state = 'paused';
    arsenal.trigger = false;
    player.keys.clear();
    hud.showOverlay('pause');
  }
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

function tick(dt) {
  if (game.state === 'playing') {
    game.time += player.alive ? dt : 0;
    player.update(dt);
    player.yaw.updateMatrixWorld(true);
    director.update(dt);
    arsenal.update(dt);
    hud.update(ctx, dt);
    if (game.deathT >= 0) {
      game.deathT += dt;
      if (game.deathT > 2.2) gameOver();
    }
  } else if (game.state === 'menu') {
    player.yaw.rotation.y += dt * 0.05;
    player.yaw.position.set(0, 9, 34);
    player.pitch.rotation.x = -0.12;
  }
  fx.update(game.state === 'paused' ? 0 : dt);
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  tick(Math.min((now - last) / 1000, 0.05));
  last = now;
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// Acceso para depuración y pruebas automatizadas.
window.__ringfall = { ctx, newGame, tick };
