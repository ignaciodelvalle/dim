# MiMAR / DIM — Four-Actor Lean IA Critique

> Date: 2026-07-01 · Scope: whole-product information architecture across all four actors (owner, vet, organization, govt/admin), read through a compliance-first / event-pipeline lens.
> Method: route-tree + nav-preset + schema reading (`app/`, `components/layout/nav-presets.ts`, `db/schema.ts`, `src/modules/organizations`), reconciled against the existing operator critique (`docs/design/critique-2026-06-24-frontend.md`) and the legal framework in `AGENTS.md`.
> Companion to — not replacement of — the 2026-06-24 operator critique. That doc covers the *token/component* layer (F1–F4); this doc covers the *IA/actor* layer above it.

---

## 0. The thesis, in one sentence

MiMAR is not four apps (owner, vet, org, govt). It is **one append-only event ledger with four postures standing around it.** Every screen either *emits* an event or *reads a projection* of the ledger. The apparent sprawl — five owner-facing "products," a 5-section org portal, a huge admin — is a navigation problem, not a domain problem: each flow was given its own top-level slot instead of being organized around the pipeline it feeds.

The fix is the same everywhere: **stop navigating by feature, start navigating by posture.** Which posture an actor holds tells you exactly what their lean design is.

| Actor | Pipeline posture | Lean lens | Primary loop |
|---|---|---|---|
| Owner | **Subject** | comply-first | see obligations → capture a fact → done |
| Vet | **Issuer** | attest-first | identify animal → record encounter → issue events |
| Organization | **Issuer + operator** | role-first | land in *my* job → act → (management is a fallback view) |
| Govt / Admin | **Consumer** | projection-first | read the ledger as population dashboards |

Nothing below asks you to delete a feature. It asks you to **re-rank** features so each actor sees one clear job first and the rest recedes into context. For a thesis/demo, that re-ranking *is* the story: "keep your pet in order, report what you witness, and it all becomes public-health data."

---

## 1. How to read this against the code reality

Three constraints shape *how* the redesign must be implemented. They are load-bearing — ignore them and you fight CI on every file.

**1.1 · Redesign by moving tokens, not by touching components.** The UI is 100% token-driven and the ratchet is closed: `lint:tokens` (`check-design-tokens.ts`) blocks raw Tailwind palette (`bg-red-700`), arbitrary hex/px (`bg-[#eef6f0]`, `text-[14px]`, `p-[12px]`, `rounded-[…]`, `shadow-[…]`), and `dark:` (dark mode disabled at `@variant`). The baseline is ~0, so any new raw value **fails the build**. The lever: change the *values* of the semantic tokens in `app/globals.css` (`--color-ln-*`, `--text-*`, `--space-*`, `--radius-*`, `--shadow-*`) plus the shared primitives — that propagates automatically and keeps the gate green. A re-rank of IA is mostly re-composition of existing primitives, which is cheap; net-new visual values are expensive. Design to the first, avoid the second.

**1.2 · Two shells, two visual languages — never mixed.** Citizen skin (`ln-*`, `Ln*` kit — owner + public, MiMAR) and operator skin (`ln-op-*`, `Op*` kit — admin + gob). `AppShell` selects chrome by route. Owner and Vet live in the citizen skin; Org and Govt/Admin live in the operator skin. The operator skin scrolls its *inner* `div.overflow-auto` container, not the window. Respect the boundary in every recommendation below.

**1.3 · The guards encode real obligations.** `lint:ui` (`check-ui-invariants.ts`) enforces touch targets ≥44px (flags `h-9`/`w-9` = 36px), no `SCREAMING_CASE` in visible JSX (localize enums), mandatory es-AR accents, and no visible English (denylist). Note that two of these are not just house style: ≥44px targets and the a11y ruleset are how the product satisfies **Ley Nacional 26.653** (web accessibility → WCAG 2.1 AA via Disp. ONTI 6/2019). Treat them as compliance, not polish.

**1.4 · Budget the breakage.** ~9 Playwright e2e specs assert UI structure (owner-shell, admin-topbar, a11y-operator-auth, smokes) and will need updating; run `pnpm verify` (typecheck + 8 lints + build) frequently, not at the end. And coordinate with the pending **Wave 3** design-system work (off-token consolidation + 138-button migration): a strong IA re-rank may moot parts of it — do not run both blind in parallel.

**Reuse-first inventory.** Extend, don't reinvent: `components/ui/` (`Button`, `Card`, `Field`, `Sheet`, `Shell`, `Hero`, `EmptyState`, `Badge`, `Chip`) and `components/ui/dashboard/` (`Op*`: `OpCard`, `OpKpi`, `OpPill`, `OpCodeBadge`, `OpStateBadge`, `OpBreach`, `OpRailNav`). The `EventCatcher` (home capture) and `CasesWidget` are already the right shape for the owner re-rank.

---

## 2. Owner — the *subject* (comply-first)

**Current state.** Top nav is seven peers — `Inicio · Mis Mascotas · Turnos · Notificaciones · Adopciones · Denuncias · Tu cuenta` (`OWNER_NAV`) — with no hierarchy: a scheduling marketplace, a civic register, and a notification feed share one shelf. The pet detail is a deep tree (~40 sub-routes under `/mis-mascotas/[publicToken]`). The home already leans the right way ("Asentar un hecho" via `EventCatcher`), but that instinct dies at the nav.

**The lean lens.** A citizen with a DNI has exactly two civic postures — *keep your own record in order* and *report what you witness*. Everything else is optional. That collapses the owner surface to **two duties + identity + a bell**.

**Concrete changes.**

- **Top nav: 7 → 3 + bell.** `Cumplir` (my pets + capture), `Denunciar` (report), `Cuenta`. `Notificaciones` becomes a bell affordance, not a peer. `Turnos`, `Adoptar`, `Tránsito`, `Refugios`, `Perdidas` stop being top-level destinations and surface *in context* (Turnos inside a pet when a vaccine is due; Adoptar/Refugios behind a single "Explorar" entry, or only when the user has zero pets). Nothing deleted — everything re-ranked.
- **Pet detail leads with a compliance panel.** Above the fold, per pet: a small set of status badges — *Rabia (vence 12/03) · Esterilización (sí / exenta / pendiente) · Microchip (sí) · PPP (atestación requerida)* — each computed as a projection over the pet's events, styled green/amber/red via existing state tokens and `LnStatusFlag`/`LnBadge`. The full libreta sanitaria history lives *below*. Optional actions (buscar hogar, marcar perdida, transferir) drop to the end.
- **Home = compliance register, not dashboard.** Keep `EventCatcher` as the hero; make the pet registry rows carry the same compliance badge so the whole home answers "is each of my animals in order?" at a glance.

**Why this is the highest-leverage screen.** The compliance panel literally looks like a DNI for the animal, and because each badge *is* a projection, it makes the event→projection story self-evident to a thesis audience.

**Legal touchpoints (informative, in-context).** The obligations the panel reflects are real and worth a one-line, non-intrusive citation where the owner acts:
- Vaccination + identification duties: **Ord. CABA 41.831** (tenencia, vacunación, identificación de canes); tattoo = Art. 4°. The owner-facing framing is honest: per `docs/legal-framework-full.md`, *no norm requires the system to warn* — the duty to stay current rests on the owner (**Ley 22.953**, DL 8056). So the vaccine nudge is a helpful UX feature, not a compliance claim; word it that way.
- Dangerous-breed attestation (`dangerous_breed_attested`): gated by per-jurisdiction `govt_business_rules` (`ppp_breed_list`) — the panel should only demand it where the pet's locality has a rule.
- Data rights already live at `/cuenta/privacidad` under **Ley 25.326** (arts. 4°/14/16). Keep that link in `Cuenta`; don't scatter it.

---

## 3. Vet — the *issuer* (attest-first)

**Current state.** The standalone vet portal `/pro` was **deprecated** (archived 2026-05-27); the independent-vet journey was folded into the org portal via the `vet_individual` role — effectively "an org of one." Its original spec was a genuinely lean loop: *login → today's agenda → attend appointment → emit clinical events*. That loop is correct and is now buried under a 5-section operator portal.

**The lean lens.** The vet is the mirror image of the owner: not a subject who complies, but the **highest-trust issuer** of authoritative events on someone else's pet (vaccination, sterilization, clinical findings, microchip, death certification). The entire portal is one loop; anything else is setup. A vet giving a rabies shot must not walk past Intake / Foster / Adoption / Members to log it.

**Concrete changes.**

- **Revive the loop, not necessarily the route.** Whether it lives at `/pro` or as a role-scoped landing inside the org shell, the *default view for a `vet_individual`* should be **today's agenda**, and each appointment opens **one form that issues events** onto the pet's libreta. Reuse the existing writer at `/mis-mascotas/[publicToken]/eventos/nuevo/vet` (`VetVisitForm`); the vet's home just needs to route into it fast (scan QR / search token → straight to the encounter form).
- **Strip operator chrome for the solo vet.** The 5 org sections are meaningless to a one-person practice. Capability-scope already supports hiding them; the fix is to *default* the solo vet to the agenda-only view and let the full org nav be an opt-in for those who actually run an organization.
- **Setup is a wizard, not a portal.** The archived `VetSetupWizard` (matrícula, ubicación, servicios, agenda) is the right one-time onboarding; keep it out of the daily loop.

**Event-quality note (this is the vet's whole value).** The vet is where SENALES-grade data enters the ledger. The schema already carries SENASA-alignment columns on sanitary events (`tipo_evento_code`, `lote_biologico`, `laboratorio`, `vencimiento_biologico`, `vet_matricula`, `establecimiento_renspa`, `proxima_dosis_at`, `firma_hash`). The vet form is the natural place to capture them — designing the loop well directly improves projection quality downstream.

**Legal touchpoints (informative).**
- Professional identity: `vet_matricula` + jurisdiction tie to the veterinary colleges — **Ley 14.072** (CVPCABA), **Decreto-Ley 9.686/1981** (CVPBA). Surface the matrícula on the vet's public profile (trust signal), not as friction.
- Signed clinical acts: `firma_hash` is a **Ley 25.506** (firma digital) placeholder; if/when signing ships, the encounter form is where it belongs. Sanitary-record layout should follow **Res. SENASA 580/2014** field order when the form is rewritten.
- Bite → rabies observation: a vet with `bite.report` can register a bite on an owner-held pet, which atomically opens the 10-day observation (**Decreto PBA 4669/1973**, **Ord. CABA 41.831 art. 9**). This is a rare but legally time-bound action — give it a clear, unmistakable entry in the encounter form.

---

## 4. Organization — the *issuer + operator* (role-first)

**Current state.** `buildOrgNav` yields five sections — *Operación · Animales · Adopciones · Casos · Administración* — ~18 items, capability-filtered (empty sections drop). The landing already does real work: KPI row (ocupación, ingresos, disponibles, adopciones), a "Requieren acción" queue, capability action cards, and a first-run `OrgSetupChecklist`. So the org portal is *well-built* — the issue isn't quality, it's that everyone sees the union of all five sections regardless of who they are.

**The lean lens.** An org is not one persona; it's a **bundle of issuer personas plus a management layer**: intake worker (`intake.create`), foster coordinator (`foster.assign`/`foster.end`), adoption reviewer (`adoption.review`/`finalize`), clinical writer (`event.write`), transfer handler (`org.transfer.*`), scheduler (`appointment.manage`), and org admin (`capability.grant`, `member.invite`). The system already stores exactly which of these a member holds. Leanness here is not "cut sections" — it's **land each member in their job**, and make the org-wide five-section view the *admin's* fallback, not everyone's front door.

**Concrete changes.**

- **Role-first landing.** Derive a default landing from the member's granted capabilities: a foster coordinator opens on the foster/tránsito queue, a clinic vet on today's agenda, an adoption reviewer on the review queue, an admin on the ops overview that exists today. One primary job per member, chosen by data you already have (`getGrantedCapabilities`).
- **Sections become progressive, not flat.** Keep the five `NavSection`s for admins/coordinators, but for single-capability members render only their section by default with the rest one click away. `OpRailNav` already supports grouped sections — this is composition, not new UI.
- **Preserve the org type differences.** `clinic | shelter | rescue_network | sanitary_authority` are genuinely different operations; the role-first landing naturally expresses that (a clinic's default ≠ a shelter's default) without a separate portal per type.

**Legal touchpoints (informative).**
- Welfare / maltrato intake (`maltreatment_reported`, shelter side): **Ley Nacional 14.346** (malos tratos). The org's denuncia-adjacent surfaces should note that the official MPF/fiscalía channel integration is downstream (already flagged in `/denuncias/[id]`).
- Seizures / decomisos (`shelter_intake_recorded`, `intake_reason='seizure'`): the **Ley 14.346** enforcement chain (municipal welfare authority → refugio via `custody_transferred`). Where a sanitary-authority org acts, this is the legal basis for the temporary-custody step.
- Data-retention asymmetry: when an org finalizes an adoption or closes custody, remember erasure preserves sanitary events by mandatory conservation (**Ley 25.326 art. 16** carve-out + SENASA / **Ley 14.072**). Don't imply "deleted" where the ledger legally must retain.

---

## 5. Govt / Admin — the *consumer* (projection-first)

**Current state.** The largest surface (~25 admin sections, plus `/gob`), and the one the 2026-06-24 critique already dissected at the token/component level (F1–F4: duplicated state color across skins, conflicting badge grammar, missing `OpButton`, minor density). Those findings stand and are the right near-term work here.

**The lean lens.** This is the **output**, the payoff of everything the other three emit — not another app to slim. For the thesis, its job is to *demonstrate the projection*: "the owner's vaccine event and the vet's attestation become this coverage map." The design goal is legibility of the read, not reduction of the surface.

**Concrete changes.**

- **Don't re-rank for leanness; re-rank for narrative.** Lead the govt landing with the two or three projections that most obviously trace back to citizen/vet events — rabies coverage, sterilization/population control, mortality & disposition — so the ledger→dashboard link is visible.
- **Close the shared-semantic gap (F1).** The single most valuable cross-actor fix: a shared *semantic* state layer so "al día" is the same green for owner, vet, and operator. Today `ln-ok #2e7d4f` (citizen) and `ln-op-ok #1e7a3e` (operator) are two hand-maintained greens. Introduce semantic aliases (e.g. `--color-state-ok`) that both skins consume; this is a pure token move (§1.1) and it makes the "one ledger" story literally look unified. Also audit `ln-op-warn #9c6700` on `ln-op-warn-bg #fff4da` for contrast — it has no recorded audit, unlike the citizen `ln-warn` (darkened to `#96600e`, 5.28:1).
- **Keep k-anonymity visible.** The `suppressSmallCells` (k=5) boundary is both a privacy control and a credibility signal for the demo — surface *why* a cell is suppressed rather than hiding the suppression.

**Legal touchpoints (informative).** The dashboards are literally organized around statutes, so citation here is natural, not intrusive:
- Mortality & disposal (`/gob/mortalidad`): **Ley CABA 5470 (2015)** — `death_recorded.disposition_method` + `facility` traceability.
- Rabies-observation compliance breaches: **Ord. CABA 41.831 art. 9** (10-day period).
- Population/coverage targets: rabies coverage is a legal mandate (`RABIES_COVERAGE_PCT`), distinct from programmatic benchmarks — label them differently so authorities trust the numbers.
- Subject-rights tooling (`export_subject_data` / `erase_subject_data`): **Ley 25.326** arts. 14/16.

---

## 6. Cross-cutting: the one fix that serves all four

Under every actor sits the same latent asset — **the immutable event ledger and its projections.** The four redesigns are coherent because they share it. Three moves compound across all four:

1. **Semantic state tokens** (§5) — one green/amber/red meaning, consumed by both skins. Makes "one ledger, four postures" *visible*, and it's a cheap token-only change.
2. **Capability-/status-driven default views** — the owner's compliance panel, the vet's agenda, the org member's role landing, and the govt's lead projections are all "compute the primary view from data we already store." Same pattern, four applications.
3. **Capture and read are the only two verbs** — every screen is either an `EventCatcher`-shaped emit or a projection read. Holding to that keeps net-new components (and net-new raw token values) near zero, which keeps CI green.

---

## 7. Sequenced next steps

Ordered by leverage-per-effort, each scoped to survive `pnpm verify` and the token ratchet:

1. **Owner pet-detail compliance panel** (citizen skin; reuse `LnBadge`/`LnStatusFlag`; projection over existing events). Highest thesis payoff, no new tokens.
2. **Owner nav re-rank** 7 → 3 + bell (`OWNER_NAV` edit; expect owner-shell e2e updates).
3. **Vet agenda-first landing** for `vet_individual` (route into existing `VetVisitForm`; no new portal required).
4. **Org role-first default landing** (derive from `getGrantedCapabilities`; compose existing `OrgNavSection`/`OpRailNav`).
5. **Semantic state token layer** (`globals.css` only; unifies both skins; unblocks the F1 finding from the 2026-06-24 critique).
6. **Govt narrative re-order** of lead projections (operator skin; content, not chrome).

Coordinate step 5 with Wave 3 before starting it, and update the ~9 structural e2e specs as steps 2–4 land.

---

## 8. What this does *not* change (keep)

- Event-sourcing invariants (append-only, projections-first) — the whole thesis depends on them.
- The public credential path (`/p/[publicToken]`) — already the strongest screen; only add the compliance badge at the top so a scanner sees legal status first.
- The operator/citizen shell split and the closed token ratchet — these are the guardrails that make a lean redesign affordable, not obstacles to it.
