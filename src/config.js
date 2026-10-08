// Tuning central del juego. Unidades: metros, segundos, puntos de daño.
export const CFG = {
  arena: { half: 58 },

  player: {
    height: 1.7, crouchHeight: 1.1, radius: 0.4, step: 0.5,
    walk: 6.2, sprint: 9.4, crouch: 3.2, jump: 7.4, gravity: 22,
    groundAccel: 14, airControl: 2.5, sensitivity: 0.0022,
    maxHealth: 100, maxShield: 100,
    shieldDelay: 4.5, shieldRate: 45, healthRate: 6,
  },

  // Armas. kind: hitscan | pellets | projectile. Munición: mag/reserve (con recarga) o heat (se sobrecalienta).
  // shellReload: recarga cartucho a cartucho. zoom: aumento con clic derecho. alien: tecnología alienígena.
  weapons: {
    rifle: {
      name: 'AR-9 CARBINE', kind: 'hitscan', auto: true, mag: 32, reserve: 192, maxReserve: 384, pickup: 48,
      interval: 0.09, damage: 8, spread: 0.018, sprayGrow: 0.005, sprayMax: 0.055,
      range: 150, reload: 2.1, headMult: 1.5, shieldMult: 1, recoil: 0.005, tracer: 0xffe3a0, sound: 'rifle',
    },
    pistol: {
      name: 'ION SIDEARM', kind: 'hitscan', auto: false, heat: { perShot: 0.11, cool: 0.45, overheat: 2.4 },
      interval: 0.18, damage: 16, spread: 0.004, range: 120, headMult: 3, shieldMult: 2, recoil: 0.012, tracer: 0x6ff5ff, sound: 'pistol',
    },
    smg: {
      name: 'VIPER SMG', kind: 'hitscan', auto: true, mag: 48, reserve: 240, maxReserve: 480, pickup: 72,
      interval: 0.055, damage: 5.5, spread: 0.034, sprayGrow: 0.004, sprayMax: 0.07,
      range: 70, reload: 1.8, headMult: 1.3, shieldMult: 1, recoil: 0.003, tracer: 0xfff0b0, sound: 'smg',
    },
    shotgun: {
      name: 'BREACHER-12', kind: 'pellets', pellets: 9, auto: false, mag: 8, reserve: 32, maxReserve: 48, pickup: 12,
      interval: 0.85, damage: 11, spread: 0.075, range: 36, falloff: [8, 36], reload: 0.5, shellReload: true,
      headMult: 1.2, shieldMult: 1, recoil: 0.05, tracer: 0xffd27a, sound: 'shotgun',
    },
    dmr: {
      name: 'DMR-3 MARKSMAN', kind: 'hitscan', auto: false, burst: 3, burstGap: 0.07, mag: 36, reserve: 108, maxReserve: 216, pickup: 36,
      interval: 0.42, damage: 13, spread: 0.006, range: 180, reload: 2.3, headMult: 2, shieldMult: 1, zoom: 2,
      recoil: 0.01, tracer: 0xfff6d0, sound: 'dmr',
    },
    sniper: {
      name: 'LONGSHOT SR-2', kind: 'hitscan', auto: false, mag: 4, reserve: 16, maxReserve: 24, pickup: 6,
      interval: 1.15, damage: 95, spread: 0.03, zoomSpread: 0.0008, range: 400, reload: 2.8, headMult: 2.5, shieldMult: 1,
      zoom: 5, scope: true, recoil: 0.06, tracer: 0xc8f4ff, sound: 'sniper',
    },
    plasma: {
      name: 'PLASMA LANCE', alien: true, kind: 'hitscan', auto: true, heat: { perShot: 0.055, cool: 0.5, overheat: 2.6 },
      interval: 0.1, damage: 9, spread: 0.02, range: 90, headMult: 1, shieldMult: 1.8, recoil: 0.004, tracer: 0xff5ad1, sound: 'plasma',
    },
    needler: {
      name: 'NEEDLE SWARM', alien: true, kind: 'projectile', auto: true, mag: 24, reserve: 72, maxReserve: 120, pickup: 24,
      interval: 0.11, damage: 10, projSpeed: 42, homing: 5, life: 1.8, spread: 0.03, reload: 2.2,
      headMult: 1, shieldMult: 1.2, recoil: 0.003, tracer: 0xff7be8, sound: 'needle',
    },
    arc: {
      name: 'ARC CANNON', alien: true, kind: 'projectile', auto: false, mag: 5, reserve: 10, maxReserve: 15, pickup: 3,
      interval: 1.0, damage: 110, splash: 4.5, projSpeed: 36, life: 3, spread: 0.002, reload: 3,
      headMult: 1, shieldMult: 1, recoil: 0.05, tracer: 0x7dff6a, sound: 'arc',
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
      label: 'Skitter', hp: 40, shield: 0, speed: 4.4, scale: 0.85,
      body: 0xc77a2c, glow: 0x7cf0ff, interval: [1.1, 1.9], burst: 1, gap: 0,
      projSpeed: 26, dmg: 7, spread: 0.05, range: [7, 16], score: 50, drop: 0.35,
    },
    warden: {
      label: 'Warden', hp: 70, shield: 80, speed: 3.1, scale: 1.25,
      body: 0x4b3a8f, glow: 0xff5ad1, interval: [1.6, 2.6], burst: 3, gap: 0.14,
      projSpeed: 34, dmg: 9, spread: 0.035, range: [12, 24], score: 150, drop: 0.6,
    },
    ravager: {
      label: 'Ravager', hp: 150, shield: 0, speed: 5.2, scale: 1.35,
      body: 0x6b2a22, glow: 0xff5a2a, interval: [0.9, 1.3], dmg: 40,
      range: [0, 1.9], melee: true, score: 200, drop: 0.5,
    },
  },

  waves: { intermission: 4, spawnGap: 0.7, maxAlive: 12 },

  // Multijugador: el daño entre jugadores se escala para que los duelos no se eternicen.
  pvp: { damageMult: 1.6, respawn: 3 },
  net: { stateRate: 1 / 20 },
};

export function waveComposition(n) {
  return {
    skitter: Math.min(14, 3 + n * 2),
    warden: Math.min(6, Math.floor(n / 2)),
    ravager: n >= 3 ? Math.min(4, Math.floor((n - 1) / 2)) : 0,
  };
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const rand = (a, b) => a + Math.random() * (b - a);
