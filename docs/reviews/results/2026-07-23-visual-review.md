# Visual review en vivo — 2026-07-23

Reviewer fresco (screenshots reales sobre :3000, cuentas seed govt@/admin@, 38 capturas
1440px + 390px + 17 tall). PNGs: `~/.claude/jobs/6d383674/tmp/visual-review/`.
Veredicto global: **6.5/10** — sistema de diseño real y disciplinado; lo frena el estado
de los mapas bajo supresión k-anon, los charts vacíos que parecen fallas, y mobile.

Verificado que los fixes recientes SE VEN: sin flechas verdes en muertes/mordeduras,
caption "filtro activo" presente y legible, headers sin apilamiento de 3+ líneas.
NO verificable con seed actual: leyenda de burbujas graduadas (todo k<5 — nunca renderiza).

## Confirmados (ranked, evidencia en PNG)

| # | Hallazgo | Pantalla |
|---|---|---|
| 1 | Mapas Panorama/Pérdidas 100% grises bajo k-anon: cero información, tooltip flotante sin anclar; falta estado in-map "detalle protegido — N en el agregado" | panorama, perdidas |
| 2 | Leyenda Panorama duplica el título de capa ("Denuncias de bienestar • Denuncias de bienestar") | panorama |
| 3 | Leyenda vigilancia con buckets degenerados ("4–5, 5–5, 5–6, 6–6") con dominio 4→6 | vigilancia |
| 4 | Charts vacíos renderizan ejes+leyenda sin mensaje (Causas por mes en blanco; "Altas nuevas" un punto solo en un vacío 0–1000) | mortalidad, padron, analytics |
| 5 | Top bar mobile desborda: chip de scope recortado, search pasado del borde | todas @390 |
| 6 | `resolveBusinessRule` + paréntesis dobles en la alerta principal del home gob | gob home |
| 7 | Chip "173d" se lee como "1730" (peso/tamaño igual entre dígitos y unidad) | casos |
| 8 | FILTROS ocupa todo el primer viewport mobile en 8+ pantallas (cero datos sin scroll) | varias @390 |
| 9 | Con `?province=CABA` el chip dice "Provincia: CABA ×" pero el select muestra "Todas" | perdidas narrowed |
| 10 | "Disposición desconocida 16,7%" en card VERDE (gap de compliance como éxito); causas: "natural"=rojo, "accidente"=verde; "SLA ENO 100%" ámbar con "12 en incumplimiento" al lado | mortalidad, admin programa |
| 11 | Locale: "0.1%"/"1.3" con punto decimal; "PERDIDAS"/"aca" sin tilde; "1 pendientes"; plurales "(es)" | admin adopciones, perdidas, directorio |
| 12 | "sin acciones disponibles desde acá" arriba de un botón rojo "Revocar verificación"; "Volver al dashboard" (inglés) | directorio |
| 13 | Formatos de eje de fecha distintos por pantalla ("sept 2025" / "jul 25 +1 +2 +3" / "jul 26") | analytics, admin programa |
| 14 | Dock: "últimos 1095 días" vs "últimos 3 años"; tabs truncados @390; opción "(en desarrollo)" visible | panorama |
| 15 | KPIs 3-across aplastados @390; botones pisan números en la tabla | operativos @390 |
| 16 | Disclaimer repetido 3× en un viewport ("subestima la natalidad real", incluso en ALTAS NETAS donde no aplica) | padron |
| 17 | Panel de detalle de denuncias con texto suelto en vez de LnEmptyState; chips de severidad inescaneables (3 paletas); columna de acciones desalineada | denuncias |
| 18 | Ranking de reconocimiento liderado por "☆ (sin registrar)" | operativos |

## Sospechados (requieren interacción/datos)
- Línea de esterilización interpola suave sobre 4 períodos suprimidos (¿indistinguible de ceros reales?) — conecta con el backlog "suprimido ≠ cero".
- Caída a 0 en "jul 26" = mes parcial ploteado como final (cliff falso).
- "Flujo de custodia" con Adopciones > Ingresos (funnel que crece; footnote existe, visual contradice).
- Tablas gemelas Mayor/Menor con escalas de barra por columna (51% con barra más larga que 67%).

## Mejores 3 (calidad de referencia)
mortalidad @1440 · admin home @1440 · operativos @1440.

## Incidente operativo
:3000 servía chunks viejos (server pre-rebuild sobrevivió a qa-up, que lo vio corriendo y
no lo reinició). Resuelto matando el proceso + qa-up. Regla: qa-up debería comparar el
BUILD_ID en memoria vs disco, no solo "hay un server en :3000" (candidato a fix del script).
