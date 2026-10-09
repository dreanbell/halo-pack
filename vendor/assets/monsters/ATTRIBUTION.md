# Modelos de monstruos — procedencia y licencias

Todos los modelos de esta carpeta proceden de **OpenGameArt.org** y están publicados bajo
**CC0 1.0 (dominio público)**: https://creativecommons.org/publicdomain/zero/1.0/
La licencia se comprobó en la página de cada recurso (campo «License(s): CC0») el 2026-10-09.
CC0 no exige atribución; se mantiene igualmente como cortesía y trazabilidad.

| Archivo | Recurso original | Autor (OpenGameArt) | Página | Formato original | Usado para |
|---|---|---|---|---|---|
| `giant-mutant.glb` | Giant Mutant | Eldritch Grim | https://opengameart.org/content/giant-mutant | .glb (78 704 triángulos; animaciones Death, Giant Run, idle, Jump Slam, Left/Right Punch) | Ravager («Mutante de Carne») y Warlord |
| `horror-run.glb` | 3D Horror Game Monster | HorrorGameMaker.com (publicado como «City Building Game Art») | https://opengameart.org/content/3d-horror-game-monster | .fbx (Run.fbx) + texturas Unity aparte | Warden, Skitter y Stalker |
| `darsh.glb` | Darsh (Undead Creature) | Eldritch Grim | https://opengameart.org/content/darsh-undead-creature | .glb (animación Idle) | Bombardier |
| `angler.glb` | 3D Angler Man | DREAM_SEARCH_REPEAT | https://opengameart.org/content/3d-angler-man | .blend (sin animación) | Drone y Overseer |

## Cambios respecto a los originales

Convertidos con Blender 4.0.2 (exportador glTF oficial):
- Se eliminaron objetos auxiliares (esferas de forma de hueso, luces, armaduras/curvas de control sobrantes).
- `giant-mutant`: geometría reducida al 25 % aprox. (Decimate, ~19 700 triángulos).
- `darsh`: geometría reducida al 50 % (~8 900 triángulos).
- `angler`: geometría reducida al 70 % (~6 700 triángulos).
- `horror-run`: solo la armadura del personaje y su animación Run; texturas (albedo y normales) incrustadas
  y reescaladas a 1024 px. Su README dice: «Credit "HorrorGameMaker.com", this is not mandatory.»

En el juego (`src/monsters.js`) se les aplica un material de carne, animación procedural y añadidos
geométricos propios (boca, dientes, ojos, tentáculos, tumores, hueso). Esos añadidos son originales de este proyecto.

## Descartados durante la búsqueda

«Alien Bug Animated», «Glutton Demon» y «Fatty» (también CC0) no encajaban con las hitboxes o con su animación;
«Octaminator» se descartó porque sus texturas referencian el diseño de un tercero (raymoohawk).

## Código de terceros

`vendor/three/addons/` contiene `GLTFLoader.js`, `BufferGeometryUtils.js` y `SkeletonUtils.js` de three.js r160
(paquete npm `three@0.160.0`), licencia MIT, la misma que `vendor/three/LICENSE`.
