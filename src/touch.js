// Controles táctiles (móvil/tablet): joystick de movimiento, arrastrar para apuntar y botones.
// Los botones simulan las mismas teclas/clics que el teclado, así toda la lógica del juego se reutiliza.

const params = new URLSearchParams(location.search);
export const TOUCH = params.get('touch') === '1'
  || (params.get('touch') !== '0' && matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0);

const LOOK_K = 1.7; // sensibilidad del dedo respecto al ratón
const STICK_R = 56; // px de recorrido del joystick

const key = (type, code) => dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
const mouse = (type, button) => document.dispatchEvent(new MouseEvent(type, { button, bubbles: true }));

export class TouchControls {
  constructor(ctx) {
    this.ctx = ctx;
    this.enabled = TOUCH;
    if (!this.enabled) return;
    document.body.classList.add('touch');
    this.root = document.getElementById('touch');
    this.stickEl = document.getElementById('t-stick');
    this.knob = document.getElementById('t-knob');
    this.move = null; // { id, x0, y0 }
    this.look = null; // { id, x, y }
    this.crouch = false;

    const pad = document.getElementById('t-pad');
    pad.addEventListener('pointerdown', (e) => this.padDown(e));
    addEventListener('pointermove', (e) => this.pointerMove(e), { passive: false });
    addEventListener('pointerup', (e) => this.pointerUp(e));
    addEventListener('pointercancel', (e) => this.pointerUp(e));

    for (const b of this.root.querySelectorAll('[data-key], [data-act]')) {
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        try { b.setPointerCapture(e.pointerId); } catch { /* puntero ya liberado */ }
        b.classList.add('down');
        this.press(b, true, e);
      });
      const up = (e) => {
        if (!b.classList.contains('down')) return;
        b.classList.remove('down');
        this.press(b, false, e);
      };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('lostpointercapture', up);
    }
    // Sin menú contextual, zoom por doble toque ni desplazamiento.
    for (const ev of ['contextmenu', 'gesturestart', 'dblclick']) document.addEventListener(ev, (e) => e.preventDefault());
    document.addEventListener('touchmove', (e) => { if (this.inGame()) e.preventDefault(); }, { passive: false });
  }

  inGame() {
    const s = this.ctx.game.state;
    return s === 'playing';
  }

  press(b, down, e) {
    const act = b.dataset.act;
    if (b.dataset.key) {
      if (b.dataset.key === 'KeyC') { // agacharse: alterna
        if (!down) return;
        this.crouch = !this.crouch;
        key(this.crouch ? 'keydown' : 'keyup', 'KeyC');
        b.classList.toggle('on', this.crouch);
        return;
      }
      key(down ? 'keydown' : 'keyup', b.dataset.key);
    } else if (act === 'fire') {
      mouse(down ? 'mousedown' : 'mouseup', 0);
      // Arrastrar desde el botón de disparo también apunta.
      if (down) this.look = { id: e.pointerId, x: e.clientX, y: e.clientY };
      else if (this.look?.id === e.pointerId) this.look = null;
    } else if (act === 'alt' && down) { // apuntar con la mira: toque para activar/desactivar
      const on = !this.ctx.arsenal.aimHeld;
      mouse(on ? 'mousedown' : 'mouseup', 2);
      b.classList.toggle('on', this.ctx.arsenal.aimHeld);
    } else if (act === 'pause' && down) {
      this.ctx.pause?.();
    } else if ((act === 'prev' || act === 'next') && down) {
      this.ctx.spectator.cycle(act === 'next' ? 1 : -1);
    }
  }

  padDown(e) {
    if (!this.inGame()) return;
    e.preventDefault();
    if (e.clientX < innerWidth * 0.42 && !this.move) {
      this.move = { id: e.pointerId, x0: e.clientX, y0: e.clientY };
      this.stickEl.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      this.stickEl.classList.add('show');
      this.knob.style.transform = 'translate(-50%, -50%)';
    } else if (!this.look) {
      this.look = { id: e.pointerId, x: e.clientX, y: e.clientY };
    }
  }

  pointerMove(e) {
    const { player, spectator } = this.ctx;
    if (this.move?.id === e.pointerId) {
      let dx = e.clientX - this.move.x0, dy = e.clientY - this.move.y0;
      const d = Math.hypot(dx, dy);
      if (d > STICK_R) { dx *= STICK_R / d; dy *= STICK_R / d; }
      this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      const k = Math.min(1, d / STICK_R);
      const dead = 0.12;
      const m = k < dead ? 0 : (k - dead) / (1 - dead);
      player.stick.x = dx / STICK_R;
      player.stick.y = dy / STICK_R;
      player.stick.m = m;
      // Joystick al tope hacia delante = esprintar.
      player.stick.sprint = k > 0.96 && dy < -Math.abs(dx);
    } else if (this.look?.id === e.pointerId) {
      const dx = e.clientX - this.look.x, dy = e.clientY - this.look.y;
      this.look.x = e.clientX;
      this.look.y = e.clientY;
      if (!this.inGame()) return;
      if (player.alive) player.look(dx * LOOK_K, dy * LOOK_K);
      else spectator.orbit(dx * LOOK_K, dy * LOOK_K);
    }
  }

  pointerUp(e) {
    if (this.move?.id === e.pointerId) {
      this.move = null;
      Object.assign(this.ctx.player.stick, { x: 0, y: 0, m: 0, sprint: false });
      this.stickEl.classList.remove('show');
    }
    if (this.look?.id === e.pointerId) this.look = null;
  }

  // Suelta todo (pausa, muerte, fin de partida).
  release() {
    if (!this.enabled) return;
    this.move = this.look = null;
    Object.assign(this.ctx.player.stick, { x: 0, y: 0, m: 0, sprint: false });
    this.stickEl.classList.remove('show');
    this.ctx.arsenal.trigger = this.ctx.arsenal.aimHeld = false;
    if (this.crouch) { this.crouch = false; key('keyup', 'KeyC'); }
    for (const b of this.root.querySelectorAll('.down, .on')) b.classList.remove('down', 'on');
    this.ctx.player.keys.clear();
  }

  // Visibilidad de botones según el contexto (una vez por frame).
  update() {
    if (!this.enabled) return;
    const { game, arsenal, director, player } = this.ctx;
    const ingame = game.state === 'playing' || game.state === 'paused';
    document.body.classList.toggle('ingame', ingame);
    if (!ingame) return;
    this.toggle('t-alt', 'on', arsenal.aimHeld);
    this.toggle('t-use', 'hidden', !(director.boxes.length && player.alive && director.boxPrompt()));
    this.toggle('t-board', 'hidden', game.mode === 'sp');
    this.toggle('t-swap-label', 'text', arsenal.slots[1 - arsenal.current]?.def.name ?? '');
  }

  toggle(id, cls, v) {
    const el = (this.els ??= {})[id] ??= document.getElementById(id);
    if (cls === 'text') { if (el.textContent !== v) el.textContent = v; return; }
    el.classList.toggle(cls, v);
  }
}

// Pantalla completa y horizontal (donde el navegador lo permita).
export function enterFullscreen() {
  if (!TOUCH || document.fullscreenElement) return;
  const el = document.documentElement;
  const p = el.requestFullscreen?.({ navigationUI: 'hide' });
  Promise.resolve(p).then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
}
