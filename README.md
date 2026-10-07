# Ringfall — demo

Shooter sci-fi en primera persona, en el navegador, inspirado en los shooters de arena clásicos. Es un proyecto fan **original**: todos los modelos, texturas y sonidos se generan por código. No usa assets, nombres ni código de ninguna franquicia comercial.

## Ejecutar

No necesita build ni dependencias. Three.js va incluido en `vendor/`.

```bash
python3 -m http.server 8000
# abrir http://localhost:8000
```

Hace falta un servidor HTTP porque los módulos ES no cargan desde `file://`. Para publicarlo, el workflow `.github/workflows/pages.yml` despliega en GitHub Pages en cada push a `main`. Antes hay que activar Pages con la fuente "GitHub Actions" en *Settings → Pages*.

## Controles

| Tecla | Acción |
|---|---|
| WASD / flechas | Moverse |
| Ratón | Apuntar · clic izq. dispara |
| Shift | Esprintar |
| Espacio | Saltar |
| C / Ctrl | Agacharse (menos dispersión) |
| R | Recargar |
| Q / 1 / 2 / rueda | Cambiar arma |
| G / clic der. | Granada |
| F | Golpe cuerpo a cuerpo (por la espalda = eliminación) |
| Esc | Pausa |

## Mecánicas

| Sistema | Detalle |
|---|---|
| Escudo + salud | El escudo absorbe daño y se recarga tras 4,5 s sin recibir impactos. La salud se recupera despacio durante la recarga. |
| AR-9 Carbine | Automática, cargador de 32. La dispersión crece con ráfagas, al moverse o en el aire. Headshot ×1,5 sin escudo. |
| Ion Sidearm | Semiautomática y sin munición: se sobrecalienta. Hace ×2 de daño a escudos y headshot ×3 sin escudo. |
| Granadas | Rebotan y explotan a los 2 s. Daño en área con línea de visión, empuje y daño propio. |
| Oleadas | Composición creciente. Al superar una oleada recibes puntos, munición y una granada. |
| Enemigos | **Skitter**: rápido, frágil. **Warden**: escudo y ráfagas de 3. **Ravager**: carga cuerpo a cuerpo (desde la oleada 3). |
| IA | Campo de flujo (Dijkstra sobre una rejilla 2.5D de 1 m) compartido por todos. Mantiene distancia, hace strafe y anticipa tu movimiento. |
| HUD | Escudo, salud, munición/calor, granadas, radar de movimiento (30 m), indicador de daño direccional y hitmarkers. |

## Estructura

```
index.html          Marcado del HUD y los menús
styles.css          Estilos
src/main.js         Arranque, estados (menú/juego/pausa/fin) y bucle
src/config.js       Tuning: armas, enemigos, oleadas
src/world.js        Arena procedural, cielo con anillo y colisiones AABB
src/nav.js          Rejilla de navegación + campo de flujo
src/player.js       Movimiento FPS, escudo/salud y daño
src/weapons.js      Armas, granadas, cuerpo a cuerpo y viewmodels
src/enemies.js      IA enemiga, proyectiles, recogibles y oleadas
src/effects.js      Trazadoras, chispas, explosiones y marcas de impacto
src/hud.js          HUD y radar
src/audio.js        Sonido sintetizado con WebAudio
vendor/three/       three.js r160 (MIT)
```

Para depurar, `window.__ringfall` expone `ctx`, `newGame()` y `tick(dt)`, que avanza la simulación sin renderizar.
