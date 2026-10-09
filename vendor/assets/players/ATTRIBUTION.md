# Skins del jugador — procedencia y licencias

Todos los modelos de esta carpeta proceden de **OpenGameArt.org** y están publicados bajo
**CC0 1.0 (dominio público)**: https://creativecommons.org/publicdomain/zero/1.0/
La licencia se comprobó en la página de cada recurso (campo «License(s): CC0») el 2026-10-09.
CC0 no exige atribución; se mantiene como cortesía y trazabilidad.

| Archivos | Recurso original | Autor (OpenGameArt) | Página | Skins del juego |
|---|---|---|---|---|
| `scifi.glb`, `scifi_federal.jpg`, `scifi_military.jpg`, `scifi_evil.jpg`, `scifi_*_glow.png`, `scifi_normal.jpg` | Sci-fi Soldier | Irondust | https://opengameart.org/content/sci-fi-soldier | FEDERAL, MILITAR, RENEGADO (3 cascos: Head1/2/3) |
| `exo.glb` | ExoTrooper Low Poly | nublet | https://opengameart.org/content/exotrooper-low-poly | EXOTROOPER |
| `commando.glb`, `commando_f.glb`, `commando.png` | Low Poly Soldier with Weapons | Casti_131 | https://opengameart.org/content/low-poly-soldier-with-weapons | COMANDO, COMANDO F |

## Cambios respecto a los originales

Convertidos a glTF binario con Blender 4.0.2 (pose de reposo, sin animaciones):
- `scifi`: cuerpo y los tres cascos (`Body`, `Head1-3`) con su esqueleto; se quitó el cañón suelto. Las texturas
  de Unity (TGA 2048 px) se pasaron a JPG/PNG de 1024 px (albedo, normales y emisión).
- `exo`: cuerpo, casco y esqueleto; sin materiales (el juego lo pinta con los colores de la armadura).
- `commando` / `commando_f`: malla del soldado y su esqueleto (sin las armas del paquete) + su paleta de textura.

En el juego (`src/playermodels.js`) estos modelos copian la pose del soldado procedural (IK de brazos y piernas).

## Buscados y no usados

- «Male Sci-Fi Character» y «Elite Soldier» (CC-BY): sin casco o de estilo militar actual.
- «Space Marine» (CC-BY-SA/GPL) y «Golem Marine»: licencias o estilo menos adecuados.
- «Evil Cyborg» (CC0): FBX antiguo que Blender 4 no importa.
- Quaternius «Toon Shooter Game Kit» (CC0): Google Drive bloqueó la descarga por cuota en ese momento.
- No se usó ningún modelo del Jefe Maestro ni de otros personajes con derechos (los «fan models» no tienen licencia libre).
