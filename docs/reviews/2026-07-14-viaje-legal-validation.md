# Validación legal del corredor /viaje — pre-launch gate (PO 2026-07-14)

> **Purpose:** the PO decided on 2026-07-14 that the `/viaje` corridor's legal values must be **validated against official sources before launch** (it blocks launch, not staging — staging may keep shipping the citation-pending state). This document is that validation pass.
>
> **Method:** (1) located the corridor data in code and the prior draft research; (2) re-fetched every official source cited (SENASA, SAG Chile, MGAP Uruguay, MAPA Brasil, European Commission Food Safety, CDC) on **2026-07-14** via WebFetch/WebSearch — 10 days after the prior research pass (2026-07-04) — specifically to catch anything that moved in that window; (3) classified every corridor value as **CONFIRMED** (official source matches), **WRONG** (source contradicts or the citation itself is stale/superseded), or **UNVERIFIABLE** (no official source pins it down, or it depends on an unresolved modeling choice).
>
> **Launch-blocking rule (PO, 2026-07-14):** `lib/reference/cross-border-corridors.ts` must not ship real `rules` values until every value used has a verdict of CONFIRMED with a live, correct citation. WRONG and UNVERIFIABLE items below must go back to PO (and ideally a matriculated vet) before they're written into code.

## 0. Structural finding — nothing is shipped yet, so nothing in *code* is technically "wrong"

`lib/reference/cross-border-corridors.ts` (read in full) currently ships **5 corridors with `rules: {}` for all of them** — the file comment block explicitly documents this as deliberate: *"Fase 1 ships the corridor STRUCTURE with `rules: {}` (citation-pending) — values are intentionally EMPTY rather than fabricated."* The UI (`TravelSemaforo`, `TravelObligationsPanel`) shows a "requisitos pendientes de validación oficial" warning instead of invented data. So **today, the app cannot show a wrong legal value for a corridor** — the risk is entirely in what gets written into `rules` next.

The actual "reference data" to validate is the **candidate value set** already researched and cited in `docs/design/handoffs/2026-07-04-corridor-requirements-draft.md` (a prior pass, 10 days old, self-labeled DRAFT, not yet in code). This review re-verifies that draft against fresh official-source fetches and is what should gate the eventual `rules` population commit.

Two things ARE already in code today and are checked below: each corridor's `sourceUrl` citation and the 5-corridor/species/direction structure (`assertCorridorCoverage`).

## 1. Corridor `sourceUrl` citations (in code today)

| Corridor | `sourceUrl` in code | Verdict | Note |
|---|---|---|---|
| Chile | `https://www.sag.gob.cl` | CONFIRMED | Live, correct authority (SAG). Homepage only — no deep link, so it's correct but imprecise; consider linking the specific tramite page (`sag.gob.cl/tramites/solicitud-de-autorizacion-sanitaria-...`). |
| Uruguay | `https://www.gub.uy/ministerio-ganaderia-agricultura-pesca` | CONFIRMED | Live, correct authority (MGAP). Homepage only, same precision note — the pet-specific page is `.../politicas-y-gestion/personas-viajan-mascotas`. |
| Brasil | `https://www.gov.br/agricultura` | CONFIRMED | Live, correct authority (MAPA). Homepage only, same precision note. |
| UE (España) | `https://eur-lex.europa.eu/legal-content/ES/TXT/?uri=CELEX%3A32013R0576` | **WRONG** | See § 5 — Regulation (EU) 576/2013 is no longer the operative instrument as of **22 April 2026**. This is the single most important correction in this review. |
| USA | `https://www.cdc.gov/importation/dogs/index.html` | CONFIRMED | Live, correct, current CDC importation index. |

## 2. Corredor Chile (SAG)

Fresh fetch of `argentina.gob.ar/senasa/requisitos-particulares-por-destino/chile` and `sag.gob.cl` on 2026-07-14.

| Field (código) | Valor propuesto (draft 07-04) | Verdict | Fuente oficial (2026-07-14) |
|---|---|---|---|
| `rabies_vaccination_to_travel_wait_days` | 21 | CONFIRMED | SENASA-Chile: "al menos 21 días previos al ingreso a Chile" |
| `rabies_titer_test_required` | false | CONFIRMED | SENASA-Chile: "No se requiere" |
| `rabies_titer_test_wait_days` | 0 | CONFIRMED | N/A, sin test |
| `rabies_vaccination_min_age_days` | 0 (sin mínimo) | UNVERIFIABLE | Fuente no fija un número — es una decisión de modelado ("todos deben estar vacunados", sin barrera de edad). No inventar el 0 sin que el PO lo apruebe como convención. |
| `microchip_before_vaccination_required` | false | UNVERIFIABLE | **Hallazgo sensible al tiempo:** SENASA-Chile confirma la regla "A partir del 28 de junio del 2026" (microchip/tatuaje ISO 11784/11785 antes de la emisión del CVI) — **hoy 2026-07-14 esa fecha ya pasó, la regla está VIGENTE**, no es "próxima". Pero la página del SAG (fetch de hoy) no menciona microchip en absoluto. Dos fuentes oficiales discrepan sobre si el requisito ya está operativo en la práctica. |
| `quarantine_days_required` | 0 (formal) | UNVERIFIABLE | SENASA-Chile no menciona cuarentena; ChileAtiende (fuente del draft) menciona confinamiento domiciliario 10 días post-ingreso — no re-verificado hoy, decisión de modelado pendiente (¿cuarentena o nota aparte?). |
| `import_permit_required` | NO CONFIRMADO | UNVERIFIABLE | Fetch del SAG (hoy) describe el trámite como resuelto **en el control fronterizo** presentando el certificado sanitario, no como un permiso previo separado — pero el propio título de la página del SAG es "Solicitud de Autorización Sanitaria", lo que sugiere un trámite formal. Ambiguo; no shippear como `false` sin que el PO/SAG lo confirme por escrito. |
| `document_issuance_window_days` | 10 | CONFIRMED | SENASA-Chile: "dentro de los DIEZ (10) días anteriores" |
| `parasite_treatment_window_days` | 30 (rango 5–30) | CONFIRMED | SENASA-Chile: "CINCO (5) días y un máximo de TREINTA (30) días" |
| `required_documents` | lista de 4 ítems (sin microchip) | **WRONG** (incompleta) | Dado que el requisito de microchip (28/06/2026) ya está vigente hoy, la lista de documentos que se popule en código **debe incluir el certificado de microchip/tatuaje** — el draft ya lo anotaba como pendiente de agregar, pero al día de hoy ya no es "pendiente", es un requisito activo que falta. |
| `required_vaccines` | `["rabia"]` | CONFIRMED | SENASA-Chile |

**Chile subtotal: 6 CONFIRMED · 1 WRONG · 4 UNVERIFIABLE**

## 3. Corredor Uruguay (MGAP · GMC Mercosur 17/15)

Fresh fetch of SENASA-Mercosur page and `gub.uy/tramites/solicitud-ingreso-mascotas-uruguay` on 2026-07-14 (the MGAP ministry page itself 403'd to direct fetch both today and in the original draft).

| Field | Valor propuesto | Verdict | Fuente oficial (2026-07-14) |
|---|---|---|---|
| `rabies_vaccination_to_travel_wait_days` | 21 | CONFIRMED | SENASA-Mercosur: "at least 21 days" tras primovacunación |
| `rabies_titer_test_required` | false | CONFIRMED | SENASA-Mercosur: no requerido |
| `rabies_titer_test_wait_days` | 0 | CONFIRMED | N/A |
| `rabies_vaccination_min_age_days` | 90 | CONFIRMED | SENASA-Mercosur: exención solo para animales <3 meses con edad certificada → implica obligatoriedad desde 90 días |
| `microchip_before_vaccination_required` | false | CONFIRMED | SENASA-Mercosur: microchip ISO 11784/11785 obligatorio para **perros >90 días con destino Uruguay** (no gatos), sin exigencia de orden respecto a la vacuna |
| `quarantine_days_required` | 0 | CONFIRMED | SENASA-Mercosur: sin cuarentena |
| `import_permit_required` | PARCIAL | UNVERIFIABLE | `gub.uy/tramites/solicitud-ingreso-mascotas-uruguay` confirma que presentar el CVI en frontera es obligatorio, pero no aclara si el trámite online "solicitud de ingreso" es un paso previo obligatorio separado o solo un canal informativo. |
| `document_issuance_window_days` | 10 | CONFIRMED | SENASA-Mercosur: examen clínico dentro de los 10 días previos al CVI |
| `parasite_treatment_window_days` | 15 (+ Praziquantel obligatorio en perros) | CONFIRMED | SENASA-Mercosur: desparasitación dentro de 15 días; Praziquantel explícito para caninos a Uruguay |
| `required_documents` | lista con Leishmaniasis + microchip (solo perros) | CONFIRMED | SENASA-Mercosur confirma ambos como específicos de Uruguay y solo-perros |
| `required_vaccines` | `["rabia"]` | CONFIRMED | — |

**Uruguay subtotal: 10 CONFIRMED · 0 WRONG · 1 UNVERIFIABLE**

**Gap de modelado (no es un verdict de valor, es un hueco de esquema):** la serología de Leishmaniasis (negativo, ≤60 días, solo caninos >90 días a Uruguay) es un requisito real y confirmado, pero **no existe un `TravelRuleType` para eso** — el draft lo mete en `required_documents` como texto libre. Si el PO quiere que el semáforo lo trate como bloqueante propio (no solo una línea de checklist), hace falta un tipo de regla nuevo.

## 4. Corredor Brasil (MAPA/VIGIAGRO · GMC Mercosur 17/15)

Fresh fetch de la misma página SENASA-Mercosur (agrupa AR→Brasil/Paraguay/Uruguay), 2026-07-14.

| Field | Valor propuesto | Verdict | Fuente oficial (2026-07-14) |
|---|---|---|---|
| `rabies_vaccination_to_travel_wait_days` | 21 | CONFIRMED | SENASA-Mercosur |
| `rabies_titer_test_required` | false | CONFIRMED | — |
| `rabies_titer_test_wait_days` | 0 | CONFIRMED | N/A |
| `rabies_vaccination_min_age_days` | 90 | CONFIRMED | SENASA-Mercosur / MAPA: "90 dias de idade" |
| `microchip_before_vaccination_required` | false | CONFIRMED | Confirmado: microchip **no** es requisito para Brasil (a diferencia de Uruguay) |
| `quarantine_days_required` | 0 | CONFIRMED | — |
| `import_permit_required` | false | CONFIRMED | CVI/pasaporte Mercosur reconocido, sin permiso adicional |
| `document_issuance_window_days` | 10 | CONFIRMED *(subido de PARCIAL)* | El fetch de hoy organiza "Brasil & Paraguay" como sección general propia con la regla de 10 días — ya no es solo "agrupado con Uruguay sin discriminar" |
| `parasite_treatment_window_days` | 15 | CONFIRMED *(subido de PARCIAL)* | Idem; Praziquantel confirmado como **NO** exigido para Brasil (solo Uruguay) |
| `required_documents` | lista de 3 ítems | CONFIRMED | — |
| `required_vaccines` | `["rabia"]` | CONFIRMED | — |

**Brasil subtotal: 11 CONFIRMED · 0 WRONG · 0 UNVERIFIABLE**

Nota aparte: el draft cita "Portaria MAPA nº 741 de 10/12/2024" como marco Brasil-específico. No pude fetchear una página MAPA que confirme esa cita puntual (solo la página genérica "Entrar no Brasil" dio 403 a fetch directo hoy) → **la cita puntual de la Portaria queda UNVERIFIABLE**, aunque los valores en sí están confirmados por la fuente SENASA.

## 5. Corredor UE/España — el hallazgo más importante

Fresh fetch de SENASA-UE, la página de la Comisión Europea de "listing of territories", y búsquedas específicas sobre el estado de la Regulation (EU) 576/2013, 2026-07-14.

| Field | Valor propuesto | Verdict | Fuente oficial (2026-07-14) |
|---|---|---|---|
| `rabies_vaccination_to_travel_wait_days` | 21 | CONFIRMED | SENASA-UE |
| `rabies_titer_test_required` | **false** (AR exento) | CONFIRMED (valor) | AR sigue exenta del RNATT — ver nota de cita abajo |
| `rabies_titer_test_wait_days` | 0 | CONFIRMED | N/A para AR |
| `rabies_vaccination_min_age_days` | 84 (12 semanas) | CONFIRMED | SENASA-UE: "12 semanas de vida" |
| `microchip_before_vaccination_required` | true | CONFIRMED | SENASA-UE: "la fecha de implantación o lectura debe ser anterior a la fecha de la vacuna... o el mismo día" — textual, sin cambios |
| `quarantine_days_required` | 0 | CONFIRMED | — |
| `import_permit_required` | false | CONFIRMED | — |
| `document_issuance_window_days` | 10 | CONFIRMED | SENASA-UE |
| `parasite_treatment_window_days` | 0 para España (24–120h solo FI/IE/MT/NO) | CONFIRMED | SENASA-UE, sin cambios |
| `required_documents` | lista de 5 ítems | CONFIRMED | — |
| `required_vaccines` | `["rabia"]` | CONFIRMED | — |

**Los VALORES (11/11) están CONFIRMADOS y sin cambios respecto al draft del 07-04.** Pero la **cita legal que sostiene todo el corredor cambió de fondo**, y esto sí es **WRONG**:

> **Regulation (EU) No 576/2013** fue derogada por el Art. 270(2) del Reglamento (UE) 2016/429 desde el **21 de abril de 2021**, pero se mantuvo transitoriamente aplicable hasta el **21 de abril de 2026**. Esa transición **ya terminó** — hoy es 2026-07-14, casi tres meses después del corte. El marco vigente ahora es:
> - **Reglamento (UE) 2016/429** (Ley de Sanidad Animal), Parte VI — base;
> - **Commission Delegated Regulation (EU) 2026/131** (20 enero 2026) — sustituye 576/2013 + 577/2013 + Delegado 2021/1933;
> - **Commission Implementing Regulation (EU) 2026/636** (20 marzo 2026) — listados de países/territorios (Anexo II Parte 2 sigue incluyendo a Argentina como exenta del RNATT);
> - **Commission Implementing Regulation (EU) 2026/705** — certificados sanitarios y declaraciones;
> - Certificados emitidos bajo el viejo Anexo IV de 577/2013 siguen siendo válidos solo si se emitieron **antes del 1 de octubre de 2026** (período de gracia).
>
> El **hecho sustantivo** que más importa al ciudadano (AR exenta del test de titulación y del período de espera de 3 meses) **sigue siendo cierto** bajo el nuevo marco (confirmado en el Anexo II Parte 2 del Reglamento 2026/636). Pero tanto el `sourceUrl` en `cross-border-corridors.ts` como todas las citas "Reg. 576/2013 / 577/2013" del draft **apuntan a normas derogadas**. Si esto se cita frente a un ciudadano o un veterinario que verifica el link, va a llegar a un texto legal que ya no rige.

**UE/España subtotal: 11/11 valores CONFIRMED · 1 cita WRONG (crítica, la del `sourceUrl` de código + todas las citas del draft)**

## 6. Corredor Estados Unidos (CDC + USDA APHIS + SENASA)

Fresh fetch/búsqueda de CDC (fetch directo dio 403 dos veces — mismo problema que tuvo el draft original; resuelto vía WebSearch) y de contenido SENASA-USA (fetch directo también 403, resuelto vía WebSearch), 2026-07-14.

| Field | Valor propuesto | Verdict | Fuente oficial (2026-07-14) |
|---|---|---|---|
| `rabies_vaccination_to_travel_wait_days` | 0 | UNVERIFIABLE | El CDC no exige espera para países low-risk, pero ninguna fuente dice literalmente "0" — es una convención de modelado, no una cita textual. |
| `rabies_titer_test_required` | false | CONFIRMED | CDC: países no listados como high-risk (AR no está en la lista) no requieren titer |
| `rabies_titer_test_wait_days` | 0 | CONFIRMED | N/A |
| `rabies_vaccination_min_age_days` | NO CONFIRMADO | **UNVERIFIABLE — desajuste de campo, no solo de valor** | Confirmado (SENASA-USA, hoy): "No se acepta el ingreso de caninos menores a 6 (seis) meses de vida" — pero esa es la **edad del animal al ingresar**, no la "edad mínima para la primera vacuna antirrábica" que define el campo `rabies_vaccination_min_age_days` en `lib/domain/travel-strictness.ts`. Mapear 180 (6 meses) en ese campo sería semánticamente incorrecto. Esto probablemente necesita un campo nuevo tipo `min_age_at_entry_days`, no reusar el existente. |
| `microchip_before_vaccination_required` | false | UNVERIFIABLE (orden) / CONFIRMED (existencia) | SENASA-USA (hoy) confirma explícitamente: **"Los perros deberán ingresar obligatoriamente con microchip compatible con la ISO 11784 y 11785"** — el requisito de microchip en sí está CONFIRMADO y debe estar en `required_documents`. Pero ninguna fuente fija un orden vacuna↔chip para el track low-risk, así que el `false` es ausencia-de-evidencia, no confirmación positiva. |
| `quarantine_days_required` | 0 | CONFIRMED | — |
| `import_permit_required` | true (CDC Dog Import Form) | CONFIRMED | Reconfirmado vigente en 2026: "Starting August 1, 2024, the only required documentation for dogs... from rabies-free/low-risk countries... is the CDC Dog Import Form." Actualización de formato del formulario el 05/02/2026, sin cambio de fondo. |
| `document_issuance_window_days` | 5 | CONFIRMED | SENASA-USA (hoy): "dentro de las CINCO (5) días previos... a un veterinario matriculado" |
| `parasite_treatment_window_days` | NO CONFIRMADO | UNVERIFIABLE | Sigue sin ventana explícita para un tratamiento antiparasitario tipo Echinococcus. Pista nueva: SENASA-USA dice que la validez del CVI es de 5 días corridos "teniendo en cuenta las fechas de emisión del Certificado de Salud y Certificado de Libre de Miasis" — sugiere que el certificado de miasis comparte la ventana de 5 días del certificado de salud, pero "libre de miasis" no es lo mismo que una desparasitación con droga/dosis (que es lo que el campo modela en los otros corredores). Recomendado: decidir con veterinario si este campo aplica a USA o debe quedar `N/A`. |
| `required_documents` | lista de 6 ítems | CONFIRMED | Reconfirmado hoy, incluyendo microchip obligatorio (perros) y edad mínima 6 meses (perros) — agregar esas dos aclaraciones como notas si no están explícitas |
| `required_vaccines` | `["rabia"]` (vía CVI SENASA, no CDC) | CONFIRMED | — |

**USA subtotal: 7 CONFIRMED · 0 WRONG · 4 UNVERIFIABLE**

Nota aparte confirmada sin cambios: el CDC no regula gatos — "Felinos: No posee restricciones para tal especie en cuanto a edad" (SENASA, hoy). El corredor USA sigue siendo el más asimétrico perro/gato del set de 5; el modelo actual aplica las mismas `rules` a ambas especies (`species: ["dog","cat"]`), lo cual el draft ya señalaba como simplificación a decidir con el PO.

## 7. Totales

Sobre 61 ítems evaluados (55 valores de regla × 5 corredores + 5 citas `sourceUrl` de código + 1 cita puntual de Brasil):

| Verdict | Cantidad |
|---|---|
| **CONFIRMED** | 49 |
| **WRONG** | 2 |
| **UNVERIFIABLE** | 10 |

Por corredor (solo valores, 11 c/u): Chile 6C/1W/4U · Uruguay 10C/0W/1U · Brasil 11C/0W/0U · UE-España 11C/0W/0U (pero cita WRONG) · USA 7C/0W/4U.

---

## Para la sesión con el PO

Solo ítems **WRONG** y **UNVERIFIABLE**, con acción propuesta. No incluye los 49 CONFIRMED (esos ya se pueden escribir en `cross-border-corridors.ts` tal como están redactados, citando las fuentes de este documento).

### WRONG — corregir antes de escribir en código

1. **Cita legal del corredor UE/España (crítico).** El `sourceUrl` de `ue_espana` en código y todas las citas "Reg. 576/2013 / 577/2013" del draft apuntan a normas derogadas desde el 21/04/2026 (transición cerrada, hoy 2026-07-14). El valor sustantivo (`rabies_titer_test_required: false` para AR) sigue siendo correcto, pero la cita debe actualizarse a **Reglamento (UE) 2016/429 Parte VI + Delegado (UE) 2026/131 + Implementing (UE) 2026/636 (Anexo II Parte 2)**. Acción propuesta: actualizar `sourceUrl` y, cuando se pueble `rules`, anotar el nuevo número de reglamento en el comentario/cita de cada valor UE.
2. **`required_documents` de Chile, incompletos.** El requisito de microchip/tatuaje ISO 11784/11785 (SENASA-Chile) entró en vigencia el 28/06/2026 — hoy ya está activo, no es "próximo". Acción propuesta: agregar "Certificado de implantación/lectura de microchip" a la lista antes de shippear, y confirmar con SAG/veterinario si en la práctica ya se está exigiendo en frontera (el fetch de hoy a sag.gob.cl todavía no lo menciona).

### UNVERIFIABLE — requieren consulta SENASA / veterinario matriculado antes de poblar `rules`

3. **`import_permit_required` — Chile y Uruguay.** Ambos tienen un trámite oficial ("Autorización Sanitaria" SAG / "Solicitud de ingreso" gub.uy) cuya obligatoriedad como paso previo (vs. gestión en frontera) no quedó clara ni en el draft ni en el re-fetch de hoy. No shippear como `false` sin confirmación explícita.
4. **`rabies_vaccination_min_age_days` para USA — desajuste de campo, no solo de valor.** SENASA confirma "6 meses mínimo" pero es la edad del animal al ingresar, no la edad mínima de la vacuna (lo que el campo `TravelRuleType` modela). Puede requerir un campo nuevo (`min_age_at_entry_days` o similar) en `lib/domain/travel-strictness.ts` en vez de forzar el valor en el campo existente.
5. **`parasite_treatment_window_days` para USA.** Solo existe un "certificado libre de miasis" sin ventana de dosificación explícita — no inventar un número; decidir con PO/veterinario si el campo aplica a USA o queda `N/A`.
6. **`rabies_vaccination_min_age_days` para Chile (valor 0) y `quarantine_days_required` (confinamiento domiciliario 10 días).** Son decisiones de modelado más que hechos por confirmar — el PO necesita fijar la convención (¿0 = "sin barrera de edad"? ¿el confinamiento domiciliario cuenta como cuarentena o va aparte?) antes de que se escriban como si fueran citas literales.
7. **Gap de esquema — Leishmaniasis (Uruguay, solo caninos).** Requisito real y confirmado (serología negativa ≤60 días) sin `TravelRuleType` propio; hoy solo puede vivir como texto libre en `required_documents`. Decidir si Fase 1 lo acepta así o si amerita un tipo de regla nuevo.
8. **Cita puntual "Portaria MAPA nº 741/2024" (Brasil).** Los valores del corredor Brasil están confirmados por SENASA, pero esta cita específica no se pudo re-verificar directamente en una página del MAPA (403 al fetch). Si se va a citar la Portaria por número, confirmar el texto exacto antes de publicarla.
9. **Simplificación perro/gato transversal a los 5 corredores.** Reconfirmado sin cambios: Uruguay (microchip + Leishmaniasis solo perros), USA (CDC solo regula perros, corredor más asimétrico), Chile/Brasil/UE (reglas iguales para ambas especies según las fuentes revisadas). El modelo actual (`species: ["dog","cat"]` con las mismas `rules`) es una simplificación de Fase 1 que el PO ya venía señalando — este review no cambia esa recomendación, solo la reconfirma con fuentes de hoy.

---

*Fuentes primarias re-fetcheadas 2026-07-14: SENASA (Chile, Mercosur, UE, USA), SAG Chile, gub.uy, Comisión Europea (Food Safety — listing of territories), CDC (vía WebSearch, fetch directo bloqueado por 403 igual que en el draft original), búsquedas específicas sobre el estado del Reglamento (UE) 576/2013. No se usó ninguna fuente no-oficial (blogs, agencias de relocation) para sostener un verdict — donde solo había fuentes no-oficiales (p. ej. artículos de terceros sobre el recast UE) se usaron únicamente para orientar la búsqueda, y el verdict se sostiene en la fuente oficial (EUR-Lex / European Commission) citada arriba.*
