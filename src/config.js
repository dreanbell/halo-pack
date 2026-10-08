// Tuning central del juego. Unidades: metros, segundos, puntos de daño.
export const CFG = {
  arena: { half: 58 },

  player: {
    height: 1.7, crouchHeight: 1.1, radius: 0.4, step: 0.5,
    walk: 6.2, sprint: 9.4, crouch: 3.2, jump: 7.4, gravity: 22,
    groundAccel: 14, airControl: 2.5, sensitivity: 0.0022,
    coyote: 0.12, jumpBuffer: 0.14,
    // Deslizamiento: al agacharse corriendo (o al aterrizar agachado con inercia).
    slide: { minSpeed: 7.2, boost: 13.5, buffer: 0.25, friction: 6.5, maxTime: 1.1, steer: 1.6, height: 0.9, cooldown: 0.9, jumpKeep: 0.92 },
    maxHealth: 100, maxShield: 100,
    shieldDelay: 4.5, shieldRate: 45, healthRate: 6,
  },

  // Armas. kind: hitscan | pellets | projectile. Munición: mag/reserve (con recarga) o heat (se sobrecalienta).
  // shellReload: recarga cartucho a cartucho. ads: aumento al apuntar (clic derecho); zoom + scope: visor (overlay).
  // adsSpread: dispersión al apuntar (× la de cadera). flash: tamaño del fogonazo. alien: tecnología alienígena.
  weapons: {
    rifle: {
      name: 'AR-9 CARBINE', kind: 'hitscan', auto: true, mag: 32, reserve: 192, maxReserve: 384, pickup: 48,
      interval: 0.09, damage: 8, spread: 0.018, sprayGrow: 0.005, sprayMax: 0.055,
      range: 150, reload: 2.1, headMult: 1.5, shieldMult: 1, recoil: 0.005, tracer: 0xffe3a0, sound: 'rifle', ads: 1.35, flash: 1,
    },
    pistol: {
      name: 'ION SIDEARM', kind: 'hitscan', auto: false, heat: { perShot: 0.11, cool: 0.45, overheat: 2.4 },
      interval: 0.18, damage: 16, spread: 0.004, range: 120, headMult: 3, shieldMult: 2, recoil: 0.012, tracer: 0x6ff5ff, sound: 'pistol', ads: 1.2, flash: 0.7,
    },
    smg: {
      name: 'VIPER SMG', kind: 'hitscan', auto: true, mag: 48, reserve: 240, maxReserve: 480, pickup: 72,
      interval: 0.055, damage: 5.5, spread: 0.034, sprayGrow: 0.004, sprayMax: 0.07,
      range: 70, reload: 1.8, headMult: 1.3, shieldMult: 1, recoil: 0.003, tracer: 0xfff0b0, sound: 'smg', ads: 1.3, flash: 0.85,
    },
    shotgun: {
      name: 'BREACHER-12', kind: 'pellets', pellets: 9, auto: false, mag: 8, reserve: 32, maxReserve: 48, pickup: 12,
      interval: 0.85, damage: 11, spread: 0.075, range: 36, falloff: [8, 36], reload: 0.5, shellReload: true,
      headMult: 1.2, shieldMult: 1, recoil: 0.05, tracer: 0xffd27a, sound: 'shotgun', ads: 1.15, adsSpread: 0.8, flash: 1.7,
    },
    dmr: {
      name: 'DMR-3 MARKSMAN', kind: 'hitscan', auto: false, burst: 3, burstGap: 0.07, mag: 36, reserve: 108, maxReserve: 216, pickup: 36,
      interval: 0.42, damage: 13, spread: 0.006, range: 180, reload: 2.3, headMult: 2, shieldMult: 1, zoom: 2, scope: 'dmr',
      recoil: 0.01, tracer: 0xfff6d0, sound: 'dmr', flash: 1.1,
    },
    sniper: {
      name: 'LONGSHOT SR-2', kind: 'hitscan', auto: false, mag: 4, reserve: 16, maxReserve: 24, pickup: 6,
      interval: 1.15, damage: 95, spread: 0.03, zoomSpread: 0.0008, range: 400, reload: 2.8, headMult: 2.5, shieldMult: 1,
      zoom: 5, scope: 'sniper', boltAction: true, recoil: 0.06, tracer: 0xc8f4ff, sound: 'sniper', flash: 2,
    },
    plasma: {
      name: 'PLASMA LANCE', alien: true, kind: 'hitscan', auto: true, heat: { perShot: 0.055, cool: 0.5, overheat: 2.6 },
      interval: 0.1, damage: 9, spread: 0.02, range: 90, headMult: 1, shieldMult: 1.8, recoil: 0.004, tracer: 0xff5ad1, sound: 'plasma', ads: 1.2,
    },
    needler: {
      name: 'NEEDLE SWARM', alien: true, kind: 'projectile', auto: true, mag: 24, reserve: 72, maxReserve: 120, pickup: 24,
      interval: 0.11, damage: 10, projSpeed: 42, homing: 5, life: 1.8, spread: 0.03, reload: 2.2,
      headMult: 1, shieldMult: 1.2, recoil: 0.003, tracer: 0xff7be8, sound: 'needle', ads: 1.2,
    },
    arc: {
      name: 'ARC CANNON', alien: true, kind: 'projectile', auto: false, mag: 5, reserve: 10, maxReserve: 15, pickup: 3,
      interval: 1.0, damage: 110, splash: 4.5, projSpeed: 36, life: 3, spread: 0.002, reload: 3,
      headMult: 1, shieldMult: 1, recoil: 0.05, tracer: 0x7dff6a, sound: 'arc', ads: 1.15,
    },
  },
  defaultLoadout: ['rifle', 'pistol'],

  // Cooperativo: caja misteriosa (créditos por bajas y oleadas; mejores armas en rondas altas).
  box: {
    cost: 500, roll: 2.6, offer: 8, range: 2.2, waveBonus: 150,
    pool: [
      { wave: 1, ids: ['smg', 'shotgun', 'dmr', 'plasma'] },
      { wave: 3, ids: ['sniper', 'needler'] },
      { wave: 5, ids: ['arc'] },
    ],
    spots: [[0, 2.4, -2.2, 0], [-44, 0, -6, Math.PI / 2]],
  },

  swapTime: 0.45,
  grenade: { max: 4, start: 2, speed: 17, fuse: 2.0, radius: 7.5, damage: 140 },
  melee: { range: 2.6, damage: 70, cooldown: 0.75, lunge: 4 },

  enemies: {
    skitter: {
      label: 'Skitter', ai: 'ranged', hp: 40, shield: 0, speed: 4.4, scale: 0.85,
      body: 0xc77a2c, glow: 0x7cf0ff, interval: [1.1, 1.9], burst: 1, gap: 0,
      projSpeed: 26, dmg: 7, spread: 0.05, range: [7, 16], score: 50, drop: 0.35,
    },
    warden: {
      label: 'Warden', ai: 'ranged', hp: 70, shield: 80, speed: 3.1, scale: 1.25,
      body: 0x4b3a8f, glow: 0xff5ad1, interval: [1.6, 2.6], burst: 3, gap: 0.14,
      projSpeed: 34, dmg: 9, spread: 0.035, range: [12, 24], score: 150, drop: 0.6,
    },
    ravager: {
      label: 'Ravager', ai: 'melee', hp: 150, shield: 0, speed: 5.2, scale: 1.35,
      body: 0x6b2a22, glow: 0xff5a2a, interval: [0.9, 1.3], dmg: 40,
      range: [0, 1.9], melee: true, score: 200, drop: 0.5,
    },
    drone: {
      label: 'Drone', ai: 'flyer', hp: 28, shield: 0, speed: 7, scale: 0.75, fly: [3.2, 6],
      body: 0x3a4048, glow: 0xffd23a, interval: [0.8, 1.3], burst: 2, gap: 0.12,
      projSpeed: 32, dmg: 5, spread: 0.06, range: [8, 17], score: 40, drop: 0.15,
    },
    stalker: {
      label: 'Stalker', ai: 'stalker', hp: 90, shield: 0, speed: 6.4, scale: 1.05,
      body: 0x24363a, glow: 0x7dffd0, interval: [0.9, 1.4], dmg: 30, leap: 13,
      range: [0, 1.9], melee: true, score: 180, drop: 0.4,
    },
    bombardier: {
      label: 'Bombardier', ai: 'artillery', hp: 110, shield: 60, speed: 2.4, scale: 1.3,
      body: 0x5a4a2a, glow: 0xff9a3d, interval: [3, 4.2], burst: 1, gap: 0,
      projSpeed: 22, dmg: 28, splash: 3.6, spread: 0.04, range: [24, 42], score: 220, drop: 0.6,
    },
    warlord: {
      label: 'WARLORD', ai: 'warlord', boss: true, hp: 2200, shield: 500, speed: 3.6, scale: 2.6,
      body: 0x3b1f1a, glow: 0xff3b2f, projSpeed: 30, dmg: 13, spread: 0.02, range: [6, 22],
      slamDmg: 45, slamRadius: 9, chargeDmg: 55, interval: [1.2, 2], score: 3000, drop: 1,
    },
    overseer: {
      label: 'OVERSEER', ai: 'overseer', boss: true, hp: 1800, shield: 700, speed: 5, scale: 2.4, fly: [8, 11],
      body: 0x1e2c4a, glow: 0x6fd8ff, projSpeed: 18, dmg: 12, spread: 0.03, range: [10, 30],
      mortarDmg: 30, splash: 4, diveDmg: 50, interval: [1.2, 2], score: 3000, drop: 1,
    },
  },

  waves: { intermission: 4, spawnGap: 0.7, maxAlive: 12 },

  net: { stateRate: 1 / 20 },
};

// Escalado de dificultad por oleada y número de jugadores.
export function difficulty(wave, players = 1) {
  const extra = Math.max(0, players - 1);
  return {
    hp: (1 + (wave - 1) * 0.12) * (1 + 0.3 * extra),
    dmg: 1 + (wave - 1) * 0.05,
    count: 1 + 0.45 * extra,
    gap: Math.max(0.25, 0.7 - wave * 0.03),
    maxAlive: Math.min(26, 13 + wave + 3 * extra),
  };
}

export function bossFor(n) {
  if (n % 5 !== 0) return null;
  return (n / 5) % 2 === 1 ? 'warlord' : 'overseer';
}

// Tropas de la oleada n con multiplicador k.
function troops(n, k) {
  const c = (v) => Math.max(0, Math.round(v * k));
  return {
    skitter: c(Math.min(18, 4 + n * 2)),
    warden: c(Math.min(8, Math.floor(n * 0.6))),
    ravager: n >= 3 ? c(Math.min(5, Math.floor((n - 1) / 2))) : 0,
    drone: n >= 2 ? c(Math.min(10, 2 + n)) : 0,
    stalker: n >= 4 ? c(Math.min(5, Math.floor((n - 2) / 2))) : 0,
    bombardier: n >= 6 ? c(Math.min(4, Math.floor((n - 4) / 2))) : 0,
  };
}

// set: 'classic' (jefe cada 5) | 'bosses' (jefe en cada oleada; desde la 6.ª, los dos cada tres).
export function waveComposition(n, players = 1, set = 'classic') {
  const k = difficulty(n, players).count;
  if (set === 'bosses') {
    const comp = troops(n * 2, k * 0.35);
    comp[n % 2 ? 'warlord' : 'overseer'] = 1;
    if (n >= 6 && n % 3 === 0) comp.warlord = comp.overseer = 1;
    return comp;
  }
  const boss = bossFor(n);
  const comp = troops(n, k * (boss ? 0.5 : 1)); // en oleadas de jefe, menos escolta
  if (boss) comp[boss] = 1;
  return comp;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const rand = (a, b) => a + Math.random() * (b - a);
