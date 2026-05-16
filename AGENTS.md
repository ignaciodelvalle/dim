# DIM — AGENTS.md

> Context for AI agents (and humans) working on this project.
> If you're a Claude session reading this for the first time, start here.

## What this is

**DIM — Documento de Identificación para Mascotas.** Argentina's digital pet credential system. A reborn 2021 university project (UTN), reimagined for 2026.

At its core: every pet has a verifiable digital identity — a credential that can be scanned via QR, displayed on a phone, printed on a tag. Owners use a PWA to maintain their pets' records (vaccinations, medications, vet visits, microchips, weight, status). The data model is designed from day one to support future expansion to veterinary professionals and government health authorities, including eventual integration with **Mi Argentina**.

The owner of the project is **Ignacio Del Valle** (ignaciodelvalle2014@gmail.com), part of the original 2021 team. Ignacio is **non-technical** — Claude writes the code, Ignacio drives product decisions and runs commands locally on Windows.

## North Star

The ultimate purpose of DIM is **animal health and welfare at population scale**: vaccinations reach pets who need them, treatments reach pets who need them, lost pets find their owners, and welfare problems become legible to authorities and NGOs who can act on them.

The pet owner PWA is the **data-collection layer** — it is and must be valuable on its own to drive adoption (no one will install a "feed the government data" app, but they will install a real digital libreta sanitaria). The architectural payoff sits at the population level: **high-level dashboards for sanitary authorities, public-health analysts, and animal-welfare officers**, derived from the same event log that powers individual pet records.

This North Star reframes some design choices and locks in others. Every event a pet owner records is potentially a public-health signal. Every screen — owner timeline, public credential, government dashboard, vet record — is a projection over the same source-of-truth event log.

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

## User roles

DIM recognizes three primary user roles, stored as `profiles.role` (enum `user_role`). One user = one primary role.

| Role    | Who                                                                         | Self-serve signup? | Primary portal       | Notes                                                                                                       |
| ------- | --------------------------------------------------------------------------- | ------------------ | -------------------- | ----------------------------------------------------------------------------------------------------------- |
| `owner` | Pet owner. Default for any self-serve signup.                                | Yes                | `/mis-mascotas`      | Every authenticated user can own pets regardless of role.                                                    |
| `vet`   | Veterinarian or other animal-health professional in the loop.                | No — admin-assigned (or verified-invite). Future flow may use RENAPER + matrícula validation. | `/profesional` (future) | Can also be a pet owner of their own pets; that's a separate `Ownership` row, not a role change.            |
| `govt`  | Government / public-health / animal-welfare authority. High access ceiling. | No — admin-assigned.  | `/gestion` (future)  | Dashboards default to aggregated, anonymous views. PII reads are possible for legitimate case work but are audit-logged. |

**Role vs. event authorship.** The `profiles.role` answers *"who is this user globally?"* The `pet_events.author_role` answers *"in what capacity did this user act when writing this specific event?"* They usually align (vet logs a vaccination → both are `vet`) but not always (vet logs their own dog's weight while acting as owner → `profiles.role='vet'` but the event's `author_role='owner'`). Keeping these separate is what lets audit trails be honest.

**Role does not restrict owning pets.** Anyone can have an `Ownership` row tying them to a pet. Role gates *portal access*, not personhood.

**Role assignment in v1.** Self-serve signup always produces `role='owner'`. Vet and govt accounts get their role flipped manually (Studio → `profiles` table → edit `role`) until we build admin tools and verified-invite flows. That's a deliberate v1 simplification; vet/govt account onboarding is high-stakes and shouldn't be self-serve.

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

## Event catalog — 23 types

`UI` column: `v1` = recordable by owner in the v1 PWA · `system` = system-emitted · `later` = schema-ready, UI deferred (either non-owner reporter flow needed, or the owner-facing form just hasn't been built yet).

Grouped by purpose for navigation. Adding a new event type is a one-line edit to the `EVENT_TYPES` const in `db/schema.ts` — no database migration.

**Lifecycle**

| Type                  | UI    | Payload                                                                                              |
| --------------------- | ----- | ---------------------------------------------------------------------------------------------------- |
| `pet_registered`      | v1    | initial profile snapshot                                                                             |
| `pet_profile_updated` | v1    | `{ field, old_value, new_value }`                                                                    |
| `status_changed`      | v1    | `{ from_status, to_status: active\|lost, reason? }` — death uses `death_recorded`, not this          |
| `death_recorded`      | v1    | `{ cause: known\|unknown\|natural\|disease\|accident\|euthanasia\|other, cause_detail?, confirmed_by_vet?, vet_name?, disposition_method?: cremation\|burial\|rendering\|unknown, facility? }` |

**Preventive medicine**

| Type                       | UI | Payload                                                                                |
| -------------------------- | -- | -------------------------------------------------------------------------------------- |
| `vaccination_administered` | v1 | `{ vaccine_name, brand?, batch?, administered_by?, campaign_id?, next_due_at? }`       |
| `deworming_administered`   | v1 | `{ product, type: internal\|external\|both, next_due_at? }`                            |
| `sterilization_performed`  | v1 | `{ procedure: castration\|spay, performed_by?, clinic?, campaign_id? }`                |

**Medication**

| Type                 | UI | Payload                                                |
| -------------------- | -- | ------------------------------------------------------ |
| `medication_started` | v1 | `{ drug_name, dose, frequency, prescribed_by? }`       |
| `medication_stopped` | v1 | `{ medication_started_event_id, reason? }`             |

**Clinical encounters and findings**

| Type                  | UI    | Payload                                                                                  |
| --------------------- | ----- | ---------------------------------------------------------------------------------------- |
| `vet_visit_logged`    | v1    | `{ reason, diagnosis?, vet_name?, clinic? }`                                             |
| `lab_work_performed`  | later | `{ test_type: blood_panel\|urinalysis\|stool\|biopsy\|culture\|other, ordered_by?, summary?, attachment_id? }` |
| `imaging_performed`   | later | `{ imaging_type: xray\|ultrasound\|ct\|mri\|endoscopy\|other, body_area?, findings?, attachment_id? }` |
| `surgery_performed`   | later | `{ procedure_name, performed_by?, clinic?, anesthesia_type?, complications?, recovery_notes? }` — distinct from `sterilization_performed` |
| `allergy_detected`    | later | `{ allergen, severity?: mild\|moderate\|severe, source?: test\|observation\|reaction, prescribed_by? }` — when discovered; differs from the static `pets.known_allergies` list which is the current state |

**Body metrics**

| Type              | UI | Payload    |
| ----------------- | -- | ---------- |
| `weight_recorded` | v1 | `{ kg }`   |

**Identification & legal**

| Type                       | UI    | Payload                                                                                              |
| -------------------------- | ----- | ---------------------------------------------------------------------------------------------------- |
| `microchip_implanted`      | v1    | `{ chip_number, country_code?, implanted_by?, location_on_body?, implant_date_known? }` — fired automatically at pet creation if a chip is provided |
| `dangerous_breed_attested` | later | `{ registry: caba_4078\|prov_14107\|other, registry_id?, attested_at, attached_documents? }` — owner registers their PPP in the official provincial registry |

**Custody & adoption**

| Type                              | UI    | Payload                                                                                          |
| --------------------------------- | ----- | ------------------------------------------------------------------------------------------------ |
| `shelter_intake_recorded`         | later | `{ intake_reason: rescue\|surrender\|seizure\|stray_found\|other, intake_condition?, rescue_jurisdiction? }` — fired when a shelter *or citizen* takes custody of an unowned animal; can roll into `pet_registered.payload` when the registering author is a shelter |
| `foster_assigned`                 | later | `{ foster_user_id, expected_weeks?, notes? }` — refugio assigns a voluntario to physically care for an animal it holds in custody |
| `foster_ended`                    | later | `{ foster_user_id, reason: adoption\|returned\|escalated\|other }`                              |
| `adoption_application_submitted`  | later | `{ applicant_user_id, related_organization_id, housing_type?, other_pets?, daily_routine?, notes? }` |
| `adoption_application_reviewed`   | later | `{ application_event_id, reviewer_user_id, notes? }`                                             |
| `adoption_application_approved`   | later | `{ application_event_id, reviewer_user_id, conditions? }`                                        |
| `adoption_application_rejected`   | later | `{ application_event_id, reviewer_user_id, reason? }`                                            |
| `adoption_finalized`              | later | `{ previous_owner_organization_id?, foster_user_id?, contract_attachment_id?, post_adoption_followup_months? }` — **composite event.** Source of truth for the transfer: atomically ends prior `shelter_custody` and `foster` rows and inserts a new `owner` row. Read as one event in the timeline. |
| `post_adoption_checkin`           | later | `{ related_organization_id, photo_attachment_ids?: uuid[], notes? }` — owner self-reports during the followup window; refugio dashboard acknowledges. Missing check-ins generate notifications to both adopter and refugio. No public-credential degradation. |
| `adoption_revoked`                | later | `{ reason, returned_to_organization_id }` — refugio reclaims animal per contract                |
| `custody_transferred`             | later | `{ from_user_id?, from_organization_id?, to_user_id?, to_organization_id?, reason? }` — for handoffs that are not adoption (refugio→refugio, citizen→refugio, capacity transfers, decomiso intake). Always recorded as an event; the `Ownership` table updates as a projection. |

**Free-form**

| Type         | UI | Payload                              |
| ------------ | -- | ------------------------------------ |
| `note_added` | v1 | `{ category?, text }` — catch-all   |

**System / observed**

| Type                 | UI     | Payload                                                                                                 |
| -------------------- | ------ | ------------------------------------------------------------------------------------------------------- |
| `credential_scanned` | system | `{ viewer_user_id?, ip_country?, user_agent?, is_self_scan, viewer_authenticated }` — location goes in event's `location_point` |
| `incident_reported`  | later  | `{ incident_type: dog_attack\|fight\|traffic_accident\|fall\|poisoning\|escape\|other, severity?, injuries_summary?, vet_involved? }` — distinct from `maltreatment_reported` (incident is non-human-cruelty) |

**Schema-ready, requires non-owner reporting flow**

| Type                    | UI    | Payload                                                                                          |
| ----------------------- | ----- | ------------------------------------------------------------------------------------------------ |
| `symptom_observed`      | later | `{ symptoms: text[], severity?, onset_at? }` — owner self-reported; aggregates matter for outbreak signal |
| `abandonment_reported`  | later | `{ reporter_role: owner\|witness\|authority, description? }`                                     |
| `maltreatment_reported` | later | `{ reporter_role, description, severity? }` — eventually integrates with Ley Nacional 14.346 denuncia pipelines |

Self-scans (owner viewing own pet's public page) are recorded with `is_self_scan: true` and hidden from default timeline UI.

Events with a real-world location should populate the `PetEvent.location_point` column (top-level), not duplicate it inside `payload`. The payload is for event-type-specific data; `location_point` is universal across event types and used by every geographic projection.

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
| 2    | Owner-issued share link               | Tier 0 + full vaccination history, microchip number, medical conditions, current medications, recent timeline. Link expires.         |
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

## v1 screens

1. **Signup** — email/password + "Connect with Mi Argentina" placeholder; *immediately* collects first pet profile (photo, name, species, base info) in same flow
2. **Login** — email/password + Mi Argentina placeholder
3. **Pet List** — grid of owner's pets (photo + name), tappable
4. **Pet Profile** — info panel + event timeline
5. **Event Detail** — full event info, geolocation if available
6. **Public Credential** — Tier 0 view at `/p/{public_token}`

## Naming

Keeping **DIM**. Acronym lands ("Documento de Identificación para Mascotas"), short, memorable. Revisit only if a clearly better name emerges.

## Open questions / future work

- Mi Argentina integration: third-party OAuth via Argentina.gob.ar SSO when available, vs. eventual official credential adoption
- DNI verification provider when we get there (RENAPER direct vs. intermediary like Didit / Truora)
- Vet portal (separate Next.js route group or sibling app, sharing DB)
- **Refugio / `/refugio` portal** — verified-org dashboard for intake, foster assignment, adoption pipeline, post-adoption followup. Single-pet flows first, bulk operations later. Schema is in place.
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
- Non-owner reporting flow for `abandonment_reported`, `maltreatment_reported`, `symptom_observed` on unregistered pets — requires schema additions for "report subject = unowned animal" plus moderation. `maltreatment_reported` ultimately wants integration with Ley Nacional 14.346 denuncia pipelines.
- Materialized views for expensive projections — keep event log as source of truth, cache when query latency justifies
- Campaign management UX (gov-side scheduling, slot allocation) — referenced by `campaign_id` in vaccination/sterilization events. Campaigns belong to clinics or sanitary authorities, not individual vets.
- Lost/found feature expansion beyond simple status flip
- Push notifications (iOS PWA limitations — may need native shell eventually). EAH 2018 finding: social media is the dominant channel for pet-health info reaching households; shareability is first-order.
- Native mobile via React Native sharing the data layer
- Per-pet "emergency info" public flag toggle

## How Claude should work in this repo

- **Always read this file first** in a new session.
- **Append to this file** when locking in a new design decision worth preserving across sessions.
- **Never break the core principles** above without explicit user agreement and an update to this file.
- **Events are forever**: if the user asks to "fix" historical event data, push back — the answer is a correction event, not a mutation.
- **Spanish UI, English code**. Variable names, function names, code comments in English. User-facing strings in Spanish (es-AR).
- The user is non-technical. When asking the user to run a command, explain in one sentence what it does. When showing an error, explain it in plain language before suggesting a fix.
