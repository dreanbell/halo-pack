# Modelos de monstruos — procedencia y licencias

Todos los modelos de esta carpeta proceden de **OpenGameArt.org** y están publicados bajo
**CC0 1.0 (dominio público)**: https://creativecommons.org/publicdomain/zero/1.0/
La licencia se comprobó en la página de cada recurso (campo «License(s): CC0») el 2026-10-09.
CC0 no exige atribución; se mantiene igualmente como cortesía y trazabilidad.

Conversión: los originales (.blend / .obj / .fbx / .glb) se exportaron a `.glb` con Blender 4.0.2
(exportador glTF oficial, animaciones incluidas). No se modificó la geometría.

| Archivo | Recurso original | Autor (OpenGameArt) | Página | Formato original | Triángulos | Animaciones |
|---|---|---|---|---|---|---|
| `darsh.glb` | Darsh (Undead Creature) | Eldritch Grim | https://opengameart.org/content/darsh-undead-creature | .glb | 17 818 | Idle |
| `giant-mutant.glb` | Giant Mutant | Eldritch Grim | https://opengameart.org/content/giant-mutant | .glb | 78 704 | Death, Giant Run, idle, Jump Slam, Left Punch, Right Punch |
| `fatty.glb` | Fatty | Drummyfish | https://opengameart.org/content/fatty | .obj (+ texturas) | 22 304 | — |
| `glutton.glb` | Glutton Demon | Teh_Bucket | https://opengameart.org/content/glutton-demon | .blend | 8 556 | glutton_Walk |
| `angler.glb` | 3D Angler Man | DREAM_SEARCH_REPEAT | https://opengameart.org/content/3d-angler-man | .blend | 9 524 | — |
| `alien-bug.glb` | Alien Bug Animated | CDmir | https://opengameart.org/content/alien-bug-animated | .glb | 1 240 | Attack.000, Attack.001, Idle, Run |
| `horror-run.glb` (+ `horror-run_albedo.png`, `horror-run_normal.png`) | 3D Horror Game Monster | HorrorGameMaker.com («City Building Game Art») | https://opengameart.org/content/3d-horror-game-monster | .fbx (Run.fbx) + texturas Unity | 3 584 | Run |

Notas:
- `horror-run`: las texturas venían aparte (Unity); se reescalaron de 2048 a 1024 px. Su README dice:
  «Credit "HorrorGameMaker.com", this is not mandatory.»
- `glutton.glb`: su material original es de tipo «toon» y no se exporta a glTF; queda sin textura
  (habrá que asignarle material de carne en el juego).
- Descartados: «Octaminator» (las texturas referencian un diseño de un tercero, raymoohawk),
  «Mutant Grunt» (texturas ausentes), «Wolf Mutant» (estilo vóxel), «Forest Monster» y
  «Hydrach» (no encajan / formato .rar/.7z).

Cargador: `vendor/three/addons/` contiene `GLTFLoader.js`, `BufferGeometryUtils.js` y
`SkeletonUtils.js` de three.js r160 (licencia MIT, misma que `vendor/three/LICENSE`).
