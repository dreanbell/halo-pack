import { MELEE_COUNT } from './skins.js';

// Armas cuerpo a cuerpo (tecla F): cosméticas. Todas golpean igual (daño, alcance y cadencia de CFG.melee) para que
// nadie gane por pagar; cambian el modelo, el estilo del golpe y el sonido. Índice = skin.k y artículo de tienda «k:i».
// Modelos CC0 en vendor/assets/melee (ver ATTRIBUTION.md). style: slash (tajo) · smash (golpe de arriba abajo) ·
// stab (puñalada). snd: blade · blunt · pan (sartén) · soft (pan, pez, caramelo).
export const MELEE = [
  { id: 'cuchillo', name: 'CUCHILLO TÁCTICO', style: 'stab', snd: 'blade' },
  { id: 'machete', name: 'MACHETE', style: 'slash', snd: 'blade' },
  { id: 'katana', name: 'KATANA', style: 'slash', snd: 'blade' },
  { id: 'espada', name: 'ESPADA', style: 'slash', snd: 'blade' },
  { id: 'cuchilla', name: 'CUCHILLA DE CARNICERO', style: 'slash', snd: 'blade' },
  { id: 'hacha', name: 'HACHA', style: 'smash', snd: 'blade' },
  { id: 'martillo', name: 'MARTILLO', style: 'smash', snd: 'blunt' },
  { id: 'tuberia', name: 'TUBERÍA', style: 'smash', snd: 'blunt' },
  { id: 'bate', name: 'BATE', style: 'smash', snd: 'blunt' },
  { id: 'pala', name: 'PALA', style: 'smash', snd: 'pan' },
  { id: 'sarten', name: 'SARTÉN', style: 'smash', snd: 'pan' },
  { id: 'rodillo', name: 'RODILLO', style: 'smash', snd: 'blunt' },
  { id: 'baguette', name: 'PAN FRANCÉS', style: 'slash', snd: 'soft' },
  { id: 'pez', name: 'PEZ', style: 'slash', snd: 'soft' },
  { id: 'caramelo', name: 'BASTÓN DE CARAMELO', style: 'smash', snd: 'soft' },
];
export const MELEE_NAMES = MELEE.map((m) => m.name);
// Precio (0 = gratis); la rareza en cajas sale del precio (src/shared/shop.js).
export const MELEE_PRICES = [0, 300, 1200, 800, 450, 500, 450, 250, 350, 400, 700, 300, 600, 900, 650];
if (MELEE_PRICES.length !== MELEE.length || MELEE.length !== MELEE_COUNT) throw new Error('MELEE_PRICES / MELEE_COUNT no coinciden con MELEE');
