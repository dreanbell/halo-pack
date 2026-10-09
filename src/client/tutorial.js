import { TOUCH } from './touch.js';

// Tutorial de la primera partida (un jugador): pasos cortos que se completan haciendo la acción.
// No pausa el juego: la primera oleada es suave. Se puede saltar desde la pausa y repetir desde Ajustes → Ayuda.
const KEY = 'ringfall.tutorial';
const STEPS = [
  { pc: 'Muévete con <kbd>W A S D</kbd>', touch: 'Muévete con el <b>joystick</b> (lado izquierdo)', done: (c, s) => s.moved > 5 },
  { pc: 'Mira alrededor con el <kbd>ratón</kbd>', touch: 'Arrastra en el lado derecho para <b>mirar</b>', done: (c, s) => s.turned > 1.2 },
  { pc: 'Salta con <kbd>Espacio</kbd>', touch: 'Salta con <b>▲</b>', done: (c, s) => s.jumped },
  { pc: 'Corre con <kbd>Shift</kbd> y deslízate con <kbd>C</kbd>', touch: 'Empuja el joystick a tope para <b>correr</b>; <b>▼</b> corriendo = deslizarte', done: (c, s) => s.slid || s.sprint > 1.5 },
  { pc: 'Apunta con la mira: <kbd>clic derecho</kbd>', touch: 'Apunta con la mira: <b>◎</b>', done: (c) => c.arsenal.aimK > 0.8 },
  { pc: 'Elimina a un enemigo: <kbd>clic izquierdo</kbd>', touch: 'Elimina a un enemigo: <b>✹</b>', done: (c, s) => c.game.kills > s.kills0 },
  { pc: 'Recarga con <kbd>R</kbd>', touch: 'Recarga con <b>↻</b>', done: (c) => c.arsenal.reloadT > 0 },
  { pc: 'Lanza una granada: <kbd>G</kbd>', touch: 'Lanza una granada: <b>◆</b>', done: (c, s) => c.arsenal.grenades < s.gren },
  { pc: 'Golpe cuerpo a cuerpo: <kbd>F</kbd> (por la espalda = eliminación)', touch: 'Golpe cuerpo a cuerpo: <b>GOLPE</b>', done: (c) => c.arsenal.meleeT > 0 },
  { pc: '¡Listo, soldado! Sobrevive a las oleadas. Abre los suministros que caen del cielo con <kbd>E</kbd>.', touch: '¡Listo, soldado! Sobrevive a las oleadas y abre los suministros que caen del cielo.', end: 6 },
];

export class Tutorial {
  constructor(ctx) {
    this.ctx = ctx;
    this.el = document.getElementById('tutor');
    this.active = false;
  }

  get seen() { try { return localStorage.getItem(KEY) === '1'; } catch { return true; } }
  set seen(v) { try { if (v) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch { /* sin almacenamiento */ } }

  // Al empezar una partida de un jugador: solo la primera vez (o tras «repetir tutorial»).
  maybeStart() {
    if (this.seen) { this.stop(); return; }
    const { player, arsenal, game } = this.ctx;
    this.active = true;
    this.i = -1;
    this.s = { moved: 0, turned: 0, jumped: false, slid: false, sprint: 0, kills0: game.kills, gren: arsenal.grenades, last: player.pos.clone(), yaw: player.yaw.rotation.y };
    this.next();
  }

  next() {
    this.i++;
    const st = STEPS[this.i];
    if (!st) { this.finish(); return; }
    if (this.i > 0) this.ctx.sfx.pickup?.();
    this.endT = st.end ?? null;
    this.wait = 0;
    this.el.innerHTML = `<small>TUTORIAL · ${Math.min(this.i + 1, STEPS.length - 1)}/${STEPS.length - 1}</small><p>${TOUCH ? st.touch : st.pc}</p>`;
    this.el.classList.add('show');
    this.el.classList.remove('ok');
    // La granada se cuenta desde que se pide (la del arsenal puede haber cambiado).
    this.s.gren = this.ctx.arsenal.grenades;
    this.s.kills0 = this.ctx.game.kills;
  }

  finish() {
    this.seen = true;
    this.stop();
  }

  stop() {
    this.active = false;
    this.el?.classList.remove('show');
  }

  update(dt) {
    if (!this.active) return;
    const c = this.ctx, s = this.s, p = c.player;
    s.moved += Math.hypot(p.pos.x - s.last.x, p.pos.z - s.last.z);
    s.last.copy(p.pos);
    let dy = p.yaw.rotation.y - s.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    s.turned += Math.abs(dy) + Math.abs(p.pitch.rotation.x) * dt;
    s.yaw = p.yaw.rotation.y;
    if (!p.onGround) s.jumped = true;
    if (p.sliding) s.slid = true;
    if (p.sprinting) s.sprint += dt;
    if (this.endT !== null) {
      this.endT -= dt;
      if (this.endT <= 0) this.finish();
      return;
    }
    if (this.wait > 0) { this.wait -= dt; if (this.wait <= 0) this.next(); return; }
    if (STEPS[this.i].done(c, s)) { this.el.classList.add('ok'); this.wait = 0.7; }
  }
}
