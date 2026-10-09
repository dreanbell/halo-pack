# Modelos de armas — procedencia y licencias

Todos los modelos de esta carpeta están publicados bajo **CC0 1.0 (dominio público)**:
https://creativecommons.org/publicdomain/zero/1.0/ — licencia comprobada el 2026-10-09 en la página de cada pack y en
el `License.txt` incluido en cada descarga. CC0 no exige atribución; se mantiene como cortesía y trazabilidad.

| Archivo | Arma del juego | Modelo original | Pack | Autor | Página |
|---|---|---|---|---|---|
| `rifle.glb` | AR-9 Carbine | AssaultRifle2_1 | 50+ LowPoly Guns («Ultimate Gun Pack») | Quaternius | https://quaternius.itch.io/50-lowpoly-guns |
| `pistol.glb` | Ion Sidearm | Pistol_6 | ídem | Quaternius | ídem |
| `smg.glb` | Viper SMG | SubmachineGun_2 | ídem | Quaternius | ídem |
| `shotgun.glb` | Breacher-12 | Shotgun_ShortStock | ídem | Quaternius | ídem |
| `dmr.glb` | DMR-3 Marksman | Bullpup_2 | ídem | Quaternius | ídem |
| `sniper.glb` | Longshot SR-2 | SniperRifle_2 | ídem | Quaternius | ídem |
| `battle.glb` | VX-7 Battle Rifle (nueva) | AssaultRifle_2 | ídem | Quaternius | ídem |
| `revolver.glb` | Kodiak .50 Magnum (nueva) | Revolver_3 | ídem | Quaternius | ídem |
| `sawed.glb` | Howler-2 Sawed-off (nueva) | Shotgun_SawedOff | ídem | Quaternius | ídem |
| `plasma.glb` | Plasma Lance | blaster-g | Blaster Kit 2.1 | Kenney | https://kenney.nl/assets/blaster-kit |
| `needler.glb` | Needle Swarm | blaster-p | ídem | Kenney | ídem |
| `arc.glb` | Arc Cannon | blaster-k | ídem | Kenney | ídem |
| `carbine.glb` | Rad Carbine (nueva) | blaster-e | ídem | Kenney | ídem |

## Cambios respecto a los originales

Convertidos con Blender 4.0.2 (FBX/GLB → GLB):
- Normalizados: largo 1, cañón hacia +X, arriba +Y, centrados.
- El **cargador** se separó como pieza propia (`mag`) cuando el modelo lo tenía suelto, para animarlo al recargar.
- Kenney: los colores de su textura de paleta se repartieron en tres materiales (claro, oscuro, acento).
- Sin texturas ni coordenadas UV propias: el juego les aplica su pack de texturas PBR procedural (metal pavonado,
  polímero, madera, caparazón alienígena con venas luminosas) por nombre de material, con proyección triplanar.
- `guns.json`: anclajes calculados en la conversión (boca del cañón, mira, empuñaduras, caja del cargador).

Los modelos no traen animaciones: el juego las añade (retroceso con muelles, cargador que cae y entra, inercia,
balanceo, sprint) además de fogonazo, trazadoras, casquillos e impactos (`src/client/effects.js`).
