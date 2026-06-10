# Iconic dataset cleanup — action plan

**Date:** 2026-05-20
**Author:** Claude (audit) → handed to Claude Code (execution)
**Source audit:** session note from 2026-05-20, summary in §0 below.
**Scope:** the iconic-pet batch (Laika, Hachikō + Hachiko Ni Sei, Pal, Terry, Kabosu + Hanako) — spec doc, seed code, demo loader, and one test wire-up.

Working tree is **`C:\dev\dim`**. Do not touch `C:\Users\ignac\DIM\DIM` — that's the corrupted copy and is being retired.

---

## §0 — One-page context for the next agent

The iconic batch is the most polished piece of narrative data in the repo. It exists as:

1. **`docs/test-storylines-iconic.md`** — 504 lines of timeline-with-events fiction, locations relocated to Argentina, written as a coverage spec.
2. **`scripts/seed-storylines-iconic.ts`** — 2,482 lines of typed `Storyline` exports. Loaded by `scripts/seed-demo.ts`.
3. **`scripts/seed-demo.ts`** — the demo loader that writes `STORYLINES` to Postgres + Supabase Storage.

The audit found 14 issues across four categories: seed-rotting bugs, doc/schema drift, canon errors, and architectural debt. This plan executes them in dependency order. Each phase is independently shippable and tested.

**Cross-references (read before editing):**
- Schema source of truth: `db/schema.ts` (especially `EVENT_TYPES` ~L228, `petAcquisitionMethodEnum` L107, `authorRoleEnum` L86).
- Event payload schemas: `lib/event-schemas.ts`.
- Share telemetry table: `shareTelemetry` in `db/schema.ts` (~L1205).
- Owner key resolution: `scripts/seed-demo.ts:303-322` (`resolveOwnerForStoryline`).
- Bigger picture for connecting dataset ↔ tests: `docs/test-dataset-plan.md`.

---

## §1 — Phase order summary

| Phase | What | Why first | Effort |
|---|---|---|---|
| 0 | **Git + filesystem recovery** | Repo is physically broken: `.git/HEAD` and `.git/packed-refs` are both truncated; `git status` fails with `fatal: unterminated line`. Without this, no PR can be opened. | ~20 min |
| 1 | Unbreak the seed loader (3 bugs) | `pnpm tsx scripts/seed-demo.ts` currently fails on fresh DB. Nothing below is verifiable until this is green. | ~30 min |
| 2 | Sync `test-storylines-iconic.md` to live event catalog | The doc references 8 event_types that don't exist anymore. Reading the doc misleads anyone trying to write a test against it. | ~30 min |
| 3 | Decide `libreta_shared_viewed` semantics | The current `note_added` workaround silently drops the "viral share burst" stressor. Either honor it or remove it from the matrix. | ~1h |
| 4 | Canon fixes (4 small narrative bugs) | Cosmetic but the doc sells itself on canon fidelity. | ~15 min |
| 5 | Fill in-batch coverage gaps (3 events) | Adds `sterilization_performed`, `microchip_replaced`, and one true-positive `outbreak_signal` to the timelines that naturally support them. | ~45 min |
| 6 | Migrate `owner_of_record` → `owner: UserKey` | Removes the legacy fallback in `seed-demo.ts` and aligns iconic with original10/supporting/dangerous. | ~30 min |
| 7 | Wire ONE storyline-driven test as a proof of concept | Closes the "dataset and tests live in separate universes" finding from `docs/test-dataset-plan.md` with one concrete file. | ~1h |
| 8 | Auto-generate the coverage matrix | The matrix at the bottom of `test-storylines-iconic.md` is hand-counted and silently rots. Replace with a generator. | ~1h |
| 9 | **Repo housekeeping** (planning sprawl + corrupted DIM tree leftovers + dead scripts) | Mid-priority but cheap; cleans the surface so future Claude Code sessions don't waste cycles on "which plan do I follow?" | ~30 min |

Total: ~6h across 10 PRs. Each phase has acceptance criteria; do not move to the next without them.

---

## §1.5 — Phase 0: Git + filesystem recovery (do this first or nothing else lands)

**Goal:** `git status` works. The working branch (`feat/sprint-1b-phase-a-microchip-lifecycle`) is the current HEAD. The dangling `claim-wip.patch` is either restored or explicitly discarded.

### 0.1 — Diagnose

Confirm the corruption before patching:

```bash
cd C:\dev\dim
git status                                # expect: fatal: unterminated line in .git/packed-refs
xxd .git/HEAD | head                      # expect: file ends at byte 0x18 (24 bytes), no newline
tail -1 .git/packed-refs                  # expect: line cut at "refs/remotes/or"
```

If those three checks don't match the description, **stop** — the corruption is different from what this plan diagnoses and needs re-investigation.

### 0.2 — Back up `.git/` before touching it

```bash
cp -r .git .git.backup-2026-05-20
```

If anything below goes sideways, `mv .git .git.bad && mv .git.backup-2026-05-20 .git` restores the broken-but-known state.

### 0.3 — Fix `.git/HEAD`

The reflog confirms the working branch is `feat/sprint-1b-phase-a-microchip-lifecycle` (see `.git/logs/HEAD` last line). The local ref file `.git/refs/heads/feat/sprint-1b-phase-a-microchip-lifecycle` exists and points to `c7621f1ffe3938b5c33c70ceb591f63521c48153`.

```bash
echo "ref: refs/heads/feat/sprint-1b-phase-a-microchip-lifecycle" > .git/HEAD
```

(The redirect adds a trailing newline, which is what git expects.)

### 0.4 — Fix `.git/packed-refs`

Drop the truncated 6th line. The remote it referenced (`refs/remotes/or...` — likely `origin/main`) will be re-populated by the next `git fetch`.

```bash
head -5 .git/packed-refs > .git/packed-refs.new
mv .git/packed-refs.new .git/packed-refs
```

After this:

```bash
git status                                # should now work
git log --oneline -5                      # should show the last 5 commits
git branch -a                             # should list local + remote branches
git fetch --all --prune                   # repopulates the dropped remote ref
```

### 0.5 — Delete `.git/claim-wip.patch`

Decision from owner (2026-05-20): **delete**. The diff content matches the security fix §2.1 of `docs/unapplied-specs-audit-2026-05-20.md` (gate `claimStubProfileAction`), which is independently tracked there and will be re-implemented from spec when scheduled.

```bash
rm .git/claim-wip.patch
```

### 0.6 — Delete the corrupted DIM folder entirely

Decision from owner (2026-05-20): all 3 leftover files in `C:\Users\ignac\DIM\DIM` are obsolete — `MiMAR-speech.md` was finalized outside the repo and is no longer needed; `mimar-flow-diagram.svg` is a draft that won't be referenced; the `supabase/` subfolder is empty.

Confirm nothing of value remains:

```bash
ls -la "/c/Users/ignac/DIM/DIM/"
# Expected: MiMAR-speech.md, mimar-flow-diagram.svg, supabase/ (empty)
```

Then delete the whole folder. Claude Code can't reach that path directly (it's outside `C:\dev\dim`), so this step is for the user to run from PowerShell:

```powershell
Remove-Item -Recurse -Force "C:\Users\ignac\DIM\DIM"
```

Or, if the `C:\Users\ignac\DIM\` parent is also empty after that (which it likely is), remove that too. Then confirm the user has set up a separate scratchpad folder **outside any sync directory** (e.g. `C:\Users\ignac\Documents\dim-scratch\`) for future personal-only files.

### 0.7 — Acceptance

```bash
git status            # clean (or shows the iconic plan file you're working on)
git log --oneline -3  # prints the last 3 commits without error
git fsck              # no errors
ls .git/claim-wip.patch 2>&1   # expect: "No such file or directory"
```

Also: `C:\Users\ignac\DIM\DIM` no longer exists (user-run, see §0.6).

---

## §2 — Phase 1: Unbreak the seed loader

**Goal:** `pnpm tsx scripts/seed-demo.ts` runs to completion against a fresh local Supabase, all iconic pets land in `pets` with no enum errors and photos load.

### 1.1 — Fix `PHOTO_DIR_ABS`

`scripts/seed-demo.ts:285`:

```ts
// REMOVE
const PHOTO_DIR_ABS = "/sessions/stoic-wizardly-lovelace/mnt/DIM/docs/archive/Fotos";

// REPLACE WITH
import path from "node:path";
const PHOTO_DIR_ABS = path.resolve(process.cwd(), "docs/archive/Fotos");
```

(If `path` is already imported at the top of the file, skip the import line.)

**Acceptance:** From the repo root, `node -e "console.log(require('path').resolve(process.cwd(), 'docs/archive/Fotos'))"` prints a directory that contains `russian dog.jpg`, `hachi.jpg`, `Doge1.jpg`.

### 1.2 — Map storyline `acquisition_method` to the DB enum

The TS type in `seed-storylines-iconic.ts:64-71` allows `"rescued" | "bred" | "unknown"`. The DB enum (`db/schema.ts:107`) doesn't. Add a mapper in `seed-demo.ts` and call it where the pet row is built.

In `scripts/seed-demo.ts`, just above the `db.insert(schemas.pets)` call (currently ~L818), add:

```ts
// Storylines use narrative acquisition labels ("rescued", "bred", "unknown")
// that don't match petAcquisitionMethodEnum. Map narrative → DB value here.
// Keep the narrative labels in the spec doc and TS Storyline type — they're
// part of the fiction. Only the DB write needs the canonical form.
type DbAcquisition = "adopted" | "purchased" | "found_stray" | "gift" | "born_in_litter" | "other";

function toDbAcquisition(value: string | undefined | null): DbAcquisition | null {
  if (!value) return null;
  switch (value) {
    case "adopted":
    case "purchased":
    case "gift":
    case "found_stray":
    case "born_in_litter":
    case "other":
      return value;
    case "rescued":
      return "adopted"; // refugio → família = canonical "adopted"
    case "bred":
      return "born_in_litter";
    case "unknown":
      return "other";
    default:
      throw new Error(`Unknown acquisition_method narrative label: ${value}`);
  }
}
```

Then change the insert at `seed-demo.ts:818`:

```ts
// BEFORE
acquisitionMethod: story.pet.acquisition_method ?? null,

// AFTER
acquisitionMethod: toDbAcquisition(story.pet.acquisition_method),
```

**Acceptance:** Run `pnpm tsx scripts/seed-demo.ts --dry-run` (or whatever the existing dry-run mode is). The Laika row should be reported with `acquisitionMethod: "adopted"`, Hachikō with `"born_in_litter"` (via Tandil estancia origin storyline), Kabosu with `"other"`.

### 1.3 — Fix `author_role: "admin"` rows

`db/schema.ts:86` — `authorRoleEnum` is `["owner", "scanner", "vet", "shelter", "govt", "system"]`. No `"admin"`.

The iconic seed uses `author_role: "admin"` in Laika's posthumous notes (e.g. 1993, 2008, 2014 entries). The TS type in `seed-storylines-iconic.ts:39` allows it (`type AuthorRole = "owner" | "vet" | "govt" | "admin" | "system" | "shelter"`), so typecheck passes but Postgres rejects.

**Decision:** Use `"system"`. `admin` and `system` express the same idea ("non-actor write authored by the platform") and the schema has chosen `system`. Don't add a new enum value just for this batch.

Steps:

1. In `scripts/seed-storylines-iconic.ts`, remove `"admin"` from `type AuthorRole` (L39):
   ```ts
   export type AuthorRole = "owner" | "vet" | "govt" | "system" | "shelter";
   ```
2. Replace every `author_role: "admin"` with `author_role: "system"`. Grep first to see the count:
   ```bash
   grep -n 'author_role: "admin"' scripts/seed-storylines-iconic.ts
   ```
   Expected: ~6 hits (posthumous notes on Laika 1993, 2008, 2014, 2017, 2022, 2023).
3. Also fix the spec doc (`docs/test-storylines-iconic.md`) — replace `author_role='admin'` with `author_role='system'` in the same Laika entries.

**Acceptance:** `grep -rn 'author_role.*admin' scripts/ docs/` returns zero hits. The TS type no longer mentions `"admin"`.

### 1.4 — Verify end-to-end

After 1.1–1.3:

```bash
pnpm typecheck
pnpm tsx scripts/seed-demo.ts --dry-run    # or whatever flag exists
pnpm tsx scripts/seed-demo.ts              # against a clean local Supabase
```

All 7 iconic pets should land in `pets`, all photo files should land in the `seed-photos` bucket, no enum errors, no FS errors.

**If `--dry-run` doesn't exist:** add it. A flag-gated branch that walks `STORYLINES`, builds the insert payloads, logs them, and exits before touching Postgres or Storage. This is high-leverage to keep — the audit had to manually trace what would break by reading code.

---

## §3 — Phase 2: Sync spec doc to the live event catalog

**Goal:** `docs/test-storylines-iconic.md` only references event_types that exist in `EVENT_TYPES` today.

The 19 May 2026 cleanup collapsed several event_types into umbrella forms with discriminators in the payload. The spec doc was written before that and still uses the old names. Update them.

### 2.1 — Top-of-doc note about the umbrella pattern

At the top of `docs/test-storylines-iconic.md`, after the `> Source bios:` block, insert:

```markdown
> **Event catalog convention:** After the 2026-05-19 cleanup, several lifecycle
> events were collapsed into umbrella event_types with an `outcome` (or
> equivalent) discriminator in the payload. When this doc mentions one of the
> old labels in prose, the corresponding row in the seed uses the umbrella:
>
> | Narrative label in this doc | Actual event_type in seed | Payload discriminator |
> |---|---|---|
> | `adoption_application_approved` / `rejected` | `adoption_application_resolved` | `outcome: "approved" \| "rejected"` |
> | `adoption_revoked` / `withdrawn` | `adoption_reversed` | `actor: "shelter" \| "adopter" \| "court"` |
> | `foster_proposal_accepted` / `rejected` / `cancelled` / `expired` | `foster_proposal_resolved` | `outcome: ...` |
> | `microchip_revoked` | `microchip_replaced` | `new_chip_number: null` |
```

### 2.2 — Replace the inline references

Do the following find-and-replace inside `docs/test-storylines-iconic.md` **only inside the per-event table rows**, not in section headers or the prose intro:

| Find | Replace |
|---|---|
| `` `adoption_application_approved` `` | `` `adoption_application_resolved` (outcome: approved) `` |
| `` `adoption_application_rejected` `` | `` `adoption_application_resolved` (outcome: rejected) `` |
| `` `adoption_revoked` `` | `` `adoption_reversed` (actor: shelter) `` |
| `` `adoption_withdrawn` `` | `` `adoption_reversed` (actor: adopter) `` |
| `` `foster_proposal_accepted` `` | `` `foster_proposal_resolved` (outcome: accepted) `` |
| `` `microchip_revoked` `` | `` `microchip_replaced` (new_chip_number: null) `` |

Pal's storyline (the only place `adoption_revoked` appears in iconic) gets updated at the 1942-03-15 row. Terry's at 1934-02-05 (`foster_proposal_accepted`) and 1934-03-08 (`adoption_application_approved`). Kabosu's at 2008-10-08. Hanako's at 2024-08-22.

**Important:** `microchip_revoked` doesn't appear in iconic — that one's in `supporting`. Note it in 2.1 anyway because someone reading the umbrella table will look for it.

### 2.3 — Update the coverage matrix counts

At the bottom of the doc, the matrix table currently lists `adoption_application_approved` / `adoption_application_rejected` / `adoption_revoked` / `foster_proposal_accepted` as separate rows. Collapse them:

```markdown
| `adoption_application_resolved` | 3 (outcome=approved) |
| `adoption_reversed`             | 1 (Pal, actor=shelter) |
| `foster_proposal_resolved`      | 1 (Terry, outcome=accepted) |
```

**Acceptance:** `grep -nE 'adoption_application_(approved|rejected)|adoption_(revoked|withdrawn)|foster_proposal_(accepted|rejected|cancelled|expired)|microchip_revoked' docs/test-storylines-iconic.md` returns matches only inside the umbrella-table block from 2.1, never inside per-event table rows.

---

## §4 — Phase 3: Honor or retire the libreta share burst stressor

**Goal:** The stressor "viral share burst" listed in the doc's `## Workflow stressors this batch uniquely exercises` section either (a) actually populates `share_telemetry` when the seed runs, or (b) gets removed from the list with a note explaining why.

Recommended: **option (a)**. The stressor is one of the most distinctive things this batch contributes (Kabosu's 47 shares in 7 days, Hachikō's *La Nación* share). Losing it is a real coverage loss.

### 3.1 — Add a `share_telemetry` insert path in `seed-demo.ts`

In `scripts/seed-storylines-iconic.ts`, add a new optional event-level field to `PetEvent`:

```ts
export interface PetEvent {
  date: string;
  event_type: EventType;
  location?: { locality?: string; province?: string; landmark?: string };
  payload?: Record<string, unknown>;
  author_role?: AuthorRole;
  uncommon?: true;
  notes?: string;
  /** When set, also inserts N rows into share_telemetry with this dispatcher. */
  share_burst?: {
    count: number;
    tier: 1 | 2;
    viewer_authenticated?: boolean;
  };
}
```

Then in the seed-demo loop that walks events, add:

```ts
if (event.share_burst) {
  await insertShareBurst(db, {
    petId: pet.id,
    occurredAt: parseISO(event.date),
    count: event.share_burst.count,
    tier: event.share_burst.tier,
    viewerAuthenticated: event.share_burst.viewer_authenticated ?? false,
  });
}
```

Where `insertShareBurst` writes `count` rows into `shareTelemetry` spread across the day at random minute offsets. Keep the helper local to `seed-demo.ts` for now.

### 3.2 — Convert the existing `note_added` workarounds back

In `seed-storylines-iconic.ts`, find the `note_added` rows with `category: "system"` whose `text` starts with `"Libreta compartida"` (Kabosu 2022-12-04, 2024-06-04; Hachikō 1932-10-04; etc.) and either:

- **Preferred:** replace with the closest "real" event that triggers the share, plus `share_burst` on it. E.g. Kabosu 2014-01-15 `libreta_shared_viewed → The Verge journalist`: keep a `note_added` (since the share itself isn't an event type) but add `share_burst: { count: 1, tier: 2, viewer_authenticated: false }`.
- For Kabosu 2024-06-04 (the "47 shares" burst), use `share_burst: { count: 47, tier: 2 }`.
- For Hachikō 1932-10-04 (the *La Nación* leak), use `share_burst: { count: 1, tier: 2 }`.
- For Kabosu 2013-12-09 (the Dogecoin Day-1 burst), use `share_burst: { count: 30, tier: 2 }` on the existing `credential_scanned` row, not a `note_added`.

### 3.3 — Update the doc

In `docs/test-storylines-iconic.md`, update each of the affected rows to say e.g. `→ share_burst(47, tier=2)` in the Details column instead of the parenthetical "(telemetry)".

**Acceptance:** After seed-demo runs, `SELECT pet_id, COUNT(*) FROM share_telemetry GROUP BY pet_id` returns ~47 rows for Kabosu, ~5 for Hachikō, plus the smaller bursts. The "viral share burst" stressor is now a real coverage signal.

### 3.4 — Fallback if 3.1–3.3 is too much for one PR

Remove "viral share burst" from the stressor list at the bottom of the doc and add a TODO line:

```markdown
> **Open:** the viral-share-burst stressor isn't currently exercised by this
> batch. To re-enable, see `docs/iconic-dataset-cleanup-plan-2026-05-20.md` §3.1.
```

Honest is better than false-advertised. But aim for 3.1–3.3 first.

---

## §5 — Phase 4: Canon fixes

Cosmetic-but-the-batch-sells-itself-on-canon fixes. All four are single-line edits in `docs/test-storylines-iconic.md` and (where the seed mirrors the text) `scripts/seed-storylines-iconic.ts`.

### 4.1 — Hachikō 1924-02-01 vaccination

Find: `vaccination_administered | Caballito | Moquillo + parvovirus (anachronistic baseline).`

Replace with: `vaccination_administered | Caballito | Moquillo + leptospirosis.`

(Parvovirus canino wasn't isolated until 1978. Lepto is real for the period.)

Also update the corresponding payload in `seed-storylines-iconic.ts` if it spells the vaccine names.

### 4.2 — Pal 1958-06-19 despedida

Find: `"Pal: enseñaste a Rin Tin Tin a no hacer trampa. Y a mí a quedarme quieto cuando hace falta. — R. Weatherwax."`

Replace `Rin Tin Tin` with `Rin Tin Tin III`. (Original Rin Tin Tin died 1932; Pal was born 1940. III is the canon-plausible overlap.)

### 4.3 — Hachikō 1934-04-22 statue

Find: `Escultor: Tora Andō`

Replace with: `Escultor: Teru Andō`

(Transliteration of 安藤照 — the kanji 照 reads *Teru*, not *Tora*.)

### 4.4 — Kabosu microchip comment

Find: `Chip 941-300-400-500-001, interscapular_left.` (and the pet bio line `Argentina country code 858 not used`)

Replace the pet bio comment with: `Microchip: Yes — 941-300-400-500-001 (ICAR-style 15-digit; 941 prefix common at Latam clinics). Argentina ISO 3166-1 country code is 032; not embedded in the chip ID.`

(858 is Uruguay, not Argentina.)

**Acceptance:** `grep -nE 'parvovirus 1924|Rin Tin Tin"|Tora Andō|858 not used' docs/test-storylines-iconic.md scripts/seed-storylines-iconic.ts` returns zero hits.

---

## §6 — Phase 5: Fill in-batch coverage gaps

**Goal:** Add the three events that naturally fit iconic and currently aren't there: `sterilization_performed`, `microchip_replaced`, and one true-positive `outbreak_signal`.

### 5.1 — `sterilization_performed` on Pal

Add at 1947 (between the 1947-05-30 trivia note and 1947-12-04 vet visit) in both the spec and the seed:

```ts
{
  date: "1947-09-15",
  event_type: "sterilization_performed",
  location: CABA("Saavedra"),
  author_role: "vet",
  payload: { procedure: "orchiectomy", anesthetic: "thiopental", surgeon: "Dra. Bardelli" },
  uncommon: true,
},
```

(Castration was routine in show dogs by the late 40s; Weatherwax's stable would have done it.)

### 5.2 — `microchip_replaced` on Hanako

Add at 2025 in both the spec and the seed:

```ts
{
  date: "2025-06-12",
  event_type: "microchip_replaced",
  location: CABA("Belgrano R"),
  author_role: "vet",
  payload: {
    old_chip_number: "941-300-400-500-101",
    new_chip_number: "941-300-400-500-102",
    reason: "migration_failure",
    new_location: "interscapular_right",
  },
  uncommon: true,
},
```

(Real failure mode: chip migrated to the elbow and stopped reading, requiring re-implant.)

### 5.3 — `outbreak_signal` true-positive on Kabosu

Add at 2022-06-04 (the day of the leukemia diagnosis) in both the spec and the seed:

```ts
{
  date: "2022-06-04",
  event_type: "outbreak_signal",
  location: CABA("Belgrano R"),
  author_role: "system",
  payload: {
    pattern_id: "ZOO_HEMA_SHIBA_AGED",
    triggered_by_event_ids: ["evt-kabosu-symptom-2022-05-15"],
    severity: "informational",
    false_positive: false,
    resolution: "matched chronic leukemia + hepatopathy",
  },
  uncommon: true,
},
```

This complements Laika's false-positive `outbreak_signal` from 2022 — together they exercise both branches of the surveillance flow.

### 5.4 — Update the matrix and stressor counts

At the bottom of the doc, bump:

- `sterilization_performed`: was 0, now 1 (Pal)
- `microchip_replaced`: was 0, now 1 (Hanako)
- `outbreak_signal`: was 1, now 2 (Laika false-positive, Kabosu true-positive)

Remove these from the "Gaps in this batch" list.

**Acceptance:** `pnpm tsx scripts/seed-demo.ts --dry-run` lists the 3 new events. `grep -c "sterilization_performed\|microchip_replaced\|outbreak_signal" scripts/seed-storylines-iconic.ts` returns ≥ 4 (one sterilization, one microchip_replaced, two outbreak_signal).

---

## §7 — Phase 6: Migrate `owner_of_record` → `owner: UserKey`

**Goal:** All 7 iconic pets carry `owner: UserKey` like the rest of the dataset. The legacy fallback in `seed-demo.ts:resolveOwnerForStoryline` (the by-token-prefix table) gets deleted.

### 6.1 — Add `owner: UserKey` to each pet bio

In `scripts/seed-storylines-iconic.ts`, for each of the 7 pets, set `owner` next to `owner_of_record`:

| Pet | `owner_of_record` (keep) | `owner` (add) |
|---|---|---|
| Laika | `"Vladimir Yazdovsky (INVAP-Bariloche)"` | `"ignacio"` |
| Hachikō | `"Hidesaburō Ueno (deceased 1925); Kikuzaburō Kobayashi"` | `"ignacio"` |
| Hachiko Ni Sei | `"Yaeko Ueno"` | `"ignacio"` |
| Pal | `"Rudd Weatherwax (Saavedra)"` | `"ignacio"` |
| Terry | `"Carlos Spitz (Olivos)"` | `"ignacio"` |
| Kabosu | `"Atsuko Sato (Belgrano R)"` | `"noeli"` |
| Hanako | `"Atsuko Sato (mapped to Noeli)"` | `"noeli"` |

Keep `owner_of_record` as the narrative field. Add `owner` as the seed key.

### 6.2 — Delete the legacy fallback in `seed-demo.ts`

`scripts/seed-demo.ts:303-322` — remove the `if (publicToken.startsWith("DIM-LAIK")) ...` block. The whole "Legacy fallback for the iconic storyline file" comment too. The `resolveOwnerForStoryline` becomes:

```ts
function resolveOwnerForStoryline(pet: any): { user?: UserKey; org?: OrgKey } {
  if (typeof pet?.owner !== "string") {
    throw new Error(`Storyline pet ${pet?.public_token} missing required 'owner' field`);
  }
  const owner = pet.owner as string;
  if (owner.startsWith("org:")) {
    return { org: owner.slice(4) as OrgKey };
  }
  return { user: owner as UserKey };
}
```

### 6.3 — Verify

```bash
pnpm tsx scripts/seed-demo.ts --dry-run
```

All 7 iconic pets should resolve to the same `ownerUserId` they used to (Ignacio for the first 5, Noelí for Kabosu/Hanako). The seed log shouldn't print the legacy-fallback warning anymore.

**Acceptance:** `grep -n "Legacy fallback for the iconic" scripts/seed-demo.ts` returns nothing. `grep -nE 'owner:\s*"(ignacio|noeli)"' scripts/seed-storylines-iconic.ts` returns 7 hits.

---

## §8 — Phase 7: First storyline-driven test

**Goal:** One real `*.test.ts` that imports a storyline from the seed module and asserts a property of the resulting projection. This is the proof-of-concept that closes the "dataset and tests live in separate universes" finding.

Pick **Hachikō's 9-year recurring lost-found loop** — it's the storyline whose stressor is most uniquely expressed in this batch.

### 7.1 — Create `__tests__/storylines/hachiko-recurring-lost.test.ts`

```ts
import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { STORYLINES } from "../../scripts/seed-storylines-iconic";
import { seedStoryline, teardownStoryline } from "../helpers/seed-storyline";
import { db } from "../../db";
import { petEvents } from "../../db/schema";
import { eq, and } from "drizzle-orm";

describe("Hachikō recurring lost/found cycles", () => {
  let hachikoPetId: string;

  beforeAll(async () => {
    const hachiko = STORYLINES.find((s) => s.pet.public_token === "DIM-HACH-0016");
    if (!hachiko) throw new Error("Hachikō storyline not found");
    const { petId } = await seedStoryline(db, hachiko);
    hachikoPetId = petId;
  });

  afterAll(async () => {
    await teardownStoryline(db, hachikoPetId);
  });

  test("has at least 5 status_changed → lost events", async () => {
    const lostEvents = await db
      .select()
      .from(petEvents)
      .where(and(eq(petEvents.petId, hachikoPetId), eq(petEvents.eventType, "status_changed")));
    const lostOnly = lostEvents.filter((e) => (e.payload as any)?.to_status === "lost");
    expect(lostOnly.length).toBeGreaterThanOrEqual(5);
  });

  test("each lost cycle is followed by a credential_scanned and then a status_changed → active", async () => {
    const events = await db
      .select()
      .from(petEvents)
      .where(eq(petEvents.petId, hachikoPetId))
      .orderBy(petEvents.occurredAt);

    // Walk: for each status_changed→lost, the next two events (by date)
    // should be credential_scanned then status_changed→active.
    const lostIndices = events
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => e.eventType === "status_changed" && (e.payload as any)?.to_status === "lost")
      .map(({ i }) => i);

    for (const i of lostIndices) {
      const nextScan = events.slice(i + 1).find((e) => e.eventType === "credential_scanned");
      const nextActive = events
        .slice(i + 1)
        .find((e) => e.eventType === "status_changed" && (e.payload as any)?.to_status === "active");
      expect(nextScan).toBeDefined();
      expect(nextActive).toBeDefined();
    }
  });

  test("the final death_recorded is at Estación Retiro", async () => {
    const death = await db
      .select()
      .from(petEvents)
      .where(and(eq(petEvents.petId, hachikoPetId), eq(petEvents.eventType, "death_recorded")))
      .limit(1);
    expect(death[0]).toBeDefined();
    const loc = (death[0].location as any) ?? {};
    expect(loc.landmark ?? loc.locality ?? "").toMatch(/Retiro/);
  });
});
```

### 7.2 — Create `__tests__/helpers/seed-storyline.ts`

This is the helper the test imports. It's the same insert logic from `seed-demo.ts` but factored out so a test (not the whole demo) can seed one storyline inside a transaction-scoped scope.

Concretely:

- Accept `(db, Storyline)`.
- Reuse `toDbAcquisition` from Phase 1.2 — lift it into `lib/storyline-mapping.ts` so both `seed-demo.ts` and this helper import it.
- Insert the pet row.
- Insert each event row, mapping `event_type`, `payload`, `author_role`, `location` to the DB columns.
- Return `{ petId, eventIds }`.
- `teardownStoryline(db, petId)` deletes by petId in the right order (events → ownerships → pet).

This helper is the durable artifact from Phase 7 — every future storyline test imports it.

### 7.3 — Wire it into Vitest

Verify `__tests__/storylines/` is picked up by the existing Vitest config (`vitest.config.ts`). If the include glob is `__tests__/**/*.test.ts` it's already covered.

**Acceptance:** `pnpm test -- __tests__/storylines/hachiko-recurring-lost.test.ts` passes. Running the full suite (`pnpm test`) doesn't regress.

---

## §9 — Phase 8: Auto-generate the coverage matrix

**Goal:** The matrix table at the bottom of `docs/test-storylines-iconic.md` is regenerated from code, not hand-counted.

### 8.1 — Script

Create `scripts/audit-storyline-coverage.ts`:

```ts
import { STORYLINES as ICONIC } from "./seed-storylines-iconic";
import { ORIGINAL_10_STORYLINES } from "./seed-storylines-original10";
import { SUPPORTING_STORYLINES } from "./seed-storylines-supporting";
import { DANGEROUS_STORYLINES } from "./seed-storylines-dangerous";
import { EVENT_TYPES } from "../db/schema";

const BATCHES = {
  iconic: ICONIC,
  original10: ORIGINAL_10_STORYLINES,
  supporting: SUPPORTING_STORYLINES,
  dangerous: DANGEROUS_STORYLINES,
};

function countByEventType(storylines: typeof ICONIC) {
  const counts = new Map<string, number>();
  for (const s of storylines) {
    for (const e of s.events) {
      counts.set(e.event_type, (counts.get(e.event_type) ?? 0) + 1);
    }
  }
  return counts;
}

const batch = process.argv[2] ?? "iconic";
const counts = countByEventType(BATCHES[batch as keyof typeof BATCHES]);

console.log(`# Coverage — ${batch} batch`);
console.log();
console.log("| Event type | Hits |");
console.log("|---|---:|");
for (const evt of EVENT_TYPES) {
  console.log(`| \`${evt}\` | ${counts.get(evt) ?? 0} |`);
}
console.log();
const gaps = EVENT_TYPES.filter((e) => !counts.has(e));
console.log("Gaps:", gaps.join(", "));
```

Run with `pnpm tsx scripts/audit-storyline-coverage.ts iconic > /tmp/iconic-matrix.md`.

### 8.2 — Wire it into the doc

In `docs/test-storylines-iconic.md`, replace the hand-typed "Cross-pet coverage matrix" block with a `<!-- AUTO-GENERATED: pnpm tsx scripts/audit-storyline-coverage.ts iconic -->` marker plus the generated table. Add a `pnpm audit:storyline-matrix` script to `package.json`:

```json
"audit:storyline-matrix": "tsx scripts/audit-storyline-coverage.ts iconic > docs/_generated/iconic-matrix.md && tsx scripts/audit-storyline-coverage.ts supporting > docs/_generated/supporting-matrix.md"
```

Then update the doc to `include` (via markdown link or a build step) the generated file.

### 8.3 — CI guard

Optional but recommended: add a CI check that runs the script and fails if the generated output differs from the committed `docs/_generated/iconic-matrix.md`. Cheap insurance against silent drift.

**Acceptance:** `pnpm audit:storyline-matrix` produces output that matches the committed file. Adding a new event to `seed-storylines-iconic.ts` and re-running the script visibly changes the count.

---

## §9.5 — Phase 9: Cleanup batch (explicit deletions)

**Goal:** delete every file flagged in the repo-health audit that the owner decided is dead weight. Single PR, one commit per category, easy to review.

**Owner decision (2026-05-20):** delete everything in categories A, B, C, E, F from the audit, plus `docs/archive/Carpeta Final-DIM 2021.docx` (9.3 MB) from category D. Keep the smaller academic material (CONAIISI paper, Business Model Canvas, Event Sourcing notes).

Branch: `chore/09-repo-housekeeping`. Each subsection below = one commit.

### 9.1 — Delete the 14 orphaned photos

These photos exist in `docs/archive/Fotos/` but no seed script references them. They're duplicates/alternates of photos that are in active use.

```bash
cd C:\dev\dim
git rm "docs/archive/Fotos/blue.jpg" \
       "docs/archive/Fotos/bol2.jpg" \
       "docs/archive/Fotos/bolti.jpg" \
       "docs/archive/Fotos/coraje.jpg" \
       "docs/archive/Fotos/coraje2.jpg" \
       "docs/archive/Fotos/corajeeee.jpg" \
       "docs/archive/Fotos/dogee.jpg" \
       "docs/archive/Fotos/puss in b2.jpg" \
       "docs/archive/Fotos/scob.webp" \
       "docs/archive/Fotos/slh homer.jpg" \
       "docs/archive/Fotos/slh santa.jpg" \
       "docs/archive/Fotos/SLH.jpg" \
       "docs/archive/Fotos/snoppy 2.jpg" \
       "docs/archive/Fotos/snoppy.jpg"

git commit -m "chore: drop 14 orphan photos unused by any seed script"
```

**Verify before commit:** the canon photos still in use should NOT appear in this list. Spot-check that `docs/archive/Fotos/bluee.jpg`, `bolt.jpg`, `courage.jpg`, `Doge1.jpg`, `scobi.webp`, `shl2.jpg`, `snoppy 3.jpg`, `puss in b.jpg` are still present. (`ls docs/archive/Fotos/ | wc -l` should go from 31 → 17.)

### 9.2 — Delete the two HTML previews

`docs/poncho/preview-fase1.html` (912 KB) and `preview-fase2.html` (908 KB) are one-shot generated outputs not referenced from anywhere outside themselves.

```bash
git rm docs/poncho/preview-fase1.html docs/poncho/preview-fase2.html
git commit -m "chore: drop poncho HTML previews (one-shot generated outputs)"
```

### 9.3 — Delete `Carpeta Final-DIM 2021.docx` (9.3 MB)

Owner decision: the 9.3 MB carpeta is too heavy to keep in git history. The smaller academic material stays (CONAIISI paper, BMC, Event Sourcing notes).

```bash
git rm "docs/archive/Carpeta Final-DIM 2021.docx"
```

Then update the three docs that reference it. The references are short — easiest to do as inline `sed` or open each file and remove the matching line:

- `docs/archive/README.md` line 9 — remove the `Carpeta Final-DIM 2021.docx` bullet.
- `docs/README.md` line 11 — remove the `Carpeta Final-DIM 2021.docx` table row.
- `docs/superpowers/README.md` line 188 — change `Carpeta Final, paper CONAIISI, Business Model Canvas, Event Sourcing notes.` to `paper CONAIISI, Business Model Canvas, Event Sourcing notes.`.

Add a short note at the top of `docs/archive/README.md` recording the removal:

```markdown
> 2026-05-20: `Carpeta Final-DIM 2021.docx` (9.3 MB) was removed from this folder. It's still in git history if needed (`git log --diff-filter=D -- "docs/archive/Carpeta Final-DIM 2021.docx"`).
```

Commit:

```bash
git add docs/archive/README.md docs/README.md docs/superpowers/README.md
git commit -m "chore: drop Carpeta Final 2021.docx (9.3MB), update refs"
```

**Verify:** `grep -rn "Carpeta Final" docs/` returns zero hits except the new "removed" note in `docs/archive/README.md`.

### 9.4 — Delete the three redundant 2026-05-20 planning docs

Owner decision: `unapplied-specs-audit-2026-05-20.md` is the authoritative roadmap. The other three same-date docs are redundant.

```bash
git rm docs/action-plan-2026-05-20.md \
       docs/implementation-plan-2026-05-20.md \
       docs/feature-inventory-2026-05-20.md

git commit -m "chore: drop redundant 2026-05-20 planning docs (subsumed by unapplied-specs-audit)"
```

**Keep these unchanged:** `docs/unapplied-specs-audit-2026-05-20.md` (the authoritative roadmap), `docs/project-review-2026-05-19.md` (the original review the audit derives from), `docs/iconic-dataset-cleanup-plan-2026-05-20.md` (this plan).

Then update `docs/README.md` to point at the audit as the entry point for "what's left to do":

```markdown
> **Looking for the active roadmap?** See [`unapplied-specs-audit-2026-05-20.md`](./unapplied-specs-audit-2026-05-20.md) — that's where every pending spec, security finding, and infra item is prioritized.
```

Add this line to `docs/README.md` near the top, then commit:

```bash
git add docs/README.md
git commit -m "docs: point README at unapplied-specs-audit as the roadmap entry point"
```

### 9.5 — Delete the two one-shot migration scripts

`scripts/normalize-existing-jurisdictions.ts` and `scripts/migrate-vets-to-clinics.ts` are zero-reference one-shot migrations. Their corresponding DB migrations are already in `db/migrations/` and are the durable record.

```bash
git rm scripts/normalize-existing-jurisdictions.ts \
       scripts/migrate-vets-to-clinics.ts

git commit -m "chore: drop applied one-shot migration scripts (migrations live in db/migrations/)"
```

If you discover one of these is still referenced from somewhere (`grep -rn "normalize-existing-jurisdictions\|migrate-vets-to-clinics" .` after the rm), revert and add a `// STATUS: applied YYYY-MM-DD` header instead.

### 9.6 — Remove `tsconfig.tsbuildinfo` from the working tree

Already gitignored, just clean the local file:

```bash
rm tsconfig.tsbuildinfo    # not tracked; just removes from disk; will be regenerated by tsc
```

No commit needed — git doesn't see this file.

### 9.7 — Final acceptance

```bash
git status                          # clean
ls docs/archive/Fotos/ | wc -l      # 17 (was 31)
ls docs/poncho/                     # only PLAN.md
ls docs/*-2026-05-20.md             # exactly 2: unapplied-specs-audit + iconic-dataset-cleanup-plan
ls scripts/normalize-existing-jurisdictions.ts scripts/migrate-vets-to-clinics.ts 2>&1   # both: No such file
grep -rn "Carpeta Final" docs/      # only the "removed" note in docs/archive/README.md
du -sh .                            # noticeably smaller; was 708M
```

Plus from §0:
- `C:\Users\ignac\DIM\DIM` no longer exists.
- `.git/claim-wip.patch` no longer exists.

Push the branch, open one PR titled `chore: repo housekeeping — drop 14 photos, 2 HTML previews, Carpeta Final 2021 (9.3MB), 3 redundant plans, 2 one-shot scripts`. Reviewer should be able to skim each commit independently.

---

## §10 — Out of scope for this plan (note for the next pass)

The audit also flagged a few things that belong to broader work and shouldn't be tackled inside this iconic-cleanup PR series:

- **`public_token` format inconsistency across batches** — supporting uses `DIM-SNNN-XXXX` (inverted), iconic/original10/dangerous use `DIM-XXXX-NNNN`. The real generator (`lib/publicToken.ts`) doesn't care about the format; the fixtures are decorative. Worth normalizing in a follow-up, but not here.
- **`docs/test-dataset-plan.md` Phase 1-6** — the big test/dataset reconnection plan. Phase 7 of this plan is the spearhead; the rest of that doc's plan should be picked up after.
- **`supporting` batch's references to removed event_types** (`foster_proposal_accepted`, `microchip_revoked`, etc., in its docstring) — same drift problem as the iconic doc, fix in a parallel cleanup PR for that batch.
- **`dangerous` batch's `acquisition_method: "rescued"` row at L381** — Phase 1.2's mapper handles it, but the TS type needs the same alignment treatment.

---

## §11 — How to run this plan with Claude Code

The intended workflow:

1. Open this file (`docs/iconic-dataset-cleanup-plan-2026-05-20.md`) in Claude Code.
2. Tell it: "Execute Phase 1 from `docs/iconic-dataset-cleanup-plan-2026-05-20.md`. Open one PR. Stop before Phase 2."
3. Verify the acceptance criteria in §2.4.
4. Repeat for each phase.

Each phase is self-contained and the acceptance criteria are concrete. If a phase grows beyond expected effort, stop and re-audit — the spec might have shifted again.

Suggested branch names:

- `chore/00-git-recovery` *(do this one outside the normal branch flow — see §1.5; you may need to work directly on whatever branch HEAD is restored to)*
- `iconic/01-unbreak-seed`
- `iconic/02-sync-event-catalog`
- `iconic/03-share-burst-stressor`
- `iconic/04-canon-fixes`
- `iconic/05-coverage-gaps`
- `iconic/06-owner-key-migration`
- `iconic/07-first-storyline-test`
- `iconic/08-auto-coverage-matrix`
- `chore/09-repo-housekeeping`

Each branch is a separate PR; each PR closes the corresponding phase. Phase 0 is special: it's a prerequisite, not a feature PR — once HEAD is restored, decide on the spot whether to commit the recovery as a `chore:` commit on develop or to skip the commit (the only changes are inside `.git/`, which isn't tracked).

---

*Generated 2026-05-20. Audit findings in the same session conversation. Source-of-truth files: `docs/test-storylines-iconic.md`, `scripts/seed-storylines-iconic.ts`, `scripts/seed-demo.ts`, `db/schema.ts`.*
