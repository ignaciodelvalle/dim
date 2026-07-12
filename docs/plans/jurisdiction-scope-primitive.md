# Jurisdiction Scope Primitive — concrete design (the shape, before migration)

> The PLAN-FIRST artifact for the jurisdiction-scope consolidation, mirroring
> `panorama-viewstate-design.md`. It fixes the SHAPE of one canonical resolver —
> its signature, return type, and every fence branch it must unify — **before**
> any of the 16 call sites is migrated. The risk of this refactor is entirely in
> the shape and in the fence; everything after is mechanical.
>
> **The jurisdictional fence is sacred.** This primitive IS the fence's
> server-side resolution. Two real fence leaks were caught on 2026-07-12/13 from
> scope logic that drifted between copies. Sixteen byte-for-byte copies of a
> ~30-line scope block is exactly that risk, multiplied. The whole point of this
> design is to make the fence auditable in **ONE** place.
>
> Status: DRAFT for PO review. Grounded against `integration/all-20260703`.
> Sequenced AFTER panorama ViewState P1b lands (§8).

---

## 0. The one decision this document makes

Today the *what-jurisdiction-is-in-view-and-how-it-narrows-the-query* logic lives
**inline in 16 files**, copy-pasted. The block does six things in sequence:

```
sp.province (ISO code)  ──provinceByCode()──►      selectedProvince : Province|null
selectedProvince        ──listLocalitiesByProvince()──►  localities  (for the switcher)
sp.locality (slug)      ──localityByName()──►      selectedLocality : Locality|null
(role, jurisdictions, names) ──narrow──►           filteredJurisdictions  ⊆ assignments
(role, jurisdictions)   ──derive──►                allowedProvinces  (switcher options)
(role, names)           ──guard──►                 adminSelectedProvince/Locality  (admin SQL drill)
```

This design collapses that into ONE async server function:

```
resolveJurisdictionScope({ role, jurisdictions, params }) ──► ResolvedJurisdictionScope
       │
       ├──► filteredJurisdictions   (the fence — the `filters` half of the projection)
       ├──► allowedProvinces        (the <JurisdictionSwitcher> option set)
       ├──► localities              (the switcher's locality dropdown)
       ├──► selectedProvince        (resolved Province object)
       ├──► selectedLocality        (resolved Locality object — canonical names)
       └──► adminSelectedProvince/Locality  (admin-only SQL drill names)
```

**Discipline:** `(events, filters) → view`. This primitive is the **`filters` half**
of that projection, for jurisdiction — the exact sibling of the already-shared
**period half** (`lib/analytics/analytics-period.ts::resolveAnalyticsPeriod`,
which is the `(period searchParams) → {since, until}` window resolver). The period
half got its shared function long ago; the jurisdiction half never did. This adds it.

### 0.1 KEY DISCOVERY — the pure fence core is ALREADY extracted and tested

The narrowing step (#4 above) is **not greenfield**. It already lives in
`lib/infra/gov-scope.ts::resolveScopedJurisdictions` — a pure, unit-tested
function (5 cases in `lib/infra/gov-scope.test.ts`, including the fence-critical
"locality not in assignments → empty list (cannot widen)"). An earlier design doc
called for exactly this extraction:
`docs/superpowers/specs/2026-06-23-gov-portal-admin-reuse-design.md` item 6.

But that extraction **under-scoped**: it extracted only the pure narrowing (which
takes already-resolved canonical *names*), leaving the async resolution around it
(ISO→Province, slug→Locality, localities fetch, allowedProvinces derivation,
admin-drill names) still inlined in all 16 sites — and **most sites don't even
call `resolveScopedJurisdictions`; they re-inline the filter by hand.**

**Consequence for this design:** `resolveJurisdictionScope` is the **async
orchestrator that completes the extraction** — it does the I/O and derivation, and
**delegates the fence-critical narrowing to the existing, tested
`resolveScopedJurisdictions`**. We do not rewrite the fence core. We wrap it once
and route all 16 sites through the wrapper. This is a far safer story than a
from-scratch primitive: the sacred part is already proven; we are removing the
16 hand-copies of the *plumbing* around it.

---

## 1. `resolveJurisdictionScope` — the canonical primitive

```ts
// lib/analytics/jurisdiction-scope.ts  (NEW — server function, async, no React)
// Sits beside resolveAnalyticsPeriod. Same shape of API (searchParams in,
// resolved value out), same testing rigor. The period sibling is pure/sync;
// this one is async because scope resolution needs two catalog reads
// (localities list + locality-by-name). Both are the two halves of `filters`.

import type { DashboardJurisdiction } from "@/lib/metrics";
import type { Province } from "@/lib/reference/ar-provincias";
import type { Locality, LocalityOption } from "@/lib/infra/ar-localidades";

export type JurisdictionScopeParams = {
  /** ?province — ISO 3166-2:AR code, e.g. "AR-B". Absent/empty = national. */
  province?: string | null;
  /** ?locality — locality slug, e.g. "la-plata". Absent = province-level (or national). */
  locality?: string | null;
};

export type JurisdictionScopeInput = {
  /** From requireAdminOrGovtOrRedirect(). "admin" ⇒ universal, empty jurisdictions. */
  role: "admin" | "govt";
  /** The operator's assignment set. Admin gets [] by contract (= universal). */
  jurisdictions: DashboardJurisdiction[];
  /** The raw ?province / ?locality searchParams (ISO code + slug). */
  params: JurisdictionScopeParams;
};

export type ResolvedJurisdictionScope = {
  /** ?province resolved (canonical name + ISO + slug), or null for national scope. */
  selectedProvince: Province | null;

  /** ?locality resolved to its catalog row (canonical localityName + slug), or null. */
  selectedLocality: Locality | null;

  /** Localities of selectedProvince, for the <JurisdictionSwitcher> dropdown. [] when national. */
  localities: LocalityOption[];

  /**
   * THE FENCE. The operator's jurisdictions narrowed by the selection.
   * Delegates to resolveScopedJurisdictions — NEVER widens beyond assignments.
   * Admin ⇒ returned unchanged (empty = universal; SQL scope short-circuits on role).
   */
  filteredJurisdictions: DashboardJurisdiction[];

  /**
   * The provinces the switcher may offer.
   * Admin ⇒ GOB_ALL_PROVINCES (all 24). Govt ⇒ derived from ORIGINAL assignments
   * (NOT filteredJurisdictions — see §2, drift risk D5).
   */
  allowedProvinces: Array<{ code: string; name: string }>;

  /**
   * ADMIN-ONLY drill-down names, to push into a SQL WHERE for tables the admin
   * queries universally (admin has no assignments to narrow, so the URL selection
   * is applied as an explicit predicate instead). Both null for govt — a govt's
   * scope is ALREADY enforced by filteredJurisdictions, and passing these for govt
   * would be a widening vector.
   */
  adminSelectedProvince: string | null;
  adminSelectedLocality: string | null;
};

export async function resolveJurisdictionScope(
  input: JurisdictionScopeInput,
): Promise<ResolvedJurisdictionScope>;
```

### 1.1 The reference implementation shape (what the body does)

```ts
const selectedProvince = params.province ? provinceByCode(params.province) : null;

const localities = selectedProvince
  ? await listLocalitiesByProvince(selectedProvince.code as ProvinceCode)
  : [];

const selectedLocality =
  selectedProvince && params.locality
    ? await localityByName(selectedProvince.code as ProvinceCode, params.locality)
    : null;

// THE FENCE — delegated to the already-tested pure core.
const filteredJurisdictions = resolveScopedJurisdictions({
  jurisdictions,
  role,
  selectedProvinceName: selectedProvince?.name ?? null,
  selectedLocalityName: selectedLocality?.localityName ?? null,
});

const allowedProvinces =
  role === "admin"
    ? GOB_ALL_PROVINCES
    : Array.from(new Set(jurisdictions.map((j) => j.province)))
        .map((name) => ({ code: PROVINCE_ISO_MAP[name] ?? "", name }))
        .filter((p) => p.code !== "");

const adminSelectedProvince = role === "admin" ? (selectedProvince?.name ?? null) : null;
const adminSelectedLocality = role === "admin" ? (selectedLocality?.localityName ?? null) : null;
```

Every clause above is lifted verbatim from the 16 sites — nothing new is
invented. The primitive's value is that this sequence exists **once**.

### 1.2 What each consumer class reads (verified against the sample)

The return type is a **superset**; each site destructures the subset it needs.

| Consumer | reads | ignores |
|---|---|---|
| Standard gob page (poblacion, vigilancia, censo, analytics, adopciones, campanas, mortalidad, programa, sistema, brotes, gob/home) | `filteredJurisdictions`, `localities`, `allowedProvinces` | admin-drill names, `selectedLocality` |
| Admin-drill page (maltrato) | `filteredJurisdictions`, `localities`, `allowedProvinces`, `adminSelectedProvince`, `adminSelectedLocality` | — |
| Export route (poblacion/censo/campanas/adopciones `export/route.ts`) | `filteredJurisdictions` only (no switcher, no dropdown) | `localities`, `allowedProvinces`, admin names |
| Variant page (perdidas — see D4) | `localities`, `allowedProvinces`, `selectedProvince` (+ admin-drill names via fetcher) | `filteredJurisdictions` (uses raw jurisdictions + admin-drill) |

A resolver returning everything and letting sites pick is correct here: the six
outputs are all cheap derivations of the same two inputs, computed together.

---

## 2. STORED-vs-DERIVED / fence branches — the table every copy must account for

There is nothing "stored" here (this is a pure projection of `(role,
jurisdictions, params) → scope`), so this table enumerates the **BRANCHES** the
one function must unify. Every branch below exists across the 16 sites today; the
primitive must reproduce each **byte-identically**.

| # | Branch / edge case | Behavior the primitive MUST reproduce | Fence rationale |
|---|---|---|---|
| B1 | **Admin widening guard** | `role === "admin"` ⇒ `filteredJurisdictions = jurisdictions` unchanged (empty = universal). Narrowing is a **no-op for admin**. | Admin scope is enforced downstream by SQL clauses that short-circuit on `role === "admin"`; the URL selection reaches admin queries only via `adminSelected*` (B7), never by shrinking an already-empty list. |
| B2 | **Govt, no province selected** | `!selectedProvinceName` ⇒ return all assignments unchanged. | The operator sees their full fenced scope; absence of a filter is not a widening. |
| B3 | **Govt, province-only** | filter `j.province === name`. | Keeps every assigned locality within that province. |
| B4 | **Govt, province + locality** | filter `j.province === name && j.locality === localityName` (exact pair). | The exact-pair intersect is what stops a govt user crafting `?province=&locality=` to widen; `govtAssignments.jurisdictionLocality` is NOT NULL, so exact match is correct. |
| B5 | **Whole-province subsumption** | A govt assigned N localities of a province, selecting province-only (B3), keeps all N. Adding a locality (B4) narrows to exactly one. Selecting a locality they are NOT assigned ⇒ **empty list** (cannot widen — covered by `gov-scope.test.ts`). | The narrowing only ever intersects DOWN; there is no path from a narrower selection to a broader result set. |
| B6 | **MAP-5 fallback: lone `?locality=` with no `?province=`** | `selectedProvince === null` ⇒ `localities = []`, `selectedLocality = null` (never resolved without a province), narrowing degrades to B2 (no-op). The stray locality param is **silently ignored (downgraded)**, not applied. | A locality with no province cannot be resolved to a canonical name, so it can never narrow — fail-safe, never fail-open. |
| B7 | **Admin SQL drill** | `role === "admin"` ⇒ `adminSelectedProvince/Locality` = the resolved **canonical names** (else both `null`). Consumed by `buildMaltratoListConditions` / `fetchPerdidasMetrics` as an explicit `WHERE province = ...` predicate. Govt callers get `null` and MUST NOT pass these. | Admin has no assignments to filter, so the drill is a separate additive predicate; gating it on `role === "admin"` is what prevents a govt path from ever using name-based (rather than assignment-based) scoping. |
| B8 | **Fail-closed on invalid/unknown ISO** | `provinceByCode(bad)` ⇒ `null` ⇒ treated as national (B2). For **govt** this yields their full assignment set (fenced), never a widened one. For **admin** it yields universal (already their scope). | Invalid input degrades to "no narrowing within an already-fenced set", never to cross-jurisdiction visibility. |
| B9 | **Null/absent locality slug** | `localityByName(code, null)` ⇒ `null` ⇒ province-only branch (B3). | Absent locality ⇒ broadest *in-province* scope, still inside assignments. |
| B10 | **allowedProvinces source** | Derived from the **ORIGINAL `jurisdictions`**, never from `filteredJurisdictions`. Admin ⇒ all 24. | If derived from the filtered set, the switcher would shrink to one province after a selection and trap the operator (a UX fence break, not a security one — but still must not drift). |

**All ten branches collapse into the single function.** B1–B6, B8, B9 are already
covered by `resolveScopedJurisdictions` + its tests; B7 and B10 are the derivation
shell this design adds around it.

### 2.1 Drift already present across the 16 (findings — reconcile at migration)

The survey found the copies have **already diverged**, which is the DRY risk
made concrete:

- **D1 — two spellings of the narrowing branch.** Ten sites use an `if/else`
  block (`poblacion:107-117`, `vigilancia:86-101`, `maltrato:116-129`, plus
  censo, analytics, adopciones, campanas, mortalidad, brotes, gob/home). Two sites
  (`programa:140-149`, `sistema:80-90`) and all four export routes use a
  **ternary** (`filteredJurisdictions = selectedLocalityRow ? … : …`). Semantically
  identical; two spellings is exactly how a future edit lands in one and not the
  other.
- **D2 — partial adoption of the existing core.** Only `app/gob/outbox/page.tsx`
  actually calls `resolveScopedJurisdictions`; the other 15 re-inline the filter
  by hand despite the tested helper existing since 2026-06-23. The extraction was
  never finished.
- **D3 — admin-drill names computed in only two sites.** `maltrato`
  (`adminSelectedProvince/Locality`, lines 135-137) and `perdidas` (`adminProvince/
  adminLocality` via `fetchPerdidasMetrics`) compute the admin drill names; the
  other 14 do not (they don't need them). The primitive returns them for all;
  non-admin-drill sites ignore them. Not a bug — but it means the "block" is not
  actually uniform today, so a naive "replace identical block" diff would miss these.
- **D4 — perdidas is a VARIANT consumer, not a clean copy.**
  `app/gob/perdidas/page.tsx:87-148` resolves `selectedProvince` + `localities` +
  `allowedProvinces` but **never computes `filteredJurisdictions`** — it passes the
  raw `jurisdictions` to `fetchLostPets`/`fetchPerdidasMetrics` and relies on
  those fetchers' internal scope clauses, using the admin-drill names for the admin
  province path. Migrating perdidas means wiring it to the primitive's
  `localities`/`allowedProvinces`/`selectedProvince`/admin-drill outputs **without**
  changing its "fetchers scope internally" contract. Flag for careful review — it
  is the one site whose scope flow genuinely differs.
- **D5 — `analytics/export/page.tsx` is a 17th site** the original survey's "16"
  did not list (it is an export rendered as a *page*, not a route). It carries the
  same resolve+localities+allowedProvinces block (lines 79-134). Include it.
- **D6 — `outreach/export/route.ts` looks similar but is NOT this pattern.** It
  uses a different scoping path and does not resolve province/locality via this
  block. Do NOT migrate it under this change.

None of D1–D6 is a live fence leak today, but each is a place where the next
copy-edit *could* introduce one. Consolidation removes the surface.

---

## 3. Parity strategy — the safety net (characterization first)

Mirror the panorama characterization-net discipline: **pin current behavior
before touching a call site**, so the refactor is "correct iff these snapshots
stay byte-identical".

### 3.1 Characterization net over the pure core + orchestrator

`resolveScopedJurisdictions` already has `gov-scope.test.ts` (5 cases). Extend it
into a `jurisdiction-scope.test.ts` beside `resolveAnalyticsPeriod`'s own tests,
pinning `resolveJurisdictionScope` across a matrix:

```
roles:          admin | govt
jurisdictions:  [] | single-province | multi-locality-one-province | multi-province
params:         {}                              (national)
                {province: "AR-B"}              (province-only, valid)
                {province: "AR-B", locality: "la-plata"}   (pair, assigned)
                {province: "AR-B", locality: "rosario"}    (pair, NOT assigned — B5 empty)
                {locality: "la-plata"}          (lone locality — B6 downgrade)
                {province: "AR-ZZ"}             (invalid ISO — B8 fail-closed)
```

For each cell, assert the full `ResolvedJurisdictionScope` (all six outputs). The
two DB reads (`listLocalitiesByProvince`, `localityByName`) are stubbed with the
same fixtures the current sites would hit, so the net is deterministic and
server-free (unit-first, like panorama P0).

### 3.2 Per-site output pinning (the "byte-identical" proof)

The refactor is **correct iff**, for each of the 16 (+D5) sites and a small set of
representative searchParams, the *inputs handed to the data fetchers* are
unchanged:

- `filteredJurisdictions` (deep-equal the array today's inline block produced),
- `allowedProvinces` (deep-equal),
- `adminSelectedProvince` / `adminSelectedLocality` where consumed,
- `localities` passed to `<JurisdictionSwitcher>` (deep-equal).

Because the primitive's body is the sites' block lifted verbatim (§1.1), these
must match by construction; the pins turn "must" into a red test if a site's
pre-existing drift (D1–D4) meant its inline block differed. That is the point:
the pins **surface** any site whose block was not actually canonical, forcing a
conscious reconciliation rather than a silent behavior change.

A light Playwright evidence pass against `:3000` (one govt account scoped to a
province, one admin) confirms the switcher options and the rendered numbers are
unchanged for a couple of representative pages — parity theater for the fence,
same as panorama's evidence pass.

---

## 4. Fence-review gate (the sacred part — BEFORE any migration lands)

An explicit adversarial fence review of the primitive, run with fresh context,
gating the first migration commit. The reviewer must confirm — with the code in
front of them, not from this doc:

1. **Existence-oracle parity.** For every `(role, jurisdictions, params)` the new
   `filteredJurisdictions` is deep-equal to the retired inline block's output. No
   row a govt could not see before becomes visible; no row they could see
   disappears. (The §3 pins are the evidence; the reviewer re-derives a couple by
   hand.)
2. **Server-side re-derivation, never trusting the client.** `params.province` /
   `params.locality` are re-resolved server-side through `provinceByCode` /
   `localityByName` on every request; the client's selection is an *input to
   resolution*, never a trusted scope. A crafted `?province=&locality=` cannot
   widen because B4/B5 intersect against the server-held assignment set.
3. **No weakening of subsumption.** The narrowing still ONLY intersects down
   (delegated to `resolveScopedJurisdictions`, whose "cannot widen" test stays
   green). The admin drill (B7) stays gated on `role === "admin"` and additive —
   never a govt path.
4. **Fail-closed on null/invalid.** B6 (lone locality) and B8 (bad ISO) degrade to
   "no narrowing within the fenced set", proven never to fail open.
5. **allowedProvinces cannot leak.** Derived from the operator's own assignments
   (or the static 24 for admin) — never from an attacker-influenced value.

Gate rule: the fence review is a **required, blocking** review of the primitive in
isolation, before the first call site is migrated. If it finds any parity gap, the
primitive changes and the review re-runs. Only then does §5 begin.

---

## 5. Migration inventory (tickable — one call site at a time)

Each item: **replace the inline block with a single
`const scope = await resolveJurisdictionScope({ role: profile.role, jurisdictions, params: { province: sp.province, locality: sp.locality } })`** and destructure the
subset the site consumes (§1.2). Net GREEN after every commit.

### Group A — standard gob pages (11)
- [ ] `app/gob/poblacion/page.tsx:93-127` (if/else form)
- [ ] `app/gob/censo/page.tsx:~87-114` (if/else)
- [ ] `app/gob/vigilancia/page.tsx:64-101` (if/else; keeps its own `trailing30d` period default — orthogonal, untouched)
- [ ] `app/gob/analytics/page.tsx:81-108` (if/else)
- [ ] `app/gob/adopciones/page.tsx` (if/else)
- [ ] `app/gob/campanas/page.tsx` (if/else)
- [ ] `app/gob/mortalidad/page.tsx` (if/else)
- [ ] `app/gob/vigilancia/brotes/page.tsx:64-101` (if/else)
- [ ] `app/gob/page.tsx` (gob home; if/else)
- [ ] `app/gob/programa/page.tsx:127-153` — **D1 drift: ternary spelling.** Reconcile to primitive.
- [ ] `app/gob/sistema/page.tsx:67-98` — **D1 drift: ternary spelling.** Reconcile to primitive.

### Group B — admin-drill page (1)
- [ ] `app/gob/maltrato/page.tsx:89-137` — also consumes `adminSelectedProvince`/`adminSelectedLocality` (D3). Verify `buildMaltratoListConditions` still receives identical names.

### Group C — export routes (4)
- [ ] `app/gob/poblacion/export/route.ts:59-76` (ternary; reads `searchParams.get()`, consumes `filteredJurisdictions` only)
- [ ] `app/gob/censo/export/route.ts:52-71` (ternary)
- [ ] `app/gob/campanas/export/route.ts`
- [ ] `app/gob/adopciones/export/route.ts`

> Export routes read from `new URL(request.url).searchParams` rather than an
> awaited `sp` object; the primitive's `params` argument is source-shape-agnostic
> (`{province, locality}`), so both page and route callers converge on it.

### Group D — variant / newly-found (2, review individually)
- [ ] `app/gob/analytics/export/page.tsx:79-134` — **D5**: 17th site, same block, export-as-page.
- [ ] `app/gob/perdidas/page.tsx:87-148` — **D4 VARIANT**: consumes
  `localities`/`allowedProvinces`/`selectedProvince`/admin-drill only; keeps its
  "fetchers scope internally" flow. Do NOT introduce a `filteredJurisdictions`
  narrowing it never had.

### Explicitly NOT migrated
- `app/gob/outreach/export/route.ts` — **D6**: different scoping path, not this pattern.
- `app/gob/panorama/page.tsx` — panorama's scope is ViewState territory (task #50);
  disjoint (§8).

---

## 6. How this unblocks the siblings (FOLLOW-UPS — not this doc's migration)

Naming the adjacencies so they land IN the structure later, not beside it. Neither
is in scope for this change.

### 6.a Converging the two incompatible switchers
Two switcher components disagree on their wire contract:
- `components/gob/JurisdictionSwitcher.tsx` keys by **ISO code** (`province="AR-B"`,
  locality **slug**), commits via full-document navigation.
- `components/JurisdictionFilter.tsx` keys by **display NAME** (`province="Buenos
  Aires"`, locality **name**), a typeahead over ~4000 localities.

A single server-side scope primitive that ingests *either* representation (ISO+slug
or name+name) and resolves both to canonical names gives these two a shared server
contract to converge onto. **Scope that convergence as a FOLLOW-UP** once every page
reads scope from the primitive — the wire-contract unification is a client concern
riding on top of this server seam, not part of it.

### 6.b Choropleth aggregation (task #51)
The `(rows, level) → choropleth` re-derivation is scattered per screen
(`gob/poblacion:203`, `censo:184`, `perdidas` aggregate helpers, `vigilancia`
sub-region rollups). That is the **same class of smell** (a projection re-derived
N times) but a **different projection** than jurisdiction scope. A
`toChoroplethData(rows, level)` sibling primitive is the right fix — as a
**separate follow-up**. Noted here only so the relationship is on record; this
change does not touch it.

---

## 7. Explicit non-goals (anti-over-abstraction)

Good architecture is knowing what NOT to DRY. This change deliberately does **not**
consolidate:

- **The three History-nav helpers** (`lib/ui/sheet-nav.ts`,
  `map-layer-nav.ts`, `inspector-nav.ts`). Rule-of-three: they share a *silhouette*,
  not a lifetime — each has its own module lifecycle and evolves independently.
  Consolidating three at their second point of similarity is premature. Wait for a
  genuine 4th consumer that forces the shared shape.
- **Per-screen enum parse/validate boilerplate** (`parseQueue`, `parseKind`,
  `parseSeverity`, `parseStatus` in maltrato, etc.). At most a cheap, optional
  `parseEnumParam(value, allowed, default)` helper — a one-liner convenience, NOT
  part of this fence work and NOT a blocker. It carries no security weight (a bad
  enum value degrades to a default filter, never a scope widening), so it stays out
  of the fence primitive entirely.

The fence primitive earns its consolidation because it is (a) copied 16×, (b)
security-critical, and (c) already half-extracted with a proven core. The items
above meet none of those three tests.

---

## 8. Sequencing & parallel-writer isolation

- **Runs AFTER panorama ViewState P1b lands.** No dependency, but serialize to
  keep the integration merge gate clean.
- **Disjoint file territory.** This change touches `app/gob/**` +
  `lib/analytics/jurisdiction-scope.ts` + `lib/infra/gov-scope.ts` (extending the
  existing helper's tests). Panorama's territory is `src/modules/panorama/**`.
  `app/gob/panorama/page.tsx` is explicitly excluded (§5), so there is **zero file
  overlap**.
- **Parallel-writer eligible.** Because territory is disjoint, this can run as a
  parallel writer in its **own git worktree**, landing through the serial
  integration merge gate with a full `pnpm verify` + the §3 parity pins. Local
  Supabase is shared, so the characterization net stays unit-first (stubbed DB
  reads) to avoid cross-writer DB contention.
- **Work-unit commits.** One commit for the primitive + its net + the fence review
  (§4), then one commit per migration group (A/B/C/D) so a later split remains
  possible even though the project default is `single-pr` with `size:exception`.

---

## 9. Summary for the PO

- **One new function**, `resolveJurisdictionScope(...)`, beside the already-shared
  period resolver. It is the jurisdiction half of `filters` that never got shared.
- It **completes an extraction that was started and abandoned** — the fence core
  (`resolveScopedJurisdictions`) already exists and is tested; we wrap it and route
  16 (really 17) sites through the wrapper, deleting 16 hand-copies of the plumbing.
- **10 fence branches** unified in one auditable place (§2).
- **Six drift findings already present** (§2.1) — none a live leak, all latent risk
  the consolidation removes.
- A **blocking fence review** of the primitive gates the first migration (§4).
- Nothing here changes what any operator can see; it changes *where the fence is
  decided* — from 16 places to one.
