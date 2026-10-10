// Emblemas de jugador: forma de fondo + icono vectorial + dos colores. Se dibujan con canvas 2D (sin imágenes):
// en la cabecera, sobre la cabeza en multijugador, en el marcador y en la pantalla de muerte.
// em = [forma, icono, color de fondo, color del icono] (índices; ver EMBLEM_* en src/shared/skins.js).
import { EMBLEM_SHAPES, EMBLEM_ICONS, EMBLEM_COLORS } from '../shared/skins.js';

const TAU = Math.PI * 2;
const poly = (g, n, r, rot = -Math.PI / 2, cx = 0, cy = 0) => {
  g.beginPath();
  for (let i = 0; i < n; i++) g.lineTo(cx + Math.cos(rot + (i * TAU) / n) * r, cy + Math.sin(rot + (i * TAU) / n) * r);
  g.closePath();
};

// Fondos (coordenadas de -1 a 1).
const SHAPES = [
  (g) => poly(g, 6, 1, -Math.PI / 2), // hexágono
  (g) => { g.beginPath(); g.moveTo(-0.85, -0.9); g.lineTo(0.85, -0.9); g.lineTo(0.85, 0.05); g.quadraticCurveTo(0.8, 0.7, 0, 1); g.quadraticCurveTo(-0.8, 0.7, -0.85, 0.05); g.closePath(); }, // escudo
  (g) => { g.beginPath(); g.arc(0, 0, 0.95, 0, TAU); }, // círculo
  (g) => poly(g, 4, 1, -Math.PI / 2), // rombo
  (g) => { g.beginPath(); g.moveTo(-0.75, -0.95); g.lineTo(0.75, -0.95); g.lineTo(0.75, 0.95); g.lineTo(0, 0.55); g.lineTo(-0.75, 0.95); g.closePath(); }, // estandarte
];

// Iconos (rellenos, coordenadas de -1 a 1; se dibujan a ~55 % del tamaño).
const ICONS = [
  (g) => { g.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.42 : 1, a = -Math.PI / 2 + (i * Math.PI) / 5; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); }, // estrella
  (g) => { g.beginPath(); g.moveTo(0.2, -1); g.lineTo(-0.6, 0.15); g.lineTo(-0.05, 0.15); g.lineTo(-0.25, 1); g.lineTo(0.6, -0.2); g.lineTo(0.05, -0.2); g.closePath(); g.fill(); }, // rayo
  (g) => { g.beginPath(); for (let r = 1; r > 0.1; r -= 0.36) { g.moveTo(r, 0); g.arc(0, 0, r, 0, TAU); } g.fill('evenodd'); }, // diana
  (g) => { for (const y of [-0.55, 0, 0.55]) { g.beginPath(); g.moveTo(-0.9, y - 0.05); g.lineTo(0, y - 0.45); g.lineTo(0.9, y - 0.05); g.lineTo(0.9, y + 0.2); g.lineTo(0, y - 0.2); g.lineTo(-0.9, y + 0.2); g.closePath(); g.fill(); } }, // galones
  (g) => { g.beginPath(); g.moveTo(-0.95, 0.7); g.lineTo(-0.95, -0.45); g.lineTo(-0.5, 0); g.lineTo(0, -0.75); g.lineTo(0.5, 0); g.lineTo(0.95, -0.45); g.lineTo(0.95, 0.7); g.closePath(); g.fill(); }, // corona
  (g) => { g.beginPath(); g.arc(0, -0.15, 0.8, 0, TAU); g.fill(); g.fillRect(-0.45, 0.4, 0.9, 0.5); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(-0.32, -0.15, 0.22, 0, TAU); g.arc(0.32, -0.15, 0.22, 0, TAU); g.fill(); g.fillRect(-0.06, 0.55, 0.12, 0.35); g.globalCompositeOperation = 'source-over'; }, // calavera
  (g) => { g.beginPath(); g.moveTo(0, -1); g.lineTo(0.16, -0.75); g.lineTo(0.16, 0.35); g.lineTo(0.5, 0.35); g.lineTo(0.5, 0.5); g.lineTo(0.12, 0.5); g.lineTo(0.12, 0.95); g.lineTo(-0.12, 0.95); g.lineTo(-0.12, 0.5); g.lineTo(-0.5, 0.5); g.lineTo(-0.5, 0.35); g.lineTo(-0.16, 0.35); g.lineTo(-0.16, -0.75); g.closePath(); g.fill(); }, // espada
  (g) => { g.beginPath(); g.moveTo(0, -1); g.bezierCurveTo(0.6, -0.4, 0.85, 0.1, 0.65, 0.55); g.bezierCurveTo(0.5, 0.9, 0.2, 1, 0, 1); g.bezierCurveTo(-0.2, 1, -0.5, 0.9, -0.65, 0.55); g.bezierCurveTo(-0.8, 0.2, -0.5, -0.1, -0.3, -0.3); g.bezierCurveTo(-0.25, 0, -0.1, 0.1, 0, 0.05); g.bezierCurveTo(0.15, -0.3, 0.05, -0.7, 0, -1); g.fill(); }, // llama
  (g) => { for (const s of [-1, 1]) { g.beginPath(); g.moveTo(0.08 * s, 0.2); for (let k = 0; k < 4; k++) { g.lineTo(s * (0.3 + k * 0.2), -0.75 + k * 0.12); g.lineTo(s * (0.25 + k * 0.2), -0.35 + k * 0.2); } g.lineTo(s * 0.95, 0.15); g.lineTo(0.08 * s, 0.6); g.closePath(); g.fill(); } g.beginPath(); g.arc(0, 0.25, 0.14, 0, TAU); g.fill(); }, // alas
  (g) => { g.beginPath(); g.arc(0, 0, 0.9, 0, TAU); g.arc(0.35, -0.25, 0.75, 0, TAU, true); g.fill('evenodd'); }, // luna
  (g) => { g.beginPath(); g.moveTo(0, 0.95); g.bezierCurveTo(-1.2, 0.05, -0.75, -1.05, 0, -0.45); g.bezierCurveTo(0.75, -1.05, 1.2, 0.05, 0, 0.95); g.fill(); }, // corazón
  (g) => { for (let k = -1; k <= 1; k++) { g.save(); g.translate(k * 0.42, 0); g.rotate(0.35); g.fillRect(-0.09, -0.95, 0.18, 1.9); g.restore(); } }, // garras
  (g) => { g.beginPath(); g.arc(0, 0, 0.5, 0, TAU); g.fill(); g.save(); g.scale(1, 0.32); g.rotate(-0.4); g.beginPath(); g.arc(0, 0, 1, 0, TAU); g.arc(0, 0, 0.82, 0, TAU, true); g.fill('evenodd'); g.restore(); }, // planeta con anillo
  (g) => { g.beginPath(); g.moveTo(-1, 0); g.quadraticCurveTo(0, -0.95, 1, 0); g.quadraticCurveTo(0, 0.95, -1, 0); g.arc(0, 0, 0.32, 0, TAU, true); g.fill('evenodd'); g.beginPath(); g.arc(0, 0, 0.16, 0, TAU); g.fill(); }, // ojo
  (g) => { poly(g, 3, 1, -Math.PI / 2); g.moveTo(0, -0.35); g.lineTo(0.42, 0.38); g.lineTo(-0.42, 0.38); g.closePath(); g.fill('evenodd'); }, // triángulo antiguo
  (g) => { g.beginPath(); g.arc(0.35, -0.35, 0.42, 0, TAU); g.fill(); g.beginPath(); g.moveTo(0.05, -0.55); g.lineTo(-1, 0.85); g.lineTo(0.55, -0.05); g.closePath(); g.fill(); }, // cometa
];

export const PALETTE = ['#16202b', '#7fe7ff', '#ffc23a', '#ff4d5e', '#9dff6a', '#c77dff', '#ff8ad8', '#f0f0f0', '#2f5d8a', '#3d6b4f'];
export const SHAPE_NAMES = ['HEXÁGONO', 'ESCUDO', 'CÍRCULO', 'ROMBO', 'ESTANDARTE'];
if (SHAPES.length !== EMBLEM_SHAPES || ICONS.length !== EMBLEM_ICONS || PALETTE.length !== EMBLEM_COLORS) console.warn('Ringfall: emblemas desajustados');

export const DEFAULT_EMBLEM = [0, 0, 0, 1];

// Dibuja el emblema centrado en (x, y) con tamaño s (px).
export function drawEmblem(g, em, x, y, s) {
  const [b, i, c1, c2] = em ?? DEFAULT_EMBLEM;
  g.save();
  g.translate(x, y);
  g.scale(s / 2, s / 2);
  SHAPES[b]?.(g);
  g.fillStyle = PALETTE[c1] ?? PALETTE[0];
  g.fill();
  g.lineWidth = 0.08;
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.stroke();
  g.scale(0.55, 0.55);
  g.fillStyle = PALETTE[c2] ?? PALETTE[1];
  ICONS[i]?.(g);
  g.restore();
}

const urls = new Map();
// Imagen (dataURL) del emblema, en caché.
export function emblemURL(em, size = 96) {
  const key = `${(em ?? DEFAULT_EMBLEM).join(',')}|${size}`;
  if (urls.has(key)) return urls.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  drawEmblem(c.getContext('2d'), em, size / 2, size / 2, size * 0.94);
  const url = c.toDataURL('image/png');
  urls.set(key, url);
  return url;
}
