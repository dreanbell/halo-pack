// Sensación de movimiento: muelles amortiguados para el arma en mano y la cámara (solo visual).
// Un muelle con poca amortiguación sobrepasa y vuelve, que es lo que da peso al retroceso y a los aterrizajes.

const STEP = 1 / 120;

export class Spring {
  constructor(k = 150, c = 16) {
    this.k = k; // rigidez
    this.c = c; // amortiguación
    this.x = 0;
    this.v = 0;
  }

  // Integración semimplícita en subpasos fijos: estable aunque el fotograma tarde.
  update(dt, target = 0) {
    const n = Math.min(8, Math.ceil(dt / STEP)), h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += (-this.k * (this.x - target) - this.c * this.v) * h;
      this.x += this.v * h;
    }
    return this.x;
  }

  kick(v) { this.v += v; }

  reset() { this.x = this.v = 0; }
}

// Suavizado exponencial independiente de los FPS.
export const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));
