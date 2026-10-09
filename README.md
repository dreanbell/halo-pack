# Ringfall — demo

Shooter sci-fi en primera persona, en el navegador, inspirado en los shooters de arena clásicos. Es un proyecto fan **original**: todos los modelos, texturas y sonidos se generan por código. No usa assets, nombres ni código de ninguna franquicia comercial.

## Pantalla de inicio

Lo primero que se ve es **tu soldado en 3D** (con su skin y su arma principal) sobre un pedestal holográfico en el
mapa elegido, que hace de fondo. **Arrastra** para girarlo y usa la **rueda** (o **pellizca** en móvil) para acercarte.
A la izquierda, las pestañas; a la derecha, su panel; abajo, **▶ JUGAR** y **MULTIJUGADOR**:

| Pestaña | Contenido |
|---|---|
| JUGAR | Mapa actual y tus dos armas |
| MODOS | Un jugador (oleadas y variantes), cooperativo, todos contra todos |
| MAPAS | Los 4 mapas; al elegir uno, el fondo cambia al momento |
| ARMAS | Tu equipo (miniaturas) y acceso al menú de armas con vista 3D |
| PERSONALIZAR | Modelo, colores, visor, casco y patrón: el soldado grande cambia en vivo |
| TIENDA | Modelos, cascos y patrones que se desbloquean con créditos ◈ |
| AJUSTES | Controles, gráficos, audio, interfaz, accesibilidad y ayuda (también desde la pausa) |

**Créditos ◈ y desbloqueos** (`src/client/wallet.js`, guardados en el navegador): empiezas con ◈ 300 y ganas al
terminar cada partida (o al salir a mitad, por lo conseguido):

| Modo | Créditos |
|---|---|
| Un jugador / cooperativo | 10 (más de 20 s jugados) + 4 por baja + 20 por oleada superada + puntuación ÷ 40 |
| Todos contra todos | 10 + 12 por baja + 100 por ganar |

| Artículo | Precio |
|---|---|
| Modelos | Clásico gratis · Federal y Militar 400 · Comando y Comando F 500 · Renegado 600 · Mono, Pato y Rana 750 · Exotrooper 900 · Dados 1 000 · Chica gancho 1 200 |
| Cascos | Centinela gratis · Halcón y Bastión 300 |
| Patrones | Liso gratis · Camuflaje 150 · Rayas 200 · Hexágonos 250 |

Colores y visor siempre gratis. En PERSONALIZAR lo bloqueado lleva candado y precio; al tocarlo te lleva a la tienda.
Lo que ya llevabas equipado al estrenar el monedero queda desbloqueado.

**Cuentas** (pestaña CUENTA, `src/client/account.js` + `server/accounts.js`): usuario y contraseña para guardar
créditos, desbloqueos, armadura y armas en el servidor (no se pierden al borrar el navegador y valen en cualquier
dispositivo). El servidor manda: valida cada compra con sus precios y calcula los créditos de cada partida
(`src/shared/shop.js`) con topes (◈ 1 500 por partida, una cada 25 s, ◈ 6 000 por hora). Contraseñas con scrypt y
sal; sesiones de 30 días (se guarda el hash del token); límite de intentos por IP. Sin cuenta se juega como
**invitado** (monedero en el navegador). Al crear la cuenta se traslada el progreso de invitado (hasta ◈ 2 000 y
◈ 3 000 en desbloqueos).

- Con `npm start` (servidor del juego) las cuentas funcionan solas. Datos en `data/accounts.json`
  (`RINGFALL_DATA=/otra/carpeta` para cambiarla; nunca se sirve como archivo).
- Para la versión de GitHub Pages hace falta el servidor publicado en internet (p. ej. con el `Dockerfile` en
  Render, Fly.io o Railway, con un volumen en `/data`). Después: o se escribe su dirección en CUENTA → SERVIDOR DE
  CUENTAS, o se abre el juego con `?api=https://tu-servidor`, o se fija en `DEFAULT_API` (`src/client/account.js`).

El avatar usa la escena y la cámara del juego (sin renderer extra) y se retira al empezar la partida (`src/client/home.js`).

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
| Tiroteo | Un jugador · Coop | 7 vidas compartidas: al caer gastas una y reapareces a los 5 s. +1 vida por oleada superada. Sin vidas, quien cae no vuelve (en coop, vuelve si el equipo gana una). Dificultad difícil, sin suministros, armas a elegir. |
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

**Modo espectador:** al caer, la cámara sigue en tercera persona a un jugador vivo (en todos contra todos, a quien te eliminó, hasta reaparecer). Clic izq./D: siguiente · Clic der./A: anterior · ratón: girar · rueda: distancia · R: centrar.

### Sin internet: servidor LAN (opcional)
Si la red no tiene salida a internet, un equipo con **Node.js 18+** puede servir el juego:

```bash
git clone https://github.com/dreanbell/halo-pack.git
cd halo-pack
node server.js            # o npm start · puerto 8080; otro: node server.js 9000
```

La consola muestra la dirección de red local (p. ej. `http://192.168.1.20:8080`). Los demás la abren en el navegador → **MULTIJUGADOR LAN** → **SERVIDOR LAN DE ESTE EQUIPO**. Si no conectan, permite "Node.js" en el firewall para redes privadas o abre el puerto TCP 8080.

### Móvil y tablet
Se juega en horizontal con controles táctiles: mitad izquierda = joystick (al tope hacia delante, esprintas), mitad derecha = apuntar, y botones de disparo, salto, agacharse, recarga, cambio de arma, granada, golpe, mira y abrir suministros. Entra a pantalla completa si el navegador lo permite. Para forzarlos o quitarlos: `?touch=1` / `?touch=0`.

### Un jugador en local
No necesita build ni dependencias: three.js y PeerJS van incluidos en `vendor/`.

```bash
python3 -m http.server 8000   # o: node server.js 8000 → http://localhost:8000
```

## Mapas

Se eligen en el menú (un jugador) o en la sala (solo el anfitrión; los demás lo ven cambiar al momento). Diseño original inspirado en mundos-anillo y ruinas de una civilización antigua.

| Mapa | Ambiente | Distribución |
|---|---|---|
| **Valle del Anillo** | Pradera, mediodía, el anillo cruzando el cielo | Plataforma central con escaleras, búnkeres en las esquinas, monolitos, arcos |
| **Ciudadela Glacial** | Nieve, atardecer, cordillera y nevada | Aguja central con muretes, terrazas elevadas a los lados, cristales de hielo |
| **Cañón Ámbar** | Desierto, acantilados escalonados, tormenta de polvo | Crucero alienígena partido (con huecos y una escalera al casco), mesetas, agujas violetas |
| **Plataforma Cenit** | Órbita nocturna sobre un gigante gaseoso | Estrado central, 4 torres con **ascensores gravitatorios**, barrera de energía |

Todo es procedural (sin imágenes externas): paneles de aleación con vetas luminosas y mapas de normales, terreno con relieve y color por altura y pendiente, cielo con sol, estrellas y nebulosa, nubes, hierba, nieve/polvo/motas y luces puntuales.

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

**Aspecto:** criaturas de terror orgánico (carne expuesta, bocas verticales con dientes, varios ojos, tentáculos, tumores, placas de hueso). Usan modelos 3D **CC0** de OpenGameArt (`vendor/assets/monsters/`, procedencia en `ATTRIBUTION.md`) con material de carne y añadidos procedurales anclados a sus huesos (`src/monsters.js`). Solo cambia la apariencia: vida, daño, IA, hitboxes y red son los mismos; la hitbox de la cabeza sigue a la cabeza del modelo.

| Enemigo | Criatura |
|---|---|
| Ravager | **Mutante de Carne**: encorvado, cabeza hundida en el pecho, boca vertical con lengua colgante, 6 ojos, tentáculos en espalda y cuello, brazo derecho hipertrofiado |
| Warden | Soldado parasitado: restos de armadura cubiertos de tejido y tumores |
| Skitter | Corredor despellejado con mandíbula abierta y espinas |
| Stalker | Alargado y delgado, cresta de hueso, racimo de ojos y tentáculos sobre los hombros |
| Bombardier | Masa jorobada con sacos de ácido y una cabeza-boca sobre un tallo |
| Drone / Overseer | Organismos flotantes con ojos y tentáculos (el Overseer, enorme y con corona de ojos) |
| Warlord | El Mutante de Carne gigante, acorazado de hueso y con corona de tentáculos |

**Dificultad:** cada oleada trae más enemigos, con +12 % de vida y +5 % de daño, aparecen más rápido y hay más a la vez (hasta 26). En cooperativo escala además con el número de jugadores. Los jefes son más duros cada vez que vuelven y sueltan munición y granadas al morir.

## Armas

| Arma | Tipo | Daño | Notas |
|---|---|---|---|
| AR-9 Carbine | Fusil automático | 10 | Todoterreno, cabeza ×2 |
| Ion Sidearm | Pistola de calor | 20 | ×2 contra escudos, cabeza ×3 |
| Viper SMG | Subfusil | 6,5 | Cadencia altísima, poco alcance, cabeza ×1,5 |
| Breacher-12 | Escopeta | 13 × 9 | Perdigones, recarga cartucho a cartucho |
| DMR-3 Marksman | Tirador | 17 | Ráfaga de 3, mira ×2, cabeza ×2,5 |
| Longshot SR-2 | Francotirador | 120 | Mira ×5. Un tiro al cuerpo mata a los básicos (Skitter, Dron); **a la cabeza mata a cualquier enemigo que no sea jefe**, aunque tenga escudo (a los jefes, ×2,5). **Multijugador:** cuerpo = mitad de la vida total del rival (escudo + salud), cabeza = baja |
| Plasma Lance 👽 | Alienígena, calor | 11 | ×1,8 contra escudos |
| Needle Swarm 👽 | Alienígena | 12 | Agujas que persiguen al objetivo |
| Arc Cannon 👽 | Alienígena | 140 | Proyectil explosivo con daño en área |
| VX-7 Battle Rifle 🆕 | Fusil de batalla automático | 14 | Más daño por bala que la carabina, menos cadencia; cabeza ×2 |
| Kodiak .50 Magnum 🆕 | Revólver | 45 | 6 balas, cabeza ×2,5 |
| Howler-2 Sawed-off 🆕 | Escopeta recortada | 12 × 12 | 2 cañones, devastadora a quemarropa |
| Rad Carbine 👽🆕 | Alienígena, semiautomática | 22 | Visor ×2, cabeza ×2,5, ×1,2 contra escudos |

**Modelos 3D:** todas las armas usan modelos CC0 descargados (Quaternius «50+ LowPoly Guns» y Kenney «Blaster Kit»,
ver `vendor/assets/guns/ATTRIBUTION.md`), vestidos con el pack de texturas del juego y animados por el juego
(retroceso, cargador que cae al recargar, inercia). Si un modelo no carga se usa el procedural de respaldo.
Las nuevas salen en los suministros del cielo (fusil de batalla y revólver desde la oleada 1; recortada y carabina desde la 3).

- **Armas iniciales «a elegir»** (un jugador y DM por defecto): eliges tus dos armas en **ARMAS** (menú, pantalla de un jugador o lobby). El menú tiene vista previa 3D giratoria de cada arma (arrastra para girar, rueda para acercar), miniaturas, ficha técnica (daño, cadencia, modo, munición, recarga, alcance, mira, calibre, multiplicadores, peso) y barras comparativas.
- **Apuntar:** mantén **clic derecho** para llevar el arma a la cara y alinear su mira (punto rojo, holográfica, miras de tritio, anillo fantasma o retícula alienígena). Al apuntar: menos dispersión, algo de aumento, movimiento más lento. El tiempo para apuntar depende del peso del arma. DMR y francotirador pasan a **visor** con retícula propia (BDC, mil-dots) y **telémetro**.
- **Detalle de las armas:** modelos procedurales de 30–60 piezas (raíles, guardamanos con ranuras, ventana de expulsión, guardamonte, miras con lente y retícula luminosa, rótulos grabados) con un pack de texturas PBR generado por código: acero pavonado cepillado con arañazos, polímero granulado, cerakote con desconchones, nogal veteado, goma moleteada, fibra de carbono y caparazón alienígena iridiscente con venas luminosas. Las piezas estáticas se unen por material (pocas llamadas de dibujo).
- **Animaciones:** el cargador cae y entra al recargar, corredera de la escopeta, cerrojo manual del francotirador, cerrojo que retrocede al disparar, inercia del arma al mover el ratón, cristales de la Needle Swarm que muestran la carga y núcleos de energía que laten. Fogonazo con estrella y llamas laterales, casquillos (latón o cartucho rojo) que rebotan y suenan.
- **Retícula de cadera** distinta para cada arma; se abre con la dispersión y se pone roja sobre un enemigo.
- **Suministros del cielo** (un jugador y cooperativo; regla «SUMINISTROS DEL CIELO», activada por defecto): a los 25 s y luego cada 45 s (máximo 2 a la vez) cae una **maleta de armas en paracaídas** en un punto despejado al azar. Antes de que aterrice, una **bengala de humo naranja** y un haz de luz marcan el sitio; al tocar suelo levanta polvo, el paracaídas se desploma y el haz pasa a verde. **No cuesta nada**: pulsa **E** junto a ella, la tapa se abre, van pasando armas y sale una al azar, que coges con **E** (10 s). Sustituye al arma que llevas en la mano; si ya la tenías, te llena la munición. Las mejores salen en oleadas altas (francotirador, agujas, recortada y carabina desde la 3; cañón de arco desde la 5). Si nadie la abre en 90 s, desaparece. En cooperativo las decide el anfitrión y la abre el primero que llega. Modelo de la maleta: «crate-wide» del Blaster Kit de Kenney (CC0, `vendor/assets/drops/`).

## Armería (skins)

Desde el menú (**ARMERÍA · PERSONALIZAR SOLDADO**) o desde el lobby (**ARMERÍA**). Hay vista previa 3D giratoria.

| Opción | Variantes |
|---|---|
| **Modelo** | Clásico (procedural) · **Federal · Militar · Renegado** (armadura de asalto con texturas PBR y visor luminoso) · ExoTrooper (servoarmadura) · Comando · Comando F · **Mono · Pato · Rana · Chica gancho · Dado par · Dado impar** (skins graciosas) |
| Color principal | 10 |
| Color secundario | 10 |
| Visor | 5 (reflectante, con brillo) |
| Casco | Centinela · Halcón · Bastión |
| Patrón | Liso · Camuflaje · Rayas · Hexágonos (con juntas, remaches y desgaste) |

La armadura se guarda en el navegador y se envía a los demás jugadores; la verán en la siguiente partida. En primera persona se ven tus brazos con la misma armadura; con una skin 3D, los brazos y manos de ese modelo (alas en el pato).

Los modelos 3D son **CC0** de OpenGameArt (`vendor/assets/players/`, procedencia en `ATTRIBUTION.md`). No copian la pose de ninguna animación propia: siguen al esqueleto procedural (`src/playermodels.js`) con IK en brazos y piernas, así que corren, se agachan, se deslizan, apuntan con el arma y caen igual que el soldado clásico, con las mismas hitboxes. El casco y el color del visor también cambian en los modelos Federal/Militar/Renegado; colores y patrón pintan al ExoTrooper. No se incluye el Jefe Maestro ni ningún personaje con derechos: los modelos «fan» no tienen licencia libre.

El modelo del soldado es procedural (unas 40 piezas biseladas con materiales PBR y reflejos del cielo) y tiene esqueleto animado: caminar, correr, agacharse, saltar, apuntar arriba y abajo con las manos en el arma (IK) y caída al morir.

## Sensación de movimiento

Todo con muelles amortiguados (`src/client/feel.js`): se pasan un poco y vuelven, como en los shooters AAA.

| | Arma en mano | Cámara |
|---|---|---|
| Andar / correr | Balanceo en ocho sincronizado con las pisadas (con sonido); al esprintar, arma baja y cruzada | Cabeceo vertical y leve giro por paso |
| Lateral | Se inclina hacia el lado del movimiento | Giro suave (~1°) |
| Disparo | Salta atrás y arriba con giro aleatorio; más fuerte en escopeta y francotirador | Patada corta que vuelve sola |
| Saltar / aterrizar | Se queda atrás al subir, sube al caer, golpe y rebote al tocar suelo | Se hunde y rebota |
| Ratón | Inercia con rebote | — |
| Reposo / agachado | Respiración; arma ladeada al agacharse | — |

Apuntando con la mira, todo se reduce. Es solo visual: las balas salen de la cabeza (`Arsenal.aimRay`), no de la
cámara sacudida, así que la puntería y el retroceso real no cambian. La retícula se abre al disparar y esprintar.

## Ajustes

Pestaña **AJUSTES** del inicio o botón **AJUSTES** en la pausa. Se aplican al momento, se guardan en el navegador
(`ringfall.settings`) y no cambian la jugabilidad (daño, hitboxes y puntería son iguales). Doble clic en un deslizador =
valor por defecto; **RESTABLECER** (dos pulsaciones) vuelve a todo lo de fábrica.

| Grupo | Opciones |
|---|---|
| Controles | Sensibilidad del ratón (×0,1–3) · sensibilidad al apuntar (×0,2–1,5) · sensibilidad táctil (móvil) · invertir eje Y · apuntar MANTENER/ALTERNAR · recarga automática |
| Gráficos | Calidad AUTO/ALTA/MEDIA/BAJA (solo desde el menú) · campo de visión 65–105° · escala de resolución 50–100 % · límite de FPS 30/60/sin límite · contador de FPS · brillo |
| Audio | Volumen general y por canal: armas, impactos y explosiones, enemigos, jugador, interfaz · silenciar en segundo plano |
| Interfaz | Tamaño del HUD · color, tamaño y punto central de la retícula · marcador de impacto · radar |
| Accesibilidad | Balanceo de cámara y arma · sacudida de pantalla · destellos de explosiones (0–100 %) |

El arma en primera persona tiene su propio campo de visión: con más FOV se ve igual que a 78°. Con límite de FPS, la
resolución dinámica mide respecto a ese límite (a 30 FPS no baja la resolución).

## Efectos de disparo y explosiones

`src/client/effects.js`: partículas por GPU (dos mallas instanciadas, aditiva y normal: 2 llamadas de dibujo para
todos los efectos) y marcas agrupadas (agujeros de bala y quemaduras, 2 llamadas más).

| Efecto | Qué se ve |
|---|---|
| Trazadoras | Estela que viaja del cañón al impacto con perspectiva real; balas finas y rápidas, energía gruesa y lenta, francotirador con estela de vapor |
| Fogonazo | Destello, chispas hacia delante y humo del cañón (las de energía, resplandor de su color) |
| Impacto en superficie | Metal: chispas que rebotan + humo. Tierra, roca, nieve: polvo del color del suelo + esquirlas. Siempre agujero de bala |
| Impacto en enemigo | Sin escudo: niebla de sangre y gotas en la dirección del disparo (más en la cabeza). Con escudo: chispazo de energía |
| Muerte de criatura | Estallido de sangre y vísceras |
| Granada | Estela de humo y piloto parpadeante; explosión con destello, bola de fuego, metralla que rebota, escombros, polvo a ras de suelo, onda, columna de humo (~3 s), quemadura y luz |
| Energía (cañón de arco, plasma enemigo) | Explosión del color del arma, sin humo negro; estela luminosa en vuelo |
| Golpe de jefe | Onda, polvo en círculo y escombros |

La potencia visual depende del daño del arma (subfusil < fusil < francotirador). La cantidad de partículas se reduce
en MEDIA (70 %) y BAJA (45 %). Solo visual: daño, alcance y colisiones no cambian.

## Controles

| Tecla | Acción |
|---|---|
| WASD / flechas | Moverse |
| Ratón | Apuntar · clic izq. dispara |
| Shift | Esprintar |
| Espacio | Saltar |
| C / Ctrl | Agacharse (menos dispersión). Mientras esprintas: deslizarse (salta durante el deslizamiento para conservar la inercia) |
| R | Recargar |
| Q / 1 / 2 / rueda | Cambiar arma |
| Clic der. (mantener o alternar) | Apuntar con la mira del arma · visor en DMR y francotirador |
| G | Granada |
| E | Abrir suministros caídos del cielo · coger el arma |
| F | Golpe cuerpo a cuerpo (por la espalda = eliminación) |
| Tab | Marcador (multijugador) |
| Círculo luminoso | Ascensor gravitatorio (Plataforma Cenit): te lanza a lo alto de la torre |
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
| Latido | Ping cada 2 s. Tras 9 s sin mensajes, la conexión se da por perdida (no cuenta el tiempo en que la pestaña estuvo congelada, p. ej. cargando un mapa). |
| Mapa | Lo elige el anfitrión; viaja en el mensaje de la sala y en el de inicio de partida. |
| Jugadores | Cada cliente es autoridad de su propio movimiento (20 Hz) y de sus disparos. Los demás se ven interpolados con 100 ms de retardo. |
| Cooperativo | El anfitrión simula enemigos, oleadas y recogibles, y envía instantáneas a 12 Hz. Los clientes le mandan el daño que hacen. En el servidor LAN, si el anfitrión se va, otro jugador toma el relevo. |
| Todos contra todos | El tirador envía el impacto a la víctima, que lo aplica sobre su propio escudo. El servidor lleva la cuenta de bajas. |

Pensado para jugar entre amigos: no hay anti-trampas. Para usar un servidor de emparejamiento propio: `?peerhost=equipo&peerport=9000&peerpath=/`.

## Estructura

```
index.html, styles.css   Entrada web: HUD, menús y estilos (raíz, la sirve GitHub Pages o el servidor LAN)

src/shared/              Lógica común del navegador y del servidor Node (sin dependencias de navegador)
  room.js                Sala multijugador: lobby, modo, mapa, reglas y marcador (P2P en el anfitrión y LAN en server/)
  rules.js               Variantes de partida y reglas configurables
  skins.js               Opciones de armadura/modelo y validación de lo que llega por red
  mapinfo.js             Catálogo de mapas

src/client/              El juego (navegador)
  main.js                Arranque, estados, lobby, mensajes de red y bucle
  net.js                 Red: anfitrión/invitado P2P (WebRTC) y cliente LAN (WebSocket)
  config.js              Tuning: armas, enemigos, oleadas
  player.js · weapons.js Movimiento FPS, escudo/salud · armas, granadas, cuerpo a cuerpo y viewmodels
  enemies.js · nav.js    IA enemiga, proyectiles, recogibles, oleadas · rejilla y campo de flujo
  aliens.js · monsters.js Rig de enemigos (hitboxes) · criaturas de carne (modelos GLB y añadidos)
  avatar.js · playermodels.js · remote.js   Soldado procedural · skins 3D con IK · otros jugadores
  armory.js · loadout.js · setup.js · gunview.js · guns.js   Armería, menú de armas, reglas, armas
  world.js · maps.js     Kit de construcción procedural y colisiones · los mapas
  quality.js             Calidad gráfica (AUTO/ALTA/MEDIA/BAJA) y resolución dinámica por FPS
  settings.js · settingsui.js   Ajustes del jugador (esquema, guardado) y su pantalla
  hud.js · effects.js · audio.js · spectator.js · touch.js · drop.js

server/                  Servidor LAN opcional (Node ≥ 18, sin dependencias)
  index.js               Arranque, sala única, latido y direcciones de red
  static.js              Archivos estáticos con gzip en memoria y revalidación ETag (304)
  ws.js                  WebSocket mínimo (RFC 6455)
server.js                Atajo: `node server.js` arranca server/index.js

scripts/check.js         Validación (`npm run check`): sintaxis de todo y carga de src/shared en Node
vendor/                  three.js r160 y PeerJS 1.5.5 (MIT) · assets/ con modelos CC0 (ver sus ATTRIBUTION.md)
```

**Rendimiento de carga:** al abrir el juego solo se descarga lo necesario para el menú; los monstruos se cargan en
segundo plano (o al empezar partida) y cada skin 3D solo cuando alguien la lleva. El servidor LAN comprime con gzip
(three.js pasa de 655 KB a 164 KB) y responde 304 a lo que no ha cambiado.

**Rendimiento gráfico (móvil):** el menú tiene un selector **GRÁFICOS** (AUTO · ALTA · MEDIA · BAJA, se guarda en el
navegador; también `?q=baja` en la URL). AUTO elige ALTA en escritorio y MEDIA o BAJA en móvil según núcleos y memoria.

| | ALTA | MEDIA | BAJA |
|---|---|---|---|
| Densidad de píxeles máx. | 2 | 1,25 | 1 |
| Sombras | 2048 px, suaves | 1024 px, a 30 Hz | no |
| Antialias | sí | no | no |
| Hierba · partículas · árboles · nubes | 100 % | 45 · 45 · 70 · 60 % | 0 · 20 · 45 · 35 % |
| Luces puntuales · texturas · mapas de normales | 6 · 512 px · sí | 3 · 256 px · sí | 1 · 256 px · no |
| Esqueletos de monstruos | 60 Hz | 60 Hz | 30 Hz |

En todos los niveles: las piezas estáticas del mapa se fusionan por material (valle: 454 → 77 llamadas de dibujo),
la resolución baja sola si los FPS caen de ~45 (y se recupera si sobran), los shaders se compilan al cargar el mapa,
el radar se dibuja a 20 Hz y en móvil no hay desenfoques CSS sobre el lienzo. La calidad solo cambia lo visual:
colisiones, rocas, hitboxes y reglas son idénticas en todos los niveles (también entre jugadores con niveles distintos).

**Sin tirones al disparar ni al aparecer enemigos:** al cargar el mapa y al empezar partida se compilan los shaders
de todo (también lo que queda fuera de cámara) y se dibuja una vez, diminuto, un ejemplar de cada enemigo, fogonazo,
casquillo y granada (se conservan para que three.js no borre sus shaders). Los rayos contra el suelo son analíticos
(antes recorrían 8 192 triángulos por bala), la retícula consulta a 20 Hz, la caja y los añadidos fusionados de cada
monstruo se calculan una vez por tipo, y la resolución dinámica solo cambia con caídas sostenidas.

Para depurar, `window.__ringfall` expone `ctx`, `newGame()` y `tick(dt)`, que avanza la simulación sin renderizar.
