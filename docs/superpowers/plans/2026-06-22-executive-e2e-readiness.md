# Plan: Executive E2E readiness gate — recorrido completo del ejecutivo nacional

> **Para Claude Code — gate previo a entregar la cuenta a un ejecutivo nacional para review autónomo.**
> Va MÁS ALLÁ del deep-dive de dashboards ([`2026-06-22-dashboards-deep-dive.md`](./2026-06-22-dashboards-deep-dive.md)):
> recorre **todo** el journey del ejecutivo paso a paso — incluidas las superficies y flujos que **no** se
> habían revisado (dashboards secundarios, drills a detalle, workflows, export, primer login, mobile,
> credibilidad/metodología). Cada paso tiene: *qué hace · experiencia esperada · estado actual · criterio go/no-go*.
> Severidad: 🔴 · 🟡 · 🟢. Lo no verificado en vivo se marca **[VERIFICAR]** — es deuda de testeo, no un OK.

## Hallazgos nuevos de este pase (lo que escapó al deep-dive)
- 🟡 **"Campañas" es un link de menú muerto.** Clic en el ítem del rail `/gob` → not-found (`/gob/campañas`). "Outreach" al lado funciona → **no es scope, es ruta inexistente**. Un ejecutivo que clickea "Campañas" cae en página inexistente. **Fix:** o se construye la página, o se saca el ítem del nav (`components/layout/nav-presets.ts` `GOB_NAV`). Un menú con un destino muerto es un *credibility hit* para gobierno.
- 🟡 **Fechas relativas rotas: "hace 20624d"** (~56 años) en las listas de Outreach. Bug de cálculo de fecha o fechas de seed fuera de rango. Exec lo nota al instante. **Fix:** `lib/format` relative-time + sanear fechas del seed.
- 🟢 **Nombres de seed artificiales** ("Capacity Sync Dog") en listas operador-facing (Outreach). Polish de dataset.
- ✅ **Progreso:** el **not-found branded ya cubre el grupo gob** ("No encontramos esta página", español) — A1/D7 parcialmente cerrado en gob (verificar `/admin`).

---

## El recorrido E2E (gate paso a paso)

### E0 · Acceso — primer login con magic link **[VERIFICAR]**
- **Qué hace:** recibe un *magic link de acceso único* (lo dice `/admin/govts/new`) y entra por primera vez.
- **No verificado:** el mail (Mailpit local `:54324`), el aterrizaje del link, expiración, reenvío. **Es el primer contacto del ejecutivo y nunca lo testeamos.** Gate: el flujo magic-link → primer login → portal correcto funciona end-to-end.

### E1 · Orientación — ¿sabe qué está mirando? 🟡
- **Estado:** el panel admin es un **lanzador** sin onboarding/tour. Un ejecutivo cae en KPIs sin un "empezá por acá". Las ⓘ ayudan, pero no hay narrativa.
- **Gate:** un estado de bienvenida / 3-pasos / "qué es esto" para el primer ingreso institucional. (Lo resuelve en parte el Panorama console como landing.)

### E2 · Panel de jurisdicción — KPIs ✅ (con D5)
- **Estado:** KPIs con definición + estado + citas legales. Bien. Falta delta/sparkline/drill (D5) y serie temporal (D1).

### E3 · Los dashboards (uno por uno)
- **Vigilancia** 🔴 (D2): **0 brotes / 0 señales** pese a 189 mordeduras — el core epi se ve muerto. **Bloqueante para este público.**
- **Mortalidad** 🟡 (D4): métricas que no reconcilian (Trazabilidad 0% vs Desconocida 34%) + causa "illness" en inglés.
- **Analítica** ✅/🟡: ranking cross-region + export; H1 "Analytics" en inglés, "Top causas" con enums inglés (D3).
- **Zoonosis** (sub-página de vigilancia) **[VERIFICAR]** — nunca abierta.
- **Investigaciones** (sub-página) **[VERIFICAR]** — nunca abierta; es un workflow de caso.
- **Outreach** ✅/🟡: fuerte ("del dato a la acción", export, audit, PII), pero "hace 20624d" (arriba).
- **Campañas** 🟡: **link muerto** (arriba).
- **Decomisos** (Ley 14.346) **[VERIFICAR]** — enforcement; nunca abierto.
- **Disputas de custodia** **[VERIFICAR]** — nunca abierto.
- **Mortalidad/Mapa nacional/Panorama** 🔴 WIP: `/admin/panorama` 404 (en construcción). Es el feature estrella para el exec.

### E4 · Búsqueda → drill → detalle **[VERIFICAR parcialmente]**
- **Qué hace:** usa el omnibox ("Buscar persona o caso"), entra a un resultado, llega al detalle.
- **No verificado:** las **páginas de detalle** (`/admin/cola/[token]`, `/gob/.../[publicCode]`, `/admin/observaciones/[token]`, user/org detail, `cases/[publicCode]`) — solo vi las listas. Un exec **va a clickear adentro**. Gate: cada detalle renderiza, con PII gating + audit log de búsqueda (ya disclosado en `/gob/usuarios`).

### E5 · Workflows de autoridad **[VERIFICAR]**
- **Cola de aprobaciones** (aprobar/rechazar matrícula/org/RUPGA) — no ejecutado.
- **Acta de infracción / Habilitación** (quick actions del panel) — no ejecutados.
- **Crear cuenta govt** (`/admin/govts/new`) — vi la forma, no completé; faltan marcadores `*` (A6).
- **Autorear regla PPP** — el **impact banner no calcula** ("No se pudo calcular", A2/D-A2): el exec crea una regla que notifica dueños province-wide **a ciegas**. 🟡
- Gate: al menos un flujo de aprobación + un acta + creación de cuenta corren end-to-end sin error.

### E6 · Export / reporting **[VERIFICAR end-to-end]**
- **Qué hace:** "Exportar CSV" en Analítica/Outreach; `/gob/analytics/export`.
- **No verificado:** que el CSV **descarga de verdad**, con datos correctos, respetando scope + k-anon. Un ejecutivo quiere sacar data para compartir. Gate: export descarga un CSV válido y privacy-safe.

### E7 · Cambio de contexto (Portales) ✅/🟡
- Admin puede saltar admin↔gob↔org↔owner. Funciona; verificar que no haya estados raros al volver.

### E8 · Mobile / tablet **[VERIFICAR — nunca testeado]**
- **Un ejecutivo abre esto en un iPad/teléfono.** El viewport de la herramienta es fijo, nunca verifiqué render mobile real. El producto es PWA mobile-first (`OpMobileDrawer`), pero las superficies operador-densas (mapas, tablas, riel) en pantalla chica son riesgo. Gate: pasada real en dispositivo de panel + 2 dashboards + 1 detalle.

### E9 · Credibilidad / metodología 🟡 (para gobierno, sube de categoría)
- **Texto en inglés** en producto estatal ("Analytics", "illness", "Euthanasia"), **action-codes crudos** (`pet_events_mutation_override`) en auditoría/feeds, **acentos faltantes** (sistema/organizaciones/servicios). En bloque mandan "a medio terminar".
- **Sin "metodología/acerca de estas métricas"**: para un producto de datos de gobierno, falta una nota de cómo se calcula cada indicador, fuentes (Censo 2022, INDEC) y que **la data es demo/sintética**. Gate: banner/aviso "datos de demostración" + un "acerca de las métricas".
- **Anclas legales** (Ley 14.107/4078/5470/14.346): presentes en KPIs ✅.

### E10 · Cierre — logout / volver ✅ trivial.

---

## Lo que escapó al deep-dive y hay que verificar SÍ o SÍ (honestidad de alcance)
1. **Primer login con magic link** (E0) — nunca testeado; es el primer contacto.
2. **Páginas de detalle / drill** (`[id]`/`[token]`/`[publicCode]`) — solo vi listas.
3. **Dashboards secundarios:** Zoonosis, Investigaciones, Decomisos, Disputas — nunca abiertos.
4. **Workflows ejecutados:** aprobar en cola, acta de infracción, habilitación, crear cuenta, autorear regla.
5. **Export real** (descarga CSV) — solo vi el botón.
6. **Mobile/tablet** — nunca verificado en dispositivo.
7. **Privacidad/seguridad en profundidad** — RLS, aislamiento entre jurisdicciones, manejo de PII en Outreach/usuarios (vi k-anon + audit, no la profundidad).

## Gate Go / No-Go para entregar al ejecutivo (review autónomo)
**Bloqueantes (deben estar):**
- [ ] Vigilancia muestra señales/brotes reales (D2).
- [ ] Panorama console vivo (`/admin/panorama`) — el feature estrella.
- [ ] Al menos un trend/serie temporal en el dashboard principal (D1).
- [ ] Métricas de disposición reconcilian (D4).
- [ ] **Cero links de menú muertos** (Campañas) y cero fechas absurdas ("hace 20624d").
- [ ] Pasada de credibilidad: sin inglés (Analytics/illness/Euthanasia), sin action-codes crudos, acentos OK.
- [ ] not-found branded en `/admin` también (residuo A1).
- [ ] Aviso "datos de demostración" visible.

**Verificados antes de entregar (no asumir OK):**
- [ ] Magic-link primer login · detalles/drill · zoonosis/investigaciones/decomisos/disputas · export CSV real · mobile en dispositivo · 1 workflow de aprobación end-to-end.

**Recomendación:** hasta cerrar los bloqueantes + correr los [VERIFICAR], **demo guiada sí, entrega para review autónomo no.**

## Tests (para CC)
- e2e "executive smoke": loguea como govt/admin y hace `GET 200 + sin error boundary` sobre **toda** ruta de `GOB_NAV`/`ADMIN_NAV` (caza links muertos como Campañas automáticamente) × {detalle de cada lista}.
- unit: relative-time nunca produce > ~3650d sin formato absoluto (caza "hace 20624d").
- e2e export: el endpoint de CSV responde `text/csv` con header de columnas y respeta scope.
- e2e mobile: viewport 390px sobre panel + 2 dashboards + 1 detalle, sin overflow/recortes.

> Al cerrar, marcar en `docs/superpowers/README.md`. Depende de `seed:panorama` (data) + del paquete metrics-IA (trends) + del Panorama console.
