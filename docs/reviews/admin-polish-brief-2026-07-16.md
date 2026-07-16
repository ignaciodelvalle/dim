# Brief — pulido UI/UX del portal admin (Cowork + Cursor, en paralelo)

**Entornos:** Cowork → `http://localhost:3000` · Cursor → `http://localhost:3001` (mismo build, base compartida — eviten mutar las MISMAS filas a la vez).
**Cuenta:** `admin@dim.test` / `Test1234!` (alcance universal).
**Objetivo:** pulir UI/UX del portal admin. NO buscar bugs de datos — buscar fricción, inconsistencia visual, copy confuso, y momentos donde el operador duda. Anotar pantalla + qué esperabas + qué viste.

## Recorrido sugerido (el operador que llega a la mañana)
1. **`/admin` (home)** — ¿el cockpit de colas te dice qué atacar primero de un vistazo? ¿Los tonos (rosa/naranja vs neutro) están bien asignados — cálido solo para "decidir ahora"? ¿El mapa del sitio se lee como tablero o como lista? ¿Las Novedades colapsadas molestan o ayudan?
2. **`/admin/cola`** — aprobá/rechazá una matrícula. ¿El feedback es claro (pending → toast → cambio visible)? ¿La cola queda coherente después?
3. **`/admin/outbox`** — abrí un detalle, tocá "Reintentar ahora". ¿Se ve que funcionó? ¿Los "Intentos", el SLA y los UUIDs se leen bien (raw solo bajo "Detalle técnico")?
4. **`/admin/sistema`** — ¿los crons caídos se explican en criollo? ¿el SLA lidera con "vencidas ahora"? ¿las métricas dicen QUÉ miden?
5. **`/admin/observaciones`** — ¿la observación "en curso" está arriba, no enterrada entre cerradas?
6. **`/admin/usuarios` y `/admin/govts`** — ¿se ve email (no UUID)? ¿las cuentas de prueba están filtradas por defecto? ¿el buscador anda?
7. **`/admin/alertas`** — tocá los filtros de fecha: ¿se ven dd/mm/aaaa? ¿tipear una fecha y apretar Enter la aplica bien?
8. **`/admin/panorama`** — arrancá nacional (provincias), hacé zoom a un área: ¿aparecen los departamentos coloreados solos, sin tocar nada? ¿el badge dice bien "Provincias"/"Departamentos" según lo que se pinta? ¿los KPIs distinguen "estado actual" vs "período"?
9. **Omnibox** (buscador global): escribí algo. ¿Aparece SOLO lo del sistema, o el navegador te mete opciones guardadas? El empty-state, ¿sugiere formatos (DIM-…, CAS-…, nombre)?

## Formato del hallazgo
`BLOQUEA / ALTO / MEDIO / BAJO / IDEA` · pantalla · qué esperabas · qué viste · captura si aplica. Priorizar consistencia visual, claridad de copy es-AR, y coherencia rótulo↔número↔mapa.
