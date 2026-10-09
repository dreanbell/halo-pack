// Código de respaldo del perfil local (sin servidor ni contraseña): nombre, créditos, desbloqueos, armadura,
// armas y récord en un texto «RF1-…» que se copia y se pega en otro dispositivo o tras borrar el navegador.
// La suma de control solo detecta códigos mal copiados; no es una protección (el progreso local es editable).
const PREFIX = 'RF1-';

function sum(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36).padStart(7, '0').slice(-6);
}
const toB64 = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64 = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));

// data: { name, coins, owned[], earned, skin, loadout, best }
export function encodeBackup(data) {
  const body = toB64(JSON.stringify({
    n: data.name, c: data.coins, o: data.owned, e: data.earned, s: data.skin, l: data.loadout, b: data.best,
  }));
  return `${PREFIX}${body}.${sum(body)}`;
}

// → datos saneados, o lanza un Error con un mensaje para el jugador.
export function decodeBackup(text) {
  const t = String(text ?? '').replace(/\s+/g, '');
  if (!t.startsWith(PREFIX)) throw new Error('Eso no es un código de Ringfall (empieza por RF1-).');
  const [body, check] = t.slice(PREFIX.length).split('.');
  if (!body || check !== sum(body)) throw new Error('El código está incompleto o mal copiado.');
  let d;
  try { d = JSON.parse(fromB64(body)); } catch { throw new Error('El código está dañado.'); }
  const int = (v) => Math.max(0, Math.floor(Number(v) || 0));
  return {
    name: String(d.n ?? '').trim().slice(0, 16),
    coins: int(d.c),
    owned: Array.isArray(d.o) ? d.o.map(String).filter((k) => /^[a-z]+:\d+$/.test(k)).slice(0, 200) : [],
    earned: int(d.e),
    skin: d.s && typeof d.s === 'object' ? d.s : null,
    loadout: Array.isArray(d.l) ? d.l.map(String).slice(0, 2) : null,
    best: int(d.b),
  };
}
