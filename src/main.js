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
import { Armory } from './armory.js';
import { DEFAULT_SKIN, sanitizeSkin } from './skins.js';
import { skyEnvironment } from './world.js';
import { LOADOUTS, VARIANTS, defaultRules, sanitizeRules, isCustom } from './rules.js';
import { renderRules } from './setup.js';

const BEST_KEY = 'ringfall.best';
const NAME_KEY = 'ringfall.name';
const SKIN_KEY = 'ringfall.skin';
const LOADOUT_KEY = 'ringfall.loadout';
const SP_RULES_KEY = 'ringfall.sprules';
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
ctx.world = createWorld(scene);
scene.environment = skyEnvironment(renderer);
ctx.nav = new NavGrid(ctx.world);
ctx.fx = new Effects(scene);
ctx.net = new Net();
ctx.remotes = new RemotePlayers(ctx);
ctx.player = new Player(ctx);
ctx.director = new Director(ctx);
ctx.arsenal = new Arsenal(ctx);
const { sfx, hud, fx, player, director, arsenal, net, remotes, world } = ctx;
const vec = (a) => new THREE.Vector3().fromArray(a);

// --- Armadura del jugador ----------------------------------------------------
function readSkin() {
  try { return sanitizeSkin(JSON.parse(localStorage.getItem(SKIN_KEY) ?? 'null') ?? DEFAULT_SKIN); } catch { return { ...DEFAULT_SKIN }; }
}
ctx.skin = readSkin();
net.skin = ctx.skin;
arsenal.setSkin(ctx.skin);
const armory = new Armory({
  canvas: $('armory-view'),
  skin: ctx.skin,
  onChange: (skin) => {
    ctx.skin = skin;
    try { localStorage.setItem(SKIN_KEY, JSON.stringify(skin)); } catch { /* sin almacenamiento */ }
    arsenal.setSkin(skin);
    net.setSkin(skin);
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

const STAT_MAX = { dps: 230, range: 400, mob: 1 };
function weaponStats(w) {
  const shots = w.kind === 'pellets' ? w.pellets : w.burst ?? 1;
  const dps = (w.damage * shots) / (w.interval + (w.burst ? w.burstGap * (w.burst - 1) : 0));
  const range = w.kind === 'projectile' ? w.projSpeed * w.life : w.range;
  return [['DAÑO', Math.min(1, dps / STAT_MAX.dps)], ['ALCANCE', Math.min(1, range / STAT_MAX.range)], ['CADENCIA', Math.min(1, 0.05 / w.interval * 1.4)]];
}

function renderLoadout() {
  for (const slot of [0, 1]) {
    $(`lo-${slot}`).replaceChildren(...Object.entries(CFG.weapons).map(([id, w]) => {
      const b = document.createElement('button');
      b.className = `wcard${w.alien ? ' alien' : ''}${ctx.loadout[slot] === id ? ' selected' : ''}`;
      b.disabled = ctx.loadout[1 - slot] === id;
      const name = document.createElement('b');
      name.textContent = w.name;
      const kind = document.createElement('small');
      kind.textContent = `${w.alien ? 'ALIENÍGENA · ' : ''}${w.heat ? 'CALOR' : `CARGADOR ${w.mag}`}${w.zoom ? ` · MIRA x${w.zoom}` : ''}`;
      const bars = document.createElement('div');
      bars.className = 'bars';
      for (const [label, v] of weaponStats(w)) {
        const l = document.createElement('span');
        l.textContent = label;
        const bar = document.createElement('div');
        bar.className = 'bar';
        const fill = document.createElement('i');
        fill.style.width = `${Math.round(v * 100)}%`;
        bar.append(fill);
        bars.append(l, bar);
      }
      b.append(name, kind, bars);
      b.addEventListener('click', () => {
        ctx.loadout[slot] = id;
        try { localStorage.setItem(LOADOUT_KEY, JSON.stringify(ctx.loadout)); } catch { /* sin almacenamiento */ }
        renderLoadout();
      });
      return b;
    }));
  }
}

let loadoutReturn = 'menu';
function openLoadout(from) {
  loadoutReturn = from;
  renderLoadout();
  hud.showOverlay('loadout');
}
$('btn-loadout').addEventListener('click', () => openLoadout('menu'));
$('btn-lobby-loadout').addEventListener('click', () => openLoadout('lobby'));
$('btn-loadout-done').addEventListener('click', () => {
  hud.showOverlay(loadoutReturn);
  if (loadoutReturn === 'lobby') renderLobby();
  if (loadoutReturn === 'setup') renderSetup();
});

// Tecla E: caja misteriosa (si la partida tiene cajas).
addEventListener('keydown', (e) => {
  if (e.code !== 'KeyE' || e.repeat || game.state !== 'playing' || !director.boxes.length) return;
  director.interact();
});
function openArmory(from) {
  armoryReturn = from;
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

function startSession(mode, rules = net.rules) {
  sfx.unlock();
  ctx.rules = sanitizeRules(mode, rules);
  const online = mode !== 'sp';
  const timeLeft = online ? net.timeLeft() : ctx.rules.timeLimit ? ctx.rules.timeLimit * 60 : Infinity;
  Object.assign(game, { mode, wave: ctx.rules.startWave - 1, kills: 0, score: 0, time: 0, deathT: -1, respawnIn: 0, timeLeft, state: 'playing' });
  game.lifePending = false;
  director.configure(mode, !online || net.isHost);
  arsenal.reset(loadoutFor());
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
  startSession('sp', spRules);
}

function respawn() {
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
  if (!lock()) { game.state = 'playing'; hud.showOverlay(null); }
}

game.onPlayerDeath = (lastHit) => {
  game.deathT = 0;
  arsenal.trigger = false;
  sfx.death();
  if (game.mode === 'dm') {
    net.send('kill', { killer: lastHit?.by ?? null, head: !!lastHit?.head });
    game.respawnIn = ctx.rules.respawn;
    return;
  }
  // Cooperativo con fuego amigo: baja por un compañero.
  if (game.mode === 'coop' && lastHit?.by != null) {
    net.bcast('tk', { killer: lastHit.by });
    teamKillFeed(lastHit.by, net.id);
  }
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
}

function toMenu() {
  net.disconnect();
  remotes.clear();
  director.configure('menu', true);
  fx.clear();
  game.state = 'menu';
  game.mode = 'sp';
  if (document.pointerLockElement) document.exitPointerLock();
  $('best').textContent = readBest().toLocaleString('es-ES');
  hud.showOverlay('menu');
}

function toLobby(status = '') {
  remotes.clear();
  director.configure('menu', true);
  fx.clear();
  game.state = 'lobby';
  if (document.pointerLockElement) document.exitPointerLock();
  hud.showOverlay('lobby');
  renderLobby(status);
}

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
  const w = CFG.weapons[m.w] ?? CFG.weapons.rifle;
  const a = vec(m.a);
  for (const b of m.bs ?? [m.b]) fx.tracer(a, vec(b), w.tracer);
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
net.on('boxTake', (m) => { director.boxes[m.id]?.close(); });
net.on('gren', (m) => { if (inMatch()) arsenal.remoteGrenade(m.p, m.v, m.from); });
net.on('hit', (m) => {
  if (!inMatch() || !arsenal.pvp) return;
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
    const title = w ? (w.id === net.id ? '¡VICTORIA!' : `GANA ${w.name.toUpperCase()}`) : m.timeUp ? '¡TIEMPO! · EMPATE' : 'FIN DE LA PARTIDA';
    hud.showResults(title, ['JUGADOR', 'BAJAS', 'MUERTES'], rows, 'VOLVER AL LOBBY');
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
$('pause').addEventListener('click', resume);
$('btn-quit').addEventListener('click', (e) => { e.stopPropagation(); toMenu(); });
$('best').textContent = readBest().toLocaleString('es-ES');
if (matchMedia('(pointer: coarse)').matches) $('touch-warn').classList.remove('hidden');

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === renderer.domElement;
  if (locked && game.state === 'paused') {
    game.state = 'playing';
    hud.showOverlay(null);
  } else if (!locked && game.state === 'playing' && (player.alive || game.mode !== 'sp' || game.respawnIn > 0)) {
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
      h: +player.height.toFixed(2), a: player.alive ? 1 : 0, w: arsenal.w.id, hp: Math.round(player.health), sh: Math.round(player.shield),
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
window.__ringfall = { ctx, newGame, tick, armory };
