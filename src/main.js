import * as THREE from 'three';
import { CFG } from './config.js';
import { createWorld } from './world.js';
import { Player } from './player.js';
import { Arsenal } from './weapons.js';
import { Director } from './enemies.js';
import { Hud } from './hud.js';
import { Sfx } from './audio.js';
import { Effects } from './effects.js';
import { NavGrid } from './nav.js';
import { Net, v3, normalizeCode, BUILD, DEBUG } from './net.js';
import { RemotePlayers } from './remote.js';

const BEST_KEY = 'ringfall.best';
const NAME_KEY = 'ringfall.name';
const $ = (id) => document.getElementById(id);
for (const el of document.querySelectorAll('.build')) el.textContent = `v${BUILD}${DEBUG ? ' · diagnóstico' : ''}`;
console.info(`Ringfall v${BUILD}`);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(78, innerWidth / innerHeight, 0.03, 3000);

// mode: 'sp' (un jugador) | 'coop' | 'dm' (todos contra todos)
const game = { state: 'menu', mode: 'sp', wave: 0, kills: 0, score: 0, time: 0, deathT: -1, respawnIn: 0 };
const ctx = { scene, camera, renderer, game };
ctx.sfx = new Sfx();
ctx.hud = new Hud();
ctx.world = createWorld(scene);
ctx.nav = new NavGrid(ctx.world);
ctx.fx = new Effects(scene);
ctx.net = new Net();
ctx.remotes = new RemotePlayers(ctx);
ctx.player = new Player(ctx);
ctx.director = new Director(ctx);
ctx.arsenal = new Arsenal(ctx);
const { sfx, hud, fx, player, director, arsenal, net, remotes, world } = ctx;
const vec = (a) => new THREE.Vector3().fromArray(a);

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

// --- Partida -----------------------------------------------------------------
function pickSpawn() {
  if (game.mode === 'coop') {
    const ids = [...net.players.keys()].sort((a, b) => a - b);
    const i = Math.max(0, ids.indexOf(net.id));
    return [new THREE.Vector3(-5.25 + (i % 8) * 1.5, 0, 30 + Math.floor(i / 8) * 1.5), 0];
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
  return [new THREE.Vector3(0, 0, 30), 0];
}

function startSession(mode) {
  sfx.unlock();
  Object.assign(game, { mode, wave: 0, kills: 0, score: 0, time: 0, deathT: -1, respawnIn: 0, state: 'playing' });
  const online = mode !== 'sp';
  director.configure(mode, !online || net.isHost);
  arsenal.reset();
  fx.clear();
  hud.reset();
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
  startSession('sp');
}

function respawn() {
  player.reset(...pickSpawn());
  arsenal.reset();
  game.respawnIn = 0;
}

function resume() {
  sfx.unlock();
  if (!lock()) { game.state = 'playing'; hud.showOverlay(null); }
}

game.onPlayerDeath = (lastHit) => {
  game.deathT = 0;
  arsenal.trigger = false;
  sfx.death();
  if (game.mode === 'dm') {
    net.send('kill', { killer: lastHit?.by ?? null, head: !!lastHit?.head });
    game.respawnIn = CFG.pvp.respawn;
  } else {
    hud.banner('HAS CAÍDO', '', 1.8);
  }
};

// Coop: al empezar cada oleada reaparecen los caídos.
game.onWaveStart = () => {
  if (game.mode === 'coop' && !player.alive) respawn();
};

// Coop (anfitrión): todo el equipo ha caído.
game.onCoopOver = () => {
  const players = [...net.players.values()].map((p) => ({ id: p.id, ...(director.scores.get(p.id) ?? { kills: 0, score: 0 }) }));
  net.send('end', { summary: { wave: game.wave, score: game.score, players } });
};

function gameOver() {
  game.state = 'over';
  const best = Math.max(readBest(), game.score);
  writeBest(best);
  if (document.pointerLockElement) document.exitPointerLock();
  hud.showGameOver({ ...game, best });
}

function toMenu() {
  net.disconnect();
  remotes.clear();
  director.configure('sp', true);
  fx.clear();
  game.state = 'menu';
  game.mode = 'sp';
  if (document.pointerLockElement) document.exitPointerLock();
  $('best').textContent = readBest().toLocaleString('es-ES');
  hud.showOverlay('menu');
}

function toLobby(status = '') {
  remotes.clear();
  director.configure('sp', true);
  fx.clear();
  game.state = 'lobby';
  if (document.pointerLockElement) document.exitPointerLock();
  hud.showOverlay('lobby');
  renderLobby(status);
}

// --- Lobby -------------------------------------------------------------------
const MODE_DESC = {
  coop: 'Todos juntos contra oleadas. Si caes, reapareces en la siguiente oleada; si cae todo el equipo, se acaba.',
  dm: () => `Cada uno por su cuenta. Gana el primero en llegar a ${net.scoreLimit} bajas. Reapareces a los ${CFG.pvp.respawn} s.`,
};

function renderLobby(status) {
  const connected = net.active;
  $('lobby-connect').classList.toggle('hidden', connected);
  $('lobby-room').classList.toggle('hidden', !connected);
  if (status !== undefined) $('mp-status').textContent = status;
  if (!connected) return;
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
  const desc = MODE_DESC[net.mode];
  $('mp-mode-desc').textContent = typeof desc === 'function' ? desc() : desc;
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

$('btn-mp').addEventListener('click', () => openLobby());

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
  const a = vec(m.a), b = vec(m.b);
  fx.tracer(a, b, m.w === 0 ? 0xffe3a0 : 0x6ff5ff);
  const d = a.distanceTo(player.pos);
  if (m.w === 0) sfx.rifle(Math.max(1, d)); else sfx.pistol(Math.max(1, d));
});
net.on('gren', (m) => { if (inMatch()) arsenal.remoteGrenade(m.p, m.v, m.from); });
net.on('hit', (m) => {
  if (!inMatch() || game.mode !== 'dm') return;
  player.takeHit(m.dmg, { shieldMult: m.sm, headMult: m.hm, part: m.part }, vec(m.from), m.from);
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
  game.state = 'over';
  if (document.pointerLockElement) document.exitPointerLock();
  if (m.mode === 'dm') {
    const rows = [...m.players].sort((a, b) => b.kills - a.kills)
      .map((p) => ({ name: p.name, color: p.color, cols: [p.kills, p.deaths], me: p.id === net.id }));
    const w = m.players.find((p) => p.id === m.winner);
    hud.showResults(w ? (w.id === net.id ? '¡VICTORIA!' : `GANA ${w.name.toUpperCase()}`) : 'FIN DE LA PARTIDA', ['JUGADOR', 'BAJAS', 'MUERTES'], rows, 'VOLVER AL LOBBY');
  } else {
    const s = m.summary ?? { wave: game.wave, score: game.score, players: [] };
    const rows = s.players.map((p) => ({
      name: playerName(p.id), color: playerColor(p.id), cols: [p.kills, p.score.toLocaleString('es-ES')], me: p.id === net.id,
    })).sort((a, b) => b.cols[0] - a.cols[0]);
    hud.showResults(`EQUIPO CAÍDO · OLEADA ${s.wave}`, ['JUGADOR', 'BAJAS', 'PUNTOS'], rows, 'VOLVER AL LOBBY');
  }
});

// Coop
net.on('snap', (m) => {
  if (inMatch() && game.mode === 'coop' && !director.authority && m.from === net.hostId) director.applySnapshot(m);
});
net.on('proj', (m) => {
  if (inMatch() && game.mode === 'coop' && !director.authority) director.spawnProjectile(vec(m.p), vec(m.v), m.d, m.c, false);
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
    hud.scoreboard(true, `TODOS CONTRA TODOS · ${net.scoreLimit} BAJAS`, ['JUGADOR', 'BAJAS', 'MUERTES'], rows);
  } else {
    const rows = players.map((p) => {
      const s = director.scores.get(p.id) ?? { kills: 0, score: 0 };
      return { name: p.name, color: p.color, cols: [s.kills, s.score.toLocaleString('es-ES')], me: p.id === net.id };
    }).sort((a, b) => b.cols[0] - a.cols[0]);
    hud.scoreboard(true, `COOPERATIVO · OLEADA ${Math.max(1, game.wave)}`, ['JUGADOR', 'BAJAS', 'PUNTOS'], rows);
  }
}

// --- UI general --------------------------------------------------------------
$('btn-start').addEventListener('click', newGame);
$('btn-retry').addEventListener('click', () => (game.mode === 'sp' ? newGame() : toLobby()));
$('pause').addEventListener('click', resume);
$('btn-quit').addEventListener('click', (e) => { e.stopPropagation(); toMenu(); });
$('best').textContent = readBest().toLocaleString('es-ES');
if (matchMedia('(pointer: coarse)').matches) $('touch-warn').classList.remove('hidden');

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === renderer.domElement;
  if (locked && game.state === 'paused') {
    game.state = 'playing';
    hud.showOverlay(null);
  } else if (!locked && game.state === 'playing' && (player.alive || game.mode !== 'sp')) {
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

// --- Bucle -------------------------------------------------------------------
let stateT = 0, boardT = 0;
function netTick(dt) {
  stateT -= dt;
  if (stateT <= 0) {
    stateT = CFG.net.stateRate;
    net.send('st', {
      p: v3(player.pos), v: v3(player.vel), y: +player.yaw.rotation.y.toFixed(3), pt: +player.pitch.rotation.x.toFixed(3),
      h: +player.height.toFixed(2), a: player.alive ? 1 : 0, w: arsenal.current, hp: Math.round(player.health), sh: Math.round(player.shield),
    });
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
    hud.update(ctx, dt);
    if (game.mode === 'sp') {
      if (game.deathT >= 0) {
        game.deathT += dt;
        if (game.deathT > 2.2) gameOver();
      }
    } else {
      if (net.active) netTick(dt);
      if (game.mode === 'dm' && !player.alive && game.respawnIn > 0) {
        game.respawnIn -= dt;
        if (game.respawnIn <= 0) respawn();
      }
      boardT -= dt;
      if (boardT <= 0) { boardT = 0.25; renderBoard(); }
    }
  } else if (game.state === 'menu' || game.state === 'lobby') {
    player.yaw.rotation.y += dt * 0.05;
    player.yaw.position.set(0, 9, 34);
    player.pitch.rotation.set(-0.12, 0, 0);
  }
  fx.update(game.state === 'paused' && game.mode === 'sp' ? 0 : dt);
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
