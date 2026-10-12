// Emotes (bailes, burlas y tácticos): lista compartida por el juego, la tienda y el servidor de cuentas.
// El índice es el número que viaja por la red y el artículo de tienda «o:i». Las animaciones están en
// src/client/emotes.js (hechas por código sobre el esqueleto del soldado: valen para todas las skins).
// mode: loop (se repite hasta cancelar) · once (una vez y termina) · hold (se queda en la pose hasta cancelar).
export const EMOTES = [
  { id: 'robot', name: 'ROBOT', cat: 'BAILE', mode: 'loop', dur: 3.2 },
  { id: 'lateral', name: 'PASO LATERAL', cat: 'BAILE', mode: 'loop', dur: 1.6 },
  { id: 'headbang', name: 'HEADBANG', cat: 'BAILE', mode: 'loop', dur: 1.0 },
  { id: 'disco', name: 'DISCO', cat: 'BAILE', mode: 'loop', dur: 1.6 },
  { id: 'caderas', name: 'CADERAS', cat: 'BAILE', mode: 'loop', dur: 1.2 },
  { id: 'giro', name: 'GIRO', cat: 'BAILE', mode: 'loop', dur: 1.8 },
  { id: 'ola', name: 'OLA', cat: 'BAILE', mode: 'loop', dur: 1.6 },
  { id: 'dab', name: 'DAB', cat: 'BAILE', mode: 'loop', dur: 1.8 },
  { id: 'venaqui', name: 'VEN AQUÍ', cat: 'BURLA', mode: 'once', dur: 2.4 },
  { id: 'hombros', name: 'ENCOGERSE', cat: 'BURLA', mode: 'once', dur: 1.8 },
  { id: 'risa', name: 'RISA', cat: 'BURLA', mode: 'once', dur: 1.6 },
  { id: 'reloj', name: 'MIRAR EL RELOJ', cat: 'BURLA', mode: 'once', dur: 2.4 },
  { id: 'facepalm', name: 'FACEPALM', cat: 'BURLA', mode: 'once', dur: 2.2 },
  { id: 'zombie', name: 'ZOMBI', cat: 'BURLA', mode: 'loop', dur: 2.0 },
  { id: 'estirar', name: 'ESTIRARSE', cat: 'BURLA', mode: 'once', dur: 2.6 },
  { id: 'senalar', name: 'SEÑALAR', cat: 'TÁCTICO', mode: 'once', dur: 2.0 },
  { id: 'rendicion', name: 'RENDICIÓN', cat: 'TÁCTICO', mode: 'once', dur: 2.0 },
  { id: 'sentarse', name: 'SENTARSE', cat: 'TÁCTICO', mode: 'hold', dur: 1.0 },
  { id: 'flexiones', name: 'FLEXIONES', cat: 'TÁCTICO', mode: 'hold', dur: 1.0 },
  { id: 'meditar', name: 'MEDITAR', cat: 'TÁCTICO', mode: 'hold', dur: 1.0 },
];
export const EMOTE_NAMES = EMOTES.map((e) => e.name);
// Precio en la tienda (0 = gratis desde el principio). La rareza en cajas sale del precio (ver shop.js).
export const EMOTE_PRICES = [900, 450, 450, 900, 450, 900, 450, 900, 0, 0, 450, 250, 250, 450, 250, 0, 0, 450, 900, 1500];
if (EMOTE_PRICES.length !== EMOTES.length) throw new Error('EMOTE_PRICES no coincide con EMOTES');
export const WHEEL_SIZE = 8;
