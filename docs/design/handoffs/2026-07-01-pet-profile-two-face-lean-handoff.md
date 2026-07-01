# Design handoff — Pet profile "two-face lean" redesign (Credencial | Libreta)

> Date: 2026-07-01 · Skin: citizen (`ln-*` / `Ln*`) · Owner surface: `app/(app)/mis-mascotas/[publicToken]/page.tsx`.
> Decided by the product owner 2026-07-01: the pet profile becomes **two faces of one document** — front (Credencial) and back (Libreta) — replacing the current 4-tab / 17-section layout.
> Builds ON TOP of the compliance-first slice (commits `6a362ec5`…`840aaf02` + H1–H4 corrections). The provenance gate (H1) and curated event detail (H3) are load-bearing and MUST survive intact.

## Read order

1. Why — [`docs/design/2026-07-01-four-actor-lean-ia-critique.md`](../2026-07-01-four-actor-lean-ia-critique.md) §2 (owner = subject; capture and read are the only two verbs; the pet IS the credential).
2. Prior slice — [`2026-07-01-owner-compliance-first-handoff.md`](./2026-07-01-owner-compliance-first-handoff.md) + [`2026-07-01-owner-post-impl-corrections-handoff.md`](./2026-07-01-owner-post-impl-corrections-handoff.md) (H1 gate, H3 curated detail, H4 credential cards — all reused here).
3. This doc.

## 0. The measured problem (audited 2026-07-01 against live code)

| Metric | Today | Target |
|---|---|---|
| `page.tsx` lines | 1,800 | — (recomposition, expect large net-negative) |
| Tabs | 4 (Cumplimiento · Libreta · Vacunas · Historial) | **2 (Credencial · Libreta)** |
| Sections in first tab | 17 (+7 chrome blocks above tabs) | **~4 blocks per face** |
| Distinct visible actions | ~34 | **~6 visible + one "⋯ Más" sheet** |
| Places rendering vaccination data | 4 (panel, Vacunas tab, Libreta ledger, Historial) | **2 (a stamp on the front; the timeline on the back)** |
| Places rendering microchip | 3 | **1 (on the credential)** |
| Entry points to the public QR/credential | 4 | **1 (the QR on the credential)** |
| Dead code | `PetReminders` + page-local `UpcomingAppointments` imported, never rendered | deleted |

Root cause: Libreta, Vacunas and Historial are **three projections of the same append-only ledger** given three tabs, and the compliance panel was added *above* the legacy dashboard instead of replacing it. This handoff completes the re-rank the critique asked for.

## 1. The model: one document, two faces

A citizen's mental model for "my pet's papers" is the DNI + libreta they already know. The profile maps to it literally:

- **Face 1 — Credencial (front).** Identity + legal state + the few actions you take *on the document*. Answers "¿está en regla?" in one glance.
- **Face 2 — Libreta (back).** One chronological ledger — future first, then past — with lenses. Answers "¿qué pasó y qué viene?".
- **Capture** is a single prominent affordance available from both faces → the existing `/anotar` hub (EventCatcher pattern; deterministic, no LLM — the repo's strongest owner-UX asset. Do not rebuild it; feature it).

Tab keys: `credencial` (default) · `libreta`. Old deep links MUST keep working: `?tab=resumen` → `credencial`; `?tab=vacunas` → `libreta` + lens `vacunas`; `?tab=historial` → `libreta` + lens `todo`; `?tab=libreta` → `libreta` + lens `oficial`. (The `/historial` 308 already points at `?tab=historial`; keep the chain.)

## 2. Face 1 — Credencial

One `LnCard`-based credential object (reuse the existing `LnHero` DNI aesthetic — gradient band, watermark, ID photo — as the card's top) fusing what today is six scattered pieces:

| Today (6 pieces) | Becomes |
|---|---|
| `LnHero` (name, breed, tags) | Credential header |
| `ComplianceObligationsPanel` (H4 cards) | **Stamp row** on the credential — same `deriveComplianceState`, same H1 provenance gate, same `data-section="compliance"` / `data-obligation` hooks |
| Right-sidebar "Identificación" card (MICROCHIP · LIBRETA · TITULAR) | Mono ID lines under the header |
| Right-sidebar "Inscripción válida" seal | Small seal in the credential footer |
| `PetCredentialCard` ("Identificación digital", QR + 3 links) | **The QR, printed on the credential** (top-right, like a real DNI). Tapping it → `/p/[publicToken]` |
| `LnVitals` 4-cell strip | Removed. Weight lives in the timeline; vaccine state is a stamp; "última visita" is the top of the timeline; age joins the identity line |

**Below the credential, in order:**
1. `PetAlertStrip` — unchanged (rabies observation, transit, open cases, pregnancy). Conditional; renders nothing when clean. `LostCockpit` / `DeceasedView` early returns stay.
2. **Anotar** — primary CTA (`LnButton primary`, block, ≥44px; sticky footer on mobile per Wave-2 item 9) → `/mis-mascotas/[token]/anotar`.
3. **Action row** — exactly three quiet items: `Compartir ↗` (opens the share sheet: public QR link + `compartir-libreta` with expiry + `mostrar-tier2`, merged into ONE sheet), `Marcar como perdida` (safety-critical, stays visible — never buried), `⋯ Más`.
4. **"⋯ Más" sheet** (LnSheet) — everything else, grouped: Editar datos · Transferir · Buscar hogar · Perro de asistencia (Ley 26.858) · Confirmar devolución (conditional) · Documentos de viaje · Ficha (alergias, comidas, adiestramiento — the ex-"01 Estado de salud" leftovers) · Contactos de emergencia (link to `/cuenta/editar`). Friction scales with reversibility: transfer/devolución keep their confirmation flows.

**Removed from the profile entirely** (product features untouched, just not on the document): `PetTrackingPlaceholder` ("Próximamente" is noise on a legal document), `PhysicalTagInterestCard` (marketing → belongs in `/cuenta` or onboarding), `AchievementsSection` (gamification on a DNI), `PetEmergencyCard` (contacts live in Cuenta; reachable via ⋯ Más), `MedicationDosesSection` + `PetUpcomingCareSection` + `PetWeightChart` as sections (all absorbed by the timeline, §3), `PetHealthTimeline` collapsed preview (the back face IS the timeline), "Ver libreta completa →" link (it's a tab now), dead imports (`PetReminders`, local `UpcomingAppointments`).

**PPP / service-dog credentials:** they are *credentials* — they stay on Face 1, as compact rows under the stamp row (PPP only where the jurisdiction rule applies, per D2 of the original slice; service-dog card keeps `Gestionar` / `Presentar`).

**Org viewer** (`isOwner=false`): sees Face 1 read-only (no Anotar, no ⋯ Más; stamps + identity + QR) and Face 2 clamped to lens `vacunas`/`oficial`. This replaces today's Cumplimiento+Vacunas clamp — simpler and equivalent.

## 3. Face 2 — Libreta (one timeline)

Single reverse-chronological list with a **future section pinned on top**:

- **PRÓXIMO** (future, ascending): active reminders (`fetchActiveRemindersForPet`), confirmed appointments, pending medication doses — the three sources `PetUpcomingCareSection` + `MedicationDosesSection` + "Próximas vacunas" already read, merged into one list. Each row keeps its action (`Marcar dada`, reschedule link). A due/over rabies row carries `Programar turno` → the existing WS-2 intent-fork sheet.
- **— hoy —** divider.
- **Past events**: the existing `EventTimeline` row anatomy (title · meta · `ConfidenceBadge` · `Corregido · ver original` · attachment thumb · curated `Ver detalle` per H3). Weight events render an inline mini-sparkline in their row detail (replaces the `PetWeightChart` section; reuse its SVG).
- **Lenses** (chip row, `aria-pressed`): `Todo` (default, D4) · `Vacunas` (`vaccination_administered` + vaccine reminders — replaces the Vacunas tab; the "Estado de vacunación" 3-badge summary renders only under this lens) · `Oficial` (`LIBRETA_SANITARIA_EVENT_TYPES` — replaces the Libreta tab's grouped view; keep the SENASA labels/ENO badges from `LibretaSanitariaView` as row metadata under this lens).
- **Immutability note** (one line, lock icon) — unchanged from WS-3.
- **Foot**: `Exportar libreta (PDF)` (existing `/api/...libreta-export`) + `Compartir libreta` (opens the same share sheet as Face 1 — `SharesManager` machinery reused inside it).

Data: reuse the deferred-fetch pattern (`getLibretaTabData`/`getVacunasTabData`/`getHistorialTabData` merge into one `getLibretaFaceData`), so Face 1 stays the only SSR-eager content.

## 4. Standards reused / reinterpreted (source: repo-wide inventory 2026-07-01)

1. Capture-hub-first (`/anotar`, EventCatcher) — featured, not rebuilt.
2. Token ratchet — zero new hex/px/`dark:`; the credential recomposes existing `ln-*` tokens and the `LnHero` aesthetic.
3. Four-verb CTA taxonomy — `Anotar` is the domain verb; no bare "Guardar".
4. Receipt screens for trámites — transfer/devolución flows unchanged.
5. 44px targets + 16px inputs + sticky mobile CTA (Wave-2 item 9).
6. Icon+text for every state (WCAG 1.4.1) — stamps are icon+text, never color alone.
7. Friction ∝ reversibility — destructive/rare actions behind ⋯ Más with their existing confirmations.
8. One control per concept — lenses filter, tabs are faces; no third navigation model.
9. Provenance gates compliance (H1) — a stamp is only "ok" when `professional_verified`/`institutional_verified`.
10. **Mobile-first verification** — every audit in this repo ran at ~1220px; this redesign's acceptance includes 320/390px passes as first-class gates.

## 5. Doctrine + test impact (do not skip)

- **AGENTS.md "Design rules" rule 5** (pet-profile block order + tab list) must be updated to: identity/credential → alerts → capture → faces. Update the rule text in the same PR.
- **e2e:** `owner-shell.spec.ts`, `create-pet.spec.ts` re-point (keep `data-section`/`data-obligation` hooks stable); demo spec `e2e/demo/02-dueno.spec.ts` uses `?tab=libreta|vacunas` — the redirect mapping (§1) keeps it green, but update it to the new faces when recording resumes.
- **Unit:** timeline merge (future sources ordering), lens filters, `?tab=` legacy mapping. Table-driven, mirror `lib/projections/pet-compliance.test.ts`.
- `pnpm verify` every iteration; Gate: visual QA at 320/768/1280 with screenshots; verification subagent re-checks H1 (no self-reported event renders an "ok" stamp) and H3 (no blacklisted payload key) after recomposition.

## 6. Open decisions (recommended defaults)

- **T1 — Vitals strip:** removed (default) vs kept as a compact line on the credential. Recommend **removed**; age joins identity, the rest is stamps/timeline.
- **T2 — "Marcar como perdida" placement:** visible action row (default) vs quick-chip row. Recommend **visible action row** — safety-critical must not be behind ⋯.
- **T3 — Ficha (alergias/comidas/adiestramiento):** ⋯ Más sheet entry (default) vs collapsible on Face 1. Recommend **sheet** — it's reference data, not status.

## 7. Out of scope

Owner nav (already re-ranked, H2) · `/anotar` hub internals · vet/org/govt surfaces · public credential `/p/[publicToken]` (already strong; unchanged) · any new event type, color token, or migration · LostCockpit/DeceasedView internals (early returns preserved).
