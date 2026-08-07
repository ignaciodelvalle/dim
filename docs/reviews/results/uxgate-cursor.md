# UX Gate — Cursor (Cohort B · operador)

**Agente:** Cursor (OPERADOR)  
**Fecha:** 2026-07-05  
**Entorno:** `http://localhost:3000` (build de producción local, seed demo)  
**Cuentas:** `alejo@dim.test`, `orgadmin@dim.test` (parcial vía alejo en Patitas), `govt@dim.test`, `admin@dim.test` — contraseña `Test1234!`  
**Alcance:** W5–W15 + consolas gob/admin (Cohort B del runbook)

Screenshots: `docs/reviews/results/uxgate-cursor-screenshots/` (capturados en sesión Chrome MCP).

**Side-effects:** ninguno irreversible ejecutado. Solo navegación, búsquedas omnibox (audit `pii_queried`), filtros y formularios abandonados sin submit.

---

## Matriz flujo × pantalla

Leyenda: ✅ suficiente · ⚠️ con reservas · ❌ insuficiente / roto

| Flujo | Pantalla | Screenshot | ¿Sobra? | ¿Falta? | ¿Autocontenido? | ¿De un vistazo? | Notas |
|-------|----------|------------|---------|---------|-----------------|-----------------|-------|
| **W5** Vacuna firmada | Selector org (`/org`) | `w05-org-picker-alejo.png` | No | Salir / usuario logueado | ✅ | ✅ | Cuatro orgs distinguibles por tipo + barrio. |
| W5 | Panel clínica | `w05-clinic-panel.png` | Permisos completos en panel (ruido para admin) | Atajo explícito “buscar mascota del turno” | ⚠️ | ✅ | Card principal bien destacada; onboarding “Servicios” pendiente coherente. |
| W5 | Mascotas clínica (destino del card) | *(misma sesión)* | — | **Camino a firmar evento** | ❌ | ✅ vacío | **Lista vacía** — clínica sin custodia; card promete firmar pero no orienta. |
| W5 | Omnibox “Laika” | *(captura inline)* | — | Explicar scope jurisdiccional | ❌ | ✅ | “Sin coincidencias en tu jurisdicción” — no destraba W5. |
| **W6** Mordedura → obs. | Form reporte (`/mordedura/nuevo`) | `w06-mordedura-form.png` | — | Búsqueda por nombre/chip además de token | ⚠️ | ⚠️ | Copy legal excelente; paso 1 exige `DIM-XXXX` manual. |
| W14 | Agenda clínica | `w14-agenda.png` | No | CTA “materializar cupos / ver servicios” en vacío | ⚠️ | ✅ | Empty state honesto (domingo sin turnos). |
| W15 | Servicios listado | *(inline)* | No | Botón crear poco visible en viewport | ⚠️ | ✅ | Existe `+ Crear servicio` (a11y) pero fácil de perder visualmente. |
| W15 | Servicio nuevo | `w15-servicios-nuevo.png` | No | — | ✅ | ✅ | Wizard 3 pasos + aviso de aprobación gobierno — justo. |
| **W7** Adopción | Panel refugio | `w07-refugio-panel.png` | Bloque permisos largo | — | ✅ | ✅ | KPIs ocupación/adopciones accionables; “Requieren acción” claro. |
| W7 | Mascotas custodia | `w07-refugio-mascotas.png` | 5 botones/card | Estado adopción/publicado en card | ⚠️ | ✅ | Acciones por animal visibles; denso en móvil. |
| W7 | Operaciones/adopciones | *(no visitado — inferido desde panel)* | — | — | — | — | “Revisar solicitudes →” y card adopciones=2 visibles en panel. |
| **W8** Tránsito | Panel refugio (módulos tránsito) | `w07-refugio-panel.png` | — | — | ✅ | ✅ | Pool, propuestas, activos en grid. |
| **W9** Transferencia | Transferencias salientes | *(inline)* | No | — | ✅ | ✅ | Tabs Salientes/Entrantes + `+ Nueva propuesta`; empty state OK. |
| **W13** Permisos | Panel refugio (lista permisos) | `w07-refugio-panel.png` | Lista completa de capabilities | Link directo a `/permisos` | ⚠️ | ⚠️ | Información útil pero repetida vs nav “Permisos”. |
| **W10–12** Gobierno | Panel jurisdicción | `w10-gob-panel.png` | — | Alinear widget cola con `/gob/cola` | ⚠️ | ✅ | KPIs + casos recientes + enlaces cruzados. |
| W10 | Cola aprobaciones | *(inline)* | No | Mostrar las 20 del widget o quitar link | ❌ | ✅ | **Vacía** mientras panel dice “Ver todos (20)”. |
| W11 | Maltrato | `w11-gob-maltrato.png` | — | — | ✅ | ✅ | KPIs + tabs + severidad — decisión regulatoria en pantalla. |
| W12 | Panorama | `w12-gob-panorama.png` | Footer denso | — | ✅ | ⚠️ | Capas, replay temporal, k-anon documentado; curva de aprendizaje alta. |
| W10 | Casos / Pérdidas / Decomisos | *(spot-check nav)* | Sidebar extenso | — | ✅ | — | Enlaces desde panel; no probados en detalle por tiempo. |
| **W16** Admin | Panel admin | `w16-admin-panel.png` | Banner demo (necesario) | — | ✅ | ✅ | Scope universal explicado; switcher Portales presente. |
| W16 | Moderación | *(inline)* | No | — | ✅ | ✅ | Propósito (spam vs triage) explícito; cola vacía OK. |
| W16 | Reglas | *(inline)* | Lista 24 provincias scroll | Búsqueda/filtro provincia | ⚠️ | ⚠️ | Árbol jurisdiccional completo; operación posible pero lenta. |

---

## Hallazgos (severidad)

### Blocker

| ID | Flujo | Hallazgo | Evidencia |
|----|-------|----------|-----------|
| **B1** | W5 Vacuna firmada | **La acción principal “Registrar / firmar evento clínico” lleva a `/mascotas` de custodia vacía** para Clínica Recoleta (0 animales). No hay onboarding alternativo (omnibox no explicado en el card; búsqueda “Laika” devuelve sin coincidencias en jurisdicción). **El operador vet no puede iniciar la firma sin adivinar un token o tener un pet en custodia.** Rompe la promesa del panel y el flujo W5 end-to-end. | Panel → mascotas vacías; omnibox Laika → “Sin coincidencias en tu jurisdicción”. |

### Mayor

| ID | Flujo | Hallazgo | Evidencia |
|----|-------|----------|-----------|
| **M1** | W10 Cola gob | **Inconsistencia cola de aprobaciones:** panel `/gob` muestra enlace **“Ver todos (20)”** y widget “Cola de aprobaciones”, pero **`/gob/cola` está vacía** (“No hay solicitudes pendientes en tu scope”). [POCO INTUITIVO] — el operador no sabe si hay 20 pendientes nacionales fuera de scope o si el widget miente. | `w10-gob-panel.png` vs cola vacía en `/gob/cola`. |
| **M2** | W5/W6 Org clínica | **Nav lateral clínica incluye módulos de refugio** (Tránsitos, Check-ins, Operaciones adopciones, Censo ingresos) sin mascotas en custodia — **ruido** que diluye tareas clínicas reales. | Sidebar en capturas clínica vs refugio (misma plantilla). |
| **M3** | W6 Mordedura | Formulario marca **“Paso 1 de 4”** pero el snapshot de accesibilidad expone **todos los pasos a la vez** (fecha, víctima, severidad, confirmación). El operador no sabe qué es obligatorio ahora vs después. [POCO INTUITIVO] | `w06-mordedura-form.png` |
| **M4** | W5 Mordedura | Paso 1 exige **token público manual** (`DIM-XXXX-XXXX`) sin integrar omnibox ni búsqueda por chip — en clínica con paciente presente, **fricción innecesaria** vs búsqueda global ya disponible en topbar. | Form paso 1 |
| **M5** | W14 Agenda | Empty state **no indica cómo obtener cupos** (“No hay cupos materializados”) — falta puente a Servicios aprobados o materialización. Operador debe inferir desde nav. | `w14-agenda.png` |

### Menor

| ID | Hallazgo |
|----|----------|
| m1 | **Doble breadcrumb** en páginas org (`Panel > Mascotas` en topbar + bloque interno). |
| m2 | **Selector `/org` sin logout** — hay que entrar a un portal para cerrar sesión. |
| m3 | **“Primeros pasos”** en panel clínica persiste con checks completados — ocupa espacio vertical en operador experto. |
| m4 | **Mascotas refugio:** mensaje empty duplicado (“Todavía no hay animales…”) título + cuerpo. |
| m5 | **Panorama gob:** contradicción leve en leyenda “Peores 10 jurisdicciones” vs “Sin jurisdicciones bajo meta” con Santa Cruz coloreada (datos demo; copy confunde). |
| m6 | **Admin reglas:** árbol de 24 provincias sin buscador — scroll largo para CABA. |
| m7 | **Permisos en panel refugio:** bloque “Tus permisos” repite lo que vive en `/permisos` — útil onboarding, sobra en día 2. |

---

## Cross-POV (cohorte B → gobierno)

Verificado en scope **govt@dim.test (3 localidades: CABA, Santa Cruz, Tierra del Fuego)** — no assertar KPIs nacionales:

| Señal ciudadana (seed) | ¿Visible en gob? | ¿Accionable? |
|------------------------|------------------|--------------|
| Denuncias bienestar | Panel: **90 activas**; Maltrato: **113 / 90 sin asignar** | ✅ Abrir, filtrar, asignar (no ejecutado) |
| Mascotas perdidas | Panorama KPI: **6 activas**, 9 recuperadas (30d) | ✅ Capa + enlace Pérdidas |
| Casos regulatorios | Panel: **5 abiertos** (disputas/decomisos históricos seed) | ✅ Links a detalle |
| Vacunas firmadas / cobertura | Panel: antirrábica **40%** vs meta 80% (3 partidos en scope) | ✅ Vigilancia/Panorama — no re-ejecuté firma vet por B1 |
| Cola matrículas/orgs | **Inconsistente** (M1) | ⚠️ |

---

## Log de side-effects

| Acción | Efecto persistente |
|--------|-------------------|
| Login/logout alejo, govt, admin | Sesiones cookie — revertido con logout |
| Omnibox “Laika” desde clínica | **`pii_queried` audit** (mensaje UI: “Las búsquedas quedan registradas”) |
| Filtros maltrato 30d | Solo querystring / estado UI |
| Panorama preset cumplimiento 90d | URL `?period=90d&layers=cobertura&preset=cumplimiento` |
| Formularios mordedura/servicio | **No submit** — sin eventos |

**No ejecutado (irreversible):** finalizar adopción, aprobar/rechazar cola, confirmar mordedura, crear servicio, transferencias, cambios reglas, moderación spam/triage.

---

## Veredicto

| Criterio runbook | Resultado |
|------------------|-----------|
| Blockers = 0 | ❌ **1** (B1 — firma clínica) |
| Majors ≤ 5 | ❌ **5** (M1–M5, en el límite) |
| **PASS UX Gate Cohort B** | **FAIL** |

### Síntesis de suficiencia informacional

- **Refugio y gobierno (maltrato/panorama)** están en el rango “justo y necesario”: contexto legal, KPIs, filtros y acciones en la misma superficie; Panorama es denso pero auto-documentado (k-anon, demo, capas temporales).
- **Admin** comunica bien el scope universal y separación gob; moderación y reglas son operables con fricción menor (scroll provincias).
- **Clínica/vet** es el talón de Aquiles: la consola promete firmar eventos pero **no cierra el flujo** para el caso de uso principal (paciente externo con turno). Hasta resolver B1 (+ alinear M1), el gate Cohort B no pasa.

### Remediación mínima sugerida (para re-run)

1. **B1:** Card “Firmar evento” → omnibox pre-focus o `/mascotas/buscar` con copy “Buscá la mascota del turno (nombre, DIM o chip)”; empty state con CTA explícito, no lista vacía muda.
2. **M1:** Widget cola gob: o filtra al scope del operador con conteo real, o el link dice “20 fuera de tu scope (solo admin)”.
3. **M2:** Ocultar nav refugio-adopción en org_type=clinic.
4. **M3–M4:** Wizard mordedura: ocultar pasos futuros o integrar búsqueda de mascota en paso 1.

---

*Addendum Cursor — listo para síntesis con Cowork (`docs/design/handoffs/2026-07-05-uxgate-runbook.md` § Consolidación).*
