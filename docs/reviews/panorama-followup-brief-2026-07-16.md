# Brief Cursor — panorama, pasada puntual de cobertura

**Entorno:** `http://localhost:3001` · cuentas `admin@dim.test`, `govt@dim.test` (Ushuaia/El Calafate/Palermo), `govt-local@dim.test` (SOLO Palermo). Password `Test1234!`.
**Contexto:** la pasada anterior (`2026-07-16-cursor-panorama-surface-qa.md`) cubrió lo grueso; esto cierra SOLO lo que quedó sin ejercitar. No re-recorras todo — enfocate en estos 4 bloques.

## 1. Click en unidad → drawer de detalle (end-to-end)
En admin, con una capa drillable activa (probá cobertura, sintomas, esterilizacion, microchip, ppp), hacé **click en una unidad del mapa** (provincia o departamento). Verificá el drawer:
- ¿Abre con el nombre de la unidad + un **sparkline** + eventos recientes?
- ¿Las 4 capas que antes drillaban vacío (sintomas/esterilizacion/microchip/ppp) ahora muestran datos en el drawer, no vacío?
- ¿El link de "ver detalle / ir a la cola/caso" del drawer navega bien?
- ¿Hover sobre una unidad muestra el popup con el valor correcto antes de clickear?

## 2. Exportar — descargas reales (click-through)
En admin, con una vista activa, probá CADA export de verdad (no solo abrir el menú):
- **CSV**: ¿descarga? ¿el contenido respeta k-anon (celdas suprimidas dicen "Protegido", nunca un número)? ¿las columnas coinciden con Registros?
- **PNG**: ¿descarga la imagen del mapa? ¿tiene el pie de método/provenance?
- **Informe imprimible**: ¿abre/descarga? ¿los KPIs del informe coinciden con los chips en pantalla (no valores viejos)?
- **Copiar vista / Vistas guardadas**: ¿el link copiado reabre la MISMA vista (capas/preset/período/scope/zoom)?

## 3. govt-local (una sola localidad — Palermo)
Logueá como `govt-local@dim.test`. Es el caso de UN barrio:
- ¿El default cae en Palermo (no nacional)?
- ¿El chip de jurisdicción dice bien "Palermo" (una sola)?
- ¿El mapa/KPIs comunican ese alcance chiquito, o queda casi vacío/confuso?
- ¿`?province=AR-X` (ajena) rebota igual que en `govt@`?

## 4. Verificar los "mapas vacíos" (¿supresión honesta o gap?)
La pasada anterior vio 3 mapas casi blancos — confirmá si es k-anon legítimo o un bug de proyección:
- **Índice territorial** (admin, nacional): ¿las 24 provincias se colorean 0-100, o el mapa queda blanco? Si blanco, ¿es porque las provincias caen bajo k<5 (supresión) o no pinta?
- **Brotes activos @ CABA**: Registros mostró 0 con KPIs con señal — ¿es vacío real, un filtro, o desacople proyección?
- **Control poblacional / esterilización como govt** (3 provincias): ¿las provincias del alcance se colorean, o el mapa no comunica el scope?

## Formato
BLOQUEA/ALTO/MEDIO/BAJO/IDEA · pantalla · qué esperabas · qué viste. Para los mapas vacíos, decí explícitamente si concluís "supresión honesta" o "proyección rota".
