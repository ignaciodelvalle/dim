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

## Data model

### `User`
- `id` (uuid, pk), `email` (unique), `display_name`, `phone?`, `avatar_url?`
- `dni_number?`, `dni_verified` (bool, default false) — Mi Argentina-ready
- `created_at`, `updated_at`

### `Pet` — the credential itself
- `id` (uuid, pk) — internal key
- `public_token` (unique) — short URL-safe code, used in QR (e.g. `DIM-3K4F-9P2X`)
- `species`, `breed?`, `name`, `sex` (male|female|unknown)
- `date_of_birth?`, `birth_date_is_estimated` (bool)
- `color?`, `distinguishing_features?`
- `microchip_id?` (unique when present)
- `primary_photo_id?` (fk → Attachment)
- `status` (active|lost|deceased), `deceased_at?`
- `jurisdiction_country` (default `'AR'`) — root for aggregation
- `jurisdiction_province?` (e.g. `'CABA'`, `'Buenos Aires'`)
- `jurisdiction_locality?` (e.g. `'Palermo'`, `'San Isidro'`) — barrio / partido level; the smallest unit exposed in public aggregates
- `created_at`, `updated_at`
- **No precise home coordinates stored on pet.** Location precision lives on events when relevant, not on the pet's home.

### `Ownership` — history of who owns each pet
- `id`, `pet_id`, `user_id`
- `role` (owner|co_owner|caretaker) — only `owner` in v1
- `started_at`, `ended_at?` (null = current)
- `transferred_from_id?` — chains ownership history
- **Constraint**: at most one active row per pet (single active owner enforced v1)

### `PetEvent` — append-only timeline (the spine)
- `id`, `pet_id`, `event_type`
- `occurred_at` (real-world time), `recorded_at` (system time)
- `recorded_by_user_id?` (nullable for anonymous scans)
- `author_role` (owner|scanner|vet|govt|system)
- `author_verified` (bool, default false)
- `payload` (jsonb), `notes?`, `created_at`
- `location_point?` (PostGIS `geography(Point, 4326)`) — optional precise location when relevant (vet visit, scan GPS, found-pet location). Used for public-health aggregation and welfare hotspot maps.
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

## Event catalog — 17 types

`UI` column: `v1` = recordable by owner in the v1 PWA · `system` = system-emitted · `later` = schema-ready, UI deferred to a future reporting flow (typically requires non-owner reporter support).

| Type                       | UI     | Payload                                                                                              |
| -------------------------- | ------ | ---------------------------------------------------------------------------------------------------- |
| `pet_registered`           | v1     | initial profile snapshot                                                                             |
| `pet_profile_updated`      | v1     | `{ field, old_value, new_value }`                                                                    |
| `vaccination_administered` | v1     | `{ vaccine_name, brand?, batch?, administered_by?, campaign_id?, next_due_at? }`                     |
| `deworming_administered`   | v1     | `{ product, type: internal\|external\|both, next_due_at? }`                                          |
| `medication_started`       | v1     | `{ drug_name, dose, frequency, prescribed_by? }`                                                     |
| `medication_stopped`       | v1     | `{ medication_started_event_id, reason? }`                                                           |
| `vet_visit_logged`         | v1     | `{ reason, diagnosis?, vet_name?, clinic? }`                                                         |
| `weight_recorded`          | v1     | `{ kg }`                                                                                             |
| `microchip_implanted`      | v1     | `{ chip_number, implanted_by?, location_on_body? }`                                                  |
| `sterilization_performed`  | v1     | `{ procedure: castration\|spay, performed_by?, clinic?, campaign_id? }`                              |
| `death_recorded`           | v1     | `{ cause: known\|unknown\|natural\|disease\|accident\|euthanasia\|other, cause_detail?, confirmed_by_vet?, vet_name? }` |
| `note_added`               | v1     | `{ category?, text }` — catch-all                                                                    |
| `status_changed`           | v1     | `{ from_status, to_status: active\|lost, reason? }` — death uses `death_recorded`, not this          |
| `credential_scanned`       | system | `{ viewer_user_id?, ip_country?, user_agent?, is_self_scan }` — location goes in event's `location_point` |
| `symptom_observed`         | later  | `{ symptoms: text[], severity?, onset_at? }` — owner self-reported, weak per-pet but valuable in aggregate (early outbreak signal) |
| `abandonment_reported`     | later  | `{ reporter_role: owner\|witness\|authority, description? }` — needs non-owner reporting flow         |
| `maltreatment_reported`    | later  | `{ reporter_role, description, severity? }` — needs non-owner reporting flow                          |

Self-scans (owner viewing own pet's public page) are recorded with `is_self_scan: true` and hidden from default timeline UI.

Events with a real-world location should populate the `PetEvent.location_point` column (top-level), not duplicate it inside `payload`. The payload is for event-type-specific data; `location_point` is universal across event types and used by every geographic projection.

## Privacy tiers (the public surface)

| Tier | Audience                              | What's visible                                                                                                                       |
| ---- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 0    | Anyone scanning the QR                | photo, first name, species, breed, approx age (year), sex, "credential valid ✓", vaccination boolean (✓ / ⚠), microchip present (y/n), "Did you find this pet?" contact form |
| 0+   | Tier 0 + owner-toggled emergency flag | "This pet takes daily medication — contact owner immediately" without drug names or owner phone                                       |
| 1    | Pet status = `lost`                   | Tier 0 + owner first name + direct contact + last-known location if shared                                                            |
| 2    | Owner-issued share link               | Tier 0 + full vaccination history, microchip number, medical conditions, current medications, recent timeline. Link expires.         |
| 3    | Owner, authenticated in app           | Everything, including scan history with locations. Editable.                                                                          |
| 4    | (future) Verified vet via portal      | Tier 2 by default + can write events                                                                                                  |

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
- Government dashboards: three audiences in scope (sanitary authority, analyst, welfare officer); build order TBD by where adoption lands first
- Non-owner reporting flow for `abandonment_reported`, `maltreatment_reported`, `symptom_observed` on unregistered pets — requires schema additions for "report subject = unowned animal" plus moderation
- Materialized views for expensive projections — keep event log as source of truth, cache when query latency justifies
- Campaign management UX (gov-side scheduling, slot allocation) — referenced by `campaign_id` in vaccination/sterilization events
- Lost/found feature expansion beyond simple status flip
- Push notifications (iOS PWA limitations — may need native shell eventually)
- Native mobile via React Native sharing the data layer
- Per-pet "emergency info" public flag toggle

## How Claude should work in this repo

- **Always read this file first** in a new session.
- **Append to this file** when locking in a new design decision worth preserving across sessions.
- **Never break the core principles** above without explicit user agreement and an update to this file.
- **Events are forever**: if the user asks to "fix" historical event data, push back — the answer is a correction event, not a mutation.
- **Spanish UI, English code**. Variable names, function names, code comments in English. User-facing strings in Spanish (es-AR).
- The user is non-technical. When asking the user to run a command, explain in one sentence what it does. When showing an error, explain it in plain language before suggesting a fix.
