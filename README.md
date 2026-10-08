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
| Cooperativo | Oleadas contra la IA. Si caes, reapareces al empezar la siguiente oleada. Si cae todo el equipo, termina la partida. |
| Todos contra todos | Gana el primero en llegar al límite de bajas (15 por defecto). Reapareces lejos de los rivales. El radar solo muestra a los rivales que corren o disparan. |

## Variantes y ajustes

**UN JUGADOR** abre la pantalla de variante y ajustes (se recuerdan entre partidas). En multijugador, el anfitrión los elige en el lobby y los demás los ven en tiempo real.

| Variante | Modos | Reglas |
|---|---|---|
| Clásico | Todos | Las reglas de siempre del modo. |
| Tiroteo | Un jugador · Coop | 7 vidas compartidas: al caer gastas una y reapareces a los 5 s. +1 vida por oleada superada. Sin vidas, quien cae no vuelve (en coop, vuelve si el equipo gana una). Dificultad difícil, sin cajas, armas a elegir. |
| Jefes en cadena | Un jugador · Coop | Un jefe con escolta en cada oleada, alternando WARLORD y OVERSEER; desde la 6.ª, los dos juntos cada tres oleadas. 4 granadas. |
| Francotiradores | Todos | Francotirador y pistola, munición infinita, sin granadas ni radar. |
| Swat | Todos | Sin escudos (la salud se regenera) ni radar. Un tiro a la cabeza elimina, salvo a los jefes. DMR y pistola, sin granadas. |

Cada variante es un punto de partida: cualquier ajuste se puede cambiar (aparece en amarillo y la partida se marca como **personalizada**).

| Ajuste | Modos | Valores |
|---|---|---|
| Límite de bajas | DM | 5–50 |
| Límite de tiempo | Todos | Sin límite · 1–30 min. En DM gana quien más bajas tenga (empate si coinciden); en oleadas, la partida termina con el resumen. |
| Vidas | Oleadas | Clásico (0) · 1–30 compartidas |
| Reaparición | DM · oleadas con vidas | 1–15 s |
| Oleada inicial | Oleadas | 1–30 |
| Oleadas | Oleadas | Normales · Solo jefes |
| Dificultad | Oleadas | Fácil (vida ×0,7, daño ×0,6) · Normal · Difícil (×1,35 / ×1,3) · Legendaria (×1,8 / ×1,7) |
| Cajas misteriosas | Oleadas | Sí / No (también en un jugador) |
| Fuego amigo | Coop | Sí / No |
| Daño entre jugadores | DM · coop con fuego amigo | ×0,6–×3 (por defecto ×1,6) |
| Armas iniciales | Todos | A elegir · Carabina + pistola · Francotirador + pistola · DMR + pistola · Escopeta + SMG · Alienígenas |
| Granadas iniciales | Todos | 0–4 |
| Munición infinita · Escudos · Cabeza = baja · Radar | Todos | Sí / No |

El récord de un jugador se guarda por variante y solo cuenta con los ajustes de la variante sin tocar.

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

## Enemigos

| Enemigo | Desde | Comportamiento |
|---|---|---|
| Skitter | Oleada 1 | Bípedo rápido con pistola de plasma |
| Warden | Oleada 2 | Blindado con escudo de energía, ráfagas de 3 |
| Drone | Oleada 2 | Vuela en grupo, te rodea y dispara |
| Ravager | Oleada 3 | Bestia cuerpo a cuerpo que carga |
| Stalker | Oleada 4 | Camuflado e invisible en el radar; salta sobre ti y se revela al atacar o recibir daño |
| Bombardier | Oleada 6 | Artillería: morteros en parábola con daño en área, desde lejos |
| **WARLORD** (jefe) | Oleadas 5, 15, 25… | Abanico de plasma, salto con onda expansiva, embestida con aviso, refuerzos al 50 % y 25 %, furia en la 2.ª fase |
| **OVERSEER** (jefe) | Oleadas 10, 20… | Vuela; lluvia de orbes explosivos, bombardeo de morteros, picados con onda expansiva y drones de refuerzo |

**Dificultad:** cada oleada trae más enemigos, con +12 % de vida y +5 % de daño, aparecen más rápido y hay más a la vez (hasta 26). En cooperativo escala además con el número de jugadores. Los jefes son más duros cada vez que vuelven y sueltan munición y granadas al morir.

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

- **Armas iniciales «a elegir»** (un jugador y DM por defecto): eliges tus dos armas en **ARMAS** (menú, pantalla de un jugador o lobby).
- **Cooperativo** (y cualquier partida de oleadas con **cajas misteriosas** activadas): por defecto empiezas con carabina y pistola. Ganas **créditos** con cada baja y cada oleada superada. Las **cajas misteriosas** (una en la plataforma central y otra en el campo, marcadas con un haz de luz) cuestan 500 créditos: pulsa **E**, la caja se abre, van pasando armas y sale una al azar, que coges con **E** antes de 8 s. Sustituye al arma que llevas en la mano. Si ya la tenías, te llena la munición. Las mejores salen en rondas altas: francotirador y agujas desde la 3, cañón de arco desde la 5.

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
src/aliens.js       Modelos y animación de los alienígenas (quitina, escudos de energía)
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
