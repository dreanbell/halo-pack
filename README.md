# Ringfall — demo

Shooter sci-fi en primera persona, en el navegador, inspirado en los shooters de arena clásicos. Es un proyecto fan **original**: todos los modelos, texturas y sonidos se generan por código. No usa assets, nombres ni código de ninguna franquicia comercial.

## Ejecutar

### Un jugador
No necesita build ni dependencias. Three.js va incluido en `vendor/`.

```bash
python3 -m http.server 8000   # o: node server.js 8000
# abrir http://localhost:8000
```

También está publicado en GitHub Pages: https://dreanbell.github.io/halo-pack/ (solo un jugador).

### Multijugador LAN (2–8 jugadores)
Requisitos: **Node.js 18+** en el equipo que hace de servidor. No hace falta `npm install`.

1. Un jugador descarga el repo y arranca el servidor:
   ```bash
   git clone https://github.com/dreanbell/halo-pack.git
   cd halo-pack
   node server.js            # o npm start · puerto 8080; otro: node server.js 9000
   ```
   La consola muestra la dirección de red local, p. ej. `http://192.168.1.20:8080`.
2. Todos (incluido el anfitrión) abren esa dirección en el navegador, estando conectados a la **misma red**.
3. **MULTIJUGADOR LAN** → escribe tu nombre → **CONECTAR**.
4. El primero en entrar es el anfitrión: elige el modo y pulsa **INICIAR PARTIDA**. Quien llegue tarde entra directamente a la partida en curso.

Los demás no necesitan descargar nada: solo un navegador. Si no conectan, revisa el firewall del equipo servidor. En Windows, permite "Node.js" en redes privadas cuando aparezca el aviso, o abre el puerto TCP 8080.

| Modo | Reglas |
|---|---|
| Cooperativo | Oleadas contra la IA. Si caes, reapareces al empezar la siguiente oleada. Si cae todo el equipo, termina la partida. Sin fuego amigo. |
| Todos contra todos | Gana el primero en llegar a 15 bajas. Reapareces a los 3 s, lejos de los rivales. El daño entre jugadores es ×1,6. El radar solo muestra a los rivales que corren o disparan. |

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
| Tab | Marcador (multijugador) |
| Esc | Pausa (en multijugador la partida sigue) |

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

## Red

| Pieza | Funcionamiento |
|---|---|
| `server.js` | Node sin dependencias. Sirve los archivos por HTTP e implementa su propio WebSocket (`/ws`). Gestiona una sala única con lobby, elección de anfitrión y marcador de bajas. |
| Jugadores | Cada cliente es autoridad de su propio movimiento (20 Hz) y de sus disparos. Los demás se ven interpolados con 100 ms de retardo. |
| Cooperativo | El anfitrión simula enemigos, oleadas y recogibles, y envía instantáneas a 12 Hz. Los clientes le mandan el daño que hacen. Si el anfitrión se va, otro jugador toma el relevo con el estado de la última instantánea. |
| Todos contra todos | El tirador envía el impacto a la víctima, que lo aplica sobre su propio escudo. El servidor lleva la cuenta de bajas. |

Pensado para jugar entre amigos en LAN: no hay anti-trampas.

## Estructura

```
index.html          Marcado del HUD y los menús
styles.css          Estilos
server.js           Servidor LAN: HTTP estático + WebSocket + sala
src/main.js         Arranque, estados, lobby, mensajes de red y bucle
src/net.js          Cliente WebSocket
src/remote.js       Avatares de otros jugadores (interpolación, impactos)
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
