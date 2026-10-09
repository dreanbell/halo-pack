import * as THREE from 'three';
import { CFG } from './config.js';
import { createWorld, skyEnvironment } from './world.js';
import { MAPS, DEFAULT_MAP, isMap, mapInfo } from '../shared/mapinfo.js';
import { Player } from './player.js';
import { Arsenal } from './weapons.js';
import { Director } from './enemies.js';
import { Hud } from './hud.js';
import { Sfx } from './audio.js';
import { Effects } from './effects.js';
import { NavGrid } from './nav.js';
import { Net, v3, normalizeCode, BUILD, DEBUG } from './net.js';
import { RemotePlayers } from './remote.js';
import { Armory } from './armory.js';
import { LoadoutMenu } from './loadout.js';
import { gunThumbnails } from './gunview.js';
import { Spectator } from './spectator.js';
import { TOUCH, TouchControls, enterFullscreen } from './touch.js';
import { DEFAULT_SKIN, sanitizeSkin, MODELS, PRIMARY } from '../shared/skins.js';
import { Home } from './home.js';
import { Wallet, PRICES, ITEM_NAMES, KIND_NAMES } from './wallet.js';
import { Account } from './account.js';
import { encodeBackup, decodeBackup } from './profile.js';
import { LOADOUTS, VARIANTS, defaultRules, sanitizeRules, isCustom } from '../shared/rules.js';
import { renderRules } from './setup.js';
import { loadMonsters } from './monsters.js';
import { buildAlien } from './aliens.js';
import { loadGunModels } from './guns.js';
import { loadDropModel } from './drop.js';
import { loadPlayerModels, requestPlayerModel } from './playermodels.js';
import { S, onSettings } from './settings.js';
import { buildSettings } from './settingsui.js';
import { Q, QUALITY_LEVELS, setQuality, needsReload, applyRenderer, trackFrame, beforeRender } from './quality.js';

const BEST_KEY = 'ringfall.best';
const NAME_KEY = 'ringfall.name';
const SKIN_KEY = 'ringfall.skin';
const LOADOUT_KEY = 'ringfall.loadout';
const MAP_KEY = 'ringfall.map';
const SP_RULES_KEY = 'ringfall.sprules';
const $ = (id) => document.getElementById(id);
for (const el of document.querySelectorAll('.build')) el.textContent = `v${BUILD}${DEBUG ? ' · diagnóstico' : ''}`;
console.info(`Ringfall v${BUILD}`);

// Calidad (quality.js): en móvil, menos píxeles, sin antialias y sombras/detalle reducidos; resolución dinámica por FPS.
// Modelos 3D de las armas (~0,9 MB, CC0): antes de crear la vista en primera persona y las miniaturas.
await Promise.all([loadGunModels(), loadDropModel()]);

const renderer = new THREE.WebGLRenderer({ antialias: Q.aa, powerPreference: 'high-performance' });
applyRenderer(renderer);
// Leer el registro de cada shader bloquea hasta que termina de compilar: solo en modo diagnóstico.
renderer.debug.checkShaderErrors = DEBUG;
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(78, innerWidth / innerHeight, 0.03, 3000);

// mode: 'sp' (un jugador) | 'coop' | 'dm' (todos contra todos). Las reglas de la partida en curso, en ctx.rules.
// timeLeft: segundos de partida restantes (Infinity sin límite).
const game = { state: 'menu', mode: 'sp', wave: 0, kills: 0, score: 0, time: 0, deathT: -1, respawnIn: 0, timeLeft: Infinity, lifePending: false };

function readSpRules() {
  try { return sanitizeRules('sp', JSON.parse(localStorage.getItem(SP_RULES_KEY) ?? 'null')); } catch { return defaultRules('sp'); }
}
let spRules = readSpRules();
const ctx = { scene, camera, renderer, game, rules: spRules };
ctx.sfx = new Sfx();
ctx.hud = new Hud();
const warmed = new Set(); // enemigos ya precalentados con las luces del mapa actual
// Ejemplares del precalentado: se conservan (fuera de escena) porque three.js borra un shader cuando ningún
// material lo usa, y entonces la primera aparición real volvería a compilarlo.
const warmKeep = { rigs: [], mats: [] };
function dropWarm() {
  for (const rig of warmKeep.rigs) rig.dispose?.();
  for (const m of warmKeep.mats) m.dispose();
  warmKeep.rigs.length = warmKeep.mats.length = 0;
  warmed.clear();
}
// Mapa: se reconstruye entero (geometría, luz, navegación) al cambiar.
function loadMap(id, force = false) {
  if (!isMap(id)) id = DEFAULT_MAP;
  if (ctx.world?.id === id && !force) return;
  ctx.world?.dispose();
  scene.environment?.userData.target?.dispose();
  ctx.world = createWorld(scene, id);
  scene.environment = skyEnvironment(renderer, ctx.world.env);
  renderer.toneMappingExposure = ctx.world.exposure * S.brightness;
  ctx.nav = new NavGrid(ctx.world);
  dropWarm(); // otro mapa, otras luces: otros shaders
  prewarm();
}
// Compila ya los shaders de todo lo visible y de lo que solo aparece al disparar (fogonazos, casquillos,
// granadas, proyectiles), para que el primer disparo no se trabe.
// Incluye un ejemplar de cada enemigo (con su modelo de carne si ya cargó): se dibujan una vez, diminutos,
// delante de la cámara, así también se suben sus texturas y búferes. Así la primera aparición de cada tipo
// no traba la partida.
function prewarm(enemies = false) {
  const temp = ctx.fx?.warmObjects() ?? [], flashes = ctx.arsenal?.warmObjects() ?? [], rigs = [];
  if (enemies) {
    for (const type of Object.keys(CFG.enemies)) {
      const rig = buildAlien(type), key = `${type}:${rig.monster ? 1 : 0}`;
      if (warmed.has(key)) { rig.dispose?.(); continue; }
      warmed.add(key);
      rigs.push(rig);
      temp.push(rig.root);
    }
  }
  renderer.compile(scene, camera); // todo el mapa, también lo que queda fuera de la vista
  if (!temp.length && !flashes.length) return;
  const holder = new THREE.Group();
  camera.updateMatrixWorld(true);
  camera.getWorldPosition(holder.position).add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(2));
  holder.scale.setScalar(0.001);
  for (const m of temp) holder.add(m);
  scene.add(holder);
  for (const f of flashes) { f.visible = true; f.userData.warmScale = f.scale.x; f.scale.setScalar(0.001); }
  renderer.render(scene, camera);
  for (const f of flashes) { f.visible = false; f.scale.setScalar(f.userData.warmScale); }
  scene.remove(holder);
  holder.clear();
  warmKeep.rigs.push(...rigs);
  for (const m of temp) if (!rigs.some((r) => r.root === m) && m.material !== ctx.fx.casingMat.brass && m.material !== ctx.fx.casingMat.hull) warmKeep.mats.push(m.material);
}
function readMap() {
  try { const id = localStorage.getItem(MAP_KEY); return isMap(id) ? id : DEFAULT_MAP; } catch { return DEFAULT_MAP; }
}
ctx.spMap = readMap();
loadMap(ctx.spMap);
// Modelos de criaturas (si tardan, los primeros enemigos usan el modelo procedural).
// Monstruos: en segundo plano cuando el menú ya está a la vista (o al empezar partida, lo que llegue antes).
const idle = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 1200));
const monstersReady = new Promise((ok) => idle(() => loadMonsters().then(ok), { timeout: 3000 }));
// Si los modelos llegan con la partida ya empezada, se precalientan entonces (un único tirón en vez de uno por tipo).
monstersReady.then(() => { if (game.state !== 'menu' && game.mode !== 'dm') prewarm(true); });
// Skins 3D: se cargan bajo demanda; aquí solo la tuya (los avatares se actualizan solos al terminar).
const playersReady = Promise.resolve().then(() => ctx.skin?.m && requestPlayerModel(ctx.skin.m)); // ctx.skin se lee más abajo
const loadAllPlayerModels = loadPlayerModels; // pruebas
ctx.fx = new Effects(scene);
ctx.fx.ground = (x, z, y) => ctx.world.groundHeightAt(x, z, 0.05, y);
ctx.net = new Net();
ctx.remotes = new RemotePlayers(ctx);
ctx.player = new Player(ctx);
ctx.director = new Director(ctx);
ctx.arsenal = new Arsenal(ctx);
ctx.spectator = new Spectator(ctx);
ctx.touch = new TouchControls(ctx);
const { sfx, hud, fx, player, director, arsenal, net, remotes, spectator, touch } = ctx;
// Pantalla de inicio: el avatar en 3D (ver home.js y «Inicio» más abajo).
const home = (ctx.home = new Home(ctx));
const vec = (a) => new THREE.Vector3().fromArray(a);

// --- Armadura del jugador ----------------------------------------------------
function readSkin() {
  try { return sanitizeSkin(JSON.parse(localStorage.getItem(SKIN_KEY) ?? 'null') ?? DEFAULT_SKIN); } catch { return { ...DEFAULT_SKIN }; }
}
ctx.skin = readSkin();
net.skin = ctx.skin;
arsenal.setSkin(ctx.skin);
// Créditos y desbloqueos (lo que ya llevas equipado al estrenar el monedero queda desbloqueado).
const wallet = (ctx.wallet = new Wallet(ctx.skin));
const account = (ctx.account = new Account());
wallet.attach(account);
const armory = new Armory({
  canvas: $('armory-view'),
  skin: ctx.skin,
  locked: (k, v) => (PRICES[k] ? wallet.locked(k, v) : 0),
  onLocked: (k, v) => {
    if (game.state === 'menu') {
      selectTab('shop');
      $('shop-msg').textContent = `${ITEM_NAMES[k][v]} está bloqueado: cómpralo por ◈ ${wallet.price(k, v)}.`;
    } else hud.toast?.(`BLOQUEADO · ◈ ${wallet.price(k, v)} EN LA TIENDA`);
  },
  onChange: (skin) => {
    ctx.skin = skin;
    try { localStorage.setItem(SKIN_KEY, JSON.stringify(skin)); } catch { /* sin almacenamiento */ }
    arsenal.setSkin(skin);
    net.setSkin(skin);
    home.setSkin(skin);
    renderHome();
    syncProfile({ skin });
  },
});
let armoryReturn = 'menu';

// --- Armas elegidas (cuando las reglas dejan elegir; si no, las fija la regla de armamento) ---
function readLoadout() {
  try {
    const l = JSON.parse(localStorage.getItem(LOADOUT_KEY) ?? 'null');
    if (Array.isArray(l) && l.length === 2 && l.every((id) => CFG.weapons[id]) && l[0] !== l[1]) return l;
  } catch { /* sin almacenamiento */ }
  return [...CFG.defaultLoadout];
}
ctx.loadout = readLoadout();
function loadoutFor() {
  return LOADOUTS[ctx.rules.loadout] ?? ctx.loadout;
}

const loadoutMenu = new LoadoutMenu({
  get: () => ctx.loadout,
  set: (l) => {
    ctx.loadout = l;
    try { localStorage.setItem(LOADOUT_KEY, JSON.stringify(l)); } catch { /* sin almacenamiento */ }
    home.setWeapon(l[0]);
    renderHome();
    syncProfile({ loadout: l });
  },
});
// Miniaturas de armas (menú y HUD): se generan en segundo plano mientras se está en el menú.
setTimeout(() => { if (game.state !== 'playing') gunThumbnails(); }, 1200);
let loadoutReturn = 'menu';
function openLoadout(from) {
  loadoutReturn = from;
  hud.showOverlay('loadout');
  loadoutMenu.open();
}
$('btn-loadout').addEventListener('click', () => openLoadout('menu'));
$('btn-lobby-loadout').addEventListener('click', () => openLoadout('lobby'));
$('btn-loadout-done').addEventListener('click', () => {
  loadoutMenu.close();
  hud.showOverlay(loadoutReturn);
  if (loadoutReturn === 'lobby') renderLobby();
  if (loadoutReturn === 'setup') renderSetup();
});

// Tecla E: abrir suministros / coger el arma (si hay alguna caja cerca).
addEventListener('keydown', (e) => {
  if (e.code !== 'KeyE' || e.repeat || game.state !== 'playing' || !director.boxes.length) return;
  director.interact();
});
function openArmory(from) {
  armoryReturn = from;
  $('armory').querySelector('.armory-grid').appendChild(armoryOpts); // las opciones vuelven a la armería
  hud.showOverlay('armory');
  armory.show();
}
$('btn-armory').addEventListener('click', () => openArmory('menu'));
$('btn-lobby-armory').addEventListener('click', () => openArmory('lobby'));
$('btn-armory-done').addEventListener('click', () => {
  armory.hide();
  hud.showOverlay(armoryReturn);
  if (armoryReturn === 'lobby') renderLobby();
});

// Récord por variante; con ajustes personalizados no cuenta.
function bestKey(rules) {
  if (isCustom('sp', rules)) return null;
  return rules.variant === 'classic' ? BEST_KEY : `${BEST_KEY}.${rules.variant}`;
}
function readBest(key = BEST_KEY) {
  try { return Number(localStorage.getItem(key)) || 0; } catch { return 0; }
}
function writeBest(key, v) {
  try { localStorage.setItem(key, String(v)); } catch { /* almacenamiento no disponible */ }
}

function lock() {
  if (TOUCH) return false; // en móvil no hay puntero que capturar
  const el = renderer.domElement;
  if (!el.requestPointerLock) return false;
  try {
    const p = el.requestPointerLock();
    if (p?.catch) p.catch(() => {});
  } catch { /* el navegador puede rechazar el bloqueo; el jugador reintenta con clic */ }
  return true;
}

// --- Partida -----------------------------------------------------------------
function pickSpawn() {
  const { world } = ctx;
  const { x, z } = world.spawn, yaw = Math.atan2(x, z);
  if (game.mode === 'coop') {
    // En fila, mirando al centro del mapa.
    const ids = [...net.players.keys()].sort((a, b) => a - b);
    const i = Math.max(0, ids.indexOf(net.id));
    const side = -5.25 + (i % 8) * 1.5, back = Math.floor(i / 8) * 1.5;
    return [new THREE.Vector3(x + Math.cos(yaw) * side + Math.sin(yaw) * back, 0, z - Math.sin(yaw) * side + Math.cos(yaw) * back), yaw];
  }
  if (game.mode === 'dm') {
    // El punto de aparición más alejado de los rivales vivos (con algo de azar).
    const rivals = remotes.alive();
    const ranked = world.spawnPoints
      .map((p) => ({ p, d: rivals.length ? Math.min(...rivals.map((r) => r.pos.distanceTo(p))) : Math.random() }))
      .sort((a, b) => b.d - a.d);
    const { p } = ranked[(Math.random() * Math.min(4, ranked.length)) | 0];
    return [p.clone(), Math.atan2(p.x, p.z)];
  }
  return [new THREE.Vector3(x, 0, z), yaw];
}

function startSession(mode, rules = net.rules, map = mode === 'sp' ? ctx.spMap : net.map) {
  sfx.unlock();
  loadMap(map);
  if (mode !== 'dm') loadMonsters(); // por si se empieza antes de que termine la carga en segundo plano
  ctx.rules = sanitizeRules(mode, rules);
  const online = mode !== 'sp';
  const timeLeft = online ? net.timeLeft() : ctx.rules.timeLimit ? ctx.rules.timeLimit * 60 : Infinity;
  Object.assign(game, { mode, wave: ctx.rules.startWave - 1, kills: 0, score: 0, time: 0, deathT: -1, respawnIn: 0, timeLeft, state: 'playing' });
  game.lifePending = false;
  game.paid = false;
  director.configure(mode, !online || net.isHost);
  arsenal.reset(loadoutFor());
  fx.clear();
  prewarm(mode !== 'dm');
  hud.reset();
  spectator.stop();
  remotes.clear();
  if (online) {
    remotes.sync([...net.players.values()], net.id);
    remotes.setTagsThroughWalls(mode === 'coop');
  }
  player.reset(...pickSpawn());
  hud.showOverlay(null);
  $('pause-mp').classList.toggle('hidden', !online);
  lock();
}

function newGame() {
  enterFullscreen();
  startSession('sp', spRules);
}

function respawn() {
  spectator.stop();
  player.reset(...pickSpawn());
  arsenal.reset(loadoutFor());
  game.respawnIn = 0;
}

// --- Vidas compartidas (regla «vidas»): la autoridad de la IA las reparte ---
function requestLife() {
  if (director.authority) { grantLife(director.takeLife(), director.lives); return; }
  game.lifePending = true;
  net.to(net.hostId, 'lifeReq');
}

function grantLife(ok, left) {
  game.lifePending = false;
  if (player.alive || game.state === 'over') return;
  if (ok) {
    game.deathT = -1;
    game.respawnIn = ctx.rules.respawn;
    hud.banner('HAS CAÍDO', left > 0 ? `QUEDAN ${left} VIDAS` : 'ERA LA ÚLTIMA VIDA', 1.8);
  } else if (game.mode === 'sp') {
    game.deathT = 0; // sin vidas: fin de la partida
  } else {
    hud.banner('SIN VIDAS', 'VUELVES CUANDO EL EQUIPO GANE UNA', 2.2);
  }
}

function resume() {
  sfx.unlock();
  enterFullscreen();
  if (!lock()) { game.state = 'playing'; hud.showOverlay(null); }
}

game.onPlayerDeath = (lastHit) => {
  game.deathT = 0;
  arsenal.trigger = arsenal.aimHeld = false;
  sfx.death();
  if (game.mode === 'dm') {
    net.send('kill', { killer: lastHit?.by ?? null, head: !!lastHit?.head });
    game.respawnIn = ctx.rules.respawn;
    spectator.start(lastHit?.by ?? null, 1.2); // sigue a quien te eliminó hasta reaparecer
    return;
  }
  // Cooperativo con fuego amigo: baja por un compañero.
  if (game.mode === 'coop' && lastHit?.by != null) {
    net.bcast('tk', { killer: lastHit.by });
    teamKillFeed(lastHit.by, net.id);
  }
  if (game.mode === 'coop') spectator.start(null, 1.8);
  if (ctx.rules.lives) requestLife();
  else hud.banner('HAS CAÍDO', '', 1.8);
};

function teamKillFeed(killer, victim) {
  hud.feed([{ text: playerName(killer), color: playerColor(killer) }, { text: '✕ FUEGO AMIGO ✕' }, { text: playerName(victim), color: playerColor(victim) }]);
}

// Coop: al empezar cada oleada reaparecen los caídos (con vidas, los que se quedaron sin ninguna piden otra).
game.onWaveStart = () => {
  if (game.mode !== 'coop' || player.alive) return;
  if (!ctx.rules.lives) respawn();
  else if (game.respawnIn <= 0 && !game.lifePending) requestLife();
};

// Coop (anfitrión): todo el equipo ha caído o se acabó el tiempo.
game.onCoopOver = (extra = {}) => {
  const players = [...net.players.values()].map((p) => ({ id: p.id, ...(director.scores.get(p.id) ?? { kills: 0, score: 0 }) }));
  net.send('end', { summary: { wave: game.wave, score: game.score, players, ...extra } });
};

// Créditos de la partida (una vez por partida: al terminar o al salir a mitad).
async function payMatch(stats) {
  if (game.paid) return 0;
  game.paid = true;
  const n = await wallet.reward(stats);
  if (n) $('home-earn').textContent = `+${n} ◈ ÚLTIMA PARTIDA`;
  renderHome();
  return n;
}
function showEarned(n) {
  if (!n) return;
  const p = document.createElement('p');
  p.className = 'earn';
  p.innerHTML = `+${n} ◈ CRÉDITOS<small>Total: ◈ ${wallet.coins.toLocaleString('es-ES')} · gástalos en la TIENDA</small>`;
  $('go-stats').appendChild(p);
}

function gameOver(timeUp = false) {
  game.state = 'over';
  const key = bestKey(ctx.rules);
  const best = key ? Math.max(readBest(key), game.score) : null;
  if (key) writeBest(key, best);
  if (document.pointerLockElement) document.exitPointerLock();
  const variant = VARIANTS[ctx.rules.variant].name;
  hud.showGameOver({
    ...game, best,
    title: timeUp ? '¡TIEMPO!' : 'FIN DE LA PARTIDA',
    recordLabel: ctx.rules.variant === 'classic' ? 'Récord' : `Récord ${variant.toLowerCase()}`,
  });
  payMatch({ mode: 'sp', kills: game.kills, wave: game.wave, score: game.score, time: game.time }).then(showEarned);
}

function toMenu() {
  // Salir a mitad de partida también paga lo conseguido.
  if (['playing', 'paused'].includes(game.state) && game.mode === 'sp') payMatch({ mode: 'sp', kills: game.kills, wave: game.wave, score: game.score, time: game.time });
  spectator.stop();
  net.disconnect();
  loadMap(ctx.spMap);
  remotes.clear();
  director.configure('menu', true);
  fx.clear();
  game.state = 'menu';
  game.mode = 'sp';
  if (document.pointerLockElement) document.exitPointerLock();
  $('best').textContent = readBest().toLocaleString('es-ES');
  hud.showOverlay('menu');
  selectTab([...$('home-nav').children].find((b) => b.classList.contains('selected'))?.dataset.tab ?? 'play');
}

function toLobby(status = '') {
  spectator.stop();
  remotes.clear();
  director.configure('menu', true);
  fx.clear();
  game.state = 'lobby';
  if (document.pointerLockElement) document.exitPointerLock();
  hud.showOverlay('lobby');
  renderLobby(status);
}

// --- Selector de mapa (menú: libre; sala: solo el anfitrión) ------------------
function renderMaps(el, current, editable, pick) {
  el.replaceChildren(...MAPS.map((m) => {
    const b = document.createElement('button');
    b.className = `mapcard${m.id === current ? ' selected' : ''}`;
    b.disabled = !editable && m.id !== current;
    b.style.setProperty('--a', m.sky[0]);
    b.style.setProperty('--b', m.sky[1]);
    b.style.setProperty('--c', m.sky[2]);
    const name = document.createElement('b');
    name.textContent = m.name;
    const tag = document.createElement('small');
    tag.textContent = m.tag;
    b.append(name, tag);
    if (editable) b.addEventListener('click', () => pick(m.id));
    return b;
  }));
  const desc = el.nextElementSibling;
  if (desc?.classList.contains('map-desc')) desc.textContent = mapInfo(current).desc;
}
// Selector de gráficos (ajustes). Se reconstruye el mapa actual con el nuevo nivel de detalle, así que en
// mitad de una partida (pausa) no se puede cambiar.
const QUALITY_NAMES = { auto: 'AUTO', alta: 'ALTA', media: 'MEDIA', baja: 'BAJA' };
function renderQuality() {
  const el = $('menu-quality'), locked = game.state !== 'menu';
  el.replaceChildren(...QUALITY_LEVELS.map((lv) => {
    const b = document.createElement('button');
    b.className = 'chip' + (Q.choice === lv ? ' selected' : '');
    b.textContent = QUALITY_NAMES[lv];
    b.disabled = locked && Q.choice !== lv;
    b.addEventListener('click', () => {
      if (Q.choice === lv || game.state !== 'menu') return;
      setQuality(lv);
      applyRenderer(renderer);
      loadMap(ctx.world.id, true);
      renderQuality();
    });
    return b;
  }));
  const notes = [];
  if (Q.choice === 'auto') notes.push(`Automático: ${QUALITY_NAMES[Q.level]} en este dispositivo`);
  if (needsReload()) notes.push('El suavizado de bordes cambia al recargar la página');
  if (locked) notes.push('Se cambia desde el menú principal');
  $('quality-note').textContent = notes.join(' · ');
}

// --- Ajustes: controles, gráficos, audio, interfaz y accesibilidad (settings.js) -----------------------------
const settingsBox = $('settings-box');
buildSettings(settingsBox, {
  quality: () => {
    const w = document.createElement('div');
    w.innerHTML = '<div class="quality"><div id="menu-quality"></div></div><p class="tip quality-note" id="quality-note"></p>';
    return w;
  },
  extra: { AYUDA: $('settings-help') },
});
renderQuality();
const fpsMeter = Object.assign(document.createElement('div'), { id: 'fps-meter', hidden: true });
document.body.appendChild(fpsMeter);
onSettings((st, key) => {
  const root = document.documentElement.style;
  root.setProperty('--hud-scale', st.hudScale);
  root.setProperty('--xh-scale', st.xhScale);
  root.setProperty('--xh-color', st.xhColor);
  document.body.classList.toggle('no-xh-dot', !st.xhDot);
  fpsMeter.hidden = !st.showFps;
  if (ctx.world && (key === null || key === 'brightness')) renderer.toneMappingExposure = ctx.world.exposure * st.brightness;
});
// La caja de ajustes vive en la pestaña AJUSTES; en la pausa se toma prestada.
function settingsHome() {
  $('home-settings').querySelector('h3').after(settingsBox);
  $('pause-settings').hidden = true;
  $('pause').querySelector('.panel').classList.remove('with-settings');
  $('btn-pause-settings').textContent = 'AJUSTES';
}
$('btn-pause-settings').addEventListener('click', (e) => {
  e.stopPropagation();
  if (!$('pause-settings').hidden) { settingsHome(); return; }
  $('pause-settings').appendChild(settingsBox);
  $('pause-settings').hidden = false;
  $('pause').querySelector('.panel').classList.add('with-settings');
  $('btn-pause-settings').textContent = 'VOLVER';
  renderQuality();
});
$('pause-settings').addEventListener('click', (e) => e.stopPropagation());
function renderMenuMaps() {
  const pick = (id) => {
    ctx.spMap = id;
    try { localStorage.setItem(MAP_KEY, id); } catch { /* sin almacenamiento */ }
    loadMap(id);
    renderMenuMaps();
    renderHome();
  };
  renderMaps($('menu-maps'), ctx.spMap, true, pick);
  renderMaps($('setup-maps'), ctx.spMap, true, pick);
}
renderMenuMaps();

// --- Inicio: avatar en 3D con pestañas (jugar, modos, mapas, armas, personalizar, tienda, ajustes) ---------
const armoryOpts = document.querySelector('#armory .armory-opts');
home.setSkin(ctx.skin);
home.setWeapon(ctx.loadout[0]);
function selectTab(tab) {
  for (const b of $('home-nav').children) b.classList.toggle('selected', b.dataset.tab === tab);
  for (const sec of $('home-panel').children) sec.hidden = sec.dataset.panel !== tab;
  if (tab === 'custom') { $('home-custom').appendChild(armoryOpts); armory.syncControls(); }
  if (tab === 'settings') { settingsHome(); renderQuality(); }
  renderHome();
}
for (const b of $('home-nav').children) b.addEventListener('click', () => selectTab(b.dataset.tab));
for (const b of document.querySelectorAll('.home-mode')) b.addEventListener('click', () => (b.dataset.go === 'sp' ? openSetup() : $('btn-mp').click()));
$('btn-loadout-2').addEventListener('click', () => openLoadout('menu'));
const slotHtml = (id, label) => {
  const d = document.createElement('div');
  d.className = 'slot';
  const img = document.createElement('img');
  img.alt = '';
  const th = gunThumbnails()[id];
  if (th) img.src = th;
  const s = document.createElement('small'); s.textContent = label;
  const b = document.createElement('b'); b.textContent = CFG.weapons[id]?.name ?? id;
  d.append(img, s, b);
  return d;
};
function renderHome() {
  const skin = ctx.skin, m = mapInfo(ctx.spMap);
  $('home-name').textContent = (account.online ? account.profile.name : localName() || 'JUGADOR').toUpperCase();
  $('home-name').title = account.online ? 'Cuenta en el servidor' : 'Perfil guardado en este dispositivo';
  renderAccount();
  $('home-model').textContent = MODELS[skin.m] ?? '';
  $('home-emblem').style.background = `linear-gradient(135deg, ${skin.p}, ${skin.s})`;
  const card = $('home-map-card');
  card.style.background = `linear-gradient(180deg, transparent 30%, rgba(0,0,0,0.7)), linear-gradient(180deg, ${m.sky[0]}, ${m.sky[1]})`;
  card.innerHTML = '';
  const b = document.createElement('b'); b.textContent = m.name;
  const sm = document.createElement('small'); sm.textContent = m.desc;
  card.append(b, sm);
  for (const id of ['home-loadout-mini', 'home-loadout']) $(id).replaceChildren(slotHtml(ctx.loadout[0], 'PRINCIPAL'), slotHtml(ctx.loadout[1], 'SECUNDARIA'));
  $('home-coins').textContent = wallet.coins.toLocaleString('es-ES');
  $('shop-coins').textContent = wallet.coins.toLocaleString('es-ES');
  // Tienda: modelos, cascos y patrones; comprar con créditos, equipar lo que ya tienes.
  const sections = [];
  for (const kind of ['m', 'h', 't']) {
    const h = document.createElement('h4');
    h.className = 'shop-kind';
    h.textContent = KIND_NAMES[kind];
    const grid = document.createElement('div');
    grid.className = 'shop-grid';
    grid.append(...ITEM_NAMES[kind].map((label, i) => {
      const owned = wallet.owns(kind, i), price = wallet.price(kind, i), equipped = skin[kind] === i;
      const c = document.createElement('button');
      c.className = 'shop-card' + (equipped ? ' equipped' : owned ? ' owned' : ' locked') + (!owned && wallet.coins < price ? ' poor' : '');
      const ico = document.createElement('span');
      ico.className = 'ico';
      ico.style.background = kind === 'm' ? `linear-gradient(135deg, ${PRIMARY[(i * 3) % PRIMARY.length]}, ${PRIMARY[(i * 7 + 2) % PRIMARY.length]})`
        : `linear-gradient(135deg, ${skin.p}, ${skin.s})`;
      const t = document.createElement('b'); t.textContent = label;
      const p = document.createElement('small');
      p.textContent = equipped ? 'EQUIPADO' : owned ? 'EQUIPAR' : `◈ ${price.toLocaleString('es-ES')}`;
      if (!owned) p.classList.add('price');
      c.append(ico, t, p);
      c.addEventListener('click', async () => {
        if (!owned) {
          let ok;
          try { ok = await wallet.buy(kind, i); } catch (e) { $('shop-msg').textContent = e.message; return; }
          if (!ok) { $('shop-msg').textContent = `Te faltan ◈ ${(price - wallet.coins).toLocaleString('es-ES')} para ${label}. ¡Juega para ganar más!`; return; }
          $('shop-msg').textContent = `¡Desbloqueado: ${label}!`;
          sfx.boxReveal?.();
        }
        armory.set({ [kind]: i });
        renderHome();
      });
      return c;
    }));
    sections.push(h, grid);
  }
  $('shop-grid').replaceChildren(...sections);
}
renderHome();
setTimeout(renderHome, 1500); // miniaturas de armas listas

// --- Cuenta: inicio de sesión y sincronización con el servidor ----------------------------------------
let profileT = null, profilePatch = {};
function syncProfile(patch) {
  if (!account.online) return;
  Object.assign(profilePatch, patch);
  clearTimeout(profileT);
  profileT = setTimeout(() => { const p = profilePatch; profilePatch = {}; account.call('profile', p).catch(() => {}); }, 600);
}
// Lo equipado debe estar desbloqueado en el monedero activo (cuenta o invitado); si no, la pieza gratis.
function fitSkin(skin) {
  const s = sanitizeSkin(skin);
  for (const k of ['m', 'h', 't']) if (wallet.locked(k, s[k])) s[k] = 0;
  return s;
}
function applySkin(skin) {
  armory.skin = skin;
  ctx.skin = skin;
  try { localStorage.setItem(SKIN_KEY, JSON.stringify(skin)); } catch { /* sin almacenamiento */ }
  arsenal.setSkin(skin);
  net.setSkin(skin);
  home.setSkin(skin);
  armory.avatar?.setSkin(skin);
  armory.syncControls();
}
// Tras iniciar sesión: la armadura y las armas de la cuenta (o se suben las actuales si es nueva).
function onLoggedIn() {
  const p = account.profile;
  if (p.skin) applySkin(fitSkin(p.skin)); else applySkin(fitSkin(ctx.skin));
  if (p.loadout?.every((id) => CFG.weapons[id])) { ctx.loadout = p.loadout; home.setWeapon(p.loadout[0]); }
  account.call('profile', { skin: ctx.skin, loadout: ctx.loadout }).catch(() => {});
  try { if (!localStorage.getItem(NAME_KEY)) localStorage.setItem(NAME_KEY, p.name); } catch { /* sin almacenamiento */ }
  renderHome();
}
function renderAccount() {
  const on = account.online;
  $('acc-local').hidden = on;
  $('acc-out').hidden = on || !account.available; // la cuenta con contraseña solo si hay servidor
  $('acc-in').hidden = !on;
  if (!on) {
    const rows = [['Créditos', `◈ ${wallet.coins.toLocaleString('es-ES')}`], ['Ganados en total', `◈ ${wallet.earned.toLocaleString('es-ES')}`],
      ['Desbloqueos', wallet.owned.size], ['Récord', readBest().toLocaleString('es-ES')]];
    $('prof-stats').replaceChildren(...rows.flatMap(([k, v]) => { const a = document.createElement('dt'); a.textContent = k; const b = document.createElement('dd'); b.textContent = v; return [a, b]; }));
    if (document.activeElement !== $('prof-name')) $('prof-name').value = localName();
  }
  if (on) {
    const p = account.profile;
    $('acc-user').textContent = p.name.toUpperCase();
    const rows = [['Créditos', `◈ ${p.coins.toLocaleString('es-ES')}`], ['Ganados en total', `◈ ${p.earned.toLocaleString('es-ES')}`], ['Partidas cobradas', p.matches], ['Desbloqueos', p.owned.length]];
    $('acc-stats').replaceChildren(...rows.flatMap(([k, v]) => { const a = document.createElement('dt'); a.textContent = k; const b = document.createElement('dd'); b.textContent = v; return [a, b]; }));
  }
  $('acc-server-state').textContent = account.available
    ? `Conectado a ${account.base || 'este servidor (el que sirve el juego)'}.`
    : 'No hay servidor de cuentas: juegas como invitado. Arranca el servidor del juego (npm start) o escribe aquí su dirección.';
  for (const id of ['acc-login', 'acc-register']) $(id).disabled = !account.available;
}
async function accountAction(kind) {
  const name = $('acc-name').value.trim(), pw = $('acc-pass').value;
  $('acc-msg').textContent = kind === 'login' ? 'Entrando…' : 'Creando la cuenta…';
  try {
    if (kind === 'login') await account.login(name, pw);
    else {
      await account.register(name, pw, wallet.localData);
      wallet.handOver(); // el progreso del navegador pasa a la cuenta (no se puede volver a importar)
    }
    $('acc-pass').value = '';
    $('acc-msg').textContent = kind === 'login' ? `¡Hola de nuevo, ${account.profile.name}!` : `Cuenta creada. ¡Bienvenido, ${account.profile.name}!`;
    onLoggedIn();
  } catch (e) {
    $('acc-msg').textContent = e.message;
  }
}
$('acc-login').addEventListener('click', () => accountAction('login'));
$('acc-register').addEventListener('click', () => accountAction('register'));
$('acc-logout').addEventListener('click', async () => {
  await account.logout();
  applySkin(fitSkin(ctx.skin)); // de vuelta al monedero de invitado
  $('acc-msg').textContent = 'Sesión cerrada. Ahora juegas como invitado.';
  renderHome();
});
$('acc-server-save').addEventListener('click', async () => {
  account.setServer($('acc-server').value);
  $('acc-msg').textContent = 'Buscando el servidor…';
  const ok = await account.detect();
  $('acc-msg').textContent = ok ? 'Servidor de cuentas encontrado.' : 'No responde ningún servidor de cuentas en esa dirección.';
  if (ok) await account.resume();
  if (account.online) onLoggedIn();
  renderHome();
});
document.querySelector('.home-player').addEventListener('click', () => selectTab('account'));

// --- Perfil local: nombre y código de respaldo (sin servidor ni contraseña) --------------------------------
function localName() {
  try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; }
}
$('prof-name').addEventListener('input', () => {
  const name = $('prof-name').value.trim().slice(0, 16);
  try { if (name) localStorage.setItem(NAME_KEY, name); else localStorage.removeItem(NAME_KEY); } catch { /* sin almacenamiento */ }
  $('home-name').textContent = (name || 'JUGADOR').toUpperCase();
});
$('prof-copy').addEventListener('click', async () => {
  const code = encodeBackup({
    name: localName(), coins: wallet.coins, owned: [...wallet.owned], earned: wallet.earned,
    skin: ctx.skin, loadout: ctx.loadout, best: readBest(),
  });
  const box = $('prof-code');
  box.value = code;
  let ok = false;
  try { await navigator.clipboard.writeText(code); ok = true; } catch {
    box.select();
    try { ok = document.execCommand('copy'); } catch { /* sin portapapeles */ }
  }
  $('acc-msg').textContent = ok
    ? 'Código copiado. Guárdalo (nota, correo o mensaje a ti mismo) y pégalo en el otro dispositivo.'
    : 'Copia el código del recuadro y guárdalo en un lugar seguro.';
});
$('prof-load').addEventListener('click', () => {
  const btn = $('prof-load');
  let d;
  try { d = decodeBackup($('prof-code').value); } catch (e) { $('acc-msg').textContent = e.message; return; }
  // Sustituye el progreso actual: se pide una segunda pulsación.
  if (!btn.dataset.armed) {
    btn.dataset.armed = '1';
    btn.textContent = '¿SEGURO? PULSA OTRA VEZ';
    $('acc-msg').textContent = `Código de ${d.name || 'Jugador'}: ◈ ${d.coins.toLocaleString('es-ES')} y ${d.owned.length} desbloqueos. Sustituirá el progreso de este dispositivo.`;
    setTimeout(() => { delete btn.dataset.armed; btn.textContent = 'CARGAR CÓDIGO'; }, 4000);
    return;
  }
  delete btn.dataset.armed;
  btn.textContent = 'CARGAR CÓDIGO';
  wallet.restore(d);
  try {
    if (d.name) localStorage.setItem(NAME_KEY, d.name);
    if (d.best > readBest()) localStorage.setItem(BEST_KEY, String(d.best));
  } catch { /* sin almacenamiento */ }
  if (d.loadout?.length === 2 && d.loadout.every((id) => CFG.weapons[id]) && d.loadout[0] !== d.loadout[1]) {
    ctx.loadout = d.loadout;
    try { localStorage.setItem(LOADOUT_KEY, JSON.stringify(d.loadout)); } catch { /* sin almacenamiento */ }
    home.setWeapon(d.loadout[0]);
  }
  if (d.skin) applySkin(fitSkin(sanitizeSkin(d.skin)));
  $('prof-code').value = '';
  $('best').textContent = readBest().toLocaleString('es-ES');
  $('acc-msg').textContent = `¡Progreso recuperado! Bienvenido, ${d.name || 'Jugador'}.`;
  renderHome();
});
wallet.onChange(() => renderHome());
account.detect().then(async () => {
  if (await account.resume()) onLoggedIn();
  $('acc-server').value = account.base ?? '';
  renderHome();
});

// Girar (arrastrar) y acercar (rueda / pellizco) al avatar; los paneles y botones no cuentan.
let homeDrag = null;
const pointers = new Map();
const onUi = (t) => t.closest('.home-panel, .home-nav, .home-cta, .home-player, button, input, select, a, details');
$('menu').addEventListener('pointerdown', (e) => {
  if (onUi(e.target)) return;
  pointers.set(e.pointerId, e.clientX + ',' + e.clientY);
  $('menu').setPointerCapture(e.pointerId);
  homeDrag = { x: e.clientX, pinch: null };
  $('menu').classList.add('dragging');
});
$('menu').addEventListener('pointermove', (e) => {
  if (!homeDrag || !pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, e.clientX + ',' + e.clientY);
  if (pointers.size >= 2) {
    const [a, b] = [...pointers.values()].map((v) => v.split(',').map(Number));
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (homeDrag.pinch) home.pinch((d - homeDrag.pinch) * 0.004);
    homeDrag.pinch = d;
    return;
  }
  home.drag(e.clientX - homeDrag.x);
  homeDrag.x = e.clientX;
});
const endDrag = (e) => {
  pointers.delete(e.pointerId);
  if (pointers.size) return;
  homeDrag = null;
  $('menu').classList.remove('dragging');
};
$('menu').addEventListener('pointerup', endDrag);
$('menu').addEventListener('pointercancel', endDrag);
$('menu').addEventListener('wheel', (e) => { if (!onUi(e.target)) { e.preventDefault(); home.wheel(e.deltaY); } }, { passive: false });

// --- Un jugador: variante y ajustes -------------------------------------------
function renderSetup() {
  renderRules($('sp-rules'), {
    mode: 'sp', rules: spRules, editable: true,
    onChange: (r) => {
      spRules = sanitizeRules('sp', r);
      try { localStorage.setItem(SP_RULES_KEY, JSON.stringify(spRules)); } catch { /* sin almacenamiento */ }
      renderSetup();
    },
  });
}
function openSetup() {
  renderSetup();
  hud.showOverlay('setup');
}
$('btn-start').addEventListener('click', openSetup);
$('btn-sp-play').addEventListener('click', newGame);
$('btn-setup-loadout').addEventListener('click', () => openLoadout('setup'));
$('btn-setup-reset').addEventListener('click', () => {
  spRules = defaultRules('sp', spRules.variant);
  try { localStorage.setItem(SP_RULES_KEY, JSON.stringify(spRules)); } catch { /* sin almacenamiento */ }
  renderSetup();
});
$('btn-setup-back').addEventListener('click', () => hud.showOverlay('menu'));

// --- Lobby -------------------------------------------------------------------
function renderLobby(status) {
  const connected = net.active;
  $('lobby-connect').classList.toggle('hidden', connected);
  $('lobby-room').classList.toggle('hidden', !connected);
  if (status !== undefined) $('mp-status').textContent = status;
  if (!connected) return;
  loadMap(net.map);
  const p2p = net.kind !== 'lan';
  $('room-code-box').classList.toggle('hidden', !p2p || !net.code);
  $('room-address').classList.toggle('hidden', p2p);
  $('room-code').textContent = net.code ?? '';
  $('mp-address').textContent = `${location.protocol}//${location.host}`;
  $('mp-players').replaceChildren(...[...net.players.values()].map((p) => {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = p.name;
    name.style.color = p.color;
    const tag = document.createElement('small');
    tag.textContent = [p.id === net.hostId && 'ANFITRIÓN', p.id === net.id && 'TÚ'].filter(Boolean).join(' · ');
    li.append(name, tag);
    return li;
  }));
  for (const b of document.querySelectorAll('.mode')) {
    b.classList.toggle('selected', b.dataset.mode === net.mode);
    b.disabled = !net.isHost;
  }
  renderMaps($('lobby-maps'), net.map, net.isHost, (id) => net.send('map', { map: id }));
  renderRules($('mp-rules'), {
    mode: net.mode, rules: net.rules, editable: net.isHost,
    // Optimista: los siguientes cambios parten de este aunque la sala aún no lo haya confirmado.
    onChange: (rules) => {
      net.rules = sanitizeRules(net.mode, rules);
      net.send('rules', { rules: net.rules });
      renderLobby();
    },
  });
  $('btn-mp-start').classList.toggle('hidden', !net.isHost);
  $('mp-wait').textContent = net.isHost ? '' : net.state === 'playing' ? 'Partida en curso…' : 'Esperando a que el anfitrión inicie la partida…';
}

function roomLink(code) {
  return `${location.origin}${location.pathname}${location.search}#sala=${code}`;
}

function openLobby(code = '') {
  sfx.unlock();
  try { $('mp-name').value = localStorage.getItem(NAME_KEY) ?? ''; } catch { /* sin almacenamiento */ }
  $('mp-code').value = code;
  toLobby('');
  // ¿Esta página la sirve server.js? Entonces también se puede jugar en LAN sin internet.
  // Solo tiene sentido si la página la sirve server.js (no en GitHub Pages).
  if (!location.hostname.endsWith('github.io')) {
    fetch('api/info', { cache: 'no-store' }).then((r) => r.json()).then((j) => {
      $('btn-lan').classList.toggle('hidden', !j?.ringfall);
    }).catch(() => $('btn-lan').classList.add('hidden'));
  }
  (code ? $('btn-join') : $('mp-name')).focus();
}

$('btn-mp').addEventListener('click', () => { enterFullscreen(); openLobby(); });

function playerNameInput() {
  const name = $('mp-name').value.trim() || 'Jugador';
  try { localStorage.setItem(NAME_KEY, name); } catch { /* sin almacenamiento */ }
  return name;
}

async function connectWith(label, fn) {
  const buttons = ['btn-host', 'btn-join', 'btn-lan'].map($);
  for (const b of buttons) b.disabled = true;
  renderLobby(label);
  try {
    await fn(playerNameInput());
    renderLobby('');
    if (net.code) history.replaceState(null, '', `#sala=${net.code}`);
    if (net.state === 'playing') startSession(net.mode); // entrar en una partida ya empezada
  } catch (e) {
    renderLobby(`${e.message}.`);
  } finally {
    for (const b of buttons) b.disabled = false;
  }
}

$('btn-host').addEventListener('click', () => connectWith('Creando sala…', (name) => net.hostP2P(name)));
function join() {
  const code = normalizeCode($('mp-code').value);
  if (code.length !== 5) { renderLobby('El código tiene 5 caracteres.'); $('mp-code').focus(); return; }
  connectWith('Uniéndose…', async (name) => { await net.joinP2P(name, code); net.code = code; });
}
$('btn-join').addEventListener('click', join);
$('mp-code').addEventListener('input', () => { $('mp-code').value = normalizeCode($('mp-code').value); });
$('mp-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
$('mp-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') (normalizeCode($('mp-code').value).length === 5 ? join() : $('btn-host').click()); });
$('btn-lan').addEventListener('click', () => connectWith('Conectando…', (name) => net.joinLan(name)));
$('btn-copy').addEventListener('click', async () => {
  const link = roomLink(net.code);
  try { await navigator.clipboard.writeText(link); renderLobby('Enlace copiado. Envíalo a los demás jugadores.'); } catch { renderLobby(link); }
});
for (const b of document.querySelectorAll('.mode')) b.addEventListener('click', () => net.send('mode', { mode: b.dataset.mode }));
$('btn-mp-start').addEventListener('click', () => net.send('start'));
$('btn-lobby-back').addEventListener('click', () => { history.replaceState(null, '', location.pathname + location.search); toMenu(); });

// Enlace de invitación: …#sala=ABCDE
const invite = normalizeCode(new URLSearchParams(location.hash.slice(1)).get('sala'));
if (invite.length === 5) openLobby(invite);

// --- Mensajes de red ---------------------------------------------------------
const inMatch = () => game.mode !== 'sp' && (game.state === 'playing' || game.state === 'paused');
const playerName = (id) => net.players.get(id)?.name ?? remotes.get(id)?.name ?? '???';
const playerColor = (id) => net.players.get(id)?.color ?? '#ffffff';

net.on('lobby', () => { if (game.state === 'lobby') renderLobby(); });
net.on('progress', (m) => { if (game.state === 'lobby' && !net.active) renderLobby(m.text); });
net.on('join', (m) => {
  if (!inMatch()) return;
  remotes.sync([...net.players.values()], net.id);
  remotes.setTagsThroughWalls(game.mode === 'coop');
  hud.feed([{ text: m.player.name, color: m.player.color }, { text: 'se ha unido' }]);
});
net.on('leave', (m) => {
  const name = remotes.get(m.id)?.name;
  remotes.remove(m.id);
  if (!inMatch()) return;
  if (name) hud.feed([{ text: name }, { text: 'ha salido' }]);
  if (game.mode === 'coop' && net.isHost && !director.authority) {
    director.promote();
    hud.toast('AHORA ERES EL ANFITRIÓN');
  }
});
net.on('start', (m) => startSession(m.mode));
net.on('disconnect', (m) => {
  if (game.state !== 'menu') toLobby(`${m.reason ?? 'Se perdió la conexión'}.`);
});

net.on('st', (m) => remotes.onState(m));
net.on('fx', (m) => {
  if (!inMatch()) return;
  const r = remotes.get(m.from);
  if (r) r.lastShot = performance.now();
  const w = CFG.weapons[m.w] ?? CFG.weapons.rifle;
  const a = vec(m.a);
  const bs = m.bs ?? [m.b];
  for (const b of bs) fx.tracer(a, vec(b), w.tracer, w);
  if (bs[0]) fx.muzzle(a, vec(bs[0]).sub(a).normalize(), w);
  sfx.shot(w.sound, Math.max(1, a.distanceTo(player.pos)));
});
net.on('pshot', (m) => {
  if (!inMatch() || !CFG.weapons[m.w]) return;
  arsenal.remoteShot(m);
  sfx.shot(CFG.weapons[m.w].sound, Math.max(1, vec(m.p).distanceTo(player.pos)));
});
net.on('efx', (m) => {
  if (!inMatch()) return;
  if (m.k === 'ring') director.shockwave(vec(m.p), m.r, 0, m.c, false);
  else if (m.k === 'toast') hud.toast(m.text);
});
net.on('box', (m) => { if (inMatch() && game.mode === 'coop') director.onBox(m); });
net.on('boxUse', (m) => { if (inMatch() && director.authority) director.useBox(m.id, m.from); });
net.on('boxDeny', (m) => { hud.toast(m.reason); sfx.deny(); });
net.on('boxTake', (m) => { director.boxes.find((b) => b.id === m.id)?.close(); });
net.on('drop', (m) => { if (inMatch() && game.mode === 'coop') director.onDrop(m); });
net.on('gren', (m) => { if (inMatch()) arsenal.remoteGrenade(m.p, m.v, m.from); });
net.on('hit', (m) => {
  if (!inMatch() || !arsenal.pvp) return;
  player.takeHit(m.dmg, { shieldMult: m.sm, headMult: m.hm, part: m.part, frac: m.fr }, vec(m.from), m.from);
});
net.on('feed', (m) => {
  const victim = { text: playerName(m.victim), color: playerColor(m.victim) };
  if (m.killer === null) hud.feed([victim, { text: 'se eliminó a sí mismo' }]);
  else hud.feed([{ text: playerName(m.killer), color: playerColor(m.killer) }, { text: m.head ? '⦿' : '▸' }, victim]);
  if (m.killer === net.id) {
    hud.hitMarker(true);
    sfx.kill();
    hud.toast(m.head ? `TIRO A LA CABEZA · ${victim.text}` : `ELIMINASTE A ${victim.text}`);
  } else if (m.victim === net.id && m.killer !== null) {
    hud.banner('ELIMINADO', `POR ${playerName(m.killer).toUpperCase()}`, 2);
  }
});
net.on('matchEnd', (m) => {
  if (game.mode === 'sp') return;
  spectator.stop();
  game.state = 'over';
  if (document.pointerLockElement) document.exitPointerLock();
  if (m.mode === 'dm') {
    const rows = [...m.players].sort((a, b) => b.kills - a.kills)
      .map((p) => ({ name: p.name, color: p.color, cols: [p.kills, p.deaths], me: p.id === net.id }));
    const w = m.players.find((p) => p.id === m.winner);
    const title = w ? (w.id === net.id ? '¡VICTORIA!' : `GANA ${w.name.toUpperCase()}`) : m.timeUp ? '¡TIEMPO! · EMPATE' : 'FIN DE LA PARTIDA';
    hud.showResults(title, ['JUGADOR', 'BAJAS', 'MUERTES'], rows, 'VOLVER AL LOBBY');
    const me = m.players.find((p) => p.id === net.id);
    payMatch({ mode: 'dm', kills: me?.kills ?? 0, won: m.winner === net.id, time: 999 }).then(showEarned);
  } else {
    // Sin resumen del anfitrión (no respondió a tiempo): lo que sabe este equipo.
    const s = m.summary ?? {
      wave: game.wave, score: game.score,
      players: [...net.players.values()].map((p) => ({ id: p.id, ...(director.scores.get(p.id) ?? { kills: 0, score: 0 }) })),
    };
    const rows = s.players.map((p) => ({
      name: playerName(p.id), color: playerColor(p.id), cols: [p.kills, p.score.toLocaleString('es-ES')], me: p.id === net.id,
    })).sort((a, b) => b.cols[0] - a.cols[0]);
    hud.showResults(`${m.timeUp ? '¡TIEMPO!' : 'EQUIPO CAÍDO'} · OLEADA ${s.wave}`, ['JUGADOR', 'BAJAS', 'PUNTOS'], rows, 'VOLVER AL LOBBY');
    const me = s.players.find((p) => p.id === net.id);
    payMatch({ mode: 'coop', kills: me?.kills ?? 0, wave: s.wave, score: me?.score ?? 0, time: 999 }).then(showEarned);
  }
});

// Límite de tiempo en cooperativo: la sala pide el resumen al anfitrión.
net.on('timeUp', () => { if (inMatch() && game.mode === 'coop') game.onCoopOver({ timeUp: true }); });

// Coop
net.on('lifeReq', (m) => { if (inMatch() && director.authority) net.to(m.from, 'life', { ok: director.takeLife(), left: director.lives }); });
net.on('life', (m) => { if (inMatch()) grantLife(m.ok, m.left); });
net.on('tk', (m) => { if (inMatch()) teamKillFeed(m.killer, m.from); });
net.on('snap', (m) => {
  if (inMatch() && game.mode === 'coop' && !director.authority && m.from === net.hostId) director.applySnapshot(m);
});
net.on('proj', (m) => {
  if (inMatch() && game.mode === 'coop' && !director.authority) director.spawnProjectile(vec(m.p), vec(m.v), m.d, m.c, false, { gravity: m.g, splash: m.s, size: m.z });
});
net.on('wave', (m) => { if (inMatch() && !director.authority) director.onWave(m); });
net.on('hurt', (m) => {
  if (!inMatch() || !player.alive) return;
  player.damage(m.dmg, vec(m.from));
  player.vel.x += m.push[0];
  player.vel.z += m.push[1];
});
net.on('edmg', (m) => { if (inMatch()) director.onRemoteDamage(m); });
net.on('claim', (m) => { if (inMatch()) director.onClaim(m); });
net.on('grant', (m) => { if (inMatch()) director.grant(m.kind); });
net.on('ekill', (m) => {
  if (!inMatch()) return;
  hud.feed([{ text: playerName(m.by), color: playerColor(m.by) }, { text: m.head ? '⦿' : '▸' }, { text: m.label.toUpperCase(), color: '#ff8a8a' }]);
  if (m.by === net.id && !director.authority) {
    hud.hitMarker(true);
    sfx.kill();
  }
});

// --- Marcador (Tab) ----------------------------------------------------------
let showBoard = false;
addEventListener('keydown', (e) => {
  if (e.code !== 'Tab' || game.mode === 'sp' || !inMatch()) return;
  e.preventDefault();
  showBoard = true;
});
addEventListener('keyup', (e) => { if (e.code === 'Tab') showBoard = false; });
addEventListener('blur', () => { showBoard = false; });

function renderBoard() {
  if (!showBoard || !inMatch()) { hud.scoreboard(false); return; }
  const players = [...net.players.values()];
  if (game.mode === 'dm') {
    const rows = players.sort((a, b) => b.kills - a.kills)
      .map((p) => ({ name: p.name, color: p.color, cols: [p.kills, p.deaths], me: p.id === net.id }));
    hud.scoreboard(true, `${VARIANTS[ctx.rules.variant].name} · TODOS CONTRA TODOS · ${ctx.rules.scoreLimit} BAJAS`, ['JUGADOR', 'BAJAS', 'MUERTES'], rows);
  } else {
    const rows = players.map((p) => {
      const s = director.scores.get(p.id) ?? { kills: 0, score: 0 };
      return { name: p.name, color: p.color, cols: [s.kills, s.score.toLocaleString('es-ES')], me: p.id === net.id };
    }).sort((a, b) => b.cols[0] - a.cols[0]);
    const lives = ctx.rules.lives ? ` · VIDAS ${director.lives}` : '';
    hud.scoreboard(true, `${VARIANTS[ctx.rules.variant].name} · COOPERATIVO · OLEADA ${Math.max(1, game.wave)}${lives}`, ['JUGADOR', 'BAJAS', 'PUNTOS'], rows);
  }
}

// --- UI general --------------------------------------------------------------
$('btn-retry').addEventListener('click', () => (game.mode === 'sp' ? newGame() : toLobby()));
$('pause').addEventListener('click', () => { if (performance.now() - pausedAt > 400) resume(); });
$('btn-quit').addEventListener('click', (e) => { e.stopPropagation(); toMenu(); });
$('best').textContent = readBest().toLocaleString('es-ES');

// Pausa manual (botón táctil) y automática al salir de la app en el móvil.
let pausedAt = 0;
function pause() {
  if (game.state !== 'playing') return;
  pausedAt = performance.now();
  game.state = 'paused';
  settingsHome();
  arsenal.trigger = arsenal.aimHeld = false;
  player.keys.clear();
  touch.release();
  hud.showOverlay('pause');
}
ctx.pause = pause;
document.addEventListener('visibilitychange', () => { if (document.hidden && TOUCH) pause(); });

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === renderer.domElement;
  if (locked && game.state === 'paused') {
    game.state = 'playing';
    hud.showOverlay(null);
  } else if (!locked && game.state === 'playing' && (player.alive || game.mode !== 'sp' || game.respawnIn > 0)) {
    pause();
  }
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// --- Bucle -------------------------------------------------------------------
let stateT = 0, boardT = 0, lastSt = '', lastStT = 0;
function netTick(dt) {
  stateT -= dt;
  if (stateT <= 0) {
    stateT = CFG.net.stateRate;
    const st = {
      p: v3(player.pos), v: v3(player.vel), y: +player.yaw.rotation.y.toFixed(3), pt: +player.pitch.rotation.x.toFixed(3),
      h: +player.height.toFixed(2), a: player.alive ? 1 : 0, w: arsenal.w.id, hp: Math.round(player.health), sh: Math.round(player.shield),
    };
    // Quieto y sin cambios: no se reenvía (como mucho cada medio segundo, para que nadie quede desfasado).
    const key = JSON.stringify(st), now = performance.now();
    if (key !== lastSt || now - lastStT > 500) {
      net.send('st', st);
      lastSt = key;
      lastStT = now;
    }
  }
}

function tick(dt) {
  // En multijugador la partida sigue aunque el jugador esté en pausa.
  const running = game.state === 'playing' || (game.state === 'paused' && game.mode !== 'sp');
  if (running) {
    if (game.mode === 'sp') game.time += player.alive ? dt : 0;
    player.update(dt);
    player.yaw.updateMatrixWorld(true);
    if (game.mode !== 'sp') remotes.update(dt);
    director.update(dt);
    arsenal.update(dt);
    if (game.mode !== 'sp') spectator.update(dt);
    hud.update(ctx, dt);
    if (!player.alive && game.respawnIn > 0) {
      game.respawnIn -= dt;
      if (game.respawnIn <= 0) respawn();
    }
    if (game.mode === 'sp') {
      if (Number.isFinite(game.timeLeft)) {
        game.timeLeft = Math.max(0, game.timeLeft - dt);
        if (game.timeLeft <= 0 && game.state === 'playing') gameOver(true);
      }
      if (game.deathT >= 0 && game.state === 'playing') {
        game.deathT += dt;
        if (game.deathT > 2.2) gameOver();
      }
    } else {
      game.timeLeft = net.timeLeft();
      if (net.active) netTick(dt);
      boardT -= dt;
      if (boardT <= 0) { boardT = 0.25; renderBoard(); }
    }
  } else if (game.state === 'menu') {
    home.update(dt, homeDrag !== null);
  } else if (game.state === 'lobby') {
    player.yaw.rotation.y += dt * 0.05;
    player.yaw.position.fromArray(ctx.world.menuCam);
    player.pitch.rotation.set(-0.12, 0, 0);
  }
  if (game.state !== 'menu') home.hide();
  touch.update();
  ctx.world.update(game.state === 'paused' && game.mode === 'sp' ? 0 : dt);
  fx.update(game.state === 'paused' && game.mode === 'sp' ? 0 : dt);
}

let last = performance.now();
// Límite de FPS (ajustes): se salta fotogramas del navegador manteniendo el ritmo medio pedido.
let nextT = 0, fpsN = 0, fpsT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (S.fpsCap) {
    const step = 1000 / S.fpsCap;
    if (now < nextT - 1.5) return;
    nextT = Math.max(nextT + step, now - step);
  }
  if (S.showFps) {
    fpsN++;
    if (now - fpsT >= 500) { fpsMeter.textContent = `${Math.round((fpsN * 1000) / (now - fpsT))} FPS`; fpsN = 0; fpsT = now; }
  }
  trackFrame(now - last);
  tick(Math.min((now - last) / 1000, 0.05));
  last = now;
  beforeRender();
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// Acceso para depuración y pruebas automatizadas.
window.__ringfall = { Q, setQuality, ctx, newGame, tick, armory, loadMap, startSession, monstersReady, playersReady, loadAllPlayerModels };
