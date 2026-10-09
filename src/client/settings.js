// Configuración del jugador: controles, gráficos, audio, interfaz y accesibilidad. Se guarda en el navegador.
// El esquema (SCHEMA) genera la pantalla de ajustes; cada módulo lee S.<clave> al usarlo (sin reiniciar).
const KEY = 'ringfall.settings';

export const SCHEMA = [
  { group: 'CONTROLES', items: [
    { key: 'sens', label: 'Sensibilidad del ratón', type: 'range', min: 0.1, max: 3, step: 0.05, def: 1, fmt: (v) => `×${v.toFixed(2)}` },
    { key: 'adsSens', label: 'Sensibilidad al apuntar', type: 'range', min: 0.2, max: 1.5, step: 0.05, def: 1, fmt: (v) => `×${v.toFixed(2)}`, tip: 'Multiplica la sensibilidad con la mira o el visor.' },
    { key: 'touchSens', label: 'Sensibilidad táctil', type: 'range', min: 0.3, max: 3, step: 0.05, def: 1, fmt: (v) => `×${v.toFixed(2)}`, touch: true },
    { key: 'invertY', label: 'Invertir eje vertical', type: 'toggle', def: false },
    { key: 'aimToggle', label: 'Apuntar', type: 'choice', def: false, options: [[false, 'MANTENER'], [true, 'ALTERNAR']], tip: 'Mantener el clic derecho, o pulsarlo una vez para entrar y otra para salir.' },
    { key: 'autoReload', label: 'Recarga automática', type: 'toggle', def: true, tip: 'Recarga sola al vaciar el cargador.' },
  ] },
  { group: 'GRÁFICOS', items: [
    { key: 'quality', label: 'Calidad', type: 'quality' },
    { key: 'fov', label: 'Campo de visión', type: 'range', min: 65, max: 105, step: 1, def: 78, fmt: (v) => `${v}°` },
    { key: 'resScale', label: 'Escala de resolución', type: 'range', min: 0.5, max: 1, step: 0.05, def: 1, fmt: (v) => `${Math.round(v * 100)} %`, tip: 'Menos píxeles = más FPS. La resolución dinámica sigue actuando por debajo.' },
    { key: 'fpsCap', label: 'Límite de FPS', type: 'choice', def: 0, options: [[30, '30'], [60, '60'], [0, 'SIN LÍMITE']] },
    { key: 'showFps', label: 'Mostrar FPS', type: 'toggle', def: false },
    { key: 'brightness', label: 'Brillo', type: 'range', min: 0.6, max: 1.6, step: 0.05, def: 1, fmt: (v) => `${Math.round(v * 100)} %` },
  ] },
  { group: 'AUDIO', items: [
    { key: 'volMaster', label: 'Volumen general', type: 'range', min: 0, max: 1, step: 0.05, def: 0.8, fmt: pct },
    { key: 'volWeapons', label: 'Armas', type: 'range', min: 0, max: 1, step: 0.05, def: 1, fmt: pct },
    { key: 'volCombat', label: 'Impactos y explosiones', type: 'range', min: 0, max: 1, step: 0.05, def: 1, fmt: pct },
    { key: 'volEnemies', label: 'Enemigos', type: 'range', min: 0, max: 1, step: 0.05, def: 1, fmt: pct },
    { key: 'volPlayer', label: 'Jugador (pasos, escudo, saltos)', type: 'range', min: 0, max: 1, step: 0.05, def: 1, fmt: pct },
    { key: 'volUi', label: 'Interfaz y avisos', type: 'range', min: 0, max: 1, step: 0.05, def: 1, fmt: pct },
    { key: 'announcer', label: 'Locutor (medallas)', type: 'toggle', def: true, tip: 'Voz del navegador: «¡doble baja!», «¡imparable!»…' },
    { key: 'muteHidden', label: 'Silenciar en segundo plano', type: 'toggle', def: true },
  ] },
  { group: 'INTERFAZ', items: [
    { key: 'hudScale', label: 'Tamaño del HUD', type: 'range', min: 0.7, max: 1.4, step: 0.05, def: 1, fmt: pct },
    { key: 'xhColor', label: 'Color de la retícula', type: 'color', def: '#7fe7ff', options: ['#7fe7ff', '#9dff6a', '#ffe27a', '#ff6ad5', '#ffffff', '#ff5a5a'] },
    { key: 'xhScale', label: 'Tamaño de la retícula', type: 'range', min: 0.5, max: 2, step: 0.05, def: 1, fmt: (v) => `×${v.toFixed(2)}` },
    { key: 'xhDot', label: 'Punto central', type: 'toggle', def: true },
    { key: 'hitmarker', label: 'Marcador de impacto', type: 'toggle', def: true },
    { key: 'dmgNumbers', label: 'Números de daño', type: 'toggle', def: true },
    { key: 'radar', label: 'Radar', type: 'toggle', def: true, tip: 'Si la partida lo permite.' },
  ] },
  { group: 'ACCESIBILIDAD', items: [
    { key: 'bob', label: 'Balanceo de cámara y arma', type: 'range', min: 0, max: 1, step: 0.05, def: 1, fmt: pct, tip: 'Bájalo si te mareas.' },
    { key: 'shake', label: 'Sacudida de pantalla', type: 'range', min: 0, max: 1, step: 0.05, def: 1, fmt: pct },
    { key: 'flashes', label: 'Destellos de explosiones', type: 'range', min: 0, max: 1, step: 0.05, def: 1, fmt: pct },
  ] },
];
function pct(v) { return `${Math.round(v * 100)} %`; }

const DEFAULTS = Object.fromEntries(SCHEMA.flatMap((g) => g.items).filter((i) => 'def' in i).map((i) => [i.key, i.def]));
export const S = { ...DEFAULTS };
try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) ?? '{}')); } catch { /* sin almacenamiento */ }
// Valores fuera de rango (versiones antiguas, ediciones a mano) → al límite.
for (const it of SCHEMA.flatMap((g) => g.items)) {
  if (it.type === 'range') S[it.key] = Math.min(it.max, Math.max(it.min, Number(S[it.key]) || it.def));
}

const listeners = new Set();
export const onSettings = (fn) => { listeners.add(fn); fn(S, null); };
export function setSetting(key, value) {
  S[key] = value;
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* sin almacenamiento */ }
  for (const fn of listeners) fn(S, key);
}
export function resetSettings() {
  for (const k of Object.keys(S)) delete S[k];
  Object.assign(S, DEFAULTS);
  try { localStorage.removeItem(KEY); } catch { /* sin almacenamiento */ }
  for (const fn of listeners) fn(S, null);
}
