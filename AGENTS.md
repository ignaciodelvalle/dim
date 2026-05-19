# DIM — AGENTS.md

> Context for AI agents (and humans) working on this project.
> If you're a Claude session reading this for the first time, start here.

## What this is

**DIM — Documento de Identificación para Mascotas.** Argentina's digital pet credential system. A reborn 2021 university project (UTN), reimagined for 2026.

At its core: every pet has a verifiable digital identity — a credential that can be scanned via QR, displayed on a phone, printed on a tag. Owners use a PWA to maintain their pets' records (vaccinations, medications, vet visits, microchips, weight, status). The data model is designed from day one to support expansion to veterinary professionals and government health authorities, and ultimately **integration with Mi Argentina** — which is the core premise of the project, not a nice-to-have.

The user-facing brand is **MiMAR (Mi Mascota Argentina)**. The internal codename is **DIM** — it stays in code, schema, token formats, and audit logs. See the **Naming** section below for the full rationale.

The owner of the project is **Ignacio Del Valle** (ignaciodelvalle2014@gmail.com), part of the original 2021 team. Ignacio is **non-technical** — Claude writes the code, Ignacio drives product decisions and runs commands locally on Windows.

## North Star

The ultimate purpose of DIM is **animal health and welfare at population scale**: vaccinations reach pets who need them, treatments reach pets who need them, lost pets find their owners, and welfare problems become legible to authorities and NGOs who can act on them.

The pet owner PWA is the **data-collection layer** — it is and must be valuable on its own to drive adoption (no one will install a "feed the government data" app, but they will install a real digital libreta sanitaria). The architectural payoff sits at the population level: **high-level dashboards for sanitary authorities, public-health analysts, and animal-welfare officers**, derived from the same event log that powers individual pet records.

This North Star reframes some design choices and locks in others. Every event a pet owner records is potentially a public-health signal. Every screen — owner timeline, public credential, government dashboard, vet record — is a projection over the same source-of-truth event log.

The ultimate trajectory is **integration with Mi Argentina**. This is not a nice-to-have — it is the premise. A standalone pet-credential PWA has limited reach; a federated layer that Mi Argentina can issue and verify is what changes the system at population scale. Every architectural decision in this codebase is filtered through whether it preserves or harms that path. See **Naming** below for more on the brand rationale.

## Project context (why CABA, why now)

DIM is rooted in concrete data about the city it was designed for. Figures below come from the CABA *Encuesta Anual de Hogares 2018* (EAH) and the 2021 CONAIISI paper authored by the original team. They both ground the North Star and become the baseline DIM should eventually measure itself against.

**Population (CABA, EAH 2018):** ~475,000 dogs and ~295,000 cats in households — roughly 16 dogs and 10 cats per 100 people. **Adoption / rescue is the growing acquisition modality**; intentional purchase is shrinking. Implication: `pet_registered` payloads will eventually want an `acquisition_method` field for adoption-trend tracking.

**Vaccination gaps:** ~15% of dogs received no vaccine in the prior 12 months. ~6% of cats lacked the antirábica, ~15% lacked the triple felina. Cat vaccination *deteriorated* between surveys — 36.6% of cats unvaccinated in 2018. Implication: campaign targeting needs species-level segmentation, not just regional.

**Veterinary access by zone — validates the jurisdiction columns on `pets`:** dogs un-attended in the prior year: 22.7% in Zona Sur, 15.5% Centro, 9.7% Norte. That 13-point gap is exactly the inequity the sanitary-authority dashboard exists to surface.

**Civic awareness:** 89% of households do not help street animals. The dominant channel for government pet-health information is social media (38% in 2018, up from 17% in 2014). Implication: notifications and shareability are first-order, not optional polish.

**Mascotas CABA** — the GCBA program offering free veterinary attention — operates today but is **not digitalized**. There's no central record of who was attended, with what, where, or when. DIM is the missing data layer this program needs more than it is a competitor to it; integration is a long-term ambition, not a confrontation.

## Core principles (locked, do not relitigate)

1. **The pet is the credential.** Not "data in an app" — an identity document for an animal with a globally-unique public token that resolves to a QR-verifiable public page.
2. **Events are the spine.** Every fact about a pet's life is an immutable, append-only event. Corrections are new events that reference earlier ones. No event is ever edited or deleted.
3. **Designed for expansion.** The data model includes columns and roles for veterinary and government actors from day one. Pet owner UI ships first; other actors are activated later with no schema rewrite.
4. **Start tight, loosen later.** The public credential page exposes the minimum necessary by default; richer reveals are gated by status (lost), explicit owner action (shared link), or verified identity (future).
5. **Build it properly, bit by bit.** No throwaway prototypes. Every milestone is usable. Foundation pays off.
6. **Open source from day one.** Public GitHub repo, MIT license. The credibility this buys with future government partners is massive.
7. **Projections are first-class.** Every view — owner timeline, public credential, vet record, government dashboard — is a *projection* over the event log: `(events, filters) → view`. No view is the source of truth. New dashboards = new queries, not new schemas.
8. **Designed for the population, not just the pet.** Every event a pet owner records is potentially a public-health signal. Aggregation is a first-class architectural concern, with privacy preserved by k-anonymity and opt-in for granular contribution.

## Stack

| Layer            | Choice                              |
| ---------------- | ----------------------------------- |
| Frontend         | Next.js 15 (App Router) + React 19  |
| Language         | TypeScript                          |
| Styling          | Tailwind CSS + shadcn/ui            |
| Auth             | Supabase Auth                       |
| Database         | Postgres (via Supabase) + RLS       |
| ORM              | Drizzle                             |
| File storage     | Supabase Storage                    |
| Maps             | MapLibre + OpenStreetMap            |
| Tests            | Vitest (Playwright later)           |
| Lint/format      | Biome                               |
| Package manager  | pnpm                                |
| Local dev        | Supabase CLI (Docker)               |
| Deploy           | Vercel + Supabase Cloud (when ready)|
| Repo             | GitHub, public, MIT                 |
| Locale           | Spanish (es-AR)                     |

## Form factor

- **v1**: Progressive Web App (installs to home screen on iOS/Android)
- **Audience**: Pet owners only. Vet and government interfaces deferred.
- **Auth**: email/password. "Connect with Mi Argentina" placeholder button shown but non-functional.

## User roles & account types

DIM has **two account types** — `personal` and `institutional` — stored as `profiles.account_type`. Each account type allows a specific set of `profiles.role` (enum `user_role`) values. One user = one account type and one role.

| Account type      | Roles allowed     | Mi Argentina / DNI | Matrícula        | Pets                | Created via                              |
| ----------------- | ----------------- | ------------------ | ---------------- | ------------------- | ---------------------------------------- |
| `personal`        | `owner`, `vet`    | Yes                | Yes (vet only)   | Yes (any count)     | Self-serve signup                        |
| `institutional`   | `govt`, `admin`   | No (NULL)          | No (NULL)        | **No (DB-enforced)**| Direct admin action only — no self-serve |

**Why two account types.** Personal and institutional accounts serve fundamentally different purposes. A *personal* account is a human with pets and (eventually) Mi Argentina identity — owns animals, gets a libreta sanitaria, may upgrade to vet to write authoritative health events. An *institutional* account is a service-account for governance work: approving requests, verifying organizations, managing scope assignments. No mascotas, no DNI, no matrícula — none of those concepts apply to an authority entity. Modeling them as one type-of-user (e.g., promoting an owner to admin) would force every `Ownership` query, every signup screen, every Mi Argentina integration to special-case institutional users. Separating them keeps each path narrow and the constraints honest. Operationally: institutional accounts are managed from a desktop browser at `/admin`; the mobile PWA workflows are for personal users only.

### The four roles

| Role    | Account type    | Who                                                                                                                              | Primary portal           | Notes                                                                                                                                |
| ------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `owner` | personal        | Pet owner. Default for any self-serve signup.                                                                                    | `/mis-mascotas`          | Can have unlimited pets. May apply to upgrade to `vet`.                                                                              |
| `vet`   | personal        | Veterinarian or animal-health professional. Has personal matrícula.                                                              | `/pro` (when approved as service provider) **OR** via `/org/[orgToken]` membership | May still own pets like any owner. Upgrade via `/cuenta/upgrade`, approved by the `govt` of the declared locality (fallback: admin). New: independent vets get `/pro` after admin/govt approval of `professional.provider` capability; clinic-affiliated vets work via the clinic's `/org/[orgToken]`. |
| `govt`  | institutional   | Government / public-health / animal-welfare authority. Approves orgs, vet upgrades, and scheduling within **assigned localities**. | `/gob`              | Multi-locality via `govt_assignments`. Created by an existing admin. Service-account model — see "Single operator" below.            |
| `admin` | institutional   | Technical-administrative user. Universal scope. Creates other institutional accounts. Approves anything outside any govt's scope. | `/admin`                 | Bootstrap admin seeded manually once via Studio; subsequent admins created by an existing admin. Cannot be self-deactivated.         |

### Lifecycle and downgrade paths

**Personal accounts** are created via self-serve signup as `role='owner'`. Vet upgrades go through the admin-page approval flow:

- *owner → vet*: applicant submits matrícula + evidence via `/cuenta/upgrade`. Creates `approval_request` of `type='role_upgrade_vet'`. Approved by the `govt` of the declared locality (fallback: admin if no govt covers that locality). On approval: `role='vet'`, `matriculaVerified=true`. **Prerequisite**: `profiles.dni_verified=true` — see [`docs/patterns/petition-prerequisites.md`](docs/patterns/petition-prerequisites.md).
- *vet → owner via self-resignation*: vet uses `/cuenta/renunciar`, confirms consequences. `role='owner'`, `matriculaVerified=false`. The `matriculaNumber` itself stays as historical data. Logged in `audit_log`.
- *vet → owner via revocation*: the govt of the relevant locality, or admin, executes the revocation flow with mandatory reason + evidence. Same end state. Logged.
- *delete account*: standard account deletion path (no admin-specific flow).

**Institutional accounts** are created exclusively by an existing admin via the admin page. The admin provides email + display name + role (govt or admin) + (for govt) the initial set of localities. System provisions an `auth.users` entry with a temporary credential (magic link or temp password). No `approval_request` involved — direct admin action, logged. **There is no path from `personal` to `institutional`.** If a person needs both an owner identity (for their pets) and an admin or govt identity (for their work), they hold two separate accounts with two separate emails.

- *govt locality adjustment*: admin assigns or revokes localities directly via the admin page. Each change is one direct action.
- *govt deactivation*: the operator may self-deactivate the account, but ONLY if every locality assigned to this govt is also covered by at least one other active govt. If any locality would be left uncovered, the action is blocked with a clear error naming the uncovered localities. On successful deactivation, pending `approval_requests` for those localities automatically fall to the admin queue (the scope-matching `NOT EXISTS` clause handles this — no manual migration). An admin can also deactivate a govt directly via the revocation flow.
- *admin deactivation*: the operator may **NEVER** self-deactivate. An admin is deactivated only by ANOTHER admin, with mandatory reason + evidence, AND never when only one active admin remains. The system always retains at least one active admin.
- *operator handoff*: when the human behind an institutional account changes (one employee leaves, another takes over), an admin resets the credentials. The account itself, its localities, its audit history persist. The operator rotates; the institutional identity does not.

### Portal access: capability-driven

A user's access to a portal is determined by whether they have at least one capability that's exercised in that portal:

- **`/mis-mascotas`** — every authenticated personal account (owner or vet). No additional capability needed; the portal lists the user's own pets.
- **`/pro`** — vets with the `professional.provider` capability (granted by admin or govt approval of a `role_upgrade_vet_provider` request). A vet without this capability can still be a vet (their matrícula is verified, they can author events) but cannot offer services in DIM until approved as a service provider.
- **`/org/[orgToken]`** — users with an active `organization_memberships` row for that specific org and at least one org-level capability (e.g., `intake.create`, `appointment.manage`, `service_offering.create`).
- **`/gob`** — `role='govt'` users with at least one active `govt_assignments` row.
- **`/admin`** — `role='admin'` users with `account_type='institutional'` and `deactivated_at IS NULL`.

Capabilities are layered: org-level (per-membership), professional-level (per-vet, e.g., `professional.provider`), and role-level (per-role, e.g., govt's `approve.org_verification`, admin's `account.create_institutional`). The portal layout asserts the right layer for entry; specific actions inside the portal assert finer-grained capabilities.

### Functional difference between `/pro` and `/org/[orgToken]`

Both surfaces support **service offerings + scheduling**: define services, set recurring availability, accept bookings, mark attendance, emit pet_events.

`/pro` provides **only that**. The independent vet operates as a service provider; no intake of strays, no foster pipeline, no adoption workflow, no member management, no coverage zones, no cross-org transfers. Authorship attribution: `pet_events` emitted from `/pro` set `recorded_by_user_id=vet`, `author_role='vet'`, `author_organization_id=null`.

`/org/[orgToken]` provides scheduling **plus** the full org capabilities matching the `org_type`: shelter/rescue_network gets intake + foster + adoption pipelines; clinic gets primarily scheduling; sanitary_authority gets official campaigns + jurisdictional dashboards. Authorship attribution: `author_organization_id` is set to the org.

A vet with **both** an independent practice AND a clinic affiliation has both portals available and chooses contextually which identity to act under. The data model captures this naturally — the offering, the appointment, and the emitted event all carry the right `author_*` fields per case.

### Business rules ownership (future)

When the system grows to support configurable business rules (minimum age to register a pet, mandatory vaccinations by jurisdiction, eligibility criteria for service offerings, etc.), the configuration follows a layered ownership:

- **Govt** configures rules within their assigned jurisdictions. A govt of CABA can set rules that apply in CABA. A govt of Mendoza Capital can set rules for Mendoza Capital.
- **Admin** configures rules universally (Argentina-wide defaults) or in any specific jurisdiction (override). Admin acts as both the universal-scope setter and the escalation path for jurisdictional rules when no govt is in scope.

When multiple rules conflict, **more specific wins**: locality > province > country > hardcoded default. A Belgrano rule overrides a CABA rule overrides an Argentina rule overrides the code default.

Schema for `business_rules` is deferred until the feature lands. The concept is locked here so future designs respect the hierarchy.

### Hard constraints (enforced at the database)

These are the invariants the schema and triggers enforce. The application layer assumes them and will not double-check:

1. **Account type ↔ role match.** `profiles.account_type='personal'` ⟹ `role ∈ {owner, vet}`. `profiles.account_type='institutional'` ⟹ `role ∈ {govt, admin}`. CHECK constraint on `profiles`.
2. **Institutional accounts have no personal-identity fields.** When `account_type='institutional'`, `dni_number IS NULL`, `dni_verified=false`, `matricula_number IS NULL`, `matricula_jurisdiccion IS NULL`, `matricula_verified=false`. CHECK constraint.
3. **Institutional accounts cannot own pets.** A trigger on `ownerships` rejects any INSERT or UPDATE that would tie an institutional account to a pet via `owner_user_id`. The trigger uses `errcode='restrict_violation'` and a clear Spanish message.
4. **Last admin cannot be deactivated.** Server-action precondition counts `account_type='institutional' AND role='admin' AND deactivated_at IS NULL` and refuses if the deactivation would leave fewer than one.
5. **Govt cannot self-deactivate if any locality is uncovered.** Server-action precondition checks coverage for every `govt_assignment` of the deactivating user.

### Single-operator model (v1)

Each institutional account has one set of credentials — one human operator at a time. The audit log shows the institutional account as the `actor_user_id`, not the person behind it. A future extension may add membership-style multi-operator access (mapping personal users to institutional account memberships, similar to `organization_memberships`), at which point audit entries will capture both the institutional account and the personal user. Until then: one operator, one credential, the institutional account is the accountable identity. Operator handoffs go through admin-issued credential resets.

### Role vs. event authorship

The `profiles.role` answers *"who is this user globally?"* The `pet_events.author_role` answers *"in what capacity did this user act when writing this specific event?"* They usually align (vet logs a vaccination → both `vet`) but not always (vet logs their own dog's weight while acting as owner → `profiles.role='vet'` but the event's `author_role='owner'`). Keeping these separate is what lets audit trails be honest.

Institutional accounts do not author `pet_events` in normal operation — they manage system state, not pet history. The `author_role='govt'` value is reserved for future workflows where a sanitary authority records an event during an inspection or campaign (likely via a personal vet acting under govt auspices, recorded with the institutional `author_organization_id`).

### Bootstrap

The first `admin` account is seeded once per environment via Supabase Studio:

```sql
-- 1. Create the auth user via Studio → Authentication → Add user (email + temporary password).
-- 2. Insert the profile row:
insert into public.profiles (id, account_type, role, display_name)
values ('<seeded_auth_user_id>', 'institutional', 'admin', 'DIM Admin');
-- 3. Log the seed:
insert into public.audit_log (actor_user_id, action, target_user_id, payload)
values ('<seeded_auth_user_id>', 'admin_seeded', '<seeded_auth_user_id>', '{"source":"studio"}');
```

From there, every institutional account is created via the admin page. Every personal account is created via self-serve signup. Both flows go through `auth.users` like any other Supabase auth path.

### Implementation reference

See [`docs/superpowers/specs/2026-05-17-admin-page-design.md`](docs/superpowers/specs/2026-05-17-admin-page-design.md) for the full spec — schema migrations, server actions, RLS policies, UI surfaces, capability matrix, and the approval / revocation / self-resignation flows in detail. The phased implementation plan lives there too.

**Organizations are not roles on `profiles`.** Clinics, refugios, rescue networks, and (eventually) sanitary authorities live in a separate `organizations` table peer to `users`. People connect to organizations through `organization_memberships`. This resolves the historical vet-vs-clinic ambiguity in one move (the individual vet keeps `profiles.role='vet'`; the clinic is an `organizations` row of type `clinic`; a membership row links them), and is the same mechanism that makes refugios and Mascotas CABA first-class without growing the `profiles.role` enum. See the **Organizations** section below for the full design.

## Organizations

Organizations (clinics, refugios, rescue networks, sanitary authorities) are first-class actors in DIM, modeled as a peer table to `users`. People and organizations both own pets, author events, and run campaigns. The connecting layer is `organization_memberships`.

| Concept | Lives on |
|---|---|
| Who a user is *globally* | `profiles.role` (owner / vet / govt) |
| Which orgs a user *belongs to* | `organization_memberships` rows |
| What kind of org something is | `organizations.org_type` (clinic / shelter / rescue_network / sanitary_authority / other) |
| Capacity in a specific event | `pet_events.author_role` and `pet_events.author_organization_id` |
| Custody of a specific pet | `Ownership` row, polymorphic between user and org |

**Why peer to users, not a subclass.** Both users and organizations own pets, author events, and run campaigns. Peer modeling lets `Ownership` and `PetEvent` carry both `*_user_id` and `*_organization_id` columns with a CHECK constraint, and dashboards filter by `org_type` cleanly. Subclassing forced fake "is_organization" flags through every read.

**Why this also resolves the vet vs. clinic question.** Individual veterinarians hold `profiles.role='vet'` (matrícula attaches to the person). The clinic is an `organizations` row of type `clinic`. A `vet_individual` membership row links them. The same vet can move between clinics without losing identity; the clinic survives staff turnover; campaigns belong to the clinic, not the vet.

**Verification — same trust ladder as user roles.** Anyone can register an organization. Status is `verified=false` until an admin reviews documents (personería jurídica for refugios, matrícula for clinics, CUIT cross-check). Unverified orgs can use the system but their events write with `author_verified=false`, their branding does not appear on public credentials, and they are excluded from broadcast-target queries.

**Shelter custody is temporary by definition.** Refugios do not become "owners" in the legal sense — they hold custody pending adoption. `Ownership.role='shelter_custody'` is the role for this, and it applies equally to:

- a refugio that rescued an animal (`owner_organization_id` set)
- a pet owner who picked up a stray on their street and is housing it while searching for the owner or a refugio (`owner_user_id` set, no org link)

The vecino-helps-stray case is explicit and intentional. An existing DIM owner can register a found animal and have it appear in their pet list with a "tránsito" badge, with no requirement to be a member of any organization. The same `shelter_custody` row transfers cleanly to a refugio or to a permanent adopter when the time comes.

**Foster is distinct from shelter_custody.** `Ownership.role='foster'` means a person physically houses an animal under an organization's institutional umbrella — the org's `shelter_custody` row stays active alongside the foster's row. A foster requires an active `organization_membership` linking them to the umbrella org. A vecino without org backing uses `shelter_custody` directly.

**Custody transfers always emit an event.** Refugio-to-refugio handoffs, citizen-to-refugio handoffs, decomiso intakes, adoption finalizations — every atomic transaction that ends prior `Ownership` rows and starts new ones emits a `custody_transferred` or `adoption_finalized` event. The event is source of truth; the `Ownership` table is the projection. The vecino who hands a stray to El Campito does not lose the record — it lives as a `custody_transferred` event with their `user_id` in the `from_user_id` field.

**Coverage zones drive the lost-pet broadcast.** Each organization declares its coverage zones in `organization_coverage` rows (often barrio-level). When a pet's status changes to `lost`, the broadcast query targets verified refugios and rescue networks whose coverage includes the lost-pet location, and through their `organization_memberships`, reaches voluntario networks who actually walk the streets. This is the Argentine-shaped version of the PawBoost broadcast model — a contextual rescue network, not random subscribers.

**Post-adoption follow-up is enforced through notifications, not credential shaming.** Missed check-ins generate notifications to both adopter and refugio. The public credential does not degrade visually. The refugio retains read access during the followup window declared on the `adoption_finalized` event.

**No bulk operations in v1.** Refugios with 200+ animals do exist in CABA (El Campito, Patitas Vagabundas, Proyecto 4 Patas). Bulk intake, bulk vaccination logging, and table-shaped UIs are deferred. The schema supports them without change; the UX work is the missing piece.

## Legal framework

DIM must be designed around — not against — the Argentine legal landscape for animal health and welfare. Four laws bear directly on what the app supports:

| Law                              | Scope                                                                                  | What it implies for DIM                                                                                                              |
| -------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Ley CABA 4078 (2012)**         | Registro de perros potencialmente peligrosos (dangerous-breed registry, CABA owners). | A `potentially_dangerous_breed` flag on `pets` plus an attestation event for owner registration.                                     |
| **Ley Provincial 14.107 (2010)** | Provincial dangerous-breed registry; **obligatory microchip identification**.          | Microchip data is a real legal artifact, not just a feature. Province-level aggregation matters; our `jurisdiction_province` covers this. |
| **Ley CABA 5470 (2015)**         | Cremation process for canines and felines in CABA.                                     | `death_recorded` event payload should carry a `disposition_method` field (`cremation` / `burial` / `other`) for traceability.        |
| **Ley Nacional 14.346 (1954)**   | Malos tratos / actos de crueldad contra animales.                                      | `maltreatment_reported` events need to eventually feed real complaint pipelines (denuncia integration is downstream of UI).          |

None of these are blockers for v1. Every one is a hook the data model should accept without rework, and the table above is the checklist for when we wire up the owner-facing forms behind each.

## Data model

### `User`
- `id` (uuid, pk), `email` (unique), `display_name`, `phone?`, `avatar_url?`
- `dni_number?`, `dni_verified` (bool, default false) — Mi Argentina-ready
- `created_at`, `updated_at`

### `Organization` — peer to user; clinic / shelter / rescue network / sanitary authority
- `id` (uuid, pk)
- `public_token` (unique) — short URL-safe code (e.g. `ORG-XK3P-9D2L`), used in public-profile QR
- `legal_name` — full legal/registered name
- `display_name` — short name shown in UI
- `org_type` (enum: `clinic | shelter | rescue_network | sanitary_authority | other`) — kept open like `event_type`; new types are one-line edits
- `cuit?` (unique when present) — Argentine tax ID, credibility booster
- `personeria_juridica_number?` — required for refugio verification; optional for clinics
- `email`, `phone?`, `website?`, `avatar_url?` (logo)
- `verified` (bool, default false) — admin-stamped after document review (same trust ladder as user role verification)
- `verified_at?`, `verified_by_user_id?`
- `tier_0_show_branding` (bool, default false) — opt-in to appear on public credentials of pets in this org's custody / recent followup window
- `jurisdiction_country` (default `'AR'`), `jurisdiction_province?`, `jurisdiction_locality?` — HQ location
- `status` (enum: `active | suspended | dissolved`)
- `created_at`, `updated_at`, `created_by_user_id`

### `OrganizationCoverage` — where the org operates
- `id`, `organization_id`
- `jurisdiction_country` (default `'AR'`), `jurisdiction_province?`, `jurisdiction_locality?` — can be barrio-level for refugios
- `is_primary` (bool) — flags the org's main zone
- `created_at`
- Multiple rows per org allowed. Used to target lost-pet broadcasts to refugios with relevant coverage and to filter adoption listings by region.

### `OrganizationMembership` — people ↔ orgs
- `id`, `organization_id`, `user_id`
- `role` (enum: `admin | coordinator | member | volunteer | foster | vet_individual`)
- `title?` — free text (e.g. `"Coordinadora de tránsito"`, `"Veterinaria de cabecera"`)
- `can_write_pet_events` (bool, default false) — gates author privileges; transportistas false, coordinators / vets true
- `joined_at`, `left_at?` (null = current), `invited_by_user_id?`
- One user can hold memberships across many orgs simultaneously.

### `Pet` — the credential itself
- `id` (uuid, pk) — internal key
- `public_token` (unique) — short URL-safe code, used in QR (e.g. `DIM-3K4F-9P2X`)
- `species`, `breed?`, `name`, `sex` (male|female|unknown)
- `date_of_birth?`, `birth_date_is_estimated` (bool) — DOB is computed from the years+months input on signup; flagged as estimated by default
- `color?`, `distinguishing_features?`
- **Microchip block** (all populated together when chip is provided):
  - `microchip_id?` (unique when present) — 15-digit ISO 11784/11785 number
  - `microchip_country_code?` (default `'858'` for Argentina)
  - `microchip_implanted_at?` (date)
  - `microchip_implanted_by?` (text — vet name / clinic)
  - `microchip_location?` (e.g. `interscapular_left`)
- `primary_photo_id?` (fk → Attachment)
- `status` (active|lost|deceased), `deceased_at?`
- **Health & lifestyle (owner self-reported):**
  - `estimated_weight_kg?` — denormalized cache of latest reported weight; events are source of truth
  - `favourite_foods?` (text[]) — predefined options + free "otros"
  - `known_allergies?` (text[]) — same pattern; distinct from the `allergy_detected` event which records discovery
  - `training_level?` (none|basic|intermediate|advanced|professional)
- **Legal & insurance:**
  - `potentially_dangerous_breed` (bool, default false) — auto-set at registration via `lib/breeds.ts` from breed + species; drives the `dangerous_breed_attested` flow (Ley CABA 4078, Ley Prov 14.107)
  - `insurance_company?`, `insurance_policy_number?`
- **Jurisdiction (coarse aggregation tag, never coordinates):**
  - `jurisdiction_country` (default `'AR'`)
  - `jurisdiction_province?`, `jurisdiction_locality?`
- `created_at`, `updated_at`
- **No precise home coordinates stored on pet.** Location precision lives on events when relevant, not on the pet's home.

### `Ownership` — history of who holds custody of each pet
- `id`, `pet_id`
- `owner_user_id?` (fk → users) — set when a person holds the row
- `owner_organization_id?` (fk → organizations) — set when an org holds the row
- `role` (enum: `owner | co_owner | shelter_custody | foster | caretaker`)
- `started_at`, `ended_at?` (null = current)
- `transferred_from_id?` — chains custody history across users and orgs
- `created_at`
- **Polymorphic holder.** Exactly one of (`owner_user_id`, `owner_organization_id`) is set per row, enforced via CHECK constraint. `Ownership` is the projection; the source of truth for transfers is always a `custody_transferred` or `adoption_finalized` event.
- **Active-owner constraint.** At most one active row per pet where `role='owner'`. Multiple `shelter_custody`, `foster`, `caretaker`, or `co_owner` rows can coexist with an active `owner`, or with each other when there is no permanent owner yet.
- **Role semantics:**
  - `owner` — permanent legal owner. The single accountable party. Person *or* organization.
  - `shelter_custody` — temporary custody pending permanent placement. Used by refugios *and* by individual citizens who pick up strays. Person *or* organization. Refugios are never `owner` in DIM — they hold `shelter_custody` until adoption finalizes. The vecino-helps-stray case uses the same role with `owner_user_id` set and no org link.
  - `foster` — temporary physical caregiver under an organization's umbrella. Requires `owner_user_id` plus an active `organization_membership` linking the foster to the org that holds the parallel `shelter_custody` row for the same pet.
  - `co_owner` — shared permanent ownership. Schema-ready; UI deferred.
  - `caretaker` — lower-stakes helper (petsitter, daycare). Schema-ready; UI deferred.

### `PetEvent` — append-only timeline (the spine)
- `id`, `pet_id`, `event_type`
- `occurred_at` (real-world time), `recorded_at` (system time)
- `recorded_by_user_id?` (nullable for anonymous scans and system events)
- `author_role` (enum: `owner | scanner | vet | shelter | govt | system`)
- `author_organization_id?` (fk → organizations) — set when the author acted on behalf of an organization (a clinic vet, a refugio coordinator, a sanitary-authority employee). Lets the audit trail attribute the institutional actor distinct from the individual person.
- `author_verified` (bool, default false) — true only when both: the relevant org is `verified=true` AND the author has `can_write_pet_events=true` in their membership
- `payload` (jsonb), `notes?`, `created_at`
- **Location (interim, v1):** `location_lat?`, `location_lng?` — numeric(10,7) lat/lng pair for events that carry precise location (vet visit, scan GPS, found-pet). Migrating to PostGIS `geography(Point, 4326)` as `location_point?` is deferred until we need radius search or polygon-based projections; Drizzle `customType` makes the lift-and-shift straightforward.
- **Append-only. Never edit, never delete. Correct by adding a new event.**

### `Reminder`
- `id`, `pet_id`, `user_id`, `reminder_type` (vaccine|medication|appointment|custom)
- `due_at`, `title`, `description?`
- `source_event_id?` (auto-generated reminders point back)
- `completed_at?`, `created_at`

### `Attachment`
- `id`, `pet_id?`, `event_id?`, `uploaded_by_user_id`
- `storage_path`, `mime_type`, `file_size`, `caption?`
- `created_at`

### `Notification` — per-user message history with read/archived state
Distinct from `PetEvent`:
- `PetEvent` = **immutable fact** about the world (the pet's life). Append-only.
- `Notification` = **message to a user** with **mutable state** (unread → read → archived).

Notifications often *project from* events (a `pet_registered` event with `potentially_dangerous_breed=true` produces a `ppp_registration_reminder` notification for the owner). Some are pure system messages (welcome, app updates) with no source event.

Fields:
- `id`, `user_id`
- `notification_type` (text — kept free-text not enum so adding new types doesn't need a migration; current values: `welcome`, `ppp_registration_reminder`, planned: `vaccine_due`, `scan_alert`, `system_update`)
- `title`, `body` (markdown allowed)
- `severity` (enum: `info` / `success` / `warning` / `urgent`) — drives badge color in UI
- `cta_label?`, `cta_url?` — optional call-to-action button
- `related_pet_id?`, `related_event_id?` — backlinks to source domain entities
- `read_at?` — null = unread
- `archived_at?` — null = visible
- `expires_at?` — optional auto-hide
- `created_at`

Indexes: partial index on `(user_id) where read_at IS NULL AND archived_at IS NULL` for unread-count queries; `(user_id, created_at)` for the inbox list.

**How notifications get created.** Three sources:
1. **Database triggers** — `welcome` on signup (handle_new_user trigger inserts both the profile row and the welcome notification atomically).
2. **Server actions** — `createPetAction` and `updatePetAction` insert a `ppp_registration_reminder` when a pet's breed is in the dangerous list.
3. **Future: scheduled jobs** — `vaccine_due` reminders fire from upcoming `Reminder` rows, generating notifications a few days before the due date.

UI for browsing notifications is deferred to a future round; for now the rows materialize correctly in the database and can be inspected in Studio.

## Libreta sanitaria

The **Libreta sanitaria** is the digital embodiment of the canonical Argentine pet booklet — the yellow paper book every vet stamps and every dueño carries. In DIM it is a **projection over `pet_events`** filtered to the medical subset: vaccinations, dewormings, sterilization, vet visits, weight, medications, microchip, clinical work (labs, imaging, surgeries), allergies, symptoms, incidents, death.

It is not a new table, not a separate write path, not a parallel data store. Every fact that lands in the Libreta is already in the event log; the Libreta is what you get when you filter that log to medical events and present them grouped by clinical purpose.

**Why this naming matters.** DIM's North Star is real public-health data at population scale, but data only flows in if the dueño understands what they're using. *"Libreta sanitaria"* is the term every Argentine pet owner already knows — collapsing the explanatory distance to zero. *"Eventos"* is a developer concept; *"libreta"* is a household concept.

### Conceptual hierarchy

DIM has three user-facing concepts, each backed by the same underlying data:

| Concept | What it is | Backing |
|---|---|---|
| **Credencial MiMAR** | The pet's digital identity — name, photo, public token, QR. The animal's *documento* | `pets` row + Tier-0 public page at `/p/{publicToken}` |
| **Libreta sanitaria** | The pet's medical history — vacunas, vet visits, peso, medicación. What the vet writes | Projection over `pet_events` filtered to `LIBRETA_SANITARIA_EVENT_TYPES` |
| **Eventos** | The append-only event log itself, including non-medical entries (registrations, scans, custody transfers, welfare reports). Internal/admin concept | `pet_events` table |

The Credencial is **identity**. The Libreta is **history**. The Eventos are the **immutable substrate**. Same data, different framings depending on who's looking.

### Event types in the Libreta

A canonical, code-locked list of `event_type`s belongs to the Libreta. Lives in `lib/libreta-sanitaria.ts`:

```ts
export const LIBRETA_SANITARIA_EVENT_TYPES = [
  "vaccination_administered",
  "deworming_administered",
  "sterilization_performed",
  "medication_started",
  "medication_stopped",
  "medication_dose_taken",
  "vet_visit_logged",
  "weight_recorded",
  "clinical_info_logged",
  "lab_work_performed",
  "imaging_performed",
  "surgery_performed",
  "allergy_detected",
  "microchip_implanted",
  "incident_reported",
  "symptom_observed",
  "death_recorded",
] as const satisfies readonly EventType[];
```

Explicitly **outside the Libreta** (identity, custody, welfare, or system signals — not medical records):

- `pet_registered`, `pet_profile_updated` — identity / admin
- `status_changed` — lost/found is identity-adjacent and welfare-adjacent, not strictly medical
- `credential_scanned` — system telemetry
- `dangerous_breed_attested` — legal attestation, not a clinical event
- `custody_transferred`, `foster_assigned`, `foster_ended`, `adoption_*` — ownership, not health
- `abandonment_reported`, `maltreatment_reported` — welfare denuncia, not health
- `note_added` — owner annotations live in a separate "Notas del dueño" view, not in the Libreta proper

**Rule for new event types.** Every addition to `EVENT_TYPES` declares explicitly whether it belongs to the Libreta. The decision is made at the moment of registration (one-line edit to `lib/libreta-sanitaria.ts`, OR an inline comment confirming it deliberately does not belong). The PR that adds an event type must close the question, not defer it.

### UI surfaces

Three surfaces over the same projection:

1. **Section on the pet profile** at `/mis-mascotas/{publicToken}`. The card formerly titled *"Eventos"* renders as **"Libreta sanitaria"** and shows the latest N medical events with a *"Ver libreta completa →"* link.
2. **Dedicated owner route** at `/mis-mascotas/{publicToken}/libreta`. The full Libreta for the authenticated owner, grouped by clinical purpose (Vacunas, Antiparasitarios, Esterilización, Visitas, Medicación, Cirugías, Estudios, Peso, Alergias y condiciones) with an optional chronological toggle. Print-friendly stylesheet. Header carries pet identity (name, photo, species, sex, microchip if any, dueño first name) **as context** — identity is not part of the Libreta as a concept, but the rendered surface needs the same cover-page context the paper libreta has, otherwise the medical entries float without anchor.
3. **Public shareable Tier-2 route** at `/libreta/compartir/{shareToken}`. The owner-issued share link of the Privacy-tiers table, materialized. Same Libreta, accessible via a **share token distinct from `pets.publicToken`**, expiring (default 30 days, configurable per share), revocable by the owner at any moment. Footers with `Generada por MiMAR · {timestamp} · vence {expiry}` for vet-presentability. This is the surface a dueño hands to a vet who doesn't know MiMAR yet.

### Tokens

Tier-2 share tokens are intentionally separate from `pets.publicToken`:

- `pets.publicToken` — stable, lifetime, public Tier-0 surface
- `libreta_share_token` (new table, name TBD when implemented) — short-lived bearer credential, owner-revocable, per-share

The two never conflate. A leaked `publicToken` exposes Tier-0 (minimal). A leaked share token exposes Tier-2 but is revocable in one click and expires on its own.

### Code conventions

- `lib/libreta-sanitaria.ts` owns `LIBRETA_SANITARIA_EVENT_TYPES`, `isLibretaSanitariaEvent(eventType)`, and a Drizzle clause helper for filtering queries.
- The component formerly used as `<EventTimeline>` remains the rendering primitive but the canonical mount on the pet profile is `<LibretaSanitaria>` — a thin wrapper applying the filter and Libreta-specific empty-state copy.
- User-facing strings consistently use *"libreta sanitaria"*, *"tu libreta"*, *"registrar en la libreta"*, *"quedó en la libreta de Negrita"* — never *"evento"* outside admin/debug surfaces.
- Code-level identifiers (table names, function names, internal types) stay English (`pet_events`, `EventTimeline`, etc.). Spanish UI, English code — the existing rule applies.

### Why this is locked

The naming is not cosmetic. It is the conceptual surface that makes DIM legible to non-technical dueños, which is precisely what the North Star ("the data-collection layer must be valuable on its own to drive adoption") requires. Renaming this later would mean retraining users we already onboarded. Lock it now, before scale.

## Event catalog — 39 types

`UI` column: `v1` = recordable by owner in the v1 PWA · `system` = system-emitted · `later` = schema-ready, UI deferred (either non-owner reporter flow needed, or the owner-facing form just hasn't been built yet).

Grouped by purpose for navigation. Adding a new event type is a one-line edit to the `EVENT_TYPES` const in `db/schema.ts` — no database migration. The Zod schema lands in `lib/event-schemas.ts` in the same PR (a CI test in `__tests__/event-schemas.test.ts` enforces coverage minus a small explicit `UNIMPLEMENTED` allowlist).

**Lifecycle**

| Type                  | UI    | Payload                                                                                              |
| --------------------- | ----- | ---------------------------------------------------------------------------------------------------- |
| `pet_registered`      | v1    | initial profile snapshot                                                                             |
| `pet_profile_updated` | v1    | `{ changes: [{field, old, new}], photo_replaced }`                                                   |
| `status_changed`      | v1    | `{ from_status, to_status: active\|lost, location_description?, reason?, disclosure_prefs_snapshot?, lost_description? }` — death uses `death_recorded`, not this |
| `death_recorded`      | v1    | `{ cause, cause_detail?, confirmed_by_vet?, vet_name?, disposition_method?, facility?, death_at_clinic?, vet_contacted_owner?, vet_decided_alone?, owner_to_private_crematorium?, disease_code?, confirmed_by_lab?, is_reportable }` |

**Preventive medicine**

| Type                       | UI | Payload                                                                                |
| -------------------------- | -- | -------------------------------------------------------------------------------------- |
| `vaccination_administered` | v1 | `{ vaccine_name, brand?, batch?, administered_by?, next_due_at? }`                     |
| `deworming_administered`   | v1 | `{ product, type: internal\|external\|both, next_due_at? }`                            |
| `sterilization_performed`  | v1 | `{ procedure: castration\|spay, performed_by?, clinic? }`                              |

**Medication**

| Type                    | UI | Payload                                                                                  |
| ----------------------- | -- | ---------------------------------------------------------------------------------------- |
| `medication_started`    | v1 | `{ drug_name, dose, frequency, prescribed_by?, drug_code?, first_dose_at, duration_days?, custom_hours?, schedule_count }` |
| `medication_stopped`    | v1 | `{ medication_started_event_id, reason? }`                                               |
| `medication_dose_taken` | v1 | `{ medication_started_event_id?, scheduled_for, reminder_id }` — dual-write with `reminder.completedAt` for the adherence cron |

**Clinical encounters and findings**

| Type                  | UI    | Payload                                                                                  |
| --------------------- | ----- | ---------------------------------------------------------------------------------------- |
| `vet_visit_logged`    | v1    | `{ reason, diagnosis?, vet_name?, clinic? }`                                             |
| `clinical_info_logged`| v1    | `{ sub_kind: lab_work\|imaging\|surgery\|allergy_detection\|other, title, details?, performed_by? }` — umbrella event with sub-kind discriminator (covers what lab/imaging/surgery/allergy used to model as dedicated event_types pre-2026-05-18) |

**Body metrics**

| Type              | UI | Payload    |
| ----------------- | -- | ---------- |
| `weight_recorded` | v1 | `{ kg }`   |

**Identification & legal**

| Type                       | UI    | Payload                                                                                              |
| -------------------------- | ----- | ---------------------------------------------------------------------------------------------------- |
| `microchip_implanted`      | v1    | `{ chip_number, country_code?, implanted_by?, location_on_body?, implant_date_known? }` — fired automatically at pet creation if a chip is provided |
| `microchip_replaced`       | later | `{ previous_chip_number, new_chip_number, reason: damaged\|unreadable\|duplicate_detected\|other, replaced_by?, replaced_at }` — chip swap (the old chip is no longer authoritative) |
| `microchip_revoked`        | later | `{ chip_number, reason: fraud_detected\|owner_request\|device_failure\|other, revoked_by_role: admin\|govt\|vet, revoked_by_user_id, notes? }` — chip retired without a replacement |
| `dangerous_breed_attested` | later | `{ registry: caba_4078\|prov_14107\|other, registry_id?, attested_at }` — owner registers their PPP in the official provincial registry |

**Free-form**

| Type         | UI | Payload                              |
| ------------ | -- | ------------------------------------ |
| `note_added` | v1 | `{ category?, text }` — catch-all   |

**System / observed**

| Type                 | UI     | Payload                                                                                                 |
| -------------------- | ------ | ------------------------------------------------------------------------------------------------------- |
| `credential_scanned` | system | `{ is_self_scan, viewer_authenticated }` — location goes in the event's `location_point` column        |
| `incident_reported`  | later  | `{ incident_type: bite_inflicted\|bite_suffered\|dog_attack\|fight\|traffic_accident\|fall\|poisoning\|escape\|other, severity?, injuries_summary?, vet_involved?, location_description?, victim_kind?, victim_contact_name?, victim_contact_phone?, victim_pet_id?, victim_age_estimate?, context?, rabies_vaccine_valid_at_incident?, reporter_role? }` — umbrella covers bite events (rabies observation flow filters by `payload->>'incident_type'='bite_inflicted'`). `dog_attack` is deprecated in favor of `bite_suffered`. Distinct from `maltreatment_reported` (incident is non-human-cruelty) |
| `outbreak_signal`    | system | `{ source_symptom_event_id, disease_code, disease_label, match_strength: {high_count, medium_count, low_count, matched_symptom_codes}, pet_jurisdiction_country, pet_jurisdiction_province?, pet_jurisdiction_locality?, pet_species }` — emitted when `symptom_observed` triggers a reportable-disease match. Owner does not see this in the libreta |

**Schema-ready, requires non-owner reporting flow**

| Type                    | UI    | Payload                                                                                          |
| ----------------------- | ----- | ------------------------------------------------------------------------------------------------ |
| `symptom_observed`      | v1    | `{ source: libreta\|welfare_report, welfare_report_id?, reporter_role: owner\|witness\|vet, free_text, matched_symptom_codes, alerted_disease_codes, severity_self_assessed?, onset_at? }` |
| `abandonment_reported`  | later | `{ welfare_report_id, reporter_role: owner\|witness, description }`                              |
| `maltreatment_reported` | later | `{ welfare_report_id, reporter_role, description, severity, kind }` — eventually integrates with Ley Nacional 14.346 denuncia pipelines |

**Custody & adoption**

| Type                              | UI    | Payload                                                                                          |
| --------------------------------- | ----- | ------------------------------------------------------------------------------------------------ |
| `shelter_intake_recorded`         | later | `{ intake_reason: rescue\|surrender\|seizure\|stray_found\|other, intake_condition?, rescue_jurisdiction? }` — fired when a shelter or citizen takes custody of an unowned animal |
| `foster_assigned`                 | later | `{ foster_user_id, expected_weeks?, notes? }` — refugio assigns a voluntario |
| `foster_ended`                    | later | `{ foster_user_id, foster_assigned_event_id?, ended_by: shelter\|foster_returned\|other, reason? }` |
| `adoption_application_submitted`  | later | `{ applicant_user_id, related_organization_id, housing_type?, other_pets?, daily_routine?, notes? }` |
| `adoption_application_approved`   | later | `{ application_event_id, reviewer_user_id, conditions? }`                                        |
| `adoption_application_rejected`   | later | `{ application_event_id, reviewer_user_id, reason? }`                                            |
| `adoption_withdrawn`              | later | `{ application_event_id, withdrawn_by_user_id, reason? }` — the applicant retires their application |
| `adoption_finalized`              | later | `{ previous_owner_organization_id, adopter_user_id, foster_user_id?, contract_attachment_id?, post_adoption_followup_months?, notes? }` — **composite event.** Atomically ends `shelter_custody` and `foster` rows and inserts a new `owner` row |
| `post_adoption_checkin`           | later | `{ related_organization_id, photo_attachment_ids, notes? }`                                      |
| `adoption_revoked`                | later | `{ reason, returned_to_organization_id }` — refugio reclaims animal per contract                |
| `custody_transferred`             | later | `{ from_user_id?, from_organization_id?, to_user_id?, to_organization_id?, from_role, to_role, reason?, matched_against_pet_id?, foster_ended_event_id?, notes? }` — handoffs that are not adoption |
| `custody_transfer_proposed`       | later | `{ from_user_id?, from_organization_id?, to_user_id?, to_organization_id?, reason, matched_against_pet_id?, proposed_at, notes? }` — Phase 1 of the return-to-owner / cross-org two-phase handshake |
| `custody_dispute_raised`          | later | `{ raised_by_role: admin\|govt, raised_by_user_id, external_proceeding_reference?, reason }` — admin or govt flags the pet as subject to external legal proceedings. Sets `pets.in_custody_dispute = true` |
| `custody_dispute_resolved`        | later | `{ raised_event_id, resolved_by_role: admin\|govt, resolved_by_user_id, outcome: ownership_confirmed\|ownership_transferred\|case_dismissed\|other, notes? }` — closes a prior `custody_dispute_raised`. Sets `pets.in_custody_dispute = false` |

**System telemetry**

| Type                     | UI     | Payload                                                                                       |
| ------------------------ | ------ | --------------------------------------------------------------------------------------------- |
| `libreta_shared_viewed`  | system | `{ share_token_id, viewer_ip_hash?, user_agent? }` — telemetry of Tier-2 share token use; NON-libreta classification |

### Deprecated event types

These event_types existed in earlier versions but are no longer written by any flow. Historical `pet_events` rows with these types remain in the database (events are immutable) and continue to render via `eventPayloadSummary`'s catch-all branch.

| Deprecated                       | Replacement                                                            | Deprecated since |
| -------------------------------- | ---------------------------------------------------------------------- | ---------------- |
| `lab_work_performed`             | `clinical_info_logged` with `sub_kind='lab_work'`                      | 2026-05-18       |
| `imaging_performed`              | `clinical_info_logged` with `sub_kind='imaging'`                       | 2026-05-18       |
| `surgery_performed`              | `clinical_info_logged` with `sub_kind='surgery'`                       | 2026-05-18       |
| `allergy_detected`               | `clinical_info_logged` with `sub_kind='allergy_detection'`             | 2026-05-18       |
| `adoption_application_reviewed`  | Application-table status field already captures the "in review" stage | 2026-05-18       |

The `incident_type='dog_attack'` value inside `incident_reported.payload` is also deprecated in favor of the unambiguous `incident_type='bite_suffered'`. Historical rows with `dog_attack` are preserved by keeping the value in the Zod enum.

Self-scans (owner viewing own pet's public page) are recorded with `is_self_scan: true` and hidden from default timeline UI.

Events with a real-world location should populate the `PetEvent.location_point` column (top-level), not duplicate it inside `payload`. The payload is for event-type-specific data; `location_point` is universal across event types and used by every geographic projection.

### Cross-cutting event design patterns

Four recurring patterns emerge from DIM's event catalog. New event design should recognize which pattern fits and use the established shape rather than inventing new structure.

**1. `*_started` / `*_ended` pairs with auto-close cron.**

Used for time-bounded processes — for example the planned `rabies_observation_started`/`_ended` (10-day legal period) and `foster_assigned`/`foster_ended`. Each pair has:
- An originating event that opens the period and writes a denormalized status column on the relevant row (`pets.rabies_observation_status='in_progress'`, `pets.in_custody_dispute=true`).
- A closing event that flips the status to a terminal state.
- A daily cron that auto-closes the happy path; manual closure for non-happy cases. Cron must be idempotent.

The pattern preserves the immutable event log while giving fast queries via the denormalized status column. When designing a new bounded-process event, follow this shape.

**2. `*_signal` system-emitted events for surveillance and audit.**

Used when the system itself produces a record not directly authored by a user. Examples: `outbreak_signal` (system detected a disease pattern from `symptom_observed`), `libreta_shared_viewed` (telemetry of share-token use), `credential_scanned` (QR scan log). Each has:
- `author_role = 'system'` (or the relevant party for authenticated scans); anonymous-scan rows have `recorded_by_user_id = null`.
- Severity tagged when actionable (`urgent | warning | info`).
- Classified as NON-libreta — these are system telemetry, not pet medical history.

When designing a new system-emitted event, ensure it's NON-libreta and the trigger that emits it is explicitly documented.

**3. `*_proposed` / `*_executed` two-phase with lazy auto-cancel.**

Used for high-trust transfers requiring acceptance: `custody_transfer_proposed` + `custody_transferred` (org-to-org and refugio-to-owner), the adoption pipeline (`adoption_application_submitted` → `_approved` / `_rejected` / `adoption_withdrawn` → `adoption_finalized`). Each pair has:
- Phase 1: proposing party emits the `*_proposed` event. State is "pending".
- Phase 2: receiving party accepts → emits the `*_executed` event in an atomic transaction; ends related ownership rows, starts new ones.
- Lazy auto-cancel: at Phase 2 accept time, the receiver's server action validates preconditions (proposer still has standing, target state still matches the proposal context). If any precondition fails, the proposal auto-cancels with a `note_added` event + notification to the original proposer. No sweep job needed.

When designing a new transfer or approval workflow, use this pattern. Avoid ad-hoc state machines; reuse the proposed/executed shape.

**4. `*_reported` umbrella with sub_kind discriminator.**

Used when several variants share a common event shape: `incident_reported` with `incident_type` (`bite_inflicted | bite_suffered | dog_attack | fight | traffic_accident | fall | poisoning | escape | other`), `clinical_info_logged` with `sub_kind` (`lab_work | imaging | surgery | allergy_detection | other`), `symptom_observed` with implicit sub_kind via `matched_symptom_codes`. Each has:
- A single event_type covering N variants.
- A discriminator field in payload (`incident_type`, `sub_kind`, …).
- Optional fields per variant that are only meaningful for some discriminator values (validated as `optional`/`nullable` at the schema level; the form layer enforces conditional requirements when needed).

When designing a new event with 3+ semantically-similar variants, prefer this umbrella over N separate event_types. Easier to extend (add a new discriminator value, optionally add new payload fields) than to add N event types each with their own schema.

**When NOT to use these patterns.**

- For purely additive write-once facts (`vaccination_administered`, `weight_recorded`, `death_recorded`), no pattern needed. Just an event_type with payload.
- For UI preferences (`emergencyInfoVisible`, `disclose_*_when_lost` on `pets`), these aren't events at all — they're mutable state on the entity row. Don't emit events for preference flips.

**Payload enrichments to add when their forms get built** (already justified by the legal framework above and the CABA acquisition-trend data):

- `pet_registered.payload.acquisition_method` — `adopted | rescued | purchased | bred | gift | unknown`. Adoption/rescue is the growing modality per EAH 2018; surfacing it lets us measure that trend over time.
- `pet_registered.payload.potentially_dangerous_breed` (boolean) — flips on the Ley CABA 4078 / Ley Prov 14.107 attestation requirement. Possibly a dedicated `dangerous_breed_attested` event for the legal record itself.
- `death_recorded.payload.disposition_method` — `cremation | burial | rendering | unknown`, plus optional `facility` (the cremation center / vet clinic that handled the disposition). Ley CABA 5470 traceability.

## Privacy tiers (the public surface)

| Tier | Audience                              | What's visible                                                                                                                       |
| ---- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 0    | Anyone scanning the QR                | photo, first name, species, breed, approx age (year), sex, "credential valid ✓", vaccination boolean (✓ / ⚠), microchip present (y/n), "Did you find this pet?" contact form |
| 0+   | Tier 0 + owner-toggled emergency flag | "This pet takes daily medication — contact owner immediately" without drug names or owner phone                                       |
| 1    | Pet status = `lost`                   | Tier 0 + owner first name + direct contact + last-known location if shared                                                            |
| 2    | Owner-issued share link               | The full **Libreta sanitaria** via a revocable, time-limited share token at `/libreta/compartir/{shareToken}`. Distinct from `pets.publicToken`. See §Libreta sanitaria for surfaces and token model.         |
| 3    | Owner, authenticated in app           | Everything, including scan history with locations. Editable.                                                                          |
| 4    | (future) Verified vet via portal      | Tier 2 by default + can write events                                                                                                  |

**Organization branding on public credentials.** When a pet's current `Ownership` row is held by a verified organization (or held one recently, within the post-adoption followup window declared on `adoption_finalized`), Tier 0 may display a "Bajo seguimiento de [Org Name] ✓" badge, gated by the org's `tier_0_show_branding` preference. The Tier-0 "Did you find this pet?" form can dual-route to both the legal owner and the originating refugio when the owner opts in — so an animal that escapes its adoptive home reaches the rescuing org alongside the owner. Unverified orgs do not appear on public credentials.

## Dashboards & projections (the consumers)

Build for **flexibility and big scope** — three audiences are intended consumers, each gets distinct views from the same underlying event log. The architectural rule: **any dashboard view must be expressible as a query/projection over the event log**, optionally with jurisdiction or time filters. If a useful view can't be expressed this way, the event catalog is incomplete and the answer is a new event type, not a new table.

### Sanitary authority (city / comuna, operational)
- Vaccination coverage by barrio — % of registered pets with up-to-date core vaccines, overdue counts and approximate density
- Active campaign performance — enrollments, completions, no-shows, geographic reach
- Mortality clusters — `death_recorded` events by cause and week, map overlay
- Antibiotic / antimicrobial use density (AMR surveillance)
- Sterilization rate trend by jurisdiction

### Public-health analyst (province / national, strategic)
- Vaccination coverage trends over time, sliceable by jurisdiction
- Zoonosis indicators — aggregated `symptom_observed` + `death_recorded` patterns flagged when anomalous
- Population dynamics — registrations vs deaths vs lost over time, by region
- Cross-region comparison and ranking
- AMR signal trends, multi-region

### Animal-welfare officer (case-driven)
- Maltreatment / abandonment report queue with map and assignment workflow
- Lost-pet hotspots (density maps from `status_changed → lost` events)
- Stray / found-pet sighting feed (anonymous `credential_scanned` events on unowned pets, when that flow exists)
- Owner-of-record gaps — unmicrochipped pets in welfare cases
- Case-management workflow: status, assignment, resolution, audit trail (itself an event stream)

### Cross-cutting projection examples
- "Pets in a given jurisdiction with overdue rabies" → contact pipeline for outreach campaigns
- "Vets with the highest sterilization throughput last quarter" → recognition / capacity allocation
- "Barrios with rising stray-scan density" → welfare resource pre-positioning

## Aggregation & privacy policy

- **Coarse public aggregates require no consent.** Counts of vaccinated pets per barrio per month, with no per-pet attribution, can power public dashboards without owner opt-in — there's no individual signal to expose.
- **Granular research/welfare contribution is opt-in.** Owners can opt their pet's events (with location, with timing) into datasets beyond coarse counts. Default off; clearly communicated; revocable.
- **PII never leaves the database in projections.** Owner names, phone numbers, exact addresses never appear in public or analyst views. `jurisdiction_locality` (barrio) is the smallest unit exposed publicly.
- **k-anonymity for small cells.** Any aggregate that would expose fewer than `k` pets in a region (default `k=5`) is suppressed or rolled up to the next coarser jurisdiction level. Prevents accidental re-identification in sparse data.
- **Authorized actors (vet portal, gov portal, when they exist) see PII within their legitimate scope only**, gated by Postgres Row Level Security. The data layer enforces tier visibility, not just the app code.
- **Owner-facing RLS lives in `db/rls.sql`.** It enables RLS on the seven core tables (`profiles`, `pets`, `ownerships`, `pet_events`, `reminders`, `attachments`, `notifications`) and locks every PostgREST read/write to the authenticated owner. `pet_events` has no UPDATE or DELETE policy — the append-only rule (`AGENTS.md → Core principles #2`) is enforced both by code discipline and by RLS. Apply via Supabase Studio (same pattern as `db/welfare_rls.sql` and `db/organizations_rls.sql`); do not use `pnpm db:push`, which would propose dropping unmodeled policies. Server-side reads via Drizzle bypass RLS by design — the public credential page at `/p/{public_token}` continues to work because its server component goes through Drizzle, not supabase-js. Verify the policies via `pnpm rls:smoke`, which runs two test accounts against PostgREST and asserts isolation end-to-end.

## Feature inventory

Lectura rápida de qué hace DIM hoy, qué está spec'd y pendiente de ejecución, y qué queda como pregunta abierta. Es la respuesta canónica a "¿existe X?" antes de asumir o construir desde cero. Cuando una feature lande o cambie de status, actualizar esta tabla en el mismo PR.

Leyenda: ✅ en producción · 🟢 spec + plan listos, pendiente de ejecutar · 🟡 spec only (falta plan) · ⚪ idea / open question.

### Owner-facing (PWA principal)

| Estado | Feature | Ruta / surface |
|---|---|---|
| ✅ | Signup con primera-mascota inline + Mi Argentina placeholder | `/signup` |
| ✅ | Login (email/password + Mi Argentina placeholder) | `/login` |
| ✅ | Lista de mascotas | `/mis-mascotas` |
| ✅ | Pet profile + event timeline | `/mis-mascotas/[publicToken]` |
| ✅ | Event detail con mapa de OSM cuando hay coords | `/mis-mascotas/[publicToken]/eventos/[eventId]` |
| ✅ | Libreta sanitaria (vista agrupada + cronológica + print) | `/mis-mascotas/[publicToken]/libreta` |
| ✅ | Tier-2 shareable libreta vía share token revocable | `/libreta/compartir/[shareToken]` |
| ✅ | Public credential Tier 0/0+/1 con disclosure prefs owner-controlled | `/p/[publicToken]` |
| ✅ | Marcar perdida + enriched description para pets sin chip | `/mis-mascotas/[publicToken]/perdida` |
| ✅ | Marcar encontrada / coordinar devolución refugio→owner | `/mis-mascotas/[publicToken]/devolucion` |
| ✅ | Vecino-en-tránsito (custody flow para vecino con stray) | `/mis-mascotas/nueva?custodyKind=transito` |
| ✅ | Reservar turnos en campaigns/clinics, ver agenda propia | `/turnos/buscar` + `/mis-mascotas/[publicToken]/turnos` |
| ✅ | Form de event-capture URL-prefill (compat con futuro agente conversacional) | `/mis-mascotas/[publicToken]/eventos/nuevo/[type]` |
| 🟢 | Adoption listing público con filtros + postulación | `/adoptar` (spec v1.2, plan pendiente) |
| 🟢 | Foster volunteers pool (pool global owner→refugio) | `/cuenta/ofrecerme-como-tránsito` + `/cuenta/transitos/*` (spec v1.4, plan listo) |

### Welfare denuncias (Ley 14.346)

| Estado | Feature | Ruta / surface |
|---|---|---|
| ✅ | Form público de denuncia (anonymous-capable, 5 attachments × 25MB, 9 kinds, 4 severidades) | `/denuncias/nueva` |
| ✅ | Tracking anónimo via reference code `DEN-XXXX-XXXX` | `/denuncias/codigo/[code]` |
| ✅ | Lista de mis denuncias (autenticado) | `/denuncias/mias` y `/denuncias/[id]` |
| ✅ | Bridge a pet_events (`maltreatment_reported`, `abandonment_reported`, `symptom_observed`) cuando subject es registered pet | server-side en `app/actions/welfare.ts` |
| 🟢 | Bug fix: location bridge a pet_event + mapa en detail page denuncia + rate-limit anon | plan `2026-05-18-welfare-reports-polish.md` |
| ⚪ | Welfare-officer queue para triagear casos | `/gob/maltrato` (no spec'd, gap operativo principal) |
| ⚪ | Moderation queue para denuncias anónimas auto-flagged | `/admin/maltrato/moderacion` |
| ⚪ | Export template a fiscalía MPF CABA (Ley 14.346 pipeline) | — |

### Organizations (refugios, clinics, rescue networks, sanitary authorities)

| Estado | Feature | Ruta / surface |
|---|---|---|
| ✅ | Org portal — intake, foster, custody, adoption, scheduling, member management | `/org/[orgToken]/*` |
| ✅ | Intake (new pet) + transfer-in con microchip cross-check | `/org/[orgToken]/intake` |
| ✅ | Foster assign / end (member-based) | dentro de `/org/[orgToken]/mascotas/[petToken]` |
| ✅ | Custody transfer org→org (two-phase: propose / accept / cancel) | `/org/[orgToken]/transferencias` |
| ✅ | Adoption pipeline completo (submitted/reviewed/approved/rejected/finalized/revoked) | `/org/[orgToken]/adopciones` |
| ✅ | Post-adoption check-ins | `/org/[orgToken]/checkins` |
| ✅ | Service offerings + scheduling con materialización vía cron | `/org/[orgToken]/servicios` |
| ✅ | Coverage zones para targeting de lost-pet broadcast | `/org/[orgToken]/cobertura` |
| ✅ | Members + capability grants | `/org/[orgToken]/miembros` |
| 🟢 | Surface unificado de mascotas en tránsito (member + voluntary pool + vecino) | `/org/[orgToken]/transitos` (parte del plan foster pool) |
| 🟢 | Listado de pets no aptas para adopción (con razón estructurada) | `/org/[orgToken]/pets/no-aptas` (parte del plan foster pool) |
| ⚪ | Bulk operations para refugios high-capacity (200+ animales) | — |

### Surveillance & health

| Estado | Feature | Surface / mecanismo |
|---|---|---|
| ✅ | Symptom-disease surveillance (matcher fuzzy → reportable diseases → outbreak signal silent a govt) | server-side, sin UI directa al owner |
| ✅ | Bite-rabies observation 10-day (Ley CABA + Decreto PBA) con auto-close + escalation hooks | `/admin/observaciones/[publicToken]` |
| ✅ | Cron de cierre automático de observaciones | `/api/cron/close-rabies-observations` |
| ⚪ | Vaccination-due warning al owner (UX feature, NO compliance requirement) | — |

### Professional & vet

| Estado | Feature | Ruta / surface |
|---|---|---|
| ✅ | Vet con membership en org puede emitir eventos clínicos | dentro de `/org/[orgToken]` |
| 🟡 | `/pro` portal para vet independiente (servicios + agenda) | spec implícita en health-campaigns; route pendiente |

### Admin & govt

| Estado | Feature | Ruta / surface |
|---|---|---|
| ✅ | Admin surface básico (orgs + vet upgrades review) | `/admin/*` parcial |
| 🟡 | Admin page completo (4 roles, account_type institutional, split `/gob` vs `/admin`) | spec v2.2 (`2026-05-17-admin-page-design.md`), plan parcial existe |
| ⚪ | `/gob` portal scope-bound por localidad | parte de admin page spec |
| ⚪ | Government dashboards (sanitary / analyst / welfare officer) | proyecciones sobre event log, no UI |

### Identity & legal

| Estado | Feature | Pendiente |
|---|---|---|
| ✅ | Microchip implant event + tracking (`microchip_implanted`) | — |
| 🟡 | Dangerous breed (PPP) registry support — Ley CABA 4078 / Prov 14.107 | flag + attestation event + export provincial |
| ⚪ | Disposition method en `death_recorded` — Ley CABA 5470 | payload field |
| ⚪ | Acquisition method en `pet_registered` — EAH 2018 trend tracking | payload field |
| ⚪ | DNI verification provider (RENAPER directo vs intermediary) | — |
| ⚪ | Mi Argentina integration — OAuth y/o emisión federada de credenciales | — |

### Infra & cross-cutting

| Estado | Feature | Ubicación |
|---|---|---|
| ✅ | Event sourcing hardening (Zod schemas estrictos + append-only triggers + validateEventPayload) | `lib/event-schemas.ts` + DB triggers |
| ✅ | Bidirectional geocoding (text ↔ map pin via Nominatim/OSM) | `components/LocationFields` |
| ✅ | Cron infra (CRON_SECRET + helper-lib + thin route) | `app/api/cron/*` |
| ✅ | RLS aplicada en 7 core tables + welfare + organizations | `db/rls.sql`, `db/welfare_rls.sql`, `db/organizations_rls.sql` |
| ✅ | RLS smoke test cross-account vía PostgREST | `pnpm rls:smoke` |
| 🟢 | Localities catalog INDEC (catalog reference) | spec + plan listos |
| ⚪ | Push notifications (iOS PWA limitations) | — |
| ⚪ | Native mobile via React Native sharing data layer | — |
| ⚪ | Conversational event-capture agent (audio/text → form prefilled) | forward-compat ya garantizada via URL-prefill |
| ⚪ | Materialized views para proyecciones caras | — |

## Naming

DIM has a dual identity by design.

**User-facing brand: MiMAR (Mi Mascota Argentina).** This is what appears in app metadata, signup/login copy, the public credential header, notification titles, future marketing, and the domain (when assigned). The "Mi-" prefix is a deliberate alignment with the Argentine government services pattern (Mi Argentina, Mi AFIP, Mi ANSES) — communicating "your personal portal." The Spanish word "mascota" is what every Argentine pet owner uses; "Mi Mascota Argentina" is warm, familiar, and emotionally legible.

**Code identifier: DIM.** The original backronym ("Documento de Identificación para Mascotas") remains in code, schema, server actions, audit logs, internal docs, and the `public_token` format (`DIM-XXXX-XXXX`). DIM is a stable identifier we never rename — every issued token, every audit entry, every database row references it. The institutional descriptor "Documento de Identificación para Mascotas" also appears in the footer of the public credential page when an animal-health professional or government clerk views the document — it reinforces legitimacy in those contexts without changing the user-facing brand for everyday owners.

**Why the duality.** "DIM" alone sounds institutional/legal — good for credibility with vets and govt, cold for an owner adding their dog's first photo. "MiMAR" alone loses the document-credential framing that makes the credencial pública meaningful as official identification. Both names serve different audiences and contexts; keeping both serves the product.

**Mi Argentina alignment is the core premise, not a nice-to-have.** This project's reason to exist is to be the missing data layer that government animal-health programs (Mascotas CABA, SENASA zoonosis surveillance, eventually Mi Argentina itself) lack today. The product makes no sense as a standalone PWA forever — its trajectory points at official adoption. Every design decision is filtered through this premise:
- The credential is real enough that Mi Argentina could eventually issue it
- The data model is privacy-preserving enough that govt actors can use it under existing legal frameworks
- The brand alignment signals the direction
- The architecture supports federation when the integration becomes feasible

If you find yourself making a decision that breaks Mi Argentina alignment for short-term convenience, reconsider.

## Open questions / future work

- Mi Argentina integration: third-party OAuth via Argentina.gob.ar SSO when available, vs. eventual official credential adoption (see `mimar-go-to-market.md` for the GTM analysis)
- DNI verification provider when we get there (RENAPER direct vs. intermediary like Didit / Truora)
- **`/pro` portal** — independent vet portal for service offerings + scheduling. Schema-ready (polymorphic `service_offerings`). Route implementation is the next step after code rename.
- **`/org/[orgToken]` portal** — currently lives at `app/refugio/`. Code rename plan: `docs/superpowers/plans/2026-05-17-code-rename-refugio-to-org.md`.
- **`/gob` portal** — govt scope-bound portal for locality approvals + regional dashboards. Designed in admin page spec v2.2; implementation follows admin page Fase 0.
- **`/admin` portal** — already partially implemented; needs refinement to split govt-shared surfaces into `/gob`.
- **Adoption-listing public surface (`/adoptar`)** — projection over (`pets` where current `Ownership` is org-held by `org_type` in (`shelter`, `rescue_network`), not death, not paused). Filters, region, species. UX and listing copy open.
- **Lost-pet broadcast distribution** — Argentine channel mix (WhatsApp share-intent + Instagram Story template + barrio Facebook groups + verified-refugio voluntario alerts via `organization_coverage`). Animales BA alignment is the diplomatic open question; we want to feed it, not compete with it.
- **Decomiso → temporary welfare-authority custody → refugio chain** — Ley Nacional 14.346 seizures should flow through `custody_transferred` events with a municipal welfare authority holding `shelter_custody` briefly before transferring to a refugio. Schema supports this; the authority-side portal and UX are open.
- **Bulk operations for high-capacity refugios** — El Campito-scale shelters (200+ animals) need table-shaped UIs for bulk intake, vaccination logging, listing edits. Deferred to a later iteration; schema does not change.
- **Cross-org transfer UX** — refugio-to-refugio handoffs need a sender-confirms / receiver-accepts flow. Event always emitted on completion (`custody_transferred`).
- Government dashboards: three audiences in scope (sanitary authority, analyst, welfare officer); build order TBD by where adoption lands first
- **Mascotas CABA program integration** — the GCBA's existing (non-digitalized) free-vet-attention program. DIM is the data layer it lacks; explore as a partnership path.
- **Dangerous breed registry support** — Ley CABA 4078 / Ley Prov 14.107. Pet flag + attestation event + (eventually) export to provincial registry.
- **Disposition method on death_recorded** — Ley CABA 5470 (cremation traceability). Payload field plus optional facility.
- **Acquisition method on pet_registered** — adoption-trend measurement (EAH 2018 shows adoption is the growing modality).
- **Non-owner reporting flow — base completa, queue triage pendiente.** `welfare_reports` table con `subjectKind` enum polimórfico (`registered_pet | unowned_animal | location | general`) cubre el caso del subject no registrado sin necesidad de ghost_subject pets. Form público + anonymous + 5 attachments + bridge a pet_events vivo en `app/actions/welfare.ts` + `app/denuncias/nueva/`. Polish del plan `2026-05-18-welfare-reports-polish.md` shipped: bridge copia `locationLat/locationLng` a los 3 pet_events emitidos, `LocationMap` montado en las 2 detail pages de denuncia (auth + anon), rate-limit persistente para anonymous (`rate_limit_buckets` + `enforceRateLimit`, 1/min + 3/hour por IP). **Pendientes:** (a) welfare-officer queue en `/gob/maltrato` para triagear casos (gap operativo principal — sin esto las denuncias se acumulan invisibles), (b) moderation queue para denuncias anónimas auto-flagged, (c) export template a fiscalía MPF CABA (Ley 14.346 pipeline). La spec `2026-05-18-maltreatment-reporting-design.md` quedó **superseded** — NO seguirla. Ver Feature inventory arriba.
- **Vaccination-due warning to owner** — when a vaccination approaches or passes its `next_due_at`. Confirmed via `docs/legal-framework-full.md` (2026-05-18 pass) that NO Argentine norm requires the system to warn — the obligation rests on the owner to keep vaccinations current (Ley 22.953, DL 8056, Ord. 41.831). A system-side warning is a UX feature, not a compliance requirement. Future spec if product decides to implement.
- Materialized views for expensive projections — keep event log as source of truth, cache when query latency justifies
- Campaign management UX (gov-side scheduling, slot allocation) — referenced by `campaign_id` in vaccination/sterilization events. Campaigns belong to clinics or sanitary authorities, not individual vets.
- Lost/found feature expansion beyond simple status flip
- Push notifications (iOS PWA limitations — may need native shell eventually). EAH 2018 finding: social media is the dominant channel for pet-health info reaching households; shareability is first-order.
- Native mobile via React Native sharing the data layer
- Per-pet "emergency info" public flag toggle
- **Conversational event-capture agent (audio/text → intent → pre-filled form)** — Spanish-only voice/text interface that detects which of the 23 event types the user is describing and opens the corresponding `/eventos/nuevo/*` form with slots pre-filled. Narrow domain (es-AR, fixed catalog, user acts on own pets) keeps it cheap and reliable. **Forward-compat that must hold from today onward:** (a) every event-creation route is URL-addressable with query-param prefill — new event forms MUST accept their payload fields as `searchParams` so a future agent can deeplink with full state. *El registro canónico vive en `lib/event-agent-registry.ts` con la función `buildAgentDeeplink(eventType, publicToken, slots)`. La implementación de referencia del patrón URL-prefill es el form de peso (`app/(app)/mis-mascotas/[publicToken]/eventos/nuevo/peso/`); copiarla cuando se agreguen nuevos forms.* (b) per-event-type Zod schemas (already a known gap, see `docs/archive/event-sourcing-hardening-prompt.md` — already implemented, see `lib/event-schemas.ts` and `validateEventPayload`) double as function-calling tool definitions for the agent — the same schema validates the human form submit and the agent's structured output; (c) the slugs at `/mis-mascotas/[token]/eventos/nuevo/*` become public contract once the agent ships — rename before launch, freeze after. **Design principles when it lands:** agent proposes, user confirms — never silent writes to `pet_events` (preserves the append-only invariant and keeps `author_role='owner'` honest); audio is not persisted (events are the source of truth, not the recording); the agent reads as well as writes — natural-language queries open filtered timeline projections, not a parallel chat surface. Legally-fraught events (`abandonment_reported`, `maltreatment_reported`, `dangerous_breed_attested`) are out of agent scope — those force the full manual flow with all disclaimers visible. LLM provider, hosting jurisdiction, and iOS PWA audio fallback are TBD when implementation lands.

## How Claude should work in this repo

- **Always read this file first** in a new session.
- **Append to this file** when locking in a new design decision worth preserving across sessions.
- **Never break the core principles** above without explicit user agreement and an update to this file.
- **Events are forever**: if the user asks to "fix" historical event data, push back — the answer is a correction event, not a mutation.
- **Spanish UI, English code**. Variable names, function names, code comments in English. User-facing strings in Spanish (es-AR).
- The user is non-technical. When asking the user to run a command, explain in one sentence what it does. When showing an error, explain it in plain language before suggesting a fix.
