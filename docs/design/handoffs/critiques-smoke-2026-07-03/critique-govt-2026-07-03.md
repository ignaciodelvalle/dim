# Design Critique — Government role (gobierno / GOVT)

**Product:** MiMAR (Mi Mascota Argentina) · internal codename DIM
**Account:** `govt@dim.test` (Operador/a Gobierno · jurisdiction scope: **6 localidades** across Tierra del Fuego, Santa Cruz, CABA)
**Viewport:** Desktop (~1560 wide)
**Date:** 2026-07-03 · **Build:** integration `d4b2516c`

---

## Surfaces walked

Panel de jurisdicción (`/gob`) · Panorama / Centro de Situación (`/gob/panorama`) · Analítica (`/gob/analytics`) · Vigilancia epidemiológica (`/gob/vigilancia`) · Mortalidad y disposición (`/gob/mortalidad`) · Casos regulatorios (`/gob/casos`) · Maltrato / Ley 14.346 triage (`/gob/maltrato`) · Cola de aprobaciones (`/gob/cola`) · Organizaciones / Habilitación (`/gob/organizaciones`).

---

## Overall impression

This is the analytical heart of MiMAR and it is genuinely **public-health-grade**. Every dashboard is legally anchored (Ley 5470 disposal, Ley 14.346 abuse, Ley 14.107 microchip, Ley 4078 PPP, ENO notification, indicator codes A7–A12 / B3–B9), privacy is enforced and *disclosed* (k-anonymity: "celdas < 5 ocultas", "26 celdas ocultas por privacidad"), and there's a **"Buscó por PII" audit trail** of the operator's own personal-data lookups. Panorama even has a temporal "replay the situation forming" scrubber and question-framed view presets. The work here is exceptional. Because the data layer is so strong, the gaps that remain are almost entirely **presentation polish**: inconsistent metric definitions, "Top N" labels that don't match the row count, and pervasive raw-enum/English leakage in an otherwise Spanish product.

---

## Usability

| Finding | Severity | Recommendation |
|---|---|---|
| **Same metric, different numbers.** "Cobertura antirrábica" shows **42%** on the Panel and Panorama but **54%** on Analítica and Vigilancia. The definitions differ (partido-weighted vs "pets con ≥1 antirrábica"), but the **label is identical**, so an operator sees two truths for one KPI. | 🟡 Moderate | Disambiguate the labels ("Cobertura antirrábica (partidos)" vs "(pets vacunados)") or unify the denominator. For a compliance dashboard, a single canonical definition is safest. |
| **"Top N" labels don't match content.** Analítica shows "Top 5 provincias" but renders **3**; "Top 10 causas de muerte" renders **5**; and with only 3 jurisdictions the "Mayor cobertura" and "Menor cobertura" tables are the **same three rows reversed**. | 🟡 Moderate | Make the heading reflect the actual count ("Provincias por cobertura (3)") and suppress the redundant twin table when N is small. |
| **List pagination is inconsistent.** Maltrato paginates ("Página 1 de 3 · 117 denuncias"); Casos renders a very long single scroll of ~45 expedientes with no pager. | 🟢 Minor | Apply the same paginated list pattern to Casos. |
| **Future-dated data leaks into the UI.** Multiple surfaces footer "último evento 15/10/26" and outbreak "PICO 14 de oct de 2026" — dates after today (03/07/26). | 🟢 Minor | Likely seed data, but clamp/validate event dates so a public-health console never shows future events as real. |
| **Approvals & habilitación are clear** (empty queue with typed filters: matrículas / verificación de orgs / RUPGA assistance-dog credentials; verify/revoke on orgs). No usability issue — just note the destructive **"Revocar verificación"** should confirm. | 🟢 Minor | Add a confirm step to Revocar verificación. |

## Visual hierarchy

- The **Panel de jurisdicción** triages beautifully: severity-tagged KPI tiles (⚠ Atención / ⚠ Peligro / ● Normal), then mortality, then compliance, then the bite time-series, then queues (approvals, PII activity, regulatory cases, denuncias, pérdidas). An operator gets situational awareness in one screen.
- Severity color + word pairing is consistent and legible (danger red for "Casos zoonosis activos 3", amber for coverage gaps).
- Panorama's **question-framed view presets** ("¿Dónde hay brotes activos sobre huecos de vacunación?") are an excellent way to guide non-analyst officials to the right lens.

## Consistency

| Element | Issue | Recommendation |
|---|---|---|
| Localization (biggest cluster) | Raw enum / English strings leak throughout: **"PETS TOTALES"**, **"PETS HOY"**, **"Signals" / "SIGNALS"**, disease codes **"lepto"** shown next to a proper **"Leptospirosis"** row, **"rabies_suspected"**, and species **"dog" / "cat"** in Vigilancia signals. | Route all enums (species, disease, signal-type) and section headings through the i18n layer. This is the single most visible polish gap across govt + org portals. |
| Missing accents | "Abrir investigacion", "Brotes historicos", "Metodos", "adopcion", "Proponer verificacion", "desde aca". | Spellcheck pass for Spanish diacritics. |
| Case-code casing | Codes mix cases: `CAS-QAff-34d9`, `CAS-QA0c-f92a` vs uppercase `CAS-45Q4-SV8Q`. | Normalize token casing on render (likely seed, but display uppercase consistently). |
| k-anonymity edge | Mortalidad hides cells < 5 yet shows an aggregate "Santa Cruz (otras localidades) 2". | Confirm the aggregate bucket is intended to be exempt; otherwise it contradicts the stated rule. |

## Accessibility

- **Charts ship text descriptions** ("Gráfico de barras horizontales: distribución de fallecimientos por método…") and explicit scale notes — excellent, well above typical dashboard accessibility.
- KPI tiles expose "ⓘ Información sobre este indicador" as real labeled buttons.
- Severity is encoded by icon + word + color (not color alone) — good.
- Verify the choropleth maps (Vigilancia, Analítica) have a non-visual equivalent; there's a "Ver datos" toggle which likely covers this — confirm it exposes a data table.
- Check contrast of the muted footer meta ("Calculado al…") and the amber KPI numerals on their tinted tiles.

## What works well

- **Legally-anchored metrics** with indicator codes (A7–A12, B3/B4/B9) — traceable to statute and audit-ready.
- **Privacy by construction**: k-anonymity suppression with counts of hidden cells; PII-search audit log; "internal notification queue, not external delivery" honesty on the ENO SLA.
- **Honest demo disclaimer** on Panorama ("dataset sintético… no representa casos reales").
- **Rabies 10-day legal compliance** tracking (A8/A9) with "2 observaciones fuera del plazo legal" surfaced as danger — this is the product's welfare mission made operational.
- **Temporal replay** scrubber and **CSV export** for analysts.
- **Severity taxonomy** on abuse denuncias (CRÍTICA — peligro inmediato → BAJA — preocupante, no urgente) is clear and actionable.

## Priority recommendations

1. **One definition per metric.** Fix the 42% vs 54% "cobertura antirrábica" split (disambiguate labels or unify denominator) — critical for a compliance tool.
2. **Complete the Spanish localization.** Kill raw enums/English (PETS, Signals, lepto, dog/cat, rabies_suspected) and add missing accents. It's the most pervasive polish issue.
3. **Fix "Top N" labels and redundant small-N tables**, and paginate Casos like Maltrato.

## Notes / to verify

- No approvals were actioned and no verification revoked (side-effectful governance actions) — queues/forms inspected structurally only.
- The govt dashboards were the heaviest to render (slow paints / screenshot retries). A production performance profile on `/gob/*` is worth doing, but the app itself never errored here (unlike the org adoptions crash).
