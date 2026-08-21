# `/api/v1` invariants

**Status:** active · written 2026-08-21 · gates Track 2 (B8) · **all four open decisions closed 2026-08-21**

Every claim in the "Verified today" column was read out of the code on
`integration/all-20260703 @ 9abbfb5f`, not copied from a review document. Where
this file disagrees with `docs/reviews/native-readiness/RN-1-api-boundary.md`,
this file is newer and says so explicitly — the review is a historical record of
what was true on 2026-08-19 and is not edited.

This is a **checklist that gates a merge**, not background reading. A `/api/v1`
route handler that cannot point at each line below is not ready.

---

## 0. Why this document exists before the first endpoint

The web app enforces these properties **per call site**, in page bodies. Nothing
in `middleware.ts` rate-limits, and nothing about being a route handler makes
any of them apply. A native client is a second consumer of the same data through
a surface that inherits almost none of the web's accidental protections.

Two of the three fences that would catch a mistake here **do not look at route
handlers at all** (§7). That, more than any individual limit, is the reason a
checklist has to exist before the first merge rather than after the first bug.

---

## 1. The five oracles

### 1.1 Public token read throttle

| | |
|---|---|
| **Enforced at** | `lib/infra/public-token-throttle.ts:63,89` — `isPublicTokenReadThrottled(bucket)` |
| **Real limits** | `PUBLIC_TOKEN_READ_LIMIT = { maxPerMinute: 60, maxPerHour: 400 }`, per IP |
| **Direction** | **Fail-open.** A `RateLimitError` throttles; any other error returns `false`. The limiter is itself a DB write, budgeted at `RATE_LIMIT_BUDGET_MS = 1500` |
| **Inherited?** | **No.** First statement of each surface, by hand |
| **Pinned by** | `__tests__/public-token-throttle-coverage.test.ts` — derives from `publicPetByToken(` call sites across `app/` (widened 2026-08-21; it used to walk `page.tsx` under one directory and could not see `opengraph-image.tsx`) |

**The bucket is per-surface, and that is deliberate.** Call sites pass distinct
names — `public_token_page`, `public_token_encontre`, `public_token_sighting`,
`public_token_og_image` — and the fence *requires* they differ. The stated
reason: a scraper hammering one surface must not spend the budget of the person
who just found a dog in the street and is loading its credential.

**The cost of that choice, stated plainly:** every new bucket raises the
aggregate ceiling for a single IP by 60/min. Four surfaces today = 240/min per
IP against the token space. **A `/api/v1/p/{token}` adds a fifth.**

> **DECIDED (§8, D1).** The API gets its OWN bucket,
> `public_token_api_credential` — a fifth, taking the aggregate per-IP ceiling
> to 300/min. The isolation is the point; the ceiling is the accepted price.

**The REST mistake:** omit the call. Nothing fails; the route ships green.

---

### 1.2 Atender lookup throttle

| | |
|---|---|
| **Enforced at** | `app/org/[orgToken]/atender/atender-access.ts:43,236` |
| **Real limits** | `{ maxPerMinute: 20, maxPerHour: 100 }`, keyed `${organizationId}:${ip}` |
| **Direction** | Fail-open |
| **Inherited?** | **Yes, if you go through the front door.** It lives *inside* `resolveAtenderPet`, so a handler calling that function gets it |
| **Pinned by** | **Nothing.** No test references `atender_lookup` or `ATENDER_LOOKUP_LIMIT` |

An authenticated DIM lookup is a national existence oracle. The 20/min is the
only thing bounding it.

**The REST mistake:** reach past `resolveAtenderPet` to the underlying query
"because the handler doesn't need the page's return shape".

**Adjacent, and worth a deliberate answer:** `app/api/gob/mascotas/[token]/route.ts`
is an existing handler that resolves a pet token bounded only by its guard's
aggregate `120/min` per profile, with no per-lookup limit. It is
jurisdiction-scoped and 404s uniformly, so it is a weaker oracle — but it is the
closest existing analogue to what Track 2 builds. **DECIDED (§8, D3): `/api/v1`
matches ATENDER, not this.** Which makes this route the odd one out; bringing it
in line is a follow-up, and it must not be cited as precedent for new routes.

---

### 1.3 Denuncia MAC anti-oracle

The best-defended property in this list. Two halves.

**Request-access** (`app/(public)/denuncias/codigo/[code]/actions.ts`): one
`NEUTRAL_MESSAGE` constant returned from a single place on every branch. Rate
limit `5/min + 20/hr` per IP, **fail-closed**. The timing channel is closed by
scheduling the mail through `after()` instead of awaiting it (`:124-130`), with
the reasoning written out at `:18-35`.

**Redemption** (`app/(public)/denuncias/seguimiento/entrar/route.ts:39-42`):
`10/min + 60/hr`. Success and failure are the *same 303 to the same URL*; the
only difference is whether a cookie is set. `validateReporterToken`
(`lib/infra/denuncia-reporter-token.ts:108-136`) uses `timingSafeEqual` behind a
length guard.

**Pinned by** `__tests__/denuncia-access-timing-oracle.test.ts` — 4 tests,
mocked, no DB. It asserts the *property* (the response resolves while the send
hangs; all four branches return an identical message), not a restated constant.

> **This is the model.** "A response-equality test per oracle" means a test
> shaped like this one, not a test that re-states a limit.

**The REST mistakes:** `404` for unknown vs `200` for found. A per-branch error
code. Any `await` of a send. A distinct `429` body — harmless today because
`THROTTLED_MESSAGE` is code-independent, and it must stay that way.

---

### 1.4 Chip and DNI

**DNI: still unthrottled.** `verify-dni.ts:126` says so in its own comment, and
the only caller adds nothing but `requireUserOrRedirect`. The mitigation is
message-collapse only — the unique-violation branch and the generic branch
return the *same* string (`:135-143`).

> **The one-line REST mistake:** return a distinct `dni_taken` code. That is the
> obvious REST instinct and it reopens the oracle immediately.

**Chip: two things, not one.** `lib/infra/chip-lookup.ts:27-30` —
`lookupByChip` is a pure DB lookup with **no auth and no limiter, by design**;
callers gate it. Exactly one caller does: `lookup-pet-for-denuncia.ts:46` at
`60/min + 200/hr` per IP, and when throttled it returns `{found:false}` — so
throttled is indistinguishable from not-found.

**The REST mistake:** call `lookupByChip` from a handler because it is the clean
framework-free function. That is an unthrottled national chip oracle in one
import.

---

### 1.5 Upload validation

`lib/infra/uploads.ts`. **Two of the three properties are universal; one is
not** — RN-1 lists all three as flat facts.

- **Magic bytes: universal.** `detectRasterMime` (`:27`) sniffs JPEG/PNG/WEBP
  signatures; `file.type` is explicitly never trusted (`:127-131`). `MAX_BYTES = 5MB`.
- **No SVG: universal**, by whitelist construction (`:9-13`).
- **sharp re-encode: BUCKET-CONDITIONAL.** `PUBLIC_REENCODE_BUCKETS = new Set(["pet-photos"])`
  (`:19`). Only that bucket always re-encodes, and it fails **closed** on a sharp
  error. Every other bucket re-encodes only if the caller passes
  `stripMetadata: true`, and on a sharp error falls back to **the original
  attacker-supplied bytes** (`:172-174`).

The storage key is derived from the validated MIME plus `randomUUID()`, never
the client filename (`:143-147`).

**The REST mistake, and RN-1 is right about it:** native uploading
direct-to-storage with a signed URL loses all three at once. No
`createSignedUploadUrl` exists anywhere today — every signed URL in the repo is
a *download*. Keep it that way, or replicate all three server-side first.

---

## 2. The response envelope — ratified, not invented

**A convention already exists** across the 34 handlers under `app/api/**`. Track 2
adopts it rather than inventing a shape the rest of the codebase does not speak.

```ts
// error
NextResponse.json({ error: "snake_case_code" }, { status })
// success — the bare payload, plus an explicit no-store
NextResponse.json(payload, { headers: { "cache-control": "no-store" } })
```

Codes in use today: `forbidden`, `unauthorized`, `not_found`, `rate_limited`,
`missing_province`, `unknown_layer`, and six `*_unavailable` degradation codes.

**Two existing deviations — do not copy either by accident:**

- `app/api/health/route.ts:71` returns `{ status: "rate_limited" }` — `status`,
  not `error`.
- `app/api/panorama/kpis/route.ts:114` merges the error key **into** the payload:
  `{ error: "panorama_kpis_unavailable", ...degradedPanoramaKpis() }` at 503.
  Read this one as a **prototype of the per-section degraded contract**, not as
  a mistake. It is the closest thing in the repo to what Track 2 needs.

**Guard shape to copy:** `app/api/gob/_guard.ts` and `app/api/panorama/_guard.ts`
are deliberate near-duplicate siblings returning
`{ok:true, actor} | {ok:false, response: NextResponse}`, both capping at
`120/min` keyed on `profile.id`. `lib/supabase/bearer.ts:77-80` already contains
the bearer variant's recipe.

**Correction to RN-1:** its improvement #2 says no bearer client exists. One
does — `lib/supabase/bearer.ts`, landed the same day as the review. It uses the
ANON key deliberately (`:24-27`). Do not re-do that work.

---

## 3. The error vocabulary — the real cost of wrapping use-cases

**No shared vocabulary exists to adopt, and three casings are already in play.**

| Source | Casing | Example |
|---|---|---|
| `packages/contract/src/input/intake.ts:108` | `SCREAMING_SNAKE` | `NAME_REQUIRED` |
| `lib/infra/live-user.ts:59` | `SCREAMING_SNAKE` | `NO_SESSION`, `ACCOUNT_ERASED` |
| `lib/infra/pet-access.ts:120` | `kebab-case` | `not-found-or-forbidden` |
| `app/api/**` | `lowercase_snake` | `not_found` |

And the one that actually hurts: **`UseCaseResult`'s failure arm is an untyped
`string`** — in all **ten** module copies (adoption, caretakers, decomiso,
events, foster, organizations, pets, surveillance, transfers, welfare).

```ts
// src/modules/events/application/types.ts:23-25
| { ok: false; error: string }
```

**Three different things travel in that one field**, with nothing in the type to
tell them apart:

| Shape | Example | Where |
|---|---|---|
| Spanish user-facing prose | `"No pudimos finalizar la adopción: …"` | most modules |
| `snake_case` codes | `not_found`, `report_not_found`, `untriaged` | `welfare`, `pets` |
| A raw `err.message` | whatever the driver threw | custody-disputes, auth |

An earlier draft of this document said "a Spanish user-facing string, in all
seven module copies". Both halves were wrong; the count was verified by
`rg 'export type UseCaseResult'` and the shapes by reading the returns. The
correction matters because it changes the remedy: this is not a translation
problem, it is a **missing discriminant**.

**The pattern to copy already exists in this repo.**
`src/modules/welfare/application/add-reporter-comment.ts:50` narrows the arm to
a typed union of codes:

```ts
| { ok: false; error: "forbidden" | "validation" | "no_case" | "report_not_found" | "db_error" }
```

That is the shape the other nine should converge on — it costs nothing at the
call site and it is the only version a native client can branch on.

Every write use-case returns prose a native app cannot branch on and cannot
translate. This is the single largest hidden cost in "just wrap the existing
use-cases in `/api/v1`", and it is invisible until the first write endpoint.

> **DECIDED (§8, D2).** `lowercase_snake`, in `packages/contract` — the casing
> all 34 existing handlers already emit, in the only place a native client can
> import from. The SCREAMING_SNAKE and kebab-case islands stay put; converting
> them is mechanical and must not gate the first endpoint.

---

## 4. `Cache-Control: no-store` is NOT inherited

```ts
// lib/infra/public-cache-policy.ts
const NO_STORE_PREFIXES = ["/p/", "/libreta/compartir/", "/adoptar", "/casos/",
                           "/denuncias/codigo/", "/denuncias/seguimiento"];
```

`middleware.ts:227-229` stamps no-store when the pathname matches. **`/api/v1/...`
matches nothing in that list.**

The privacy class this closed on 2026-07-07 was real: a revoked share and a
found pet were being served stale from the CDN at the exact shared URL. A JSON
endpoint reopens it unless it sets the header per-response, which is what the
gob and panorama handlers already do by hand.

**Checklist line:** every `/api/v1` response that carries pet, case, denuncia or
share data sets `cache-control: no-store` explicitly. Do not rely on the prefix
list, and do not add `/api/` to it without deciding what that means for the
cacheable reads a native client would actually benefit from.

---

## 5. Per-section degraded contract

The point of Track 2, not a refinement of it.

Today a hung query fails soft into a blank section. A human reading a web page
correctly reads that as "something is missing". **A native client rendering the
same blank JSON presents it as a valid credential with no findings** — no
vaccines, no incidents, nothing to worry about.

Every section of a `/api/v1` read therefore reports its own state. A section
that could not be loaded says so; it never renders as empty. The existing
`degradedPanoramaKpis()` pattern (§2) is the working precedent.

The credential loader already has the shape for this: `<DegradedCredentialCard>`
exists at `app/(public)/p/[publicToken]/page.tsx:255,274-282`.

---

## 6. Envelope metadata

`payloadVersion`, `issuedAt`, `staleAfter` on every read, per TRACKS.md. These
are what let a native client cache honestly and what let the credential say
"this is what the server knew at 14:32" instead of implying live truth — which
matters directly for the offline decision (show without signature, say plainly
that it cannot be verified offline).

---

## 7. What a new route handler inherits — the honest table

| Mechanism | Inherited? |
|---|---|
| `middleware.ts` → `updateSession` + CSP | **Yes** — the matcher excludes only static assets |
| `scripts/check-api-guard-headers.ts` | **Yes** — derives header names from `middleware.ts` and scans every route handler (widened 2026-08-21) |
| `Cache-Control: no-store` | **No** — path-prefix allowlist |
| `scripts/check-authz-guards.ts` | **Yes** — its coverage rule scans every `app/**/route.ts` (widened 2026-08-21, D4): each exported handler calls a guard, or carries a `@no-auth-required: <reason>` |
| `public-token-throttle-coverage` | **Only via `publicPetByToken`** — a handler that resolves a token another way is invisible to it |
| Any rate limit | **No** — every one is a per-call-site `enforceRateLimit()` |

**Both structural gaps on this list are now closed** (`check-api-guard-headers`
and `check-authz-guards`, same day). What a `/api/v1` handler still does NOT
inherit is a rate limit and `no-store` — both remain per-call-site, and §9 is
where they are checked.

Two things about the authz coverage rule a new handler should know. Cron-secret
checks (`authorizeCronRequest` / `checkCronSecret`) count as authorization for a
**route handler only**, never for a server action — proving a trusted scheduler
called you leaves "who is acting" unasked, and an action is reached from a
logged-in browser. And the rule reads `export async function GET(…)`: every
other export shape is *reported*, not skipped — a shape that still names a
method (`export const GET = withX(handler)`, `export { handler as POST }`, a
non-async `export function DELETE(`) as an unreadable export shape, and a shape
that names none (`export const { GET, POST } = handlers`, `export * from
"./impl"`) as a file that yields no readable HTTP method at all. The second half
was added 2026-08-21 after a review measured that both nameless shapes produced
zero functions, zero offenders, and a file reported as authorized.

**What that claim does and does not cover.** No *export shape* can make a
handler invisible to the fence — that is the precise version of the statement.
It is not a claim that a handler can never pass unauthorized: the analysis is
regex-based and `scripts/lib/strip-comments.mjs` deliberately KEEPS string and
template-literal contents (a token inside a string can be real emitted markup,
so blanking them would blind the sibling fences to genuine violations). A
handler whose body merely contains the text `requireUser(` inside a string
literal therefore counts as guarded. That is a stated blind spot — the linter's
own header says so — with zero occurrences today, and it is the one remaining
way past the coverage rule.

---

## 8. Open decisions

**All four are now decided.** Two were the PO's (D1, D3 — taken 2026-08-21,
both the recommended option); two were engineering calls made here and recorded
so they are visible rather than silent (D2, D4). Nothing in this document is
waiting on anyone.

Each entry keeps its counter-argument. A decision whose downside was never
written down is one nobody can revisit on purpose.

### D1 — throttle bucket for `/api/v1/p/{token}` · **DECIDED 2026-08-21 (PO)**

**Its own bucket: `public_token_api_credential`.**

It follows the rule already in force and its stated reason — a client hammering
the API must not starve the person loading the credential in the street. The
additive ceiling (240 → 300/min per IP across all token-resolving surfaces) is
the price of that isolation, and it is already being paid four times over.

**The counter-argument was put to the PO and knowingly declined:** at some
number of surfaces "60 per surface" stops being a limit. If the aggregate ever
matters more than the isolation, the fix is NOT a shared bucket — it is a
second, aggregate limiter keyed per IP across all token reads, layered on top.
That remains available as a separate change and must not be smuggled into an
endpoint.

**What this obliges:** the new bucket name goes in the coverage fence's expected
set like the other four, and §9's checklist line "bucket named" is satisfied by
`public_token_api_credential`, nothing else.

### D2 — error-code casing and home · **engineering, decided**

**Decided: `lowercase_snake`, in `packages/contract`.** Reasons: it is what all
34 existing handlers already emit, so `/api/v1` is consistent with the surface a
native app also talks to; and `packages/contract` is the only place a native
client can import from. The `SCREAMING_SNAKE` and `kebab-case` islands stay
where they are — converting them is a separate, mechanical change that should
not gate the first endpoint.

**The real work this exposes is not the casing** — it is that `UseCaseResult`'s
failure arm is Spanish prose (§3). That needs its own change, and the first
`/api/v1` **write** endpoint is blocked on it. Reads are not.

### D3 — which limit `/api/v1` matches · **DECIDED 2026-08-21 (PO)**

**Per-lookup, atender-style.** Not `gob/mascotas`'s aggregate-only `120/min`
per profile.

An aggregate-only limit bounds how fast one account works, not how much of the
national token space it can enumerate — and enumeration is the threat the whole
oracle list (§1) exists for. An account can walk the padrón slowly and hit no
ceiling at all.

**The accepted cost:** a legitimate high-volume integrator will hit it. That is
a conversation about issuing them a scoped credential, which is a better
conversation to have than an unbounded default — and it is a conversation that
only happens if the limit exists.

**What this obliges:** `/api/v1` credential reads carry a per-resolution
limiter, not only the guard's aggregate cap. It also makes
`app/api/gob/mascotas/[token]/route.ts` the odd one out — it resolves a pet
token under the aggregate cap alone (§1.2). Bringing it in line is a follow-up,
not a blocker, but it should not be cited as precedent for new routes.

### D4 — `check-authz-guards.ts` over `app/api/**` · **LANDED 2026-08-21**

**Decided: before the first endpoint.** Widening a fence over an empty
directory is free; widening it over a directory that already has routes means
auditing each one by hand first. The same widening over
`check-api-guard-headers.ts` on 2026-08-21 surfaced five call sites the moment
it ran — all benign, but each needed reading. Doing that once, at zero, is the
cheap moment.

**Landed 2026-08-21**: the coverage rule now scans all 47 `app/**/route.ts`
handlers (`listRouteHandlerFiles`, floor `MIN_ROUTE_HANDLER_FILES = 40`); 41
authorize, 6 carry a written `@no-auth-required` reason (`/api/health`, the two
`denuncias/seguimiento` endpoints, the open-data download, and both auth
callbacks).

---

## 9. Merge checklist

A `/api/v1` route handler is not ready until every line has an answer.

- [ ] Rate-limited, with the bucket named and the direction (open/closed) stated.
- [ ] `cache-control: no-store` set explicitly if it carries pet, case, denuncia or share data.
- [ ] Errors use the `{ error: "snake_case" }` envelope and a code from the agreed vocabulary.
- [ ] Every section reports its own availability; nothing degrades to a silent empty.
- [ ] `payloadVersion` / `issuedAt` / `staleAfter` present on reads.
- [ ] Success and failure are indistinguishable wherever an oracle exists (§1.3 is the reference test shape).
- [ ] If it resolves a public token, `publicPetByToken` is the door — so the coverage fence can see it.
- [ ] If it resolves a chip or a DNI, it carries its own limiter; `lookupByChip` and `verifyDni` bring none.
- [ ] If it accepts an upload, it goes through `lib/infra/uploads.ts`. No signed upload URLs.
- [ ] A response-equality test exists for each oracle the route touches.

---

## Provenance and known drift

Verified against code on 2026-08-21. Two numbers in the planning docs have
drifted and are not worth editing there, but should not be trusted:

- `TRACKS.md:222` says `p/[publicToken]/page.tsx` is 1,423 lines. It is **1,452**.
  `RN-1` says 1,450 in one place and 1,423 in another.
- `RN-1:8` says 33 route handlers under `app/api/**`. There are **34** (25 of
  them crons), and 47 across all of `app/`.

One thing could not be verified from the repo and needs a staging probe: whether
Next serves `/p/{token}/opengraph-image` as a fully dynamic per-request render in
production. It is DB-backed with a dynamic param and middleware stamps no-store
on it via the `/p/` prefix, so it should be — but "should be" is not a
measurement.
