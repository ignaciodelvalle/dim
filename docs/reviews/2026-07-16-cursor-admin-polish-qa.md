# QA pulido UI/UX — portal admin (Cursor)

**Fecha:** 2026-07-16  
**Entorno:** `http://localhost:3001` · cuenta `admin@dim.test`  
**Branch / HEAD:** `integration/all-20260703` @ `def94e82`  
**Brief:** `docs/reviews/admin-polish-brief-2026-07-16.md`  
**Foco:** fricción, inconsistencia visual, copy confuso (no bugs de datos).  
**Método:** recorrido browser del operador matutino; mutación UI en outbox (Reintentar).

## Veredicto

El home y varias pantallas de confiabilidad ya hablan en criollo y priorizan bien lo urgente. Los huecos que más hacen dudar al operador son: **feedback débil del reintento de outbox**, **filtro de cuentas de prueba permeable**, **omnibox sin resultados para entidades que sí existen**, y **señales contradictorias de alcance en Panorama** al volver de CABA.

Cola de matrículas: **no se pudo ejercer** (0 pendientes).

---

## Hallazgos

### ALTO · `/admin/outbox/[id]` · Reintentar ahora — no se ve que “funcionó”
- **Esperaba:** toast o cambio claro (Intentos ↑, último intento, confirmación durable).
- **Vi:** botón pasa por “Programando…”; al terminar vuelve a “Reintentar ahora”. Solo cambia “Próximo reintento” (15/7 → 16/7). **Intentos sigue en 0**. Sin toast durable.
- **Nota:** el copy del botón aclara que no entrega al instante (bien), pero el operador no tiene un “recibo” visible.

### ALTO · `/admin/outbox` lista + detalle · UUIDs y JSON a la vista
- **Esperaba:** raw solo bajo “Detalle técnico”.
- **Vi:** en lista, columna “Evento origen” = prefijos UUID (`dd583152…`). En detalle, UUID completo bajo el título + bloque “Payload snapshot” (inglés) siempre visible. “Detalle técnico” solo envuelve el payload del evento origen.

### ALTO · `/admin/usuarios` · filtro de cuentas de prueba incompleto
- **Esperaba:** por defecto solo cuentas “reales”; las de prueba ocultas.
- **Vi:** hay “Mostrar cuentas de prueba (46)”, pero el listado default ya muestra `*-admin@dim-test.local`. Búsqueda `q=owner` trae 21 fixtures (`idem-guards-owner`, `mortality-dash-owner`, …) y aún ofrece “Mostrar cuentas de prueba (4)”.
- **Extra:** búsqueda `q=lucia` → “Sin resultados” + “Mostrar cuentas de prueba (1)” — no dice que el match está oculto.

### ALTO · Omnibox · busca y no encuentra lo que el portal sí muestra
- **Esperaba:** hits para mascota/token conocidos (p. ej. Chichila / `DIM-9GDH` visto en Observaciones) o al menos personas.
- **Vi:** `autocomplete=off` (bien, sin datalist del browser). Empty-state excelente: “Probá con un código (DIM-…, CAS-…) o nombre y apellido.”
- **Pero:** `Chichila`, `DIM-9GDH`, `Admin DIM` → siempre “Sin coincidencias”. El empty-state enseña formatos, pero la búsqueda no entrega nada usable.

### ALTO · `/admin/panorama` · “Volver a Nacional” deja señales cruzadas
- **Esperaba:** un solo alcance coherente (rótulo ↔ mapa ↔ KPIs ↔ copy de burbujas).
- **Vi (tras CABA → Volver a Nacional):** botón “Alcance Nacional · todas las provincias” conviviendo con panel “Alcance: CABA”, footer “Argentina (todas las provincias)” y copy de burbujas de nivel localidad; KPIs todavía de CABA un rato. El operador no sabe en qué nivel está.

### MEDIO · `/admin` home · mapa del sitio = directorio, no tablero
- **Esperaba:** tablero accionable o, si es mapa, más denso/visual.
- **Vi:** lista agrupada con descripciones (útil como índice). Tonos de colas: cálidos en Alertas(1), SLA(12), Observaciones(1); Casos(496) neutro — bien para “decidir ahora” vs inventario. Novedades colapsadas por defecto ayudan.

### MEDIO · `/admin` + `/admin/sistema` · “Avisale” sin tilde / mezcla EN en crons
- Banner criollo bueno (“Procesos automáticos caídos - avisá a soporte”).
- “Avisale” → debería “Avisále” / “Avisá al”.
- “Detalle técnico” muestra snake_case EN (`expire_foster_proposals`) — OK bajo técnico; en Sistema cada FALLO ya explica impacto en español (bien).

### MEDIO · `/admin/sistema` · SLA lidera con vencidas, pero choca con “100% histórico”
- **Vi:** “12 vencidas ahora” + “Cumplimiento histórico 100% de las entregadas”. Correcto si se lee fino; fácil de malinterpretar como “está todo bien”.

### MEDIO · `/admin/alertas` · fechas dd/mm/aaaa OK; Enter no aplica
- Placeholder `dd/mm/aaaa` correcto.
- Tipié `01/06/2026` + Enter → **no** navegó; hace falta “Aplicar”.
- Botón de acción a veces se ve truncado en viewport angosto (“Reconoc…”); a11y name completo “Reconocer”.

### MEDIO · `/admin/observaciones` · “en curso” arriba (PASS) · dueño seed ilegible
- Primera fila: Chichila · **En curso** (PASS del brief).
- Dueño: `lucia-gen-mrau2dv1` — no parece nombre humano.

### MEDIO · Panorama · leyenda / hint stale
- Leyenda trunca (“Denuncias de b…”).
- Con alcance provincia, el hint sigue diciendo “click en una provincia del mapa”.

### BAJO · Copy / a11y menores
- Outbox labels sin tilde: “Ultimo intento”, “Proximo reintento”.
- Home métrica “Decisiones 7d” con prefijo a11y “Normal : …”.
- Flechas mixtas `->` vs `→`.

### IDEA · Novedades
- Colapsadas = bien. Al expandir: muchas filas “Incidentes reportados · Tucumán · hace 6 días” sin discriminación útil para el matutino.

---

## Checklist del brief (rápido)

| # | Pantalla | Resultado |
|---|---|---|
| 1 | `/admin` home | Colas priorizan bien; mapa = lista; Novedades colapsadas ayudan |
| 2 | `/admin/cola` | Vacía — no se pudo aprobar/rechazar matrícula |
| 3 | `/admin/outbox` | Detalle usable; Reintentar sin feedback durable; UUID/JSON visibles |
| 4 | `/admin/sistema` | Crons en criollo OK; SLA “vencidas ahora” OK pero choca con 100% |
| 5 | `/admin/observaciones` | “En curso” primero — PASS |
| 6 | usuarios / govts | Email visible — PASS; filtro prueba permeable — FAIL parcial |
| 7 | `/admin/alertas` | dd/mm/aaaa PASS; Enter no aplica — FAIL |
| 8 | `/admin/panorama` | Zoom CABA/BA pinta comunas/deptos + badge OK; volver nacional confunde |
| 9 | Omnibox | Sin autofill browser + empty-state formats PASS; hits FAIL |

---

## PASSes a conservar

1. Home: tonos cálidos solo en “decidir ahora”; Casos 496 neutro.  
2. Crons caídos explicados en español (impacto + qué hace el proceso).  
3. Outbox: filas en incumplimiento resaltadas; aviso “12 items en incumplimiento de SLA”.  
4. Observaciones: activas primero.  
5. Usuarios/govts: email, no UUID.  
6. Alertas: placeholder `dd/mm/aaaa`.  
7. Panorama: badge Provincias → Comunas (CABA) → Departamentos/partidos (BA); KPIs marcan **período** + backlog stock.  
8. Omnibox: `autocomplete=off` + empty-state con DIM-/CAS-.

---

## Reproducción

1. `http://localhost:3001` · login `admin@dim.test`  
2. Recorrer rutas del brief en orden.  
3. Outbox: abrir un incumplimiento → “Reintentar ahora” → observar Intentos / toast.  
4. Usuarios: listado default + `?q=owner` + `?q=lucia`.  
5. Alertas: tipar Desde + Enter vs Aplicar.  
6. Panorama: nacional → Ver CABA → Volver a Nacional → Buenos Aires.  
7. Omnibox: basura (empty-state) + `DIM-9GDH` / nombre de mascota vista en Observaciones.
