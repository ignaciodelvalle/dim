# Cowork QA — Ronda 2 · Bloques E (adversarial) + D (org/refugio)

**Fecha:** 2026-07-11 (ART) · **Entorno:** `http://localhost:3001` (rediseño, congelado) · datos sintéticos de demo.
**Cuentas usadas:** `admin@dim.test` (E1/E2/E4), `lucas@dim.test` (E3, govt 5 localidades), `alejo@dim.test` (D, admin de refugio+clínica+rescate+autoridad).
**Método:** botón-mash real (navegación rápida + Atrás + paneles), URLs editadas a mano, fence forzado, sesión pesada, y recorrido de los 4 portales de org de alejo. Anoto dead-ends y mismatches rótulo↔mapa↔números. No creé datos.

---

## TL;DR

- **Bloque E — el hardening AGUANTA.** Botón-mash no rompe (E1); URLs inválidas no crashean (E2); el **fence es sólido** (E3, provincias ajenas → 0); y la **sesión pesada sobre cobertura Buenos Aires sigue viva, sin crash** (E4 — fix confirmado ✅).
- **Pero aparecen dead-ends y rarezas:** provincia inexistente → "**Cargando indicadores…**" infinito; el **delta de KPI se rompe a períodos largos** (+1.839% a 12m, +1.057% a 999d); el link compartido **no reproduce exactamente** lo que veías (mapa en blanco / cámara).
- **Bloque D — paneles por rol bien diferenciados**, pero **inconsistentes entre sí** (el refugio no tiene la lista de "Pendientes" con contadores que sí tienen clínica y autoridad), y **D3 es un dead-end**: no hay ninguna denuncia derivada en el seed para las orgs de alejo.

---

## BLOQUE E — Adversarial

### E1 · Botón-mash → 🟢 ROBUSTO
5 navegaciones rápidas (preset/provincia/período/capas distintos, sin esperas) + **Atrás ×3** + apertura/cierre frenético de todos los paneles del riel. **No se rompió, no se trabó, el mapa no quedó en estado raro.** Terminó en un estado **totalmente coherente**: rótulo "Buenos Aires" = Vista "Brotes activos" = KPIs (BA: 64,0% / 18 zoonosis) = mapa (departamentos BA + burbujas) = dock ("Buenos Aires · 14 registros"). El abort-de-bundle-stale y la sincronización de estado aguantan el estrés.

### E2 · Links compartidos → 🟡 sin crash, pero fidelidad parcial + dead-ends
- **Copiar vista y abrir en otra pestaña:** el rótulo/Vista/KPIs/dock se reprodujeron ("Buenos Aires · 14 registros"), **pero el mapa quedó en blanco** y la cámara **arrancó reseteada a nacional** (`z=3.54`) antes de re-sincronizar a `z=5.57`. ⇒ *no llegás exactamente a lo mismo que veías.* (Caveat honesto: parte del mapa-en-blanco puede ser un artefacto de MapLibre en pestaña de fondo/no-enfocada, no un bug de la app — conviene confirmarlo abriendo el link en una pestaña en primer plano.)
- **URLs editadas a mano — ninguna crashea (bien), pero el manejo no es del todo prolijo:**
  - `province=AR-ZZ` (inexistente): **dead-end** — los KPIs quedan en "**Cargando indicadores…**" para siempre, el rótulo muestra el código crudo "AR-ZZ", Registros 0. No hay "provincia inválida" ni fallback a nacional.
  - `period=999d`: se **clampa a "últimos 365 días"** (ok), pero el delta del KPI dice "**▲ +1.057%**" (absurdo).
  - `preset=notreal`: no crashea; cae en un estado tipo "Pérdidas" con una mezcla de KPIs medio incoherente.

### E3 · Fence fuera de jurisdicción (como lucas) → 🟢 SÓLIDO
lucas cubre 5 localidades (barrios de CABA: Palermo, Recoleta, Puerto Madero, San Nicolás…). Forcé por URL **Tierra del Fuego (AR-V)** y **Jujuy (AR-Y)**: en ambos casos → **KPIs 0% / 0% / 0%**, mapa "**Sin datos para esta capa en este alcance**", **Registros 0**. **No filtra nada.** El rótulo muestra el nombre de la provincia forzada, pero el dato está fenced a cero.
- *Nit cosmético:* los KPIs dicen "0%" mientras el mapa/dock dicen "sin datos" — sería más honesto que el KPI también diga "—/sin datos" (0% se puede leer como "cobertura cero real"). Cero exposición igual.

### E4 · Sesión larga sobre cobertura Buenos Aires → 🟢 VIVO (fix confirmado)
Churn pesado: BA cobertura ↔ nacional ↔ BA brotes ↔ BA cobertura 12m, repetido, + esperas. **La app sigue viva: sin pantalla blanca, sin crash, mapa y navegación responden.** El crash de revalidación **no reproduce** ✅.
- **Matiz:** bajo el churn rápido, la consulta más pesada (**BA cobertura 12 meses**) llegó a fallar con un error **elegante**: "**No pudimos cargar los indicadores en este momento**" — y **se recupera** en una carga limpia (64,0%). O sea: el fix convirtió el viejo crash en una **degradación elegante** ante request-racing. Bien.
- **🔴 Bug repetido:** el **delta de KPI está roto a ventanas largas** — "**▲ +1.839%**" (BA cobertura 12m), "+1.057%" (999d). Una cobertura antirrábica no varía +1000~1800%. (Ya venía de la ronda 1; a 12m/año es escandaloso.)

---

## BLOQUE D — Organización / refugio (alejo, 4 orgs)

Selector de org limpio ("**Seleccionar organización** — Pertenecés a 4 organizaciones"): Refugio (Palermo), Clínica (Recoleta), Red de Rescate (Puerto Madero), Autoridad sanitaria (Retiro), cada una con tipo · localidad · rol. Buen punto de partida para el cambio de sombrero.

### D1 · Mi trabajo pendiente (Refugio) → 🟡 mayormente sí
El panel del refugio **sí** te dice lo importante de un vistazo, **arriba**: "Primeros pasos 3/5" (faltan Servicios + Capacidad), KPIs **Ocupación 5 · Ingresos semana — · Disponibles 3 · Adopciones en curso 2**, "Requieren acción → Todo en orden", y un badge "2" en el nav de Operaciones que matchea las 2 adopciones.
- **Gaps:** las tarjetas de acción rápida de abajo (**Check-ins post-adopción, Propuestas emitidas, Tránsitos activos**) **no tienen contadores** → no sé *cuántos* vencen hoy sin abrir cada una. Y una **lista larga de "Tus permisos"** domina el home (ruido para el trabajo diario).
- **Tensión menor:** "Adopciones en curso 2" está en tarjeta ámbar (⚠) pero "Requieren acción: Todo en orden".

### D2 · Cambio de sombrero → 🟢 cada tipo muestra lo suyo (con matices)
- **Refugio:** nav completo de refugio (Tránsitos, Voluntarios, Operaciones/adopciones, Check-ins) + KPIs de custodia. Primeros pasos **3/5**.
- **Clínica:** **sin** las secciones de refugio; acción propia "**Registrar / firmar evento clínico**"; Primeros pasos **3/4** (sin "Capacidad del refugio"); **lista de Pendientes CON contadores** (Denuncias derivadas 0 · Casos 0 · Transferencias 0 · Permisos 0).
- **Autoridad sanitaria:** banner "rutina diaria" que destaca **Casos** + **Maltrato derivado** (su rol de fiscalización); misma lista de Pendientes con contadores.
- **🟡 Inconsistencia entre tipos:** el **refugio NO tiene** esa lista de "Pendientes" con contadores (Denuncias derivadas / Casos / Transferencias / Permisos) que **sí** tienen clínica y autoridad — usa quick-cards sin números. Y **clínica ≈ autoridad** (paneles casi idénticos; ambos muestran "Animales en custodia / Registrar ingreso", que suenan más a refugio que a una autoridad regulatoria pura). La diferenciación por tipo es real pero **despareja**.

### D3 · Maltrato derivado → 🟡 feature bien hecha, pero DEAD-END en el seed
La sección **Maltrato** existe y está bien: tabs **Recibidos / Emitidos**, botón "+ Nueva denuncia", empty-state claro, y en clínica/autoridad aparece en el panel como "Denuncias de maltrato derivadas (N)".
- **Pero:** **ninguna** de las orgs de alejo tiene una denuncia derivada — Autoridad, Refugio y Clínica muestran **0 / "Todavía no se derivó ninguna denuncia a esta organización"**. ⇒ **el escenario D3 no se puede ejercer end-to-end**: no hay nada que encontrar ni sobre qué actuar. El seed tiene denuncias del lado gobierno, pero **ninguna derivada al lado org**.
- **Y el gap de descubribilidad:** como el **panel del refugio no muestra el contador de derivadas** (solo clínica/autoridad lo tienen), un operador de refugio **tendría que cazarla en el menú** aunque existiera.

---

## Consistencia rótulo ↔ mapa ↔ números (lo crítico)

| Momento | Qué no coincide |
|---|---|
| **Link compartido en pestaña nueva** | Rótulo/KPIs/dock dicen "Buenos Aires · 14 registros" pero el **mapa queda en blanco** (caveat pestaña-de-fondo). |
| **`province=AR-ZZ`** | Rótulo "AR-ZZ", Registros 0, pero KPIs en "**Cargando indicadores…**" infinito (ni número ni error). |
| **Fence (lucas, provincia ajena)** | KPIs "**0%**" vs mapa/dock "**sin datos**" — dos formas de decir lo mismo (cosmético). |
| **Delta de KPI** | "▲ +1.839% / +1.057%" — el número de tendencia no puede ser real. |
| **Paneles de org** | Refugio (sin lista de Pendientes con contadores) vs Clínica/Autoridad (con contadores) — el mismo concepto se muestra distinto según el tipo. |

## Lo que funcionó muy bien
- **Hardening del panorama** (E1): botón-mash + Atrás + paneles no lo rompen; aterriza coherente.
- **Fence jurisdiccional** (E3): sólido, cero fuga en provincias ajenas.
- **No hay crash de revalidación** (E4): la sesión pesada sobre BA cobertura sigue viva; el peor caso degrada con un mensaje elegante y se recupera.
- **Selector de organización** y **diferenciación por rol** (D2): claro, cada tipo trae su nav y sus acciones.
- **Empty-states honestos** por todos lados ("Sin datos para esta capa", "Todavía no se derivó ninguna denuncia").

## Qué mejoraría (priorizado)
1. **Delta de KPI** (E2/E4): arreglar el cálculo de tendencia a 12m/año/999d (hoy da +1000~1800%).
2. **`province` inválida** (E2): cortar el "Cargando indicadores…" infinito → mostrar "provincia inválida" o volver a nacional.
3. **Paridad de paneles de org** (D1/D2/D3): darle al **refugio** la misma lista de "Pendientes" con contadores (incluida "Denuncias de maltrato derivadas") que tienen clínica/autoridad; y ponerle **contadores** a las quick-cards (check-ins, propuestas, tránsitos).
4. **Seed de D3:** derivar al menos una denuncia de maltrato a una org de demo, para que el flujo "maltrato derivado" sea demostrable de punta a punta.
5. **Link compartido** (E2): confirmar/arreglar el render del mapa al abrir una vista drilleada por URL en pestaña nueva.

### Anexo — cobertura de esta sesión
- **E1** admin: 5 navegaciones rápidas + Atrás×3 + mash de paneles del riel.
- **E2** admin: pestaña nueva con URL drilleada; `province=AR-ZZ`, `period=999d`, `preset=notreal`.
- **E3** lucas: forzado `province=AR-V` y `AR-Y` → 0 en todo.
- **E4** admin: churn BA cobertura (90d/12m) ↔ nacional ↔ BA brotes + esperas; confirmación de recuperación.
- **D1/D2/D3** alejo: paneles de Refugio, Clínica y Autoridad; Maltrato/Recibidos de Autoridad y Refugio.
- No creé datos.
