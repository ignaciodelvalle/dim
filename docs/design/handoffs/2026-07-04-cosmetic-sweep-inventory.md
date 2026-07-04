## Ground truth

| | |
|---|---|
| **Branch** | `integration/all-20260703` |
| **HEAD** | `888b86a9` |

Verified with: `git -C C:/dev/dim branch --show-current` · `git -C C:/dev/dim rev-parse --short HEAD`

---

## 1. Gender concordance

Helpers exist: `lostBannerHeadline`, `lostFirstPersonLine`, `lostThirdPersonPhrase`, `foundParticiple` in `lib/utils/format.ts` (+ tests in `__tests__/lost-sex-copy.test.ts`).

| # | file:line | current string/code | proposed es-AR fix | HEAD? |
|---|-----------|---------------------|-------------------|-------|
| 1 | `components/ui/StatusFlag.tsx:35` | `label: "PERDIDO"` (all pets) | Derive from `pet.sex`: `PERDIDO` / `PERDIDA` / `PERDIDO/A` | Y |
| 2 | `components/PetCard.tsx:31` | `URGENTE · perdido` | `URGENTE · perdido` / `URGENTE · perdida` / `URGENTE · perdido/a` via sex | Y |
| 3 | `app/(app)/mis-mascotas/[publicToken]/cartel/PosterPreview.tsx:104` | `PERDIDA` (banner) | Sex-aware: `PERDIDO` / `PERDIDA` / `SE BUSCA` | Y |
| 4 | `app/(public)/p/[publicToken]/page.tsx:86` | `está perdida` (metadata) | `está ${lostThirdPersonPhrase(pet.sex)}` or neutral `se perdió` | Y |
| 5 | `app/(app)/mis-mascotas/[publicToken]/perdida/MarkLostWizard.tsx:125` | `` `Marcar ${petName} como perdida` `` | Pass `petSex`; use `lostThirdPersonPhrase` / `Marcar … como perdido/a` | Y |
| 6 | `app/(app)/mis-mascotas/[publicToken]/perdida/MarkLostWizard.tsx:101` | `` `…está perdida — ayudanos…` `` | Sex-aware: `está perdido/a` / `se perdió` | Y |
| 7 | `lib/events/events.ts:403-404` | `"Marcada como perdida"` / `"Marcada como encontrada"` | Use `pet.sex` at write/render or neutral `se perdió` / `volvió a estar activa` | Y |
| 8 | `app/(app)/mis-mascotas/[publicToken]/SheetMounter.tsx:433,447` | `"Marcar como encontrada"` | `Marcar como ${foundParticiple(petSex)}` (needs sex prop) | Y |
| 9 | `app/(app)/mis-mascotas/[publicToken]/anotar/handoff.ts:94,100` | Static capture labels | OK as imperative; optional sex-aware labels if pet context available | Y (low) |

**Already sex-aware (skip):** `components/pet-profile/LostPublicCredential.tsx:123,154` · `components/pet-profile/LostCaseBlock.tsx:114,156,180` · `lib/utils/format.ts:111-152`

**Found via:** `rg 'PERDIDO|PERDIDA|perdido|encontrada' app components lib --glob '*.{tsx,ts}'`

---

## 2. Pluralization (días / relative time)

| # | file:line | current string/code | proposed es-AR fix | HEAD? |
|---|-----------|---------------------|-------------------|-------|
| 1 | `lib/utils/format.ts:247` | `` `hace ${diffDay} días` `` (2–6 only; 1 = `ayer`) | Already OK for 2–6; keep | N (1d OK) |
| 2 | `components/pet-profile/LostPublicCredential.tsx:314` | `` `hace ${Math.floor(h / 24)} días` `` | `hace 1 día` when days === 1 | Y |
| 3 | `app/(app)/inicio/page.tsx:429` | `` `en ${reminder.daysUntilDue} días` `` / `` `−${…} días` `` | `en 1 día` / `−1 día` when abs === 1 | Y |
| 4 | `lib/infra/notifications.ts:277,281,285` | `` `…en ${daysUntilDue} días` `` / `` `…hace ${absDays} días` `` | Singular when value === 1 | Y |
| 5 | `app/gob/perdidas/_components/LostPetRow.tsx:21` | `` `hace ${days} días` `` | `hace 1 día` when days === 1 | Y |
| 6 | `app/admin/observaciones/page.tsx:39` | `` `hace ${days} días` `` | Same singular rule | Y |
| 7 | `app/gob/maltrato/_components/WelfareDenunciaRow.tsx:41` | `` `hace ${diffDays} días` `` | Same singular rule | Y |

**Already correct:** `app/(app)/inicio/_components/RemindersSection.tsx:39-46` · `app/(app)/mis-mascotas/[publicToken]/_components/PetReminders.tsx:38-45` · `lib/utils/format.ts:246` (`ayer`)

**Found via:** `rg 'hace \$\{|vence en|en \$\{.*d[ií]as' lib app components --glob '*.{tsx,ts}'`

---

## 3. Spacing / punctuation

| # | file:line | current string/code | proposed es-AR fix | HEAD? |
|---|-----------|---------------------|-------------------|-------|
| 1 | `components/NotificationCard.tsx:40-41` | `{severityLabel}{"·"}{typeLabel}` (no space after ·) | `{severityLabel} · {typeLabel}` → e.g. `Atención · Vacuna próxima a vencer` | Y |
| 2 | `app/gob/reglas/AdminReglasLens.tsx:114,152,175` | `"Ver reglas ->"` / `"Ver ->"` | `Ver reglas →` / `Ver →` | Y |
| 3 | `app/gob/reglas/[country]/[province]/[locality]/page.tsx:169` | `"Configurar ->"` | `Configurar →` | Y |
| 4 | `app/admin/observaciones/page.tsx:213` | `"Cerrar profesionalmente ->"` | `Cerrar profesionalmente →` | Y |
| 5 | `app/gob/reglas/[country]/[province]/[locality]/nueva/PppAttestationRegistriesForm.tsx:106,114` | `"Required"` / `"Optional"` / `"Marcar required"` | `Obligatorio` / `Opcional` / `Marcar obligatorio` | Y |

**Not found at HEAD:** `ATENCIÓN·VACUNA` glued string · duplicated `Vacunación antirrábica · Vacunación antirrábica` (`rg 'ATENCIÓN|Vacunación antirrábica.*Vacunación' app components lib`).

---

## 4. Internal-prefix leaks (PANO —)

| # | file:line | current string/code | proposed es-AR fix | HEAD? |
|---|-----------|---------------------|-------------------|-------|
| 1 | `app/(app)/inicio/page.tsx:308` | `` `${pet.name} · ${offering.displayName}` `` | Strip/normalize seed prefix in read path or fix seed (`scripts/seed-panorama.ts:2324`) | Y (data + display) |
| 2 | `scripts/seed-panorama.ts:2324,3458` | `` displayName: `PANO — ${…}` `` | User-facing label without `PANO —` (seed-only source) | Y (seed) |

**Found via:** `rg 'PANO —' app components src` (user UI only via `offering.displayName` on `/inicio` agenda)

---

## 5. Brand drift (DIM → MiMAR)

| # | file:line | current string/code | proposed es-AR fix | HEAD? |
|---|-----------|---------------------|-------------------|-------|
| 1 | `db/triggers.sql:58` | `'¡Bienvenido a DIM, ' \|\| …` | `'¡Bienvenido a MiMAR, ' \|\| …` | Y |
| 2 | `db/migrations/0091_welcome_notification_cta.sql:39` | Same welcome title | Same fix in migration mirror / re-apply trigger | Y |
| 3 | `app/gob/outreach/page.tsx:290` | `"…registradas en DIM en los últimos 30 días…"` | `"…registradas en MiMAR…"` | Y |
| 4 | `app/gob/outreach/page.tsx:106` | `"…eventos registrados en DIM."` (KPI caveat) | `"…en MiMAR."` | Y |
| 5 | `app/(public)/acerca/page.tsx:27,32` | `"DIM — Documento de Identificación…"` | Keep legal descriptor; lead with **MiMAR** for brand | Y (review) |

**OK (token format):** `DIM-XXXX-XXXX` placeholders in forms/landing — not brand drift.

**Found via:** `rg '\bDIM\b' app components db --glob '*.{tsx,ts,sql}'`

---

## 6. English HTML5 validation messages

Pattern: `LnInput`/`LnSelect`/`LnTextarea` localize via `lib/utils/format.ts` + `components/ui/Field.tsx:114-158`. Raw `<input|select|textarea required>` bypasses this.

| # | file:line | current string/code | proposed es-AR fix | HEAD? |
|---|-----------|---------------------|-------------------|-------|
| 1 | `app/gob/vigilancia/investigaciones/nuevo/OpenInvestigationForm.tsx:49-74` | Raw `<select required>` + `<textarea required minLength={10}>` | Wrap in `OpField`/`LnField` or add `onInvalid` + `setCustomValidity` / `noValidate` + Zod | Y |
| 2 | `app/(public)/p/[publicToken]/FoundPetForm.tsx:40,61` | Raw `<input required>` | Use `LnInput` or localized validity handlers | Y |
| 3 | `app/(public)/p/[publicToken]/encontre/FinderInPossessionForm.tsx:148,241` | Raw `<input required>` | Same | Y |
| 4 | `app/(public)/refugios/[orgToken]/sheets/ContactarSheet.tsx:122,142` | Raw `required` on inputs | Same (verify if plain `<input>` vs `LnInput`) | Y |

**Already localized:** `app/(auth)/login/LoginForm.tsx` (LnField) · `app/(public)/denuncias/nueva/WelfareReportForm.tsx` · `app/(public)/denuncias/nueva/DenunciaWizard.tsx:344` (`noValidate`) · `app/(public)/refugios/.../SerVoluntarioSheet.tsx` (LnInput/LnTextarea)

**Found via:** `rg 'required' app/(public) app/gob --glob '*.tsx'` + read of form markup

---

## 7. Vet greeting ("Buen día, Dra..")

| # | file:line | current string/code | proposed es-AR fix | HEAD? |
|---|-----------|---------------------|-------------------|-------|
| 1 | `app/(app)/inicio/page.tsx:96-98,133` | `greetingFirstName(profileRow.displayName)` → `Buen día, {firstName}.` | **Fixed at HEAD** — skips honorifics (`lib/utils/greeting.ts:9-17`) | N |
| 2 | `lib/utils/greeting.ts:4-7` | Comment documents prior bug | Keep; ensure seed profile `displayName` is `"Dra. Lilian Marrone"` not `"Dra."` alone | N (code fixed) |

**Found via:** `rg 'Buen día|greetingFirstName|Dra\.' app lib` · `__tests__/greeting-first-name.test.ts`

---

## 8. Admin / govt console labels

| # | file:line | current string/code | proposed es-AR fix | HEAD? |
|---|-----------|---------------------|-------------------|-------|
| 1 | `app/gob/usuarios/page.tsx:75` | Admin path: `"Admin · Usuarios"` / govt: `"MiMAR Gobierno · Usuarios"` | **Fixed** (was `"MIMAR GOBIERNO"` in QA) | N |
| 2 | `app/gob/maltrato/page.tsx:205` | H1: `"Denuncias de maltrato"` | **Fixed** (nav: `Maltrato` in `nav-presets.ts:253`) | N |
| 3 | `components/layout/nav-presets.ts:112` | Sidebar: `"Mascotas"` | Align to `"Mascotas en custodia"` **or** keep nav short + page title (page already `"Mascotas en custodia"` at `app/org/[orgToken]/mascotas/page.tsx:186`) | Y (nav label only) |
| 4 | `app/org/[orgToken]/mascotas/page.tsx:184-186` | Title `"Mascotas en custodia"` | Matches intended page title | N (page fixed) |

**Found via:** `rg 'MIMAR GOBIERNO|Investigaciones de maltrato|Animales en custodia|Mascotas en custodia' app components`

---

## 9. Data-integrity display

| # | file:line | current string/code | proposed es-AR fix | HEAD? |
|---|-----------|---------------------|-------------------|-------|
| 1 | `src/modules/pets/application/tab-data/get-libreta-face-data.ts:86-102` | Past events: no `occurredAt <= now()` filter | Exclude future-dated rows from `past`; keep in `future` ledger only | Y |
| 2 | `lib/metrics/freshness.ts:45` | `max(occurred_at)` for footer | Cap at `now` or label `"último evento registrado (incl. programados)"` if future exists | Y |
| 3 | `components/ui/dashboard/DashboardFreshnessFooter.tsx:58` | `"último evento {date}"` | Same as above when `maxAt > now` | Y |
| 4 | `app/gob/analytics/_components/OutbreakHistoryTable.tsx:57-61` | Renders `peakDate` as-is | Flag future peaks: `"Programado"` / filter `peakDate <= today` | Y |
| 5 | `app/gob/page.tsx:334` | KPI sub: raw `lepto` / `rabies` codes | Use ENO catalog labels (`lib/surveillance` / `ref.*`) | Y |

**Top N headings:** User-visible `"Top 5"` / `"Top 10"` strings **not found** at HEAD (`rg 'Top 5|Top 10' app/gob components` — comments only). Ranking UI uses `"Mayor/Menor cobertura antirrábica"` (`RegionRankingTable.tsx:86,96`). Death-cause block title: `"Principales causas de muerte (12m)"` — row count may be <10 when data sparse (expected).

**Skip (intentional):** `0 DE 3 AL DÍA` vs `1 VIGENTE` vocabulary split.

---

## 10. Broken links / typos / wizard copy

| # | file:line | current string/code | proposed es-AR fix | HEAD? |
|---|-----------|---------------------|-------------------|-------|
| 1 | `components/layout/nav-presets.ts:243` | `href: "/gob/analytics"`, label `"Analítica"` | **Fixed** (route exists) | N |
| 2 | `components/AdoptionQueueList.tsx:272` | `` `${n} postulación/postulaciones` `` | **Correct** — `postulaciónes` typo **not found** at HEAD (`rg 'ónes' app components`) | N |
| 3 | `app/(app)/mis-mascotas/[publicToken]/perdida/MarkLostWizard.tsx:126` | Subtitle uses `stepLabels[step - 1]` | **Fixed** (step-specific labels) | N |
| 4 | `components/ui/WizardShell.tsx:72-79` | Hides `"Paso 1 de 1"` when `totalSteps === 1` | **Fixed** for `app/(app)/mis-mascotas/nueva/page.tsx:32-35` | N |
| 5 | `components/LocationFields.tsx:296-299` | `Localidad` + `{required && *}` | **Fixed** when `required` passed (`MinimalNewPetForm.tsx:101`) | N |
| 6 | `app/gob/reglas/[country]/[province]/[locality]/page.tsx:133-135` | Raw `JSON.stringify(rule.rulePayload)` | Use `summarizeRulePayload()` like govt read-only lens (`app/gob/reglas/page.tsx:117-118`) | Y |
| 7 | `app/gob/reglas/AdminReglasLens.tsx:92` | `"Sin overrides → se usan…"` (ASCII arrow in prose) | `"Sin overrides → …"` or `"Sin overrides, se usan…"` | Y (minor) |

---

## 11. `acquisition_method` capture

| # | file:line | current string/code | proposed es-AR fix | HEAD? |
|---|-----------|---------------------|-------------------|-------|
| 1 | `components/PetForm.tsx:445-470` | `acquisitionMethod` select → `createPetAction` / `parsePetForm` | Keep; used on **edit** (`editar/page.tsx`, `SheetMounter.tsx`) | Y (partial) |
| 2 | `app/(app)/mis-mascotas/nueva/MinimalNewPetForm.tsx` | **No** `acquisitionMethod` field | Add optional/required select; persist to `pets.acquisitionMethod` + `pet_registered.payload.acquisition_method` | Y (gap) |
| 3 | `src/modules/pets/domain/pet-form.ts:152-156` | Parses `acquisitionMethod`; null if empty | Onboarding must submit field for analytics mix | Y |
| 4 | `lib/analytics/govt-dashboards.ts:1827-1847` | Trend excludes null `acquisition_method` | Document that `/mis-mascotas/nueva` path under-reports until fixed | Y (impact) |

**Found via:** `rg 'acquisitionMethod|acquisition_method' components app src --glob '*.{tsx,ts}'`

---

### Batch hints (by file)

| File | Categories |
|------|------------|
| `lib/utils/format.ts` + `lib/infra/notifications.ts` + `LostPublicCredential.tsx` + `inicio/page.tsx` | §2 pluralization |
| `components/PetCard.tsx` + `StatusFlag.tsx` + `PosterPreview.tsx` + `MarkLostWizard.tsx` + `lib/events/events.ts` | §1 gender |
| `components/NotificationCard.tsx` + `app/gob/reglas/**` | §3 spacing |
| `db/triggers.sql` (+ migration 0091) | §5 welcome brand |
| `MinimalNewPetForm.tsx` + `PetForm.tsx` | §11 acquisition |
| `get-libreta-face-data.ts` + `DashboardFreshnessFooter.tsx` | §9 future dates |
