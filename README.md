# Ringfall — demo

Shooter sci-fi en primera persona, en el navegador, inspirado en los shooters de arena clásicos. Es un proyecto fan **original**: todos los modelos, texturas y sonidos se generan por código. No usa assets, nombres ni código de ninguna franquicia comercial.

## Jugar

**https://dreanbell.github.io/halo-pack/** — no hay que instalar ni descargar nada.

### Multijugador (2–8 jugadores, P2P)
1. Uno pulsa **MULTIJUGADOR LAN** → escribe su nombre → **CREAR SALA**. Aparece un código de 5 letras (p. ej. `J3MKW`).
2. Los demás abren la misma web, pulsan **MULTIJUGADOR LAN**, escriben el código y pulsan **UNIRSE**. También pueden abrir el enlace de **COPIAR ENLACE** (`…/#sala=J3MKW`), que rellena el código solo.
3. El anfitrión elige el modo y pulsa **INICIAR PARTIDA**. Quien llegue tarde entra directamente a la partida en curso.

La partida va **directa entre navegadores** (WebRTC). La sala vive en el navegador del anfitrión: si lo cierra, la partida termina para todos. Solo hace falta internet para cargar la web y emparejarse al entrar (servidor público de PeerJS). Con todos en la misma red, el tráfico del juego no sale de ella.

| Modo | Reglas |
|---|---|
| Cooperativo | Oleadas contra la IA. Si caes, reapareces al empezar la siguiente oleada. Si cae todo el equipo, termina la partida. Sin fuego amigo. |
| Todos contra todos | Gana el primero en llegar a 15 bajas. Reapareces a los 3 s, lejos de los rivales. El daño entre jugadores es ×1,6. El radar solo muestra a los rivales que corren o disparan. |

### Sin internet: servidor LAN (opcional)
Si la red no tiene salida a internet, un equipo con **Node.js 18+** puede servir el juego:

```bash
git clone https://github.com/dreanbell/halo-pack.git
cd halo-pack
node server.js            # o npm start · puerto 8080; otro: node server.js 9000
```

La consola muestra la dirección de red local (p. ej. `http://192.168.1.20:8080`). Los demás la abren en el navegador → **MULTIJUGADOR LAN** → **SERVIDOR LAN DE ESTE EQUIPO**. Si no conectan, permite "Node.js" en el firewall para redes privadas o abre el puerto TCP 8080.

### Un jugador en local
No necesita build ni dependencias: three.js y PeerJS van incluidos en `vendor/`.

```bash
python3 -m http.server 8000   # o: node server.js 8000 → http://localhost:8000
```

## Armas

| Arma | Tipo | Notas |
|---|---|---|
| AR-9 Carbine | Fusil automático | Todoterreno |
| Ion Sidearm | Pistola de calor | ×2 contra escudos, cabeza ×3 |
| Viper SMG | Subfusil | Cadencia altísima, poco alcance |
| Breacher-12 | Escopeta | 9 perdigones, recarga cartucho a cartucho |
| DMR-3 Marksman | Tirador | Ráfaga de 3, mira ×2 |
| Longshot SR-2 | Francotirador | 95 de daño, cabeza ×2,5, mira ×5 |
| Plasma Lance 👽 | Alienígena, calor | ×1,8 contra escudos |
| Needle Swarm 👽 | Alienígena | Agujas que persiguen al objetivo |
| Arc Cannon 👽 | Alienígena | Proyectil explosivo con daño en área |

- **Un jugador y todos contra todos:** eliges tus dos armas en **ARMAS** (menú o lobby).
- **Cooperativo:** empiezas con carabina y pistola. Ganas **créditos** con cada baja y cada oleada superada. Las **cajas misteriosas** (una en la plataforma central y otra en el campo, marcadas con un haz de luz) cuestan 500 créditos: pulsa **E**, la caja se abre, van pasando armas y sale una al azar, que coges con **E** antes de 8 s. Sustituye al arma que llevas en la mano. Si ya la tenías, te llena la munición. Las mejores salen en rondas altas: francotirador y agujas desde la 3, cañón de arco desde la 5.

## Armería (skins)

Desde el menú (**ARMERÍA · PERSONALIZAR SOLDADO**) o desde el lobby (**ARMERÍA**). Hay vista previa 3D giratoria.

| Opción | Variantes |
|---|---|
| Color principal | 10 |
| Color secundario | 10 |
| Visor | 5 (reflectante, con brillo) |
| Casco | Centinela · Halcón · Bastión |
| Patrón | Liso · Camuflaje · Rayas · Hexágonos (con juntas, remaches y desgaste) |

La armadura se guarda en el navegador y se envía a los demás jugadores; la verán en la siguiente partida. En primera persona se ven tus brazos con la misma armadura.

El modelo del soldado es procedural (unas 40 piezas biseladas con materiales PBR y reflejos del cielo) y tiene esqueleto animado: caminar, correr, agacharse, saltar, apuntar arriba y abajo con las manos en el arma (IK) y caída al morir.

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
| Clic der. | Mira (DMR, francotirador); si el arma no tiene, granada |
| G | Granada |
| E | Caja misteriosa (cooperativo) |
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
| Sala (`src/room.js`) | Lobby, modo, anfitrión y marcador de bajas. En P2P se ejecuta en el navegador del anfitrión y los demás se conectan a él por WebRTC (PeerJS). En LAN sin internet la ejecuta `server.js` y los clientes usan WebSocket. |
| Latido | Ping cada 2 s. Tras 9 s sin mensajes, la conexión se da por perdida. |
| Jugadores | Cada cliente es autoridad de su propio movimiento (20 Hz) y de sus disparos. Los demás se ven interpolados con 100 ms de retardo. |
| Cooperativo | El anfitrión simula enemigos, oleadas y recogibles, y envía instantáneas a 12 Hz. Los clientes le mandan el daño que hacen. En el servidor LAN, si el anfitrión se va, otro jugador toma el relevo. |
| Todos contra todos | El tirador envía el impacto a la víctima, que lo aplica sobre su propio escudo. El servidor lleva la cuenta de bajas. |

Pensado para jugar entre amigos: no hay anti-trampas. Para usar un servidor de emparejamiento propio: `?peerhost=equipo&peerport=9000&peerpath=/`.

## Estructura

```
index.html          Marcado del HUD y los menús
styles.css          Estilos
server.js           Servidor LAN opcional (sin internet): HTTP estático + WebSocket
src/room.js         Lógica de la sala (compartida por P2P y server.js)
src/main.js         Arranque, estados, lobby, mensajes de red y bucle
src/net.js          Red: anfitrión/invitado P2P (WebRTC) y cliente LAN (WebSocket)
src/remote.js       Otros jugadores: interpolación, impactos y etiqueta de nombre
src/avatar.js       Modelo del soldado, materiales por skin, animación e IK de brazos
src/skins.js        Opciones de armadura y validación
src/armory.js       Pantalla de armería con vista previa 3D
src/guns.js         Modelos de las armas
src/box.js          Caja misteriosa del cooperativo
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
vendor/peerjs/      PeerJS 1.5.5 (MIT)
```

Para depurar, `window.__ringfall` expone `ctx`, `newGame()` y `tick(dt)`, que avanza la simulación sin renderizar.
