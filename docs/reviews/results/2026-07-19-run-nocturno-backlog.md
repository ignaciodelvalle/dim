# Run nocturno 2026-07-19 — backlog consolidado

> Síntesis de: deep review de promesas AGENTS.md (44 agentes), perf audit (26
> agentes), exploración de filtros de analítica, y los diferidos del día. Agrupado
> por INTENCIÓN (honestidad / terminar lo planeado / vuelta de tuerca) + perf +
> filtros. Cada ítem con archivo y esfuerzo. Ordenado para ejecutar de arriba a abajo.

---

## 🔴 Categoría 1 — HONESTIDAD (estados que mienten al usuario)

Todo esto es la misma clase que el `LOW-1` (semáforo mordeduras) que ya arreglamos: un estado que lee como éxito o alarma cuando el dato no lo respalda.

| # | Qué miente | Archivo | Fix | Esfuerzo |
|---|---|---|---|---|
| H1 | Mortalidad: "Trazabilidad 0%" rojo (falsa alarma) y "Desconocida 0%" verde (falso éxito) sin muertes | `gob/mortalidad/page.tsx:168` | Gatear las tarjetas de tasa en `hasDeaths` como la de conteo → "—" neutral | quick |
| H2 | Reunificación: "0% Peligro" rojo en jurisdicción sin episodios | `gob/perdidas/page.tsx:204` | Con `lostEpisodes===0` → "—" tono neutral | quick |
| H3 | Export a fiscalía: `window.open` tras `await` muere con popup-blocker pero dice "se abrió" — se pierde el ÚNICO output legal | `MpfExportButton.tsx:37` | Renderizar la URL firmada como `<a>` visible | quick |
| H4 | Filtros gob/perdidas: los chips 12m/ytd/custom no hacen nada, vuelven a 30d silenciosamente | `gob/perdidas/page.tsx:58` | Usar `resolveAnalyticsPeriod(sp)` en vez del parser a mano | quick |
| H5 | Revocar org deja la pastilla verde "Verificada" junto a "revocada" | `RevokeOrgActions.tsx:187` | `navigateAfterActionSuccess` para refrescar el SSR | quick |
| H6 | Alarma "síntomas escalantes" sin límite temporal ni filtro de enfermedad — un resfrío viejo pinta rojo | `admin/observaciones/[token]/page.tsx:63` | Reflejar `findEscalatingSymptom` (límite + filtro rabia) | medium |
| H7 | Libreta PDF "oficial" imprime valores pre-corrección | `libreta-export/route.ts:126` | Traer `event_amended` + aplicar `overlayAmendments` | medium |

## 🟡 Categoría 2 — TERMINAR ALGO YA PLANEADO (features fachada)

Prometido en AGENTS.md pero inalcanzable/no funcional. **Decisión de PO requerida en viaje.**

| # | Feature | Estado real | Camino | Esfuerzo |
|---|---|---|---|---|
| P1 | **Foster / "vecino en tránsito"** | El alta del ciudadano no tiene selector de custodia → toda mascota se registra como owner. Pilar inalcanzable | Renderizar `CustodyKindToggle` en paso 1 del alta; normalizar `transito`→`foster_in_transit` | medium |
| P2 | **Viaje transfronterizo** | Muerto de punta a punta: nada escribe `transport_recorded`, `to_country` hardcodeado "AR", `/viaje` sin link entrante, semáforo nunca verde | **PO decide:** (a) construir form "Registrar viaje", o (b) esconder `/viaje` tras feature flag hasta construirlo. NO dejarlo como fachada | big / decisión |
| P3 | Nudges de libreta | Código muerto (0 llamadores), anunciado vivo en 3 docs | Borrar la derivación huérfana + corregir AGENTS.md/README (o remontar la tira) | quick |

## 🟢 Categoría 3 — VUELTA DE TUERCA (calidad / usabilidad / a11y)

| # | Qué | Archivo | Fix | Esfuerzo |
|---|---|---|---|---|
| V1 | **A11y WCAG 4.1.2 en 7 dominios**: wizards con `sr-only`+`aria-hidden` dejan campos enfocables invisibles | perdida/adopción/foster/vet/denuncias/intake/compliance | Reemplazar `sr-only` por `inert` en las secciones inactivas (UN patrón cierra los 7) | medium |
| V2 | Adopción: gate "ya postulaste" consulta eventos inexistentes → bloquea re-postular a rechazados | `postular/page.tsx:119` | Usar `adoption_application_resolved` | quick |
| V3 | Devolución re-muestra propuestas rechazadas como accionables (loop de error) | `devolucion/page.tsx:176` | Usar `hasPendingProposal` | quick |
| V4 | Surveillance: funcionario avisado de infracción legal de 10 días sin superficie para cerrar la observación (admin-gated) | `vigilancia/page.tsx:299` | Admitir govt en la ruta o lista in-page | medium |
| V5 | Tarjeta "Observaciones rábicas en curso" muestra conteos de señales, no observaciones | `vigilancia/page.tsx:666` | Renombrar o poner la lista real | quick |
| V6 | CTA primarios: `<button>` anidado en `<a>` (HTML inválido) | `mis-mascotas/page.tsx:212` | `LnButton` modo ancla (asChild) | quick |
| V7 | Credencial degradada/throttled sin `h1` (SR pierde orientación) | `DegradedCredentialCard.tsx:72` | `<h1>` en ambos fallbacks | quick |
| V8 | Onboarding no captura método de adquisición (dato de política pública perdido) | `MinimalNewPetForm.tsx` | `<select acquisitionMethod>` opcional paso 2 | quick |
| V9 | Reasignar decomiso / sumar parte a disputa exigen pegar UUID crudo | `ReasignarButton.tsx:86`, `AddPartyForm.tsx:96` | Reusar el combobox/buscador del alta | medium |
| V10 | Libreta PDF rotula eventos en inglés | `libreta-export/route.ts:41` | Usar `eventTypeLabel`/`tipoEventoLabel` | quick |

## 📊 Categoría 4 — FILTROS (barato + potente)

**Fecha:**
- F1 — `deltaV2` (ya existe en `OpKpi`) en las 9 pantallas que no lo tienen (censo, mortalidad, adopciones, vigilancia, programa, poblacion, maltrato, analytics + admin twins). `campanas/page.tsx` es el template. **Máximo retorno, primitivo ya construido.** (H4 arriba cubre el bug de perdidas.)
- F2 — Unificar `gob/historial` al `PeriodPicker` compartido; agregar filtro de período a `gob/decomisos` (ya computa `daysElapsed`).

**Nuevos filtros baratos (columna + `eq()` ya existen en `pets`):**
- F3 — **Species** (dog/cat) — el KPI catalog ya fija metodología por especie; toggle runtime = UI + swap del `eq(pets.species,'dog')` hardcodeado. *(agregar índice si se vuelve hot)*
- F4 — **Status** (active/lost/deceased) — ya construido en `gob/perdidas` (`PetStatusFilter`); portar a censo/poblacion.
- F5 — **Método de adquisición**, **raza peligrosa**, **grano jurisdiccional** — columnas + predicados ya existen, solo falta el control UI.
- *(Medium: age-band necesita helper de bucketing; verified-only en programa necesita condición matrícula para esterilización. Expensive: filtro "estado actual de vacunación" — requiere columna denormalizada, NO venderlo como barato.)*

## ⚡ Categoría 5 — PERFORMANCE (big rocks del audit)

- PF1 — `/gob` + panorama fan-out (~40-48 queries / pool max:2): consolidar los `count() FILTER` sobre `pet_events` con el mismo (scope, ventana, join) en menos consultas multi-métrica. **El costo servidor dominante.** (Los 6 quick-wins ya bajaron ~13 queries.)
- PF2 — `globals.css` 194KB: mover skins `.lp-*` a CSS Modules (~10,5KB gz fuera del crítico de /login).
- PF3 — Libreta refetch re-autentica en cada perfil: renderizar `LibretaFace` en su propio `<Suspense>` reusando el acceso ya resuelto (NO pasar acceso desde el cliente — seguridad).

## ⏸️ Categoría 6 — DIFERIDOS (bajo valor / no verificable)

- #7 slider opacidad Panorama — interacción (no carga); requiere verificación manual del drag. Que Ignacio lo pruebe en browser o tren dedicado.
- #8 pet row React.cache — ~0ms reloj; no vale tocar el fail-soft del credencial público.
- LOW-2 scrubber degraded — el review lo consideró defendible; riesgo de "degraded pegado" supera el beneficio.

---

## Orden sugerido para la noche
1. **Honestidad quick** (H1-H5) — barato, alto impacto, misma clase que el trabajo de hoy.
2. **A11y sweep** (V1) — un patrón, 7 dominios.
3. **Foster toggle** (P1) — reactiva un pilar.
4. **Filtros: deltaV2 sweep** (F1) — primitivo ya listo.
5. **Vuelta de tuerca quick** (V2-V10).
6. **PF1** si queda presupuesto.
7. **Decisión PO:** viaje (P2) — construir o esconder.
