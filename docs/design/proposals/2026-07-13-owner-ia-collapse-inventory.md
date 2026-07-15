# Owner IA collapse — anti-lock-out inventory

**Date:** 2026-07-13
**Status:** Analysis / gate document — READ-ONLY pass, no code changed
**Scope:** the owner tier only (`/inicio`, `/mis-mascotas`, `/mis-mascotas/[publicToken]`, the 13 `/cuenta` sub-routes + the `?sheet=` layer)
**Related:** `docs/design/drafts/owner-home-3in1-draft.html`, `docs/design/proposals/2026-07-12-owner-screens-and-pet-profile.md`

---

## 1. Framing

The PO wants the owner experience collapsed into **fewer, clearer screens**: `inicio` + `mis mascotas` + `pet profile` become **ONE surface — a set of pet CREDENTIALS you move between** (1 pet = 1 screen, 4 pets = swipe). Each credential carries **its own pendientes**. The credential is the landing-hero visual language, with action buttons (Anotar / Ver perfil) where the landing puts the QR.

Two things this is **not**:

- **Orgs/shelters are out of scope.** They keep their professional/bulk panel (`app/org/**` — already multi-select, bulk actions, Kanban).
- **The pet profile is not owner-exclusive.** It is **shared infrastructure**. Confirmed: org staff land on `/mis-mascotas/{token}` from at least four non-owner entry points (§7.3). Any change to that route is a two-tier change.

### The rule this document enforces

> **No screen gets removed until every function it holds has a named destination. If something has no home, it doesn't get cut.**

So this document is an **inventory first, a proposal second**. Every user-facing function on the owner surfaces is enumerated with a real `file:line`, a scope, and a destination.

### Destination codes

| Code | Destination | Means |
|---|---|---|
| **A** | The pet credential/document | Per-pet things — live on that pet's credential |
| **B** | `mis-mascotas` index | Cross-pet things — reclamar, the many-pet index |
| **C** | A minimal `cuenta` | Genuinely person-scoped — identity, DNI, password/role/org membership, delete/export |
| **D** | **DELETE — dead** | No live consumer; removing it removes nothing |
| **E** | Stays / out of scope | Org-tier, vet-tier, or already correctly placed |

### Headline numbers

- **~180 user-facing functions inventoried** across 4 surface groups.
- **3 screens are safely removable** (`/cuenta/editar`, `/cuenta/casos`, `/cuenta/transitos` hub) — every function has a destination.
- **9 screens must survive** — mostly role-conditional flows (vet, govt, foster) that the owner collapse must not touch.
- **1 confirmed dead subsystem**: the 4 `/cuenta` privacy toggles. **Verdict: D — delete.** Rigorously verified in §6.
- **1 confirmed data-model defect**: emergency contacts are a per-pet fact modeled as an account default (§5).
- **Top lock-out risk**: `/inicio`'s cross-pet aggregations have no obvious home in a per-pet model (§9).

---

## 2. `/inicio` — the home surface

Everything on this page is either **per-pet** (→ A) or a **cross-pet aggregation** (the hard part — see §9).

| Function | Today's screen (file:line) | Scoped to | Proposed destination | Risk if orphaned |
|---|---|---|---|---|
| Greeting "Buen día, {firstName}" | `app/(app)/inicio/page.tsx:302-304` | person | **A** — credential masthead or swipe-container header | None. Cosmetic. |
| Urgency subtitle — "N vencimientos / N casos" | `page.tsx:305-329` | **cross-pet agg** (`countProximosReminders` `lib/domain/vaccine-reminder-state.ts:71` + `fetchOpenWorkflows` `lib/analytics/owner-dashboard.ts:711`) | **B** (index badge) + **A** (per-pet pendientes) | **HIGH.** This is the only "is anything on fire across all my pets" signal. A 4-pet owner on pet #1's credential cannot see pet #3 is overdue. See §9.1. |
| First-run copy (no pets yet) | `page.tsx:330-338`, `lib/domain/owner-first-run.ts:33` | person | **B** — index empty state | Low. |
| "N de M mascotas al día" | `page.tsx:339-349` | **cross-pet agg** | **B** | Medium — same as urgency subtitle. |
| Date stamp | `page.tsx:356-360` | — | **A** — credential chrome | None. |
| `IntentApplyBanner` — resume adoption application | `_components/IntentApplyBanner.tsx:23-122` | person (cookie `APPLY_INTENT_PET_TOKEN_COOKIE_NAME`, line 25) | **B** | Medium. Cookie-driven resume; no other entry point. Gated on `stillListable` (lines 57-65). |
| ↳ "Ver ficha" → `/adoptar/{token}` | `IntentApplyBanner.tsx:97-102` | pet (not owned) | **B** | — |
| ↳ "Continuar →" → `/adoptar/{token}/postular` | `IntentApplyBanner.tsx:105-109` | pet (not owned) | **B** | — |
| ↳ "×" dismiss → `dismissApplyIntentAction` | `IntentApplyBanner.tsx:111-119`, `app/actions/apply-intent.ts:41` | person | **B** | — |
| Vet-upgrade-pending band → `/cuenta/upgrade` | `page.tsx:368-404`, condition line 142-153 | **role (vet applicant)** | **C** | Medium. Role-conditional — see §8. |
| `OpenCyclesSection` — "N postulaciones en curso" | `_components/OpenCyclesSection.tsx:64-75`, `countPendingApplications` `lib/analytics/owner-dashboard.ts:1818` | **cross-pet agg** | **B** (already duplicated as an `ActionLinkCard` on `/mis-mascotas`) | Low — dual entry point already exists. |
| `OpenCyclesSection` — "N transferencias esperan tu confirmación" | `OpenCyclesSection.tsx:76-87`, `countPendingTransfers` `owner-dashboard.ts:1850` | person (email/user match) | **B** (already duplicated) | **HIGH.** Inbound transfers are for pets you do **not** yet own — they have **no credential to live on**. See §9.2. |
| `FirstRunEmptyState` — "Cargar una mascota" | `_components/FirstRunEmptyState.tsx:34-38` | person | **B** | Low. |
| `FirstRunEmptyState` — "reclamar con un código" | `FirstRunEmptyState.tsx:39-44` | person | **B** | Low. |
| **`CredentialRail`** — the carousel itself | `_components/CredentialRail.tsx`, mounted `page.tsx:426-428` | cross-pet, cap `OWNER_CAROUSEL_CAP = 8` (`page.tsx:209`) | **A** — *this becomes the new surface* | — This IS the new model. |
| ↳ "Ver las N mascotas →" overflow | `CredentialRail.tsx:36,89-96` | cross-pet | **B** | **HIGH at scale.** The cap is 8; `/mis-mascotas` caps at 200. Swiping is not a 200-pet UI. §9.3. |
| ↳ prev/next arrows, position dots | `CredentialRail.tsx:73-80,101-134,138-150` | — | **A** | None. |
| ↳ Per-card identity header → profile | `_components/CredCard.tsx:116-132` | pet | **A** (collapses — the card *is* the profile) | — |
| ↳ Per-card status flag chip | `CredCard.tsx`, via `lnPetStatusFromCompliance` `lib/projections/pet-compliance.ts:548` | pet | **A** | — |
| ↳ Per-card vaccine tiles (Vigente/Por vencer/Vencida) | `CredCard.tsx:163-186`, `fetchVaccinationSummariesForPets` `owner-dashboard.ts:1299` | pet | **A** | — |
| ↳ Lost: "Ver reporte" | `CredCard.tsx:142-146` | pet | **A** | — |
| ↳ Lost: "Compartir cartel" → `/cartel` | `CredCard.tsx:150-154` | pet | **A** | — |
| ↳ Lost: "Lo encontré" → `?sheet=marcar-encontrada` | `CredCard.tsx:156-160` | pet | **A** | — |
| ↳ Footer "Asentar" → `?sheet=anotar` | `CredCard.tsx:196-200` | pet | **A** — *this is the draft's Anotar button* | — |
| ↳ Footer "Ver perfil" | `CredCard.tsx:201-204` | pet | **A** — *the draft's Ver perfil button* | — |
| `RemindersSection` — 1 reminder inline banner | `_components/RemindersSection.tsx:66-89,110-112` | **cross-pet agg** (`fetchActiveReminders` `owner-dashboard.ts:1031`) | **A** — becomes that pet's pendientes | Medium — see §9.1. |
| `RemindersSection` — 2+ panel, `VISIBLE_COUNT = 3` + "Ver N más" | `RemindersSection.tsx:95,115-173` | cross-pet agg | **A** per-pet + **B** rollup | Medium. |
| ↳ "Agendar" → `/turnos/buscar` | `_components/ReminderActions.tsx:40,69-74` | pet | **A** | — |
| ↳ "Posponer 7 días" → `snoozeReminderAction` | `ReminderActions.tsx:44-62`, `app/actions/reminders.ts:52` | pet/reminder | **A** | — |
| ↳ "Registrar" → vaccine form | `ReminderActions.tsx:34,83-90`, `lib/ui/reminder-urls.ts` | pet/reminder | **A** | — |
| **EventCatcher** wrapper `id="asentar"` (bottom-tab deep-link target) | `page.tsx:440-445` | — | **A** — but the anchor must be re-pointed | **MEDIUM.** `CitizenTabBar` deep-links to `#asentar`. If `/inicio` dies, this anchor 404s. |
| ↳ Pet chip radiogroup (8 chips, tap/long-press) | `components/EventCatcher.tsx:106,132-149,263-273,305-396` | **cross-pet** picker | **A** — *the picker disappears; the credential you're on IS the selection* | Low — this is a **win**. The picker exists only because `/inicio` is pet-agnostic. |
| ↳ Free-text "¿qué pasó?" textarea | `EventCatcher.tsx:197-209` | pet | **A** | — |
| ↳ Quick chips: Vacuna/Peso/Vet/Medicación/Nota | `EventCatcher.tsx:82-90,216-226` | pet | **A** | — |
| ↳ "Anotar" submit → `quickCaptureAction` | `EventCatcher.tsx:151-163`, `app/actions/quick-capture.ts:20` | pet | **A** | — |
| ↳ Zero-pet fallback | `EventCatcher.tsx:114-126` | person | **D** — already unreachable from `/inicio` (page hides the card at `page.tsx:444`) | None. |
| `PetHealthStatusStrip` header "N de M al día" | `_components/PetHealthStatusStrip.tsx:112,119` | **cross-pet agg** | **B** | Medium. |
| ↳ Per-pet row → profile link | `PetHealthStatusStrip.tsx:57-65` | pet | **A** (collapses) | — |
| ↳ Per-pet compliance chip | `PetHealthStatusStrip.tsx:71-80` | pet | **A** — *duplicate of the credential's own compliance panel* | None — **dedupe win**. |
| ↳ Nudge rows → `nudge.actionHref` | `PetHealthStatusStrip.tsx:24-45,82-88`, `fetchPetHealthNudges` `lib/infra/owner-nudges.ts:276` | pet | **A** — *this IS "each credential carries its own pendientes"* | — The draft's pendientes already exist here. |
| ↳ Strip empty state → "Cargar una mascota" | `page.tsx:494-505` | person | **B** | Low. |
| "Próximos turnos" card | `page.tsx:514-537`, `fetchUpcomingAppointments(user.id, 5)` `owner-dashboard.ts:165` | **cross-pet agg**, cap 5 | **A** per-pet + **B** rollup | **MEDIUM.** A turno is per-pet, so A works — but "what's coming up this week across my pets" is a real calendar need. §9.1. |
| ↳ Appt row → `/mis-turnos/{token}` | `page.tsx:600-630` | pet/appointment | **E** — `/mis-turnos` stays | — |
| `CasesWidget` | `components/CasesWidget.tsx:63-130`, `fetchOpenWorkflows` `owner-dashboard.ts:711` (7 sub-queries) | **cross-pet agg** | **A** per-pet + **B** rollup | **HIGH.** Some cases (approval requests, custody disputes) are **not** pet-scoped. §9.2. |
| ↳ "Ver historial →" → `/cuenta/casos` | `CasesWidget.tsx:90-97` | person | **B** | — |
| ↳ Case row → `case.ctaUrl` | `CasesWidget.tsx:105-126` | mixed | **A**/**B** | — |
| Footer "Documento sincronizado" | `page.tsx:546` | — | **A** | None. |
| **"+ Denunciar maltrato animal"** → `/denuncias/nueva` | `page.tsx:547-552` | person, **no pet required** | **B** | **HIGH.** A maltrato report is about *someone else's* animal. It **cannot** live on your own pet's credential. §9.2. |

---

## 3. `/mis-mascotas` — the index

| Function | Today's screen (file:line) | Scoped to | Proposed destination | Risk if orphaned |
|---|---|---|---|---|
| **Vet role redirect** — `role==="vet" && as!=="owner"` → `resolveVetLanding` | `app/(app)/mis-mascotas/page.tsx:61-63`, `lib/infra/role-landing.ts:107` | **role (vet)** | **E** — must be preserved verbatim | **HIGH.** A vet who also owns pets reaches their own pets **only** via `?as=owner`. Drop this and either vets lose their pets or every vet lands on the owner index. §8. |
| h1 + subtitle "N activa(s) · N en memoria" | `page.tsx:146-153` | person | **B** | None. |
| "+ Inscribir mascota" → `/nueva` | `page.tsx:154-158` | person | **B** | Low. |
| Claimed-pets success banner (`?reclamado=`) | `page.tsx:162-168` | person | **B** | Low. |
| **200-cap notice** | `page.tsx:171-176`, `MIS_MASCOTAS_LIMIT = 200` (line 44) | person | **B** | **Note:** the notice tells users to "usá el buscador" — **no search UI exists on this page**. Verified by full-file read. Pre-existing bug. §9.3. |
| Active pets registry rows (`LnRegRow`) | `page.tsx:207-218` | person→pets | **B** | — |
| ↳ "En tránsito" badge | `page.tsx`, `isTransitRole` `components/PetCard.helpers.ts:46` | **ownership-role** | **A** + **B** | Low. |
| ↳ Registry empty state → "Cargar una mascota" | `page.tsx:182-193` | person | **B** | Low. |
| In memoriam section + `MemorialRow` | `page.tsx:226-245,307-355` | person→pets | **B** (index) + **A** (memorial credential skin) | Medium. Deceased pets are **excluded** from `/inicio`'s carousel (`carouselSource`, `page.tsx:210`). If the carousel becomes the only surface, **memorials vanish**. §9.4. |
| "Reclamar una mascota" card → `/reclamar` | `page.tsx:252-272` | person | **B** — *the PO named this explicitly* | Low. |
| `ActionLinkCard` "Mis postulaciones" + badge | `page.tsx:282-288` | **cross-pet agg** | **B** | Low. |
| `ActionLinkCard` "Transferencias pendientes" (`hideWhenZero`) | `page.tsx:289-296`, `ActionLinkCard.tsx:30-32` | person | **B** | See §9.2. |

**Note on "Más acciones":** the brief describes it as a menu. It is **not** — it is a static two-card grid (`page.tsx:277-298`) with exactly the two `ActionLinkCard`s above. No dropdown, no popover. Verified by full-file read.

**Note on filters/search:** none exist. The brief asks about "any filters/search" — there are none on `/mis-mascotas`. The 200-cap notice references a búsqueda that was never built.

### Sibling routes

| Route | File | Reached from | Destination |
|---|---|---|---|
| `/mis-mascotas/nueva` | `nueva/page.tsx:21-37`, `createPetAction` `src/modules/pets/actions.ts:94` | index header, empty states, `/inicio` first-run | **B** |
| `/mis-mascotas/reclamar` | `reclamar/page.tsx:10-49`, `ClaimWizard` → `app/actions/pet-claim.ts:43,51,60` | index card, `/inicio` first-run | **B** |
| `/mis-mascotas/reclamar-dni` | `reclamar-dni/page.tsx:12-62` | **only** from `/reclamar` (`reclamar/page.tsx:39-44`) | **E** (frozen) — **`ClaimForm.tsx:1-19` is a static "temporalmente pausado" notice.** Feature is paused pending Mi Argentina. Do not touch. |
| `/mis-mascotas/postulaciones` | `postulaciones/page.tsx:78-326`, `withdrawAdoptionApplicationAction` `src/modules/adoption/actions.ts:278` | index `ActionLinkCard`, `/inicio` `OpenCyclesSection` | **B** |

---

## 4. The pet profile — `/mis-mascotas/[publicToken]`

**This surface is the destination, not a source.** Most of it stays exactly where it is; the collapse means `/inicio` and `/mis-mascotas` fold *into* it, not the reverse.

### 4.1 Access + faces

| Function | file:line | Scoped to | Destination | Risk |
|---|---|---|---|---|
| `requirePetAccess` — resolves `accessPath: "owner" \| "org"` | `lib/infra/pet-access.ts:100-239` | pet × (person \| org-membership) | **E** — unchanged | **CRITICAL.** This is the two-tier gate. §7.3. |
| `requireAlivePetAccess` — blocks deceased; org path needs `event.write` | `lib/infra/pet-access.ts:245-279` | pet | **E** | — |
| Credencial ⇄ Libreta flip (tablist + "Girar") | `components/pet-profile/PetDetailTabsPanel.tsx:239,312-322` | pet | **A** | — |
| ↳ Face resolution (SSR + client agree) | `lib/domain/pet-face-nav.ts`, called `page.tsx:179-183` and `PetDetailTabsPanel.tsx:142` | pet | **A** | — |
| ↳ `FlipCard` — both faces mounted, one painted (ADR-11) | `components/pet-profile/FlipCard.tsx:90-114` | pet | **A** | — |
| Face 1 Credencial: memorial ribbon | `components/pet-profile/CredentialFace.tsx:188-364`, `page.tsx:464-469` | pet | **A** | See §9.4. |
| ↳ Situation skin (perdida/observación/preñada/tránsito) | `lib/ui/pet-situation.ts` | pet | **A** | — |
| ↳ Identity row: photo, name, "Inscripto/a", breed/sex/age, jurisdiction chip, microchip hero tag, **QR → `/p/{token}`** | `CredentialFace.tsx`, QR gen `page.tsx:522-527` | pet | **A** — *the draft replaces the QR slot with Anotar/Ver perfil; the QR needs a named home* | **MEDIUM.** §9.5. |
| ↳ Service-dog credential row | `CredentialFace.tsx`, `petServiceDog` table | pet | **A** | — |
| Face 2 Libreta: `getLibretaFaceData` (deferred fetch) | `app/actions/pet-tab-data.ts`, called `PetDetailTabsPanel.tsx:146-167` | pet | **A** | — |
| ↳ Masthead, `VacunasStatusBadges`, `FutureLedgerList`, `AsientoCard` list, weight sparkline (12mo), truncation note | `components/pet-profile/LibretaFace.tsx` | pet | **A** | — |
| ↳ **Audience filter** — `pastEventMatchesAudience` | `components/pet-profile/libreta-lens.ts`, `isOwner` toggle | **role** (owner sees all; org/vet see sanitaria subset) | **E** | **CRITICAL.** Privacy boundary. §7.3. |
| ↳ `ExportLibretaButton` | `LibretaFace.tsx` footer, `app/api/mis-mascotas/[publicToken]/libreta-export/route.ts` | pet | **A** | — |
| ↳ Immutability note "Los eventos no se editan ni se borran" | `LibretaFace.tsx:160-163` | — | **A** | — |

### 4.2 Action row — `components/pet-profile/PetActionRow.tsx`

| Button | Condition | Target | Destination |
|---|---|---|---|
| Anotar | `isOwner && !isDeceased` (`:43`) | `?sheet=anotar` | **A** — *the draft's Anotar* |
| Compartir | always (`:50`) | `?sheet=compartir` | **A** |
| Editar datos | `isOwner && !isDeceased` (`:55`) | `?sheet=editar-mascota` | **A** |
| Marcar como perdida | `isOwner && !isDeceased && status==="active"` (`:62`) | `?sheet=marcar-perdida` | **A** |
| Más | `isOwner` (`:69`) | `?sheet=mas` | **A** |

All open via `SheetTriggerLink` (`components/pet-profile/SheetTriggerLink.tsx`) using History API `pushSheetUrl`, **not** `<Link>` — a Next 15.5 workaround. Any nav rework must preserve this.

### 4.3 `SheetMounter` — every `?sheet=` value

`app/(app)/mis-mascotas/[publicToken]/SheetMounter.tsx`

| `?sheet=` | Line | Role gate | Server action | Dest |
|---|---|---|---|---|
| `anotar` | 191-221 | `accessPath!=="owner" \|\| deceased` → null (194-196) | — (routes onward) | **A** |
| `vacuna` | 223-234 | none | `createVaccinationAction` `src/modules/events/actions.ts:175` | **A** |
| `peso` | 236-250 | none | `createWeightAction` `actions.ts:274` | **A** |
| `sintoma` | 252-263 | none | `createSymptomObservedAction` `actions.ts:1297` | **A** |
| `medicacion` | 265-277 | none | `createMedicationStartAction` `actions.ts:511` | **A** |
| `nota` | 279-289 | none | `createNoteAction` `actions.ts:870` | **A** |
| `turno-antirrabica` | 291-297 | none | — (links to `/turnos/buscar` or `/vacunas/programar`) | **A** |
| `compartir` (+ aliases `compartir-libreta`, `mostrar-tier2`) | 304-332 | both roles | `createLibretaShareAction` `app/actions/libreta-share.ts:66`; `enableTier2PublicAction`/`revokeTier2PublicAction` `app/actions/tier2-public.ts:15,24` | **A** |
| `chapita` | 334-350 | `!owner \|\| deceased \|\| !chapitaData` → null (338) | `togglePhysicalTagInterestAction` `app/actions/physical-tag-interest.ts:25` | **A** |
| **`emergencia`** | 352-365 | `!owner \|\| !emergencyContacts` → null (355) | `updateEmergencyContactsAction` `app/actions/profile.ts:75` | **A** — **but see §5** |
| `mas` | 367-378 | passes `accessPath`, `ownershipRole` | — | **A** |
| `transferir-mascota` | 380-386 | none in-component | `initiatePetTransferAction` `src/modules/transfers/actions.ts:95` | **A** |
| `marcar-perdida` | 388-413 | `markLostData===null` → null | `setPetLostAction` `src/modules/events/actions.ts:1375` | **A** |
| `editar-mascota` | 415-434 | none in-component (trigger is owner-gated) | `updatePetAction` `src/modules/pets/actions.ts:308` | **A** |
| `marcar-encontrada` | 436-467 | `status!=="lost"` → notice | `setPetFoundAction` `src/modules/events/actions.ts:1535` | **A** |

**`MasSheet`** items — `_more/MasSheet.helpers.ts:32-113`, `deriveMasSheetItems` (`accessPath!=="owner"` → empty, line 34):

| Item | Condition | Target | Dest |
|---|---|---|---|
| `edit` | owner | `?sheet=editar-mascota` | **A** |
| `contacts` | always appended (102-106); **deceased short-circuits to only this** (51-58) | `?sheet=emergencia` | **A** |
| `transfer-pet` | `ownershipRole==="owner" && status==="active"` (60-66) | `?sheet=transferir-mascota` | **A** |
| `find-home` | `ownershipRole` ∈ {foster, owner} (68-74) | `/buscar-hogar` | **A** |
| `service-dog` | `species==="dog" && ownershipRole==="owner"` (76-82) | `/asistencia` | **A** |
| `confirm-return` | `hasPendingReturnProposal` (84-90) | `/devolucion` | **A** |

### 4.4 `LostCaseBlock` — `components/pet-profile/LostCaseBlock.tsx`

| Function | Line | Role | Action | Dest |
|---|---|---|---|---|
| Stale-case banner + "Reactivar búsqueda" | 119-123, 395 | owner | `reactivateLostSearchAction` `app/actions/reactivate-lost-search.ts:12` | **A** |
| "Apareció — marcar como encontrada/o" | 212-333 | owner | `?sheet=marcar-encontrada` | **A** |
| `LostShareCard` — WhatsApp / copy link / poster (`/cartel`) | 212-333 | owner | — | **A** |
| Last-seen summary + "actualizar" → `/perdida` | 212-333 | owner | — | **A** |
| `<details>` "Más opciones": `LostLastSeenCard` (map), `LostScanFeed`, **`LostDisclosureCard` (5 toggles)** | 212-333 | owner | `setPetDisclosurePrefsAction` `app/actions/lost-mode.ts:14` → `set-pet-disclosure-prefs` | **A** — **this is the REAL privacy control (§6)** |
| Org/vet read-only body — last-seen summary + `LostScanFeed`, **no** share/toggle/found | 334-382 | **org** (REQ-5.3) | — | **E** |

### 4.5 Compliance panel, avisos, and the rest

| Function | file:line | Dest |
|---|---|---|
| `ComplianceObligationsPanel` — rabies / sterilization / microchip / ppp cards | `components/pet-profile/ComplianceObligationsPanel.tsx`, state from `deriveComplianceState` `lib/projections/pet-compliance.ts`, computed `page.tsx:476-495` | **A** |
| ↳ "Programar turno" (rabies `due`/`over`) | `ComplianceObligationsPanel.tsx:152-159` | **A** |
| ↳ "Registrar atestación" (PPP) | `ComplianceObligationsPanel.tsx:161-168` → `/eventos/atestar-raza-peligrosa` | **A** |
| `PetAlertStrip` — urgency ordering container | `components/pet-profile/PetAlertStrip.tsx`, built `page.tsx:534-590` | **A** — *this is the pendientes engine the draft wants* |
| ↳ `lost` (urgent) → `LostCaseBlock` | `page.tsx:535-550` | **A** |
| ↳ `rabies` (urgent) → `RabiesObservationBanner` + "Confirmar fin de observación" | `page.tsx:782-836`, `ownerCloseRabiesObservationAction` `src/modules/surveillance/actions.ts:227` | **A** |
| ↳ `transit` (warning) → `TransitBanner` + `ConvertFosterButton` + `/buscar-hogar` | `page.tsx:838-862`, `_components/ConvertFosterButton.tsx` | **A** |
| ↳ `open-cases` (warning) → `PetOpenCasesSection` | `page.tsx:534-590` | **A** |
| ↳ `pregnancy` (info) → `PregnancyInProgressCard` | `page.tsx:534-590` | **A** |
| Per-event page + `AmendEventButton`/`AmendEventForm` (append-only) | `eventos/[eventId]/page.tsx` | **A** |
| `/mudanza` — jurisdiction move | `mudanza/page.tsx` | **A** |
| `/editar` standalone parity page | `[publicToken]/editar/page.tsx` (same `PetForm`/action as the sheet) | **A** — candidate dedupe |
| Redirect stubs `/vacunas`, `/historial`, `/mostrar-libreta` → `?tab=` | — | **E** — keep, they're bookmark compat |
| Org back-link → `/org/{orgToken}/mascotas` | `page.tsx:620-628`, `accessPath==="org"` | **E** |
| Org-mediated access notice | `page.tsx:631-636`, `accessPath==="org"` | **E** |

**No delete/archive action exists** anywhere on this surface. Deceased (`fallecimiento`) is the terminal state and converts the credential to a read-only In-Memoriam skin — consistent with the append-only invariant.

---

## 5. Emergency contacts — a per-pet fact modeled as an account default

### The defect, confirmed

```
db/schema.ts:428-431   profiles.preferred_vet_name / preferred_vet_phone
                       profiles.emergency_contact_name / emergency_contact_phone
                       (added by db/migrations/0042_emergency_contact_columns.sql)
```

- **Stored once**, on the viewer's own `profiles` row, keyed by `user.id` — `app/(app)/mis-mascotas/[publicToken]/page.tsx:282-292`.
- **Rendered on every pet.** The sheet copy says so literally: *"Estos datos aparecen en la credencial de todas tus mascotas"* — `EmergencyContactSheet.tsx:52`.
- **Edited from two places**: `/cuenta/editar` (`EditProfileForm.tsx:282-302`, via `EmergencyContactFields`) **and** the per-pet `?sheet=emergencia` (`SheetMounter.tsx:352-365` → `updateEmergencyContactsAction` `app/actions/profile.ts:75`, which revalidates **both** `/cuenta` and `/mis-mascotas/{token}`).

**Two edit surfaces, one row.** A user editing "the vet" from Pampa's credential silently rewrites it for all four pets. That is a genuine data-loss-shaped surprise, not a cosmetic wart.

### Two corrections to the brief (verified)

1. **There is no `PetEmergencyCard` component.** The real thing is `EmergenciaBlock` — a local function inside `components/pet-profile/LibretaFace.tsx:180-246`.
2. **It renders on Face 2 (Libreta), not the credential.** `page.tsx:652-660` only passes `emergencyContacts` when `isOwner`. The comment at `page.tsx:33` referring to "CredentialFace's EmergencyCard" is **stale** — the JSX disagrees with it. (Consistent with the project's spec-conflict rule: validated code beats the prose.)
3. **`preferredVetName` is fetched but never rendered** — `page.tsx:280-281` notes only `displayName` feeds Face 1. `EmergenciaBlock` renders `preferredVetPhone`, `emergencyContactName`, `emergencyContactPhone` only.

### Proposed fix — per-pet override with an account default

Recommended: **per-pet columns + keep the account row as the seed default.** Not per-pet-only.

*Rationale:* the single-vet case is the common one (one household, one clinic). Per-pet-only forces a 4-pet owner to type the same vet four times — a worse product for the majority to fix a minority case. But the override must exist, because a foster pet's vet is genuinely the shelter's vet, not yours.

| Aspect | Proposal |
|---|---|
| Schema | Add nullable `pets.preferred_vet_name/phone`, `pets.emergency_contact_name/phone`. NULL = "inherit from owner's profile". |
| Read | `EmergenciaBlock` resolves `pet.X ?? profile.X`. |
| Migration | **Forward-only, additive, zero backfill.** All-NULL means every existing pet inherits today's behavior on day one. No data moves. Recount the next free integer at write time — do not hardcode. |
| Back-compat | `profiles.*` columns **stay**. They become the default seed, not dead. |
| `?sheet=emergencia` | Gains an explicit choice: "Usar mis datos de cuenta" (writes NULL) vs "Datos propios de {pet}" (writes the pet row). Removes the silent-cross-pet-write. |
| `/cuenta/editar` | Keeps `EmergencyContactFields`, relabelled: "Datos por defecto — se usan en las mascotas que no tengan datos propios." |
| Risk | Low. Additive columns + a coalesce. The behavior change is opt-in per pet. |

**Migration note:** `updateEmergencyContactsAction` (`app/actions/profile.ts:75`) already takes `petPublicToken` as its first argument **and ignores it for the write** — it revalidates the pet path but writes to `profiles`. The signature is already pet-shaped. This fix is smaller than it looks.

---

## 6. The `/cuenta` privacy toggles — VERDICT: **D, DEAD. Delete them.**

The brief asked for rigorous verification. Here it is.

### 6.1 The exhaustive reference set

Repo-wide grep, both camelCase and snake_case, excluding `node_modules`/`.next`. **Complete output** for all four columns:

| Column | Every reference in the repo |
|---|---|
| `discloseNameCredential` | `db/schema.ts:451` (definition) · `lib/domain/privacy-prefs.ts:7` (key list) · `src/modules/pets/application/profile/update-privacy-pref.ts:4` (**a comment**) · `app/(app)/cuenta/_components/PrivacySection.tsx:23` (the toggle) · `app/(app)/cuenta/page.tsx:76` (SELECT) · `page.tsx:297` (prop pass) |
| `disclosePhoneCredential` | `db/schema.ts:452` · `privacy-prefs.ts:8` · `update-privacy-pref.ts:5` (comment) · `PrivacySection.tsx:28` · `cuenta/page.tsx:77` · `page.tsx:298` |
| `allowOrgContact` | `db/schema.ts:453` · `privacy-prefs.ts:9` · `update-privacy-pref.ts:6` (comment) · `PrivacySection.tsx:32` · `cuenta/page.tsx:78` · `page.tsx:299` |
| `allowLostAlertsInZone` | `db/schema.ts:454` · `privacy-prefs.ts:10` · `update-privacy-pref.ts:7` (comment) · `PrivacySection.tsx:37` · `cuenta/page.tsx:79` · `page.tsx:300` |

Plus SQL-side: `db/migrations/0050_phase1_schema_extensions.sql:65-76` (the `ADD COLUMN` + `COMMENT ON COLUMN`).

**That is the entire reference set.** Every single reference is one of: the column definition, the key list, a *comment*, the toggle UI itself, or the `/cuenta` page reading its own toggle state back to render the toggle.

### 6.2 The checks the brief demanded

| Check | Result |
|---|---|
| **Server actions** | `updatePrivacyPrefForUser` (`update-privacy-pref.ts:19-39`) does exactly one thing: `db.update(profiles).set({[key]: next})`. Its own header comment states: *"No cross-table side effects."* It **writes**. Nothing **reads**. |
| **Public `/p/[token]` render** | The owner-identity fetch is **entirely inside `if (isLost)`** — `app/(public)/p/[publicToken]/page.tsx:385`. Gating is read from **`pet.*`, never `profiles.*`**: `showPhone = pet.disclosePhoneWhenLost` (`:392`), `phone: showPhone ? profiles.phone : sql`null`` (`:399`), `firstName = pet.discloseFirstNameWhenLost && …` (`:451-454`), `ownerEmail` gated on `pet.discloseEmailWhenLost` (`:460`), poster props (`:549-550`). **Zero reads of the four profile columns.** |
| **Non-lost credential** | Because the fetch is inside `if (isLost)`, a **non-lost** public credential shows **no owner name and no owner phone at all** — regardless of any toggle. The surface `discloseNameCredential`/`disclosePhoneCredential` claim to control **does not exist**. |
| **Email/notification path** | `app/actions/alert-firings.ts:75-82` selects only `role`, `accountType`, `deactivatedAt`, `deletedAt` — and it is an **admin** alert path, unrelated to owner zone alerts. No consumer of `allowLostAlertsInZone` exists anywhere. |
| **Bare `select()` leak** | Checked all 30 `.from(profiles)` call sites. All are explicit column projections. No `select()` splat silently pulls these columns into a consumer. |
| **Poster (`/cartel`)** | `cartel/page.tsx:73-74,113` reads `pet.discloseFirstNameWhenLost` / `pet.disclosePhoneWhenLost` / `pet.discloseLastLocationWhenLost`. Profile columns: absent. |

### 6.3 The schema comment is actively false

```
db/schema.ts:446-450
  // Global disclosure prefs (handoff P1-2). Each toggle controls a
  // single surface; per-pet overrides live on `pets.disclose_*_when_lost`.
  // Defaults follow privacy-first: name + phone hidden, org contact
  // opt-in …
```

**"Each toggle controls a single surface"** — no, it controls zero. **"per-pet overrides live on `pets.disclose_*_when_lost`"** — those are not *overrides*, they are the **only** implementation. The account-level layer they claim to override was never wired. The comment documents an intent that the code never fulfilled, and it has been sitting in the schema misleading every reader since migration 0050.

### 6.4 The real mechanism (the live consumer, for the record)

Per-**pet**, per-**incident**, and **privacy-first by construction**:

- **Columns:** `pets.disclose_first_name_when_lost` / `disclose_phone_when_lost` / `disclose_email_when_lost` / `disclose_last_location_when_lost` / `allow_finder_form_when_lost` — `db/schema.ts:599-605`.
- **Set at incident time:** `MarkLostWizard` (`app/(app)/mis-mascotas/[publicToken]/perdida/MarkLostWizard.tsx:41-45`) — **all four disclosure fields default `false`**; only `allow_finder_form_when_lost` defaults `true` (it exposes no owner data — the finder messages you blind).
- **The wizard deliberately overrides the permissive DB defaults.** `MarkLostWizard.tsx:7`: *"the DB defaults for disclose_*_when_lost are permissive (first name, …)"* and `:38-39`: *"must actively opt in. The finder form starts ON because it exposes no owner data."*
- **Editable later:** `LostDisclosureCard` inside `LostCaseBlock`'s "Más opciones" → `setPetDisclosurePrefsAction` (`app/actions/lost-mode.ts:14`), bound per-pet via `requirePetAccess`.
- **Enforced at query level, not render level:** `p/[publicToken]/page.tsx:386-390` — *"only FETCH what the owner opted to disclose … not fetched-then-redacted."*

The PO's read is **correct on every point**, including the "defaults OFF" claim.

### 6.5 Why this is a Ley 25.326 problem, plainly

A user opens `/cuenta`, sees **"Mostrar mi nombre en la credencial pública"**, and toggles it **ON**. Nothing happens. They toggle it **OFF**. Nothing happens. The toggle is a light switch wired to no bulb.

The inverse is worse. The defaults are `disclose_name_credential = false`, `disclose_phone_credential = false` (`schema.ts:451-452`) — the screen tells a user, truthfully-looking, *"your name and phone are hidden."* Meanwhile the **actual** DB defaults on the pet row are **permissive** (`disclose_first_name_when_lost = true`, `disclose_phone_when_lost = true`, `schema.ts:599-600`). Today the `MarkLostWizard` saves us — it forces opt-in at the incident. But the account screen's promise and the data layer's default point in **opposite directions**, and the only thing holding the line is a client-side default constant in one wizard.

Ley 25.326 (art. 6, art. 14) is about giving the data subject **real, exercisable control** over their personal data. A consent surface that renders four switches, persists their state, echoes it back on reload, and **influences nothing** is not a privacy control — it is a claim of control that the system does not honor. It is worse than having no screen: no screen is an absence; this is a **misrepresentation**, and it is one a regulator or a journalist can reproduce in ninety seconds by toggling a switch and diffing the public page.

**Destination D. Delete the toggles, the UI, the key list, and the write path.** Point users at the per-pet control that actually works.

### 6.6 The precise deletion set

| Delete | Path |
|---|---|
| The toggle UI (all 4 rows + form) | `app/(app)/cuenta/_components/PrivacySection.tsx` — **entire file** (keep the footer link to `/cuenta/privacidad`, relocate it) |
| The mount | `app/(app)/cuenta/page.tsx:295-303` |
| The SELECT | `app/(app)/cuenta/page.tsx:76-79` |
| The prop pass | `app/(app)/cuenta/page.tsx:297-300` |
| The key list | `lib/domain/privacy-prefs.ts` — **entire file** |
| The use-case | `src/modules/pets/application/profile/update-privacy-pref.ts` — **entire file** |
| The action | `updatePrivacyPrefAction` — `app/actions/profile-self-service.ts:65` |
| The result type | `UpdatePrivacyPrefResult` in `src/modules/pets/application/profile/types.ts` |
| The false comment | `db/schema.ts:446-450` |

**On the columns themselves:** keep `profiles.disclose_name_credential` etc. in the DB for now, or drop them in a forward-only migration — **PO call** (§10, Q1). Dropping is cleaner and removes the misleading `COMMENT ON COLUMN` at `0050_phase1_schema_extensions.sql:70-76`. Keeping costs 4 booleans and nothing else. Either way the **UI must go**, because the UI is the thing making the false claim. If the columns stay, the schema comment must be corrected to say **"UNUSED — no consumer. Superseded by pets.disclose_*_when_lost."**

---

## 7. `/cuenta` — the 13 sub-routes

### 7.1 The `/cuenta` hub — `app/(app)/cuenta/page.tsx`

| Function | file:line | Scoped to | Role-conditional | Dest |
|---|---|---|---|---|
| Avatar / initials | `:198-209` | person | no | **C** |
| Display name + email | `:212-219` | person | no | **C** |
| Role badge | `:221` | person | shows `profile.role` | **C** |
| Account-type badge | `:222` | person | no | **C** |
| Pet-count badge | `:223-227` | person | `isPersonal && petCount>0` | **B** |
| DNI verification badge/row | `:243-265` | person | no | **C** |
| "Declarar ahora" → `?sheet=verificar-dni` | `:258-263` | person | only when `!profile.dniLast4` | **C** |
| Matrícula verification row | `:268-286` | **role (vet)** | `matriculaNumber` set, or warn-dot if `role==="vet"` w/o matrícula | **C** — §8 |
| **`PrivacySection` (4 toggles)** | `:295-303` → `_components/PrivacySection.tsx:22-40` | person | no | **D — DEAD (§6)** |
| ↳ toggle write → `updatePrivacyPrefAction` | `PrivacySection.tsx:66`, `app/actions/profile-self-service.ts:65` | person | no | **D** |
| ↳ footer link "Datos personales (Ley 25.326)" | `PrivacySection.tsx:99-104` | person | no | **C** — relocate, this one is real |
| "Crear consultorio →" banner | `:308-328` | **role (vet)** | `vetNeedsClinic` (computed `:100-114`) | **C** — §8 |
| **01** "Editar mi información" → `?sheet=editar-perfil` | `:340-345` | person | no | **C** |
| **02** "Rol y organizaciones" section header | `:352-396` | — | **entire section hidden unless `isPersonal`** | **C** |
| ↳ "Convertirme en profesional/organización" | `:357-363` | **role** | `role==="owner"` only | **C** — §8 |
| ↳ "Crear consultorio" | `:364-370` | **role (vet)** | `role==="vet"` only | **C** — §8 |
| ↳ "Mis organizaciones" → `/memberships` | `:371-375` | **org-membership** | all personal accounts | **C** |
| ↳ "Mis solicitudes" → `/solicitudes` | `:376-380` | **role** | all personal accounts | **C** |
| ↳ "Tránsitos" → `/transitos` | `:381-385` | **role (foster)** | all personal accounts | **C** |
| ↳ "Renunciar a rol veterinario" (danger) | `:386-393` | **role (vet)** | `role==="vet"` only | **C** — §8 |
| **03/02** "Privacidad y derechos" → `/privacidad` | `:404-409` | person | numbering shifts to "02" when non-personal (`:401`) | **C** |
| **04** "Zona de riesgo" + `DeactivateAccountDialog` | `:417-436` | person | **`isPersonal` only** (govt uses `/desactivar`) | **C** |
| ↳ "Desactivar mi cuenta" + motivo (≥5 chars) → `selfDeactivatePersonalAccountAction` | `_components/DeactivateAccountDialog.tsx:39,50,54-111`, `app/actions/profile-self-service.ts:74` | person | via `isPersonal` parent gate | **C** |
| "Cerrar sesión" → `logoutAction` | `:439-446`, `app/actions/auth.ts:41` → `src/modules/auth/application/logout.ts:9` | person | no | **C** |
| Footer "Documento sincronizado / MiMAR" | `:449-452` | — | no | **C** |
| Error/timeout card + "Reintentar" (8s timeout `:48`) | `:129-151` | — | on load failure | **C** |
| "No se encontró tu perfil" fallback | `:155-163` | — | profile row missing | **C** |

### 7.2 The `?sheet=` overlay — `app/(app)/cuenta/CuentaSheetMounter.tsx`

| Sheet | Line | Component | Gate | Action | Dest |
|---|---|---|---|---|---|
| `editar-perfil` | 60-73 | `EditProfileForm` | none | `updateProfileAction` / `uploadAvatarAction` — `app/actions/profile.ts:42,58` | **C** |
| `renunciar-rol` | 75-88 | `VetSelfResignForm` | `if (role !== "vet") return null` (**:76**) | `vetSelfResignAction` `profile-self-service.ts:43` | **C** — §8 |
| `solicitar-upgrade-vet` | 90-107 | `VetUpgradeForm` | `if (role !== "owner") return null` (**:94**) | `requestVetUpgradeAction` `app/actions/upgrade.ts:46` | **C** — §8 |
| `verificar-dni` | 109-122 | `DniVerifyForm` | `if (dniVerified) return null` (**:110**) | `verifyDniAction` `app/actions/dni-verification.ts:39` | **C** |
| unknown/absent | 124-125 | — | returns null | — | — |

Per the header comment (`:13-17`), `desactivar`, `ofrecerme-como-transito`, `crear-consultorio`, `privacidad` are deliberately **full pages, not sheets**.

**Note (`:94`):** the client-side `role !== "owner"` gate closes a real gap — the server action itself only rejects `role === "vet"`. Deleting the sheet layer without preserving this check **widens** an authorization gap. Flagged.

### 7.3 The 13 sub-routes

| Route | Key functions (file:line) | Scoped to | Role gate | Dest |
|---|---|---|---|---|
| **`/cuenta/editar`** | Avatar upload (JPEG/PNG/WebP ≤2MB) `EditProfileForm.tsx:66-94,130-150` → `uploadAvatarAction` `app/actions/profile.ts:58` · Nombre (2-80, required) `:230-254` · Teléfono + `PhoneFormatWarning` `:18-25,256-280` · **`EmergencyContactFields`** `:282-302` · "Guardar cambios" → `updateProfileAction` `app/actions/profile.ts:42` · "Cancelar" `:313-318` | person | none | **C** — *and the whole page collapses into the `editar-perfil` sheet, which already renders the identical form.* **Emergency fields → A per §5.** |
| **`/cuenta/privacidad`** | "Descargar JSON" (Ley 25.326 art.14) `PrivacyActions.tsx:77-84` → `exportMySubjectDataAction` `app/actions/subject-rights.ts:24` · "Quiero eliminar mi cuenta" + motivo (≥5) `:101-144` · "Confirmar borrado" → `eraseMySubjectDataAction` `:42`, `subject-rights.ts:31` · legal note card `privacidad/page.tsx:46-58` | person | none | **C** — **must survive.** Export + erasure are statutory. |
| **`/cuenta/verificar-dni`** | Redirect if verified `page.tsx:36-38` · `sanitizeNext` open-redirect guard `page.tsx:13-19` · DNI field (7-8 digits) `DniVerifyForm.tsx:31-49` · "Declarar DNI" → `verifyDniAction` `app/actions/dni-verification.ts:39` | person | none (but gates upgrade/org/foster) | **C** — **must survive.** No-DNI-in-plaintext invariant; `sanitizeNext` is a security control. |
| **`/cuenta/upgrade`** | **Card A (vet):** already-vet CTA `page.tsx:80-85` · pending banner `:94-103` · approved `:104-131` · rejected + `decisionNotes` `:132-148` · `VetUpgradeForm` — matrícula, provincia (`LocationFields` L1), especialidad, años `:127-198` · **DNI gate** `VetUpgradeForm.tsx:45-95` · → `requestVetUpgradeAction` `app/actions/upgrade.ts:46`. **Card B (org):** already-admin link `:165-181` · `OrgCreateForm` — nombre, razón social, tipo (govt `sanitary_authority` blocked client+server), correo, CUIT, teléfono, jurisdicción, personería `:133-263` · DNI gate `:52-102` · → `createOrganizationAction` `upgrade.ts:78` | **role** / **org-membership** | content differs by role/state | **C** — **must survive.** §8 |
| **`/cuenta/crear-consultorio`** | **Gate:** `role!=="vet"` → `RoleGateNotice` → `/upgrade` `page.tsx:35-44` · **Gate:** `!matriculaVerified` → notice → `/solicitudes` `:46-55` · redirect if already admin `:70-72` · 3-step wizard: legales (nombre/razón/CUIT) `CrearConsultorioForm.tsx:61-94`, contacto `:97-113`, ubicación `:116-140` · DNI gate `:33-50` · → `createClinicAction` `upgrade.ts:120` | **role (vet)** + **org-membership** | **fully vet+matriculaVerified** | **E/C** — **must survive.** §8 |
| **`/cuenta/renunciar`** | **Gate:** `role!=="vet" \|\| accountType!=="personal"` → redirect `page.tsx:27-29` · consequences ×4 `VetSelfResignForm.tsx:57-77` · motivo `:80-95` · confirm checkbox `:98-100` · "Renunciar" → `vetSelfResignAction` `profile-self-service.ts:43` · "Cancelar" `:111-116` | **role (vet)** | vet + personal only | **E/C** — **must survive.** §8 |
| **`/cuenta/desactivar`** | **Gate:** `role!=="govt" \|\| accountType!=="institutional" \|\| deactivatedAt!==null` → redirect `page.tsx:28-35` · per-locality coverage computation `:37-83` · coverage list `GovtSelfDeactivateForm.tsx:74-104` · **block banner when any locality uncovered** `:108-121`, `canProceed` `:29` · consequences `:127-149` · motivo `:152-168` · confirm `:171-173` · → `govtSelfDeactivateAction` `profile-self-service.ts:54` | **role (govt)** | govt + institutional only | **E** — **must survive, out of owner scope.** The coverage gate is a public-service continuity control. §8 |
| **`/cuenta/memberships`** | Count header `page.tsx:68-79` · empty state → `/upgrade` `:82-96` · per-membership row: org link → `/org/{token}`, `OrgTypeBadge` `:149-156`, `VerifiedBadge` `:158-171`, `RoleBadge` `:173-180`, joined date `:101-138` · **`LeaveMembershipButton`**: disabled when `isLastAdmin` `LeaveMembershipButton.tsx:37-48`; "Renunciar" → confirm → `leaveOrganizationAction` `:25`, `src/modules/organizations/actions.ts:298` | **org-membership** | last-admin protection | **C** — **must survive.** §8 |
| **`/cuenta/solicitudes`** | Pending org invitations (email-matched) `page.tsx:157-194` → "Ver invitación" `/r/invite/{token}` · requests list w/ type+status badges, dates, rejection reason `:250-299` · filter chips Todas/Pendientes/Aprobadas/Rechazadas `:212-229`, `FilterChip` `:312-337` · empty states `:206-208,233-236` · `WithdrawButton` (pending only, `:297`) → `withdrawApprovalRequestAction` `app/actions/approval-requests.ts:33` | **role** + **org-membership** | none for access | **C** — **must survive.** |
| **`/cuenta/transitos`** (hub) | 4 rows w/ live count badges: ofrecerme `:46-50`, propuestas + pending badge `:51-56`, activos + active badge `:57-62`, historial `:63-67` · info card `:71-80` | **role (foster)** | none for access | **C** — *hub is removable; children are not.* |
| ↳ **`/transitos/activos`** | Active foster list → `/mis-mascotas/{token}` `page.tsx:90-120` · empty state `:77-88` · **`CoFosterToggle`** "Permitir"/"No permitir" `CoFosterToggle.tsx:44-68` → `setCoFosterAllowedAction` `:27`, `src/modules/foster/actions.ts:407` · nav footer `:124-137` | **pet** (ownership) | foster | **A** — *`CoFosterToggle` is per-pet; it belongs on the foster pet's credential* |
| ↳ **`/transitos/historial`** | Finalizados list `page.tsx:70-110` · propuestas no concretadas + rejection reason `:112-147` · read-only | pet/role | foster | **B** or **C** |
| ↳ **`/transitos/propuestas`** | "Ofrecerme" CTA `:48-53` · activas `:58-103` · historial `:106-132` | pet/role | foster | **C** — *proposals are for pets you do **not** own yet → no credential exists.* §9.2 |
| ↳ **`/transitos/propuestas/[token]`** | 404 guards `page.tsx:34-35` · detail rows `:70-89` · matching warnings `:94-106` · **`ProposalActions`** (pending only, `:109`): Aceptar → `allowCoFoster` checkbox + notes → `acceptFosterProposalAction` `ProposalActions.tsx:50`, `foster/actions.ts:249`; Rechazar → motivo select (capacity/health_mismatch/timing/distance/household/other) + notes → `rejectFosterProposalAction` `:75`, `foster/actions.ts:295`; success screen `:91-103` | **pet** (proposal) | foster | **C** — *same: no credential yet.* §9.2 |
| **`/cuenta/ofrecerme-como-transito`** | **Precheck gate** (`ready`, `page.tsx:36-42`): isPersonalOwner + dniVerified + hasDisplayName + hasPhone → else `PreCheckChecklist` w/ per-item CTAs `:103-165` · status banner + Pausar `FosterVolunteerWizard.tsx:193` / Salir del pool → `withdrawFosterVolunteerAction` `:142`, `foster/actions.ts:377` / Reactivar `:219` · Step 1 disponibilidad: `LocalityPickerAcross`, duración máx `:246-305` · Step 2 qué podés recibir: species/size/age/condition checkboxes incl. **PPP liability note** `:308-386` · Step 3 contexto: tri-state otros animales / chicos, notas `:389-421` · → `upsertFosterVolunteerAction` `:124`, `foster/actions.ts:350` | **role (foster-volunteer)** | owner + personal | **C** — **must survive.** Person-scoped: it's a profile of *you as a household*, not of any pet. |
| **`/cuenta/casos`** | `CasesWidget` "Abiertos" `page.tsx:38` · `CasesWidget` "Historial" (limit 50) `:39-43` · "← Volver al inicio" → `/inicio` `:22-28` · read-only | person (cross-pet) | none | **B** — *confirmed pet/custody-scoped content living under the account.* Lands on the index. |

**Confirming the brief's suspicion:** yes — **`/cuenta/casos` and `/cuenta/transitos` are pet/custody-scoped content filed under the account.** `/cuenta/casos` is literally two `CasesWidget` mounts and a link back to `/inicio`; it has no account-scoped function at all. `/cuenta/transitos` is a 4-row hub over pet-custody children. **Both hubs land: `/cuenta/casos` → B, `/cuenta/transitos` hub → C-collapsed.** But note the split — `CoFosterToggle` is genuinely per-pet (→ A), while the *proposals* are for pets you don't own yet (→ C, §9.2). "Tránsitos" is not one thing.

---

## 8. Role-conditional — owners are not the only ones on these screens

**This is the collapse's biggest non-obvious hazard.** `/cuenta` is a **shared** surface. A vet, a govt officer, and an org member all live on it. "Minimal cuenta" must not mean "owner's cuenta."

| Actor | What they need on `/cuenta` that an owner never sees |
|---|---|
| **Vet** | Matrícula verification row (`cuenta/page.tsx:268-286`) · "Crear consultorio" banner, gated `vetNeedsClinic` (`:100-114,308-328`) · "Crear consultorio" row (`:364-370`) · "Renunciar a rol veterinario" (`:386-393`) · the `renunciar-rol` sheet (`CuentaSheetMounter.tsx:75-88`) · `/cuenta/crear-consultorio` (vet + `matriculaVerified` double gate, `page.tsx:35-55`) · `/cuenta/renunciar` |
| **Owner→vet applicant** | `solicitar-upgrade-vet` sheet (`CuentaSheetMounter.tsx:90-107`, **`role==="owner"` gate at `:94` closes a server-side gap**) · `/cuenta/upgrade` Card A + its DNI prereq · `/inicio`'s pending band (`inicio/page.tsx:368-404`) · `/cuenta/solicitudes` to track it |
| **Govt (institutional)** | `/cuenta/desactivar` — **with a per-locality coverage gate that blocks self-deactivation while any locality would be left uncovered** (`GovtSelfDeactivateForm.tsx:29,108-121`). Also: the entire "02 Rol y organizaciones" section and "Zona de riesgo" are **hidden** for them (`cuenta/page.tsx:352,417`), and the section numbering shifts (`:401`). |
| **Org member** | `/cuenta/memberships` + `LeaveMembershipButton`'s **last-admin protection** (`LeaveMembershipButton.tsx:37-48`) · `/cuenta/solicitudes` invitations (`page.tsx:157-194`) |
| **Vet who also owns pets** | **`/mis-mascotas` redirects them away** unless `?as=owner` (`mis-mascotas/page.tsx:61-63`). If the owner index is folded into a credential swipe, **this redirect and its escape hatch must be re-homed or vets lose access to their own pets.** |

**Rule for the collapse:** the "minimal cuenta" (**C**) is minimal **for owners**. Every gate above is either a security control (`:94`, last-admin, `sanitizeNext`), a public-service control (govt coverage), or a professional-tier flow. **None of them may be dropped as part of an owner-tier simplification.** If the design cannot express them, `/cuenta` stays as-is for non-owner roles and only the owner's view of it slims down.

---

## 9. Functions with NO good destination — the genuine lock-out risks

These are the ones that force a screen to survive. **This is the section that decides what gets cut.**

### 9.1 Cross-pet aggregation — "is anything on fire?"

A credential is per-pet **by definition**. These are cross-pet **by definition**:

| Function | Source |
|---|---|
| Urgency subtitle "N vencimientos · N casos" | `inicio/page.tsx:305-329` |
| "N de M mascotas al día" | `inicio/page.tsx:339-349`, `PetHealthStatusStrip.tsx:112` |
| `RemindersSection` across all pets | `RemindersSection.tsx`, `fetchActiveReminders` `owner-dashboard.ts:1031` |
| "Próximos turnos" (5 across all pets) | `inicio/page.tsx:514-537`, `fetchUpcomingAppointments` `owner-dashboard.ts:165` |

**The lock-out:** a 4-pet owner sitting on Pampa's credential has **no way to know** that pet #3's rabies is overdue without swiping to it. Today `/inicio` answers "is anything on fire?" in one glance. Per-pet pendientes answer "is *this* pet on fire?" — a different question.

**What it forces:** the **B** index cannot be a plain list. It must carry the rollup — the counts, and ideally the reminders. **Or** the swipe container carries a persistent cross-pet status bar above the credentials. Either way, **something above the per-pet layer must survive.** For a 1-pet owner (likely the majority) this is a non-issue; for a 4-pet owner it is the whole value of the home screen.

### 9.2 Functions about pets you do NOT own — **no credential exists to host them**

**This is the hardest finding in this document.** These have **no A destination**, structurally:

| Function | Source | Why there's no credential |
|---|---|---|
| **"+ Denunciar maltrato animal"** → `/denuncias/nueva` | `inicio/page.tsx:547-552` | It's about **someone else's** animal. You may own no pets at all. |
| **Inbound transfers** "N transferencias esperan tu confirmación" | `OpenCyclesSection.tsx:76-87`, `countPendingTransfers` `owner-dashboard.ts:1850` | The pet **is not yours yet**. That's the point of confirming. |
| **Adoption postulaciones** | `OpenCyclesSection.tsx:64-75`, `/mis-mascotas/postulaciones` | You're applying for a pet you don't own. |
| **Foster proposals** | `/cuenta/transitos/propuestas`, `foster/actions.ts:249,295` | A shelter proposes a pet you don't have custody of. |
| **`IntentApplyBanner`** resume | `IntentApplyBanner.tsx:23-122` | Cookie-scoped, for an unowned pet. |
| **Approval requests / custody disputes** (inside `fetchOpenWorkflows`) | `owner-dashboard.ts:711` | Person-scoped or contested — no clean pet owner. |

**What it forces:** the model "1 pet = 1 screen, 4 pets = swipe" has **zero screens** for a user with **zero pets** — and that user can still denounce cruelty, apply to adopt, receive a transfer, and volunteer as a foster. **A pets-only IA cannot represent a pets-less user.**

**Therefore: the `mis-mascotas` index (B) must survive as a real screen**, not as an overflow link off the carousel. It is the only place these can live. The PO's model already keeps B for "reclamar" and "the many-pet index" — this finding says B carries **more** than that: it is the **inbox for everything that isn't yet yours.**

### 9.3 The 200-pet tail

`/inicio` caps the carousel at **8** (`OWNER_CAROUSEL_CAP`, `inicio/page.tsx:209`). `/mis-mascotas` caps at **200** (`MIS_MASCOTAS_LIMIT`, `mis-mascotas/page.tsx:44`) and shows an over-cap notice (`:171-176`) telling users to "usá el buscador" — **a búsqueda that does not exist**. Verified: no search or filter UI is present anywhere on that page.

**What it forces:** swipe is a 1-8 pet UI. **B must survive with a real list** — and the phantom search should either be built or the notice reworded. Note the shape: a 200-pet "owner" is usually a shelter that hasn't onboarded to `app/org/**`.

### 9.4 Memorials

Deceased pets are **excluded** from `/inicio`'s carousel (`carouselSource`, `inicio/page.tsx:210`) and live in `/mis-mascotas`'s "In memoriam" section (`mis-mascotas/page.tsx:226-245`). The credential surface renders a memorial skin (`CredentialFace.tsx:188-364`, `page.tsx:464-469`) — so **A can host a memorial** — but if the carousel is the only home and it filters the deceased out, **memorials become unreachable**.

**What it forces:** either the swipe includes memorials (a grief-UX decision — do you want to swipe past a dead pet on the way to a live one? Almost certainly not) or **B keeps the In memoriam section**. Recommend B.

### 9.5 The QR slot

The draft puts **Anotar / Ver perfil** where the landing hero puts the **QR**. But the QR is not decoration — it's generated per-pet (`page.tsx:522-527`) and resolves to `/p/{publicToken}`, and **"the pet is the credential"** is invariant #1. Showing your pet's QR to a vet is a real, physical, in-clinic act.

**What it forces:** name the QR's new home explicitly. It currently also lives behind `?sheet=compartir` (`SheetMounter.tsx:304-332`) — that may be enough, but it's a demotion from hero to sheet and should be a **conscious** PO decision, not a side effect of the button placement.

### 9.6 The `#asentar` deep-link anchor

`CitizenTabBar`'s capture tab deep-links to `/inicio#asentar` (`inicio/page.tsx:440-445`). If `/inicio` is removed, **the bottom tab bar breaks.** Mechanical, but it's a lock-out if unnoticed — and it's the single most-used control in the app.

### 9.7 Deep-link / bookmark surface

| Route | Shared/bookmarked? | Implication |
|---|---|---|
| **`/mis-mascotas/[publicToken]`** | **YES — heavily.** Linked from `app/org/[orgToken]/mascotas/OrgMascotasBulkList.tsx:337`, `OrgMascotasPipelineBoard.tsx:106`, `app/org/[orgToken]/checkins/page.tsx:179,227,268`, and the public found-pet CTA `app/(public)/p/[publicToken]/encontre/action.ts:339` (comment: *"the cockpit IS /mis-mascotas/{token}"*) | **This URL must not change.** If the credential surface becomes `/inicio?pet={token}`, all five call sites break — **including one that fires in the middle of a lost-pet emergency.** Recommend: the credential surface **keeps** `/mis-mascotas/[publicToken]` as its canonical URL and `/inicio` redirects into it (e.g. to the most-urgent pet), **not** the reverse. |
| `/p/{publicToken}` | **YES — it's the QR target.** Physically printed on chapitas. | Immutable. Out of scope. |
| `?tab=libreta` + legacy `?tab=vacunas\|historial\|resumen` + `#hash` | Yes | Already handled by `resolvePetFace` (`lib/domain/pet-face-nav.ts`, `HASH_TO_TAB` line 77). Preserve. |
| `/mis-mascotas/{token}/vacunas`, `/historial`, `/mostrar-libreta` | Yes (legacy) | Redirect stubs into `?tab=`. Keep. |
| `?sheet=*` on the pet profile | Shared in-flight (e.g. `?sheet=marcar-encontrada` from `CredCard.tsx:156-160`) | Preserve the whole vocabulary. |
| `/inicio#asentar` | Tab-bar target | §9.6. |
| `/mis-mascotas?as=owner` | **Vet escape hatch** (`page.tsx:61-63`) | §8. Must survive in some form. |
| `/cuenta?sheet=*` | 4 values (`CuentaSheetMounter.tsx`) | Low bookmark risk; `?sheet=verificar-dni` is linked from `/cuenta` itself (`:258-263`). |

**Recommendation:** `?pet={token}`-style addressing on a collapsed `/inicio` is the **wrong direction**. The pet profile URL is the one with real inbound links from three tiers (owner, org, public). **Collapse `/inicio` into `/mis-mascotas/[publicToken]`, not the other way round.**

---

## 10. Screens we can actually remove

**Only these. Every function inside them has a named destination.**

| Screen | Why it's safe | Where its functions go |
|---|---|---|
| **`/cuenta/editar`** | **Fully redundant today.** `?sheet=editar-perfil` (`CuentaSheetMounter.tsx:60-73`) already mounts the **same `EditProfileForm`** with the **same actions**. The standalone route is a second door to one room. | Avatar/nombre/teléfono → **C** (the sheet). `EmergencyContactFields` (`:282-302`) → **A** per §5. |
| **`/cuenta/casos`** | It has **no account-scoped function**. It is two `CasesWidget` mounts (`page.tsx:38,39-43`) plus a "← Volver al inicio" link (`:22-28`). Pure pet/custody content misfiled under the account. | Both widgets → **B**. `CasesWidget`'s "Ver historial →" (`CasesWidget.tsx:90-97`) re-points to B. |
| **`/cuenta/transitos`** (the **hub only**) | A 4-row link menu with count badges (`page.tsx:46-67`) + an info card (`:71-80`). Zero functions of its own. | Rows → **C** (`/cuenta` section) or **B**. Its **children survive** — see below. |

**Everything else stays.** In particular, **`/inicio` and `/mis-mascotas` are *not* on this list** — §9.1/9.2/9.3/9.4 each independently block removing `/mis-mascotas`, and `/inicio`'s cross-pet rollup + `#asentar` anchor need explicit homes first.

**What the collapse actually buys, honestly:** `/inicio`'s per-pet content (carousel cards, health strip rows, reminders, EventCatcher's pet picker) is **already a duplicate** of the pet profile's own content, computed by the **same projections** (`lnPetStatusFromCompliance` `lib/projections/pet-compliance.ts:548` feeds `/inicio`, `/mis-mascotas`, *and* the profile; `credRank` `inicio/page.tsx:568-583` and `misMascotasRank` `mis-mascotas/page.tsx:119-137` are **duplicated identical rank tables**). The win is **real** — it's a **dedupe**, not a deletion. `/inicio` becomes thin (rollup + inbox) rather than absent, and `/mis-mascotas` becomes the index + inbox it half-is already.

---

## 11. Screens that must survive (and why)

| Screen | Why |
|---|---|
| **`/mis-mascotas`** (as **B**) | **Four independent blockers:** the pets-less user and everything-not-yet-yours (§9.2), the 200-pet tail (§9.3), memorials (§9.4), and the cross-pet rollup (§9.1). This is not a nice-to-have — it's the only screen that can exist when you own zero pets. |
| **`/mis-mascotas/[publicToken]`** (as **A**) | It IS the new model. Also **shared infrastructure** — five inbound links from org + public tiers (§9.7), one of them in the lost-pet emergency path. **URL is immutable.** |
| **`/cuenta/privacidad`** | Statutory. `exportMySubjectDataAction` (Ley 25.326 art.14) + `eraseMySubjectDataAction` (`app/actions/subject-rights.ts:24,31`). Not removable at any size. **And after §6 it becomes the *only* honest privacy surface on the account.** |
| **`/cuenta/verificar-dni`** | The DNI gate for upgrade/org/foster flows. Holds `sanitizeNext` (`page.tsx:13-19`), an open-redirect guard — a security control, not a page. |
| **`/cuenta/upgrade`** | Owner→vet and owner→org. Role-transition. §8. |
| **`/cuenta/crear-consultorio`** | Vet + `matriculaVerified` double gate (`page.tsx:35-55`). §8. |
| **`/cuenta/renunciar`** | Vet→owner downgrade. §8. |
| **`/cuenta/desactivar`** | Govt institutional. **Holds a per-locality coverage gate** (`GovtSelfDeactivateForm.tsx:29,108-121`) preventing a jurisdiction from being left uncovered. Out of owner scope entirely. §8. |
| **`/cuenta/memberships`** | Org membership + **last-admin protection** (`LeaveMembershipButton.tsx:37-48`). §8. |
| **`/cuenta/solicitudes`** | Request tracking + org invitations. The only place a rejected upgrade's `decisionNotes` surfaces. §8. |
| **`/cuenta/ofrecerme-como-transito`** | Genuinely person-scoped — a profile of **your household**, not any pet. 3-step wizard + pool status controls. |
| **`/cuenta/transitos/{activos,historial,propuestas,propuestas/[token]}`** | The hub dies; the children don't. Proposals are for **unowned** pets (§9.2). `CoFosterToggle` (`CoFosterToggle.tsx:44-68`) is the one genuinely per-pet piece → **A**. |
| **`/mis-mascotas/{nueva,reclamar,postulaciones}`** | Real flows off B. |
| **`/mis-mascotas/reclamar-dni`** | **Frozen — do not touch.** `ClaimForm.tsx:1-19` is a static "temporalmente pausado" notice pending Mi Argentina identity verification. Invariant #6: no decision may harm the Mi Argentina path. |
| **`/cuenta`** (as **C**, slimmed **for owners only**) | Identity, DNI, role/org, export/erasure, logout. **Cannot be slimmed for vet/govt/org-member** without dropping security and public-service gates (§8). |

---

## 12. Dead code to delete

| # | What | Verdict | Evidence |
|---|---|---|---|
| **1** | **The 4 `/cuenta` privacy toggles** — `PrivacySection.tsx` (whole file), its mount + SELECT + prop pass (`cuenta/page.tsx:76-79,295-303`), `lib/domain/privacy-prefs.ts` (whole file), `update-privacy-pref.ts` (whole file), `updatePrivacyPrefAction` (`profile-self-service.ts:65`), `UpdatePrivacyPrefResult` | **D — DEAD. DELETE.** | §6. Complete repo-wide grep: **every** reference is the definition, the key list, a comment, the toggle itself, or `/cuenta` reading its own state back. **Zero consumers.** Public page gates on `pet.*` only (`p/[publicToken]/page.tsx:392,451-454,460`) and only inside `if (isLost)` (`:385`). Not a privacy control — a **claim** of one. Ley 25.326 credibility problem. |
| **2** | **The false schema comment** `db/schema.ts:446-450` ("Each toggle controls a single surface; per-pet overrides live on…") + `COMMENT ON COLUMN` at `db/migrations/0050_phase1_schema_extensions.sql:70-76` | **D (comment)** | The comment documents an intent the code never implemented. Migrations are immutable, so 0050's `COMMENT ON` needs a **new** forward-only migration to correct or drop. |
| **3** | `profiles.disclose_name_credential`, `disclose_phone_credential`, `allow_org_contact`, `allow_lost_alerts_in_zone` (`db/schema.ts:451-454`) | **D — pending PO call (Q1)** | Zero readers. Drop in a forward-only migration, **or** keep + fix the comment to "UNUSED — superseded by `pets.disclose_*_when_lost`". Dropping is cleaner. The **UI must go regardless** — the UI is what makes the false claim. |
| **4** | `EventCatcher` zero-pet fallback `components/EventCatcher.tsx:114-126` | **D — unreachable from `/inicio`** | `inicio/page.tsx:444` already hides the whole card when `!hasManageablePets`. Keep **only** if `EventCatcher` is reused elsewhere — verify before cutting. |
| **5** | Stale comment `mis-mascotas/[publicToken]/page.tsx:33` — "CredentialFace's EmergencyCard" | **D (comment)** | The JSX disagrees: `EmergenciaBlock` is in `LibretaFace.tsx:180-246`, Face 2 only. Spec-conflict rule: code wins. |
| **6** | `preferredVetName` fetched but never rendered (`page.tsx:280-292` vs `LibretaFace.tsx:180-246`) | **Not dead — resolve via §5** | Fetched, unused in the block. Either render it or stop selecting it. Folds into the §5 fix. |
| **7** | Duplicated rank tables — `credRank` `inicio/page.tsx:568-583` vs `misMascotasRank` `mis-mascotas/page.tsx:119-137` | **Not dead — dedupe** | Identical logic, two copies. The collapse is the natural moment to extract one. |
| **8** | `/mis-mascotas/[publicToken]/editar` standalone vs `?sheet=editar-mascota` | **Not dead — parity dupe** | Same `PetForm`, same `updatePetAction`. Same shape as `/cuenta/editar` (§10). Candidate for the same treatment. |
| **9** | The 200-cap notice's phantom "buscador" (`mis-mascotas/page.tsx:171-176`) | **Broken copy, not dead code** | No search UI exists on the page. Either build it or fix the sentence. §9.3. |

---

## 13. Open questions for the PO

1. **Privacy columns — drop or keep?** The **UI goes regardless** (§6, §12.1). But do we drop the four `profiles.*` columns in a forward-only migration (clean, removes the misleading `COMMENT ON COLUMN`), or keep them and just correct the comment to "UNUSED"? *Recommendation: drop. A dead column with a false comment is how this happened in the first place.*

2. **Emergency contacts — per-pet override + account default (recommended, §5), or per-pet only?** The override model costs one additive migration and spares a 4-pet owner from typing the same vet four times. Per-pet-only is purer but worse for the common case. *Recommendation: override + default.*

3. **Cross-pet rollup — where?** §9.1 says something above the per-pet layer must answer "is anything on fire across all my pets?" Options: (a) the **B** index carries the rollup, (b) a persistent status bar above the swipe, (c) accept that a 4-pet owner swipes to find out. *Recommendation: (a). It's the smallest change and B has to survive anyway.*

4. **The pets-less user (§9.2) — confirm B is the inbox.** Maltrato denuncias, inbound transfers, adoption postulaciones, and foster proposals are all about pets that **aren't yours**. They cannot live on a credential. Does the PO accept that **`mis-mascotas` is the index *and* the inbox**, or should the inbox be its own thing?

5. **The QR (§9.5).** The draft puts Anotar/Ver perfil in the QR's hero slot. Is demoting the QR to `?sheet=compartir` acceptable, given invariant #1 ("the pet is the credential") and the in-clinic show-your-QR moment? *This should be an explicit decision, not a side effect.*

6. **Memorials in the swipe? (§9.4)** Should a deceased pet appear in the credential swipe (currently filtered out at `inicio/page.tsx:210`), or stay in B's "In memoriam"? *Recommendation: B. Swiping past a dead pet to reach a live one is a grief-UX failure.*

7. **URL direction (§9.7) — confirm.** `/mis-mascotas/[publicToken]` has five inbound links from the org and public tiers, one in the lost-pet emergency path (`p/[publicToken]/encontre/action.ts:339`). Confirm the credential surface **keeps that URL** and `/inicio` redirects **into** it — rather than `/inicio?pet={token}`.

8. **The vet-with-pets escape hatch (§8).** `/mis-mascotas?as=owner` is how a vet reaches their own pets (`mis-mascotas/page.tsx:61-63`). Where does that live after the collapse?

9. **Scope confirmation.** Is the "minimal cuenta" (**C**) minimal **only for owners**? §8 says the vet matrícula flow, the govt coverage gate, the last-admin protection, and the `role==="owner"` sheet gate (`CuentaSheetMounter.tsx:94`, which closes a real server-side gap) **cannot** be dropped. Confirm the collapse slims the **owner's view** of `/cuenta`, not `/cuenta` itself.

---

## Appendix — verification notes

- This was a **read-only** pass. No code was modified.
- Every `file:line` was read, not inferred. Where the brief's description disagreed with the code, **the code is reported** and the discrepancy flagged (`PetEmergencyCard` → `EmergenciaBlock`; "Más acciones" menu → static two-card grid; `/mis-mascotas` filters/search → none exist; `page.tsx:33` stale comment).
- The §6 dead-code verdict rests on an **exhaustive** repo-wide grep of all four columns in **both** camelCase and snake_case, plus targeted checks of: every server action, the public `/p/[token]` render path, the poster path, the notification/alert-firing path, and all 30 `.from(profiles)` call sites for a bare `select()` splat. The reference set in §6.1 is **complete**, not a sample.
