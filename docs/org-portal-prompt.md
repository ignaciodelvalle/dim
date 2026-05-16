# DIM — Org portal build package

You are building the organization-facing portal for DIM. This is a multi-PR effort, ~16 tasks, organized into four groups by dependency. **Read these three documents in order before writing any code:**

1. `AGENTS.md` — the source of truth for principles, data model, event catalog, privacy tiers, and locked design decisions. Especially the sections **Organizations**, **Ownership**, **PetEvents**, **Privacy tiers**, **Role vs. event authorship**.
2. `docs/org-portal-permissions.md` — the membership permissions matrix and the API shape for `lib/org-permissions.ts`. Authoritative for every "who can do what" question in this package.
3. `docs/org-portal-event-flows.md` — the atomic event sequences for every composite workflow (intake, transfers, foster, adoption). Authoritative when the spec is permissive and a choice has to be made.

Then skim `db/schema.ts`, `db/migrations/0000_orgs_foundation.sql`, `db/organizations_rls.sql`, and the existing server actions under `app/actions/` so you know the patterns already in use.

## What's already in place

- Tables: `organizations`, `organization_coverage`, `organization_memberships`, polymorphic `ownerships`, `pet_events.author_organization_id`. All from migration `0000_orgs_foundation.sql`.
- Enums extended: `ownership_role` has `shelter_custody` and `foster`; `author_role` has `shelter`.
- Read-side RLS for orgs (`organizations_rls.sql`).
- Nothing on the write side. No routes under `/refugio`, `/o/...`, `/adoptar`. No server actions for orgs.
- `EVENT_TYPES` in `db/schema.ts` does **not** yet include the 12 custody/adoption event types listed in `docs/org-portal-event-flows.md`. Add them as a one-line edit in Task 1.1 — no migration, the column is `text`.

## Working rules (from AGENTS.md, do not relitigate)

- **Events are append-only.** Never edit or delete a `pet_events` row. Corrections are new events. The `adoption_finalized` flow updates `ownerships` rows (projections) but never mutates events.
- **Spanish UI, English code.** All user-facing strings in es-AR; identifiers, comments, commits in English.
- **Non-technical owner.** When a command needs to be run, explain in one sentence what it does and what they should see if it worked.
- **Adding a new event type is a one-line edit to `EVENT_TYPES`.** Done. No migration for that.
- **No throwaway code.** One PR per task below, in order within each group. Tasks within the same group can run in parallel if your branches don't collide.
- **The architecture is event-sourcing.** Every composite workflow has its atomic sequence pinned in `docs/org-portal-event-flows.md`. Implement it exactly as specified; if the spec ever conflicts with that doc, the doc wins for these flows and the spec wins for everything else — flag the conflict, don't silently choose.

## Locked architectural decisions (from product discussion)

- **Custody transfers between orgs use a two-event handshake**, not a `pending_transfers` table. `custody_transfer_proposed` then `custody_transferred`. State is derived from event history.
- **Shelter intake of a brand-new pet emits two events**: `pet_registered` then `shelter_intake_recorded`. Both in the same transaction.
- **Verification documents reuse the existing `attachments` table** with flags (a new column on attachments — see Task 1.4), not a new storage bucket. We don't know the real verification workflow yet; don't over-build.
- **Org `public_token` format is `ORG-XXXX-XXXX`**, same generator family as pets.
- **Tier-0 origin-org branding has dual opt-out**: org sets `tier_0_show_branding`, adopter sets per-pet `tier_0_show_origin_org`. Both must be true for the badge to render. The origin org id always lives in the immutable event log (`adoption_finalized.payload.previous_owner_organization_id`); the visual toggle does not erase lineage.
- **Vecino-as-tránsito is out of scope for this package.** It's the personal-owner side of shelter_custody and is handled in a separate work stream. Do not build any vecino-tránsito UI here; do build the schema-level support if it shows up incidentally.

## Group 0 — Foundations

These four tasks unblock everything else. They are parallelizable.

### Task 0.1 — Append new event types

**Goal.** `EVENT_TYPES` in `db/schema.ts` includes the 12 custody/adoption types listed in `docs/org-portal-event-flows.md` § "EVENT_TYPES additions".

**What to do.** Append them to the const, grouped by purpose with comments matching the existing style. Update `lib/events.ts` to add minimal `eventPayloadSummary` cases for each new type so they render in the timeline as "Custody transferida" / "Adopción finalizada" / etc. Detailed renderers can be improved later.

**Acceptance.** `pnpm lint`, `pnpm build`, and `pnpm test` pass. Inserting a row with one of the new types via Drizzle works (write a smoke test).

### Task 0.2 — `lib/org-permissions.ts`

**Goal.** The permissions matrix from `docs/org-portal-permissions.md` exists as TypeScript code with full test coverage.

**What to do.**
- Implement the `Capability` union, `OrgContext` and `PerPetContext` types, `can()` and `requireCapability()` exactly per the doc.
- `requireCapability` throws an `OrgPermissionError` with Spanish messages like `"No tenés permisos para esta acción en {orgName}."`.
- Tests under `__tests__/org-permissions.test.ts` covering every cell of the matrix. The test data table should literally mirror the markdown matrix; if they diverge, the test fails.
- Export a `resolveAuthorship(org, profile, orgVerifiedSnapshot)` helper from `lib/event-authorship.ts` (separate file) per the doc's API.

**Acceptance.** Test suite passes. `pnpm typecheck` shows no `any` in the public API of either file.

### Task 0.3 — `getCurrentOrgContext(request)` helper + cookie

**Goal.** The "acting as which org" decision is persisted across requests and available in every server action.

**What to do.**
- New helper `lib/current-org.ts`:
  - `getCurrentOrgContext()` (server-only): reads a cookie `dim_current_org`, validates the user has an active membership with that org id, returns `OrgContext | null`. Returns null when the cookie is missing or the membership has been revoked.
  - `setCurrentOrgContext(organizationId | null)`: server action that writes the cookie (or clears it). Validates membership before writing.
- The cookie is HTTP-only, secure in prod, scoped to the path `/`, with a 30-day max-age.
- New small client component `components/OrgContextSwitcher.tsx`: a dropdown showing "Modo personal" plus every active membership of the current user. Selecting one calls `setCurrentOrgContext` and refreshes the page. Display: avatar/initials + org display_name + role.
- Mount the switcher in `app/(app)/mis-mascotas/page.tsx` header (top-right next to the notification bell). It only renders when the user has at least one active membership; otherwise hidden.

**Acceptance.** A user with two memberships can switch between them; the cookie is set; on subsequent requests `getCurrentOrgContext()` returns the chosen org. Logging out clears the cookie.

### Task 0.4 — `attachments.purpose` column + ORG token generator

**Goal.** Two small infra additions used by later tasks.

**What to do.**
- Add a column `attachments.purpose text not null default 'pet_event'` via a Drizzle migration. Allowed values (validated in app code): `pet_event | org_verification | adoption_contract | other`. Document in the schema header. Existing rows default to `pet_event`.
- Add an `organization_id` nullable column to `attachments` (`references organizations(id) on delete cascade`) so org-scoped attachments (verification docs, adoption contracts) have a real owner. Index on it.
- Extend `lib/publicToken.ts`: existing function generates `DIM-XXXX-XXXX`. Add `generateOrgPublicToken()` returning `ORG-XXXX-XXXX`. Same character set, same collision-retry behaviour.

**Acceptance.** Migration is idempotent (`do $$ ... exception when ... end $$` guards). `generateOrgPublicToken()` produces values matching `/^ORG-[A-Z0-9]{4}-[A-Z0-9]{4}$/`. Unit test for the token format.

## Group 1 — Org administration (sequential, all depend on Group 0)

### Task 1.1 — Register and edit org

**Goal.** A user can register a new organization and edit its profile.

**What to do.**
- Route group `app/(refugio)/refugio/nueva/page.tsx` with the registration form. Fields: legal_name, display_name, org_type (dropdown over `organizations.org_type` enum), CUIT (optional, validated against AR CUIT checksum if present), personería jurídica number (required when org_type=shelter), email, phone, website, avatar upload. Plus `<LocationFields mode="jurisdiction" />` for the HQ.
- Route `app/(refugio)/refugio/[orgToken]/configuracion/page.tsx` to edit the same fields. Admin-only via `requireCapability("org.profile.update", ...)`. Coordinator gets a read-only view with a notice "Solo admins pueden editar".
- Server actions `createOrganizationAction` and `updateOrganizationAction` in `app/actions/organizations.ts`. Create action also inserts an `organization_memberships` row for the creating user with `role='admin'`, `can_write_pet_events=true`, and switches `current_org` cookie to the new org.
- Public token generated via `generateOrgPublicToken()` from Task 0.4.
- **In dev** (`process.env.NODE_ENV !== 'production'`): newly created orgs auto-set `verified=true` and `verified_at=now()`. In production: `verified=false`. Document this in the action with a comment pointing at the future "Task 4.5 — real verification flow".
- After create, redirect to the org's dashboard route (will be a stub for now: `app/(refugio)/refugio/[orgToken]/page.tsx` showing display_name + verification status + placeholders for the upcoming sections).

**Acceptance.** A logged-in user can register a refugio in dev with auto-verification on; their membership row is created; the cookie switches to the new org; the configuration page shows the saved fields and is editable.

### Task 1.2 — Members and invitations

**Goal.** Org admins manage members; invitations work end-to-end without an external email provider.

**What to do.**
- Route `app/(refugio)/refugio/[orgToken]/miembros/page.tsx`. Lists current memberships with role badge, `can_write_pet_events` toggle (admin/coordinator only per matrix), and "Terminar membresía" button. Plus a section for pending invitations.
- Route `app/(refugio)/refugio/[orgToken]/miembros/invitar/page.tsx`. Form: email, role (dropdown over the matrix; admin-only can grant `admin`), `can_write_pet_events` initial value, optional welcome message.
- A new table `organization_invitations`:
  ```
  id uuid pk
  organization_id uuid fk
  email text not null
  invited_role organization_membership_role not null
  can_write_pet_events boolean not null default false
  invited_by_user_id uuid fk
  invitation_token text not null unique  -- INV-XXXX-XXXX format
  expires_at timestamptz not null default now() + interval '14 days'
  accepted_at timestamptz
  accepted_by_user_id uuid fk
  created_at timestamptz
  ```
  Add to `db/schema.ts` + a migration `0003_org_invitations.sql` (idempotent).
- Server actions: `inviteMemberAction`, `revokeInvitationAction`, `acceptInvitationAction`, `endMembershipAction`, `updateMembershipRoleAction`, `updateCanWritePetEventsAction`. All gated through `requireCapability`.
- Public route `app/(refugio)/r/invite/[token]/page.tsx`. If user is logged out: shows "Te invitaron a unirte a {Org Name}" and a "Iniciar sesión o crear cuenta" button. If logged in and email matches: shows accept/decline buttons. Accept inserts the `organization_memberships` row and updates the invitation `accepted_at` / `accepted_by_user_id`.
- For the invitation email: in v1, the action returns the invite URL in the form's success state so the inviter can copy it and send it via WhatsApp/email manually. Leave a clear TODO comment in `app/actions/organizations.ts` pointing to "future: wire transactional email provider". Do not add an email dependency in this PR.

**Acceptance.** Admin invites someone by email; the URL is shown to copy; opening the URL in another browser session (different user, matching email) lets them accept; the new membership shows up in the members list.

### Task 1.3 — Coverage zones

**Goal.** An org admin declares which jurisdictions the org operates in.

**What to do.**
- Route `app/(refugio)/refugio/[orgToken]/cobertura/page.tsx`. Two sub-sections:
  - **CABA barrios** (when at least one coverage row has `province_code='AR-C'` or the org HQ is in CABA): a checklist of the 48 barrios from `ar_localities`. Each checkbox toggles a row in `organization_coverage`. One barrio per row.
  - **Other provinces**: a list of `<LocationFields mode="jurisdiction">` blocks for adding province-only or province+localidad coverage rows. "Primary" radio across all rows.
- Server actions: `addCoverageZoneAction`, `removeCoverageZoneAction`, `setPrimaryCoverageZoneAction`. Gated on `org.coverage.manage`.
- The primary zone surfaces on the public org page later; only one row can have `is_primary=true` per org (enforce in the action, not via constraint — keeping the constraint simple).

**Acceptance.** An admin can add, remove, and re-mark primary coverage zones. The list persists across reloads.

## Group 2 — Custody (depend on Group 1.1; 2.3 also depends on 1.2)

### Task 2.1 — Intake for a brand-new pet

**Goal.** A member with `custody.intake.new_pet` can register an animal that doesn't exist in DIM.

**What to do.**
- Route `app/(refugio)/refugio/[orgToken]/mascotas/nueva/page.tsx`. Reuses `<PetForm>` from the existing personal flow but with two changes: the "owner" framing is replaced by "intake" framing ("Estás registrando un animal que entró en custodia de {org.name}"), and there is an "Intake" section above with `intake_reason` (dropdown: `rescue | surrender | seizure | stray_found | other`), optional `intake_condition` free text, and a `<LocationFields mode="jurisdiction+point">` for the rescue location.
- Server action `createIntakePetAction` in `app/actions/intake.ts`. Follows Flow 1 from `docs/org-portal-event-flows.md` exactly — one transaction with `pets`, `ownerships(shelter_custody)`, `pet_registered`, `shelter_intake_recorded` (and `microchip_implanted` if chip provided). Authorship via `resolveAuthorship`.
- After create, redirect to the pet detail route in org context (Task 2.4 below).

**Acceptance.** After a successful intake, the DB has one new pet, one ownership row (`shelter_custody`, org-held), two events (`pet_registered` then `shelter_intake_recorded`) with matching `author_organization_id`, and the org admins receive a notification.

### Task 2.2 — Intake for an existing pet (transfer-in)

**Goal.** A member with `custody.intake.transfer_in` can take custody of an animal already in DIM.

**What to do.**
- Route `app/(refugio)/refugio/[orgToken]/mascotas/buscar/page.tsx`. Search by microchip number or `public_token` or owner email. Shows the matched pet with current ownership and a "Tomar custodia" CTA.
- Confirmation screen explains the consequences (current ownership ends, previous owner is notified) and requires entering `intake_reason` + optional `authority_reference` if `reason='seizure'`.
- Server action `transferInPetAction` in `app/actions/intake.ts`. Implements Flow 2a or 2b depending on whether the prior holder is an org or a person.
- The previous-owner notification (Flow 2b) is severity `warning` by default and `urgent` when reason is `seizure`.

**Acceptance.** Searching for an existing pet, confirming intake, ends prior ownership, creates new `shelter_custody` row owned by the org, and emits `custody_transferred` + `shelter_intake_recorded` events. Previous owner sees a notification.

### Task 2.3 — Foster assign and end (depends on Task 1.2)

**Goal.** Admin/coordinator assigns and ends foster periods on pets the org has in custody.

**What to do.**
- Route `app/(refugio)/refugio/[orgToken]/transitos/page.tsx`. Lists active foster rows for the org's pets. Each row shows pet, foster user, start date, expected weeks.
- From a pet detail page in org context (Task 2.4), a "Asignar tránsito" action opens a modal:
  - Dropdown of active members of this org (any role) who don't already foster this pet.
  - Inputs: `expected_weeks`, `notes`.
- Server action `assignFosterAction` implements Flow 4 from the event-flows doc. If the chosen user's current membership role is not `foster`, do not change it — the matrix allows any role to foster, the foster Ownership row is what matters.
- A "Cerrar tránsito" action on each active foster row opens a modal asking for `reason` (radio: `returned | escalated | other`; `adoption` is not selectable here because it only happens via Flow 7). Implements Flow 5.

**Acceptance.** After foster assign, two ownership rows are active for the pet (shelter_custody + foster). After foster end, only shelter_custody remains active. Both transitions emit their respective events.

### Task 2.4 — Pet detail in org context

**Goal.** Org members see a pet detail page tailored to their context, with the right actions available.

**What to do.**
- Route `app/(refugio)/refugio/[orgToken]/mascotas/[petToken]/page.tsx`. Reuses the existing pet detail components (event timeline, info panel) but adds:
  - Header indicates "En custodia de {org.name} desde {date}" (or "Bajo tránsito de {foster_name}" when a foster row is active).
  - Action buttons: "Asignar tránsito" (Task 2.3), "Proponer transfer a otro refugio" (Task 2.5 below — placeholder button for now if you implement out of order), "Publicar en adopción" (toggles a pet flag — covered in Task 3.1), "Marcar como perdida" (existing action), etc.
- The page must use `getCurrentOrgContext()` and verify the org holds an active `shelter_custody` row for this pet. If the user is not in org context or the org doesn't hold custody, 404.

**Acceptance.** A member of the right org viewing the pet sees the org-flavoured page; a member of a different org or no context gets 404.

### Task 2.5 — Org-to-org transfer handshake

**Goal.** Two-event proposal/accept dance per Flow 3.

**What to do.**
- From pet detail in org context, action "Proponer transfer" opens a modal:
  - Search input that queries `organizations where verified=true and org_type in ('shelter', 'rescue_network')`.
  - Inputs: optional `reason`, `expires_at` (default 7 days).
- Server action `proposeCustodyTransferAction` implements step P1 from Flow 3. Emits `custody_transfer_proposed` event + notifications to receiving org admins/coordinators.
- New route `app/(refugio)/refugio/[orgToken]/transfers/recibidos/page.tsx`. Lists pending proposals targeting this org. Each row has "Aceptar" and "Rechazar" actions implementing step A1 (`acceptCustodyTransferAction` and `rejectCustodyTransferAction`).
- The proposing org can cancel via a "Cancelar propuesta" action implementing step C1 (`cancelCustodyTransferAction`).
- A proposal is "pending" iff no follow-up event references it; compute this with a single query over `pet_events` filtered by `payload->>'proposal_event_id'`.

**Acceptance.** Org A proposes; Org B sees the proposal; accepting it ends Org A's shelter_custody and creates Org B's. The event log carries `custody_transfer_proposed` then `custody_transferred` with matching `proposal_event_id`.

## Group 3 — Adoption pipeline (depend on Group 1.1; 3.3 depends on 3.2 and 2.3)

### Task 3.1 — Public `/adoptar` listing

**Goal.** A public listing of all adoptable animals.

**What to do.**
- Add column `pets.publish_to_adopt boolean not null default false`. Migration `0004_publish_to_adopt.sql`. Toggled by org admins from the pet detail in org context.
- Route `app/adoptar/page.tsx` (public, no auth). Query: pets where current Ownership is `role='shelter_custody' AND owner_organization_id IS NOT NULL`, the holding org is `verified=true`, the pet has `status='active'` and `publish_to_adopt=true`. Join the org for display.
- Filters via search params: province, locality (cross-referencing `ar_localities` and `organization_coverage`), species, sex, approx age range.
- Card per pet: photo, name, species, breed, age, holding org name + logo, CTA "Más información".
- Route `app/adoptar/[petToken]/page.tsx`. Detail page: more photos, full description, intake context (rescue story summary from `shelter_intake_recorded` payload), CTA "Solicitar adopción" → requires login → redirects to Task 3.2 form.
- No PII anywhere on these pages — only org display info, never the foster or previous-owner names.

**Acceptance.** A pet with `publish_to_adopt=true` held by a verified shelter appears in the listing. Filtering by barrio shows only pets whose holding org covers that barrio.

### Task 3.2 — Adoption applications

**Goal.** A logged-in user can apply to adopt; the holding org sees the application in an inbox.

**What to do.**
- Route `app/(app)/adoptar/[petToken]/aplicar/page.tsx` (authenticated). Form: `housing_type` (dropdown), `other_pets` (text), `daily_routine` (textarea), `notes`. Submission emits the `adoption_application_submitted` event per Flow 6.
- Route `app/(app)/aplicaciones/page.tsx` — adopter's own applications list with status.
- Route `app/(refugio)/refugio/[orgToken]/aplicaciones/page.tsx` — org-side inbox. Filters by pet, status (derived from latest application event), date.
- Route `app/(refugio)/refugio/[orgToken]/aplicaciones/[applicationEventId]/page.tsx` — application detail. Actions: "Marcar como revisada" (`reviewApplicationAction`), "Aprobar" (`approveApplicationAction`), "Rechazar" (`rejectApplicationAction`). Each emits the corresponding event per Flow 6.
- Status of an application is computed from the latest event in `(submitted, reviewed, approved, rejected, finalized)` chain referencing the original `application_event_id`. Build a small helper `lib/adoption-applications.ts` for this.

**Acceptance.** A user can apply, the org sees the application, can review/approve/reject, the applicant is notified. A second approval for the same pet while the first isn't finalized is blocked with a clear error.

### Task 3.3 — Finalize adoption (the atomic composite)

**Goal.** Implement Flow 7 from the event-flows doc.

**What to do.**
- From the application detail (when status is `approved`), action "Finalizar adopción" opens a modal:
  - Confirmation of adopter + pet.
  - Upload contract attachment (uses `attachments` with `purpose='adoption_contract'`, `organization_id` set).
  - Input `post_adoption_followup_months` (default 6, min 0, max 24).
- Server action `finalizeAdoptionAction` in `app/actions/adoption.ts`. **Implements Flow 7 as a single `db.transaction`.** All six steps inside one tx. If any step throws, the whole transaction rolls back. Test exhaustively — this is the highest-stakes write in the system.
- Reminders are scheduled at months 1, 3, and `followup_months` (deduped if overlapping). Use `lib/reminder-schedule.ts` for the date math.
- Idempotency: if `adoption_finalized` already exists for the application_event_id, the action returns the existing finalized id with no writes.

**Acceptance.** After finalize, ownership transfers atomically; the adopter sees the pet in `/mis-mascotas`; the org no longer has the pet in custody; reminders are scheduled; the adopter receives a celebratory notification. Crash-injection test (throw inside step 4) leaves zero partial writes.

### Task 3.4 — Post-adoption check-ins and revocation

**Goal.** Adopter check-ins + the missed-checkin cron + admin-only revocation.

**What to do.**
- Surface on `/mis-mascotas/[petToken]` (adopter's view, when the pet was adopted from an org and is within the followup window): a "Hacer check-in" card with optional photos and notes. Submission emits `post_adoption_checkin` per Flow 8 and marks the corresponding `reminders` row complete.
- Cron route `app/api/cron/post-adoption-checkins/route.ts`. Runs daily; for each `reminders` row whose `due_at < now() - interval '7 days' AND completed_at IS NULL AND source_event_id references an adoption_finalized event`, insert a `notifications` row for both adopter and org admins/coordinators of type `adoption_post_checkin_missed`. Dedupe via existing notifications query (same pattern as the vaccine-due cron from the v1 closure work).
- From org-side pet detail post-finalize (admin-only), action "Revocar adopción" with required reason. Server action `revokeAdoptionAction` implements Flow 9 atomically.

**Acceptance.** Adopter check-in creates the event and clears the reminder. Missed check-in generates one notification per recipient on the next cron tick, no duplicates on subsequent ticks. Revocation transfers custody back to the org atomically.

## Group 4 — Surface, branding, integration

### Task 4.1 — Refactor event-writing forms to honor org context

**Goal.** When an org member is in org context and viewing a pet held by that org, the existing event forms (vaccination, vet visit, weight, etc.) write events with the correct authorship.

**What to do.**
- Audit every server action under `app/actions/events.ts`. Each must call `getCurrentOrgContext()` and `resolveAuthorship` instead of hardcoding `author_role='owner'`.
- For each action, add a "scope" pre-check: if the user is in org context, they need either the org capability for that event family **and** an active `shelter_custody` row owned by their org for this pet (or an active `foster` row for the user with `foster.write_events_on_assigned_pet`). If the user is not in org context, the existing personal-owner ownership check stands.
- Add tests covering: personal-owner write, org-member write (succeeds when in context + has capability), org-member write (denied when not in context), foster write (succeeds for assigned pet only).

**Acceptance.** No regression on personal-owner flows. Org-context writes produce events with `author_organization_id` set and `author_role` derived correctly.

### Task 4.2 — Public org page `/o/[orgToken]`

**Goal.** A public profile for verified orgs.

**What to do.**
- Route `app/o/[orgToken]/page.tsx`. Reads via the Supabase client (not service role) so RLS gates access (only `verified=true` orgs are publicly readable per the existing RLS).
- Display: logo, display_name, org_type label, contact (email, phone, website), primary coverage zone, coverage list, count of pets currently published to adoption, recent adoption finalizations as a stat ("47 mascotas adoptadas en el último año"), CTA "Ver mascotas en adopción" linking `/adoptar?org={orgToken}`.
- No member names, no PII of adopters, no draft listings. Only data that is already public from elsewhere.

**Acceptance.** Visiting an unverified org's public page returns 404. A verified org's page renders with the expected sections and no PII.

### Task 4.3 — Tier-0 origin-org branding

**Goal.** The "Bajo seguimiento de {Org}" badge appears on `/p/[publicToken]` for pets whose current ownership is org-held by a verified shelter/rescue OR whose `adoption_finalized` happened within the followup window, gated by both org and adopter opt-in.

**What to do.**
- Add column `pets.tier_0_show_origin_org boolean not null default true` via migration `0005_origin_org_branding.sql`. Adopter can toggle from the personal pet edit form: a clear control under a "Privacidad de la credencial pública" section.
- On `/p/[publicToken]`, compute the badge:
  - Read the pet's current Ownership and the most recent `adoption_finalized` event.
  - If current ownership is `shelter_custody` org-held: candidate org = that org. Badge only if `org.verified=true AND org.tier_0_show_branding=true`.
  - Else if a finalized adoption exists and `now() < finalized_at + post_adoption_followup_months months`: candidate org = `adoption_finalized.payload.previous_owner_organization_id`. Badge only if `org.verified=true AND org.tier_0_show_branding=true AND pets.tier_0_show_origin_org=true`.
  - Else no badge.
- When the badge renders, the Tier-0 "¿Encontraste a esta mascota?" form dual-routes to both legal owner and the originating org (a server action notifies both inboxes).

**Acceptance.** Toggling either flag off hides the badge; the dual-route stops once the badge is hidden. The origin id is still readable from the event log regardless of badge state (verify with a small query in the test).

### Task 4.4 — Lost-pet broadcast to org volunteers

**Goal.** When a pet's status flips to `lost`, the existing `setPetLostAction` additionally fan-outs notifications to volunteers of verified shelter/rescue orgs whose coverage matches.

**What to do.**
- Extend `setPetLostAction` (or split into a dedicated `broadcastLostPetAction` it calls):
  - Resolve the pet's location: `event.location_lat/lng` if set on the new `status_changed` event, else `pet.jurisdiction_locality` (slug from `ar_localities`).
  - Query orgs: `verified=true AND org_type IN ('shelter', 'rescue_network')` whose `organization_coverage` includes that location (match on locality slug + province code).
  - For each matched org, query members: active memberships with `role IN ('volunteer', 'coordinator', 'admin')`.
  - Insert one `notifications` row per recipient, type `lost_pet_broadcast`, severity `urgent`, CTA to the public `/p/{token}` page. Dedupe per (user, pet) within a 24-hour window.
- Add an opt-out toggle on `organization_memberships`: a column `receives_broadcasts boolean not null default true`. Volunteers who opt out are excluded from the query.

**Acceptance.** Marking a pet as lost in a specific barrio notifies every volunteer of every verified shelter that covers that barrio, exactly once per 24h. Volunteers who toggled `receives_broadcasts=false` get no notification.

## After Group 4

- Update `AGENTS.md`:
  - Under "v1 screens" add the new org-portal screens.
  - Under "Open questions / future work" tick off `/refugio` portal, `/adoptar`, lost-pet broadcast, and add a new line for "Verification flow real + admin tooling — deferred to next stream".
- Open a tracking issue for the deferred items: bulk operations for high-capacity refugios, real email provider for invitations, full admin verification flow.

If anything in `AGENTS.md` conflicts with these instructions and you can't tell which wins: `docs/org-portal-event-flows.md` wins for the composite event sequences, `docs/org-portal-permissions.md` wins for the matrix, AGENTS.md wins for everything else. Flag the conflict in the PR description; do not silently choose.

## Build cadence

- One PR per task, against `develop`. Title format: `[org-portal G.N] short description` (e.g. `[org-portal 2.5] org-to-org transfer handshake`).
- Within a group, tasks can run in parallel if branches don't collide; across groups, strict order.
- After each PR is merged: `pnpm lint && pnpm build && pnpm test` must be green.
- After Group 4 is done, run a single end-to-end smoke: register org → invite member → intake new pet → assign foster → end foster (returned) → publish to adopt → applicant applies → approve → finalize → check-in. Capture screenshots into `docs/org-portal-walkthrough.md` for posterity.
