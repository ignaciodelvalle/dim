# Owner IA redesign — the profile IS the app

> The owner experience collapses 3→2: the pet profile (`/mis-mascotas/[publicToken]`) becomes THE
> owner surface — a carousel of the owner's pet credentials — and `/mis-mascotas` becomes the
> index + inbox. `/inicio` disappears into the profile. Every decision below is PO-locked
> (2026-07-13). The anti-lock-out gate is `docs/design/proposals/2026-07-13-owner-ia-collapse-inventory.md`
> (~180 functions, each with a destination) — **no screen is removed until every function it holds
> has landed**. Draft that seeded the conversation: `docs/design/drafts/owner-home-3in1-draft.html`
> (superseded on one point: the credential is ONE — the profile itself swipes; there is no second
> mini-credential of the same pet).

## The model (as the owner lives it)

- **Open the app → land on the credential of the pet that most needs you** (urgency order).
  Zero pets → land on the index.
- **The profile IS the credential**: the existing two-face document (Credencial ↔ Libreta),
  with photo + QR at EQUAL weight (PO: "el QR da el indicio de que existe en un sistema" —
  invariant #1 made visible). Actions live in the existing action row below the identity band.
- **Swipe (or arrows) moves between YOUR pets** — same document, next pet, urgent-first.
  The URL follows: each pet keeps its real route (`/mis-mascotas/[token]`). Sharing, back
  button, and the lost-pet emergency path (5 inbound links from org/public tiers) stay intact.
- **Position dots carry each pet's status color** — the cross-pet glance without leaving the
  document (dot 3 amber ⇒ Michi needs something).
- **Per-pet content lives inside its pet**: reminders, turnos, open cycles — computed by the
  same projections that fed `/inicio`'s duplicates.
- **Capture = the existing "Anotar" action** (pet already known; no picker). The tab-bar
  "Asentar" retargets to the CURRENT pet's anotar. No capture card is added to the profile.
- **`/mis-mascotas` = index + inbox**: the cross-pet rollup, everything about pets that are
  NOT yours (denuncias made, inbound transfers, adoption postulaciones, foster proposals),
  En memoria (deceased NEVER enter the swipe), reclamar, the 200-tail with real search.
  The #9 `CredCard` mini-cards move here (compact per-pet cards belong on an index).
- **`/cuenta` slims FOR OWNERS ONLY**: identity, DNI, role/org membership, data export/erase
  (Ley 25.326), logout. Vet/govt/org flows (matrícula, coverage gate, last-admin protection,
  the `role==="owner"` sheet gate) are security/public-service controls and survive untouched.

## PO-locked decisions (2026-07-13)

| # | Decision |
|---|---|
| 1 | Dead privacy columns: **DROP** (forward-only migration) + delete the UI/lib/action; new migration corrects the false `COMMENT ON` from 0050 |
| 2 | Emergency contacts / preferred vet: **per-pet override + account default** (additive migration) |
| 3 | Cross-pet rollup lives on the **index** |
| 4 | The index is also the **inbox** (not-your-pets items) |
| 5 | **QR stays at photo level** on the credential; actions go below, not in the QR slot |
| 6 | Deceased pets: **index "En memoria" only**, never in the swipe |
| 7 | URL direction: **the profile keeps its route**; `/inicio` redirects INTO it (swipe = navigating real routes) |
| 8 | Vet-with-pets: **`/mis-mascotas` (+`?as=owner`)** remains the door |
| 9 | The cuenta slim-down applies to the **owner's view only** |
| — | Avisos≠compliance verified NOT duplicated; fix is a RENAME ("Vigilancia por mordedura") |
| — | The situation pill drops its date suffix (the alert card owns the date) — the one real duplicate |
| — | Gesture model: Claude's call ("manejalo como quieras") |

## Phases (each independently shippable; anti-lock-out check at every removal)

### P1 — Standalone cleanups (no IA change; land first, lowest risk)
1. **Delete the dead privacy feature**: `PrivacySection.tsx`, `lib/domain/privacy-prefs.ts`,
   `update-privacy-pref.ts`, `updatePrivacyPrefAction`, the mount/SELECT in `cuenta/page.tsx`;
   forward-only migration dropping `profiles.disclose_name_credential`, `disclose_phone_credential`,
   `allow_org_contact`, `allow_lost_alerts_in_zone` + correcting 0050's `COMMENT ON`. (A privacy
   screen that claims control it doesn't have is the worst thing we found.)
2. Delete dormant `EventCatcherSingle` (+ its test).
3. Rename the rabies-observation banner heading → **"Vigilancia por mordedura"** (kills the
   "antirrábica" visual echo with the compliance card; both facts stay).
4. Situation pill (`page.tsx:602-608`): keep the label ("Perdida"/"Preñada"), drop the date —
   `LostCaseBlock`/`PregnancyInProgressCard` own it.
5. Remove `/cuenta/editar` (redirect → `/cuenta?sheet=editar-perfil`, same form) and
   `/cuenta/casos` (redirect → `/inicio#casos` now; index inbox at P5). Remove the
   `/cuenta/transitos` hub (children survive; its 4 links fold into a cuenta section).
6. Fix stale comments (`page.tsx:33` EmergencyCard→EmergenciaBlock; the schema comment via the
   migration above).

### P2 — Emergency contacts per-pet (decision 2)
Additive migration: pet-level `preferred_vet_*` / `emergency_contact_*`; `EmergenciaBlock`
reads pet-level with account fallback, labeled honestly ("de tu cuenta" when falling back);
edit affordance on the Libreta face. `updateEmergencyContactsAction` already receives
`petPublicToken` — the write path is smaller than it looks. Render `preferredVetName`
(fetched-but-unused today) or stop selecting it.

### P3 — The profile absorbs its pet's content
Reminders, turnos, open cycles render INSIDE the pet profile (below compliance/avisos),
pet-scoped, using the same fetchers `/inicio` uses filtered to this pet. `/inicio` still
exists during this phase (transitional duplication is acceptable; removal is P5's gate).
Dedupe `credRank`/`misMascotasRank` into one shared module while touching this.

### P4 — The carousel (the heart)
- The profile swipes between the owner's LIVE pets, urgent-first (the shared rank).
- **Gesture model (my call)**: horizontal swipe is captured on the credential document band
  (header/identity zone) + the status dots + desktop arrow buttons — NOT on the whole page
  surface, so vertical scroll of the long document never fights the swipe. Keyboard: ←/→.
- Navigation = a shallow route transition to the neighbor's REAL route; adjacent pet
  preloaded (prefetch) so the swipe lands without a blank.
- Dots: one per live pet (cap follows the existing 8), tinted by `lnPetStatusFromCompliance`.
- Tab-bar "Asentar" → current pet's `?sheet=anotar`.
- Non-owner viewers (org/admin/public paths into the same route) see NO carousel chrome —
  the swipe is owner-only.

### P5 — `/inicio` folds in; the index+inbox is born
- `/inicio` server-redirects: most-urgent live pet's profile; zero pets → `/mis-mascotas`.
  (`/inicio#asentar`/`#casos` anchors retarget accordingly.)
- `/mis-mascotas` becomes index + inbox: rollup strip (decision 3), inbox sections
  (decision 4: open workflows, foster proposals, transfers, postulaciones), En memoria,
  reclamar, `CredCard` mini-cards as the index rows, and REAL search (the 200-cap notice
  currently points at a buscador that doesn't exist — build it or the copy stays a lie).
- Cuenta owner-view slims to C (decision 9); role flows untouched.
- `inicio-structure.test.ts` and friends are DELIBERATELY updated here (they mandate the old
  blocks); every removed block's function must be shown landed (the inventory is the checklist).

### P6 — Gate
`pnpm verify` + full suite + fresh adversarial review (UI phases also get a live Playwright
pass: swipe, URL-follow, back button, share link, lost-pet emergency path, vet `?as=owner`,
zero-pet landing, org member reaching a held pet's profile without carousel chrome) + PO/Cowork
validation round.

## Risks / watchpoints
- **Gesture conflict** is the top UX risk — hence the constrained swipe surface (P4).
- **Perf**: profile page weight × preload; measure before widening prefetch beyond 1 neighbor.
- **Tests that mandate the old home** — updated deliberately at P5, never silently.
- **Role escape hatches** (vet/govt/org) must survive every phase — §8 of the inventory is the
  checklist.
- The public `/p/[token]` and org tiers share the route — carousel chrome must be
  strictly owner-gated.

## Explicitly out of scope
The org/refugio panel (already professional + bulk — the segmentation the PO named), the vet
tier, `/mis-mascotas/reclamar-dni` (frozen pending Mi Argentina, invariant #6), and the public
credential page.
