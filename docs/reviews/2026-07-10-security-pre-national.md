# Security review — pre-national deployment (DIM / MiMAR)

- **Date:** 2026-07-10
- **Branch:** `integration/all-20260703`
- **Scope:** Read-mostly defensive review ahead of national government rollout. Focus areas: public anonymous surfaces, the new Panorama cross-request cache, authz on routes touched this week, secrets/config, DoS-shaped param abuse. Leverages (does not re-derive) the existing `check-authz-*`, `check-rls-coverage`, and `__tests__/rls` matrices — targets what those do NOT cover: rate limiting, enumeration, upload handling, cache poisoning, param-driven DoS.
- **Reviewer:** automated pre-national sweep.

## Executive verdict — what MUST be fixed before national deployment

Overall posture is **strong**. Auth gating, scope narrowing, RLS, PII disclosure gating, upload hardening, and secrets hygiene are all in good shape. No CRITICAL or HIGH issue was found that blocks deployment. The shortlist below is ordered by priority.

1. **(FIXED in this commit — was MED)** `/denuncias/codigo/[code]` public receipt had no rate limit while every sibling public surface did. Now guarded per-IP (`denuncia_receipt`, 30/min · 200/hr).
2. **(MED — report only)** Authenticated Panorama layer/KPI fan-out has no per-operator request-rate cap. An institutional operator (or a stolen institutional session) can fan out many distinct-key heavy queries against a 2-connection analytics pool. Bounded per-query by the 8s/20s DB budgets, but not bounded in aggregate. Recommend a per-user request cap on `/api/panorama/*` before national load.
3. **(LOW — report only)** Reference-code entropy (~40 bits) is the sole barrier on the receipt page; acceptable, but a `rate_limit_buckets` cleanup lag or a future entropy reduction would erode it. Keep the new rate limit; consider structured audit logging of receipt reads at national scale.

Everything else below is defense-in-depth or informational.

---

## Findings (ranked)

### MED-1 — `/denuncias/codigo/[code]` receipt page had no rate limit *(FIXED this commit)*

- **File:** `app/(public)/denuncias/codigo/[code]/page.tsx`
- **Class:** Missing rate limit on a PII-disclosing public read / DoS-shaped surface.
- **Detail:** The receipt renders the full welfare report to any holder of a `DEN-XXXX-XXXX` code: `description` (free text, may name the denounced party), approximate location + coarse map, masked contact, and **evidence attachments via freshly-minted signed URLs**. Unlike `/p/[publicToken]` (60/min · 400/hr), the denuncia lookup (`denuncia_lookup` 60/min · 200/hr), and the sighting/finder actions (per-token 1/min · 10/hr), this page issued DB queries + signed-URL generation on every request with **no per-IP limit**.
- **Attack scenario:** An attacker script hammers the path — either to brute-scrape codes (impractical at ~31^8 ≈ 40 bits, but unbounded) or simply to burn DB queries and signed-URL generation as a cheap amplification/DoS vector, since each valid-format request costs ≥1 indexed query and N storage-signing round-trips.
- **Entropy note:** `generateReferenceCode` uses rejection-sampled Web Crypto over a 31-char unambiguous alphabet, 8 chars → ~8.5e11 combinations. Blind enumeration of a single target is not realistic; the real gap is defense-in-depth + amplification, not a confidentiality break.
- **Fix applied:** Added `enforceRateLimit("denuncia_receipt", ip, { maxPerMinute: 30, maxPerHour: 200 })` before any data fetch, mirroring the `/p/[publicToken]` guard, with a soft `ReceiptThrottleNotice` (not a hard error) so a legitimate reporter is never locked out. Test: `__tests__/denuncia-receipt-rate-limit.test.ts`.

### MED-2 — Authenticated Panorama fan-out has no aggregate request-rate cap *(report only)*

- **Files:** `app/api/panorama/[layer]/route.ts`, `app/api/panorama/kpis/route.ts`, `app/api/panorama/unit-history/route.ts`; pool sizing in `src/modules/panorama/application/db-budget.ts` + analytics pool (max 2).
- **Class:** Authenticated, param-driven DoS.
- **Detail:** Each route auth-gates correctly (see "verified strong" below) and caps individual queries with `withDbBudget` (8s layer/unit-history, 20s KPIs) and `PER_LAYER_CAP=2000` + k-anon inside the loaders. But the **cache key varies on many attacker-controllable dimensions** (`level`, `asOf` bucket, `basis`, `verified`, custom `from`/`to`, province/locality drill). An operator can deliberately vary those to force cache **misses** and fan out many concurrent heavy fan-outs against a 2-connection analytics pool.
- **Attack scenario:** A single authenticated institutional account (or a compromised session) issues a burst of distinct-key `/api/panorama/[layer]?...` requests with rolling `asOf`/`from`/`to`/`level` values. Each misses the Data Cache and enqueues an ~3–11s fan-out; the analytics pool (max 2) saturates, degrading the console for every operator. The per-query budget prevents a single stuck query but not aggregate saturation.
- **Why not higher:** Requires a valid ACTIVE INSTITUTIONAL admin/govt account (personal-account admins, deactivated, and erased accounts are already rejected by `_guard.ts`). Blast radius is degraded analytics (honest "no pudimos cargar" degraded strip), not data disclosure.
- **Recommendation:** Add a per-user (profile id) request-rate cap on `/api/panorama/*` (e.g. `enforceRateLimit("panorama_api", profile.id, {...})`) using the same `rate_limit_buckets` limiter. Cheap, reuses existing infra, and closes the aggregate-saturation gap at national concurrency.

### LOW-1 — `createAdminClient` doc comment is stale *(report only, no vuln)*

- **File:** `lib/supabase/admin.ts:6` — "ONLY import this module from `app/actions/admin-institutional.ts`."
- **Detail:** The comment is out of date: the anonymous sighting (`report-pet-sighting.ts`) and finder (`encontre/action.ts`) flows legitimately import `createAdminClient` to bypass RLS for anonymous evidence uploads. `import "server-only"` correctly prevents any client-bundle leak, and `SUPABASE_SERVICE_ROLE_KEY` is read from a non-`NEXT_PUBLIC` env var. No security impact — just a misleading invariant that could cause a future reviewer to "fix" the wrong thing. Recommend updating the comment to reflect the real allowlist.

### LOW-2 — EXIF strip fallback stores original bytes on failure *(informational)*

- **File:** `lib/infra/welfare-uploads.ts:97-106` (and the sighting/finder equivalents via `uploadAttachmentIfPresent`).
- **Detail:** If `sharp` throws (corrupt/unsupported raster, or HEIC/HEIF/GIF which are intentionally excluded from `STRIP_EXIF_MIME`), the upload falls back to the **original bytes including GPS EXIF**. This is a deliberate availability-over-minimisation trade-off ("we'd rather store metadata than fail the whole denuncia"), documented in-code. For an anonymous denuncia the reporter's home GPS could theoretically survive in a HEIC upload's metadata, readable by an operator with a signed URL (never the public). Acceptable for v1; flag for the data-protection review whether HEIC/HEIF should be transcoded or rejected rather than passed through, since iPhone photos default to HEIC.

---

## Verified strong (no action needed)

- **Panorama cache is NOT poisonable across scopes.** `layerCacheKey` / `kpiCacheKey` compose the **full authorization scope** (role, sorted+normalized jurisdictions, layer, level, since/asOf bucket, basis, admin drill-down, verified). The ` ` field separator can't appear in a province/locality name, so distinct pairs never alias. `role=` in the key prevents any govt↔admin collision even when both narrow to empty jurisdictions. Two entries can only be shared when the full authz scope is identical — which is correct (jurisdiction-scoped, not user-scoped, data). Auth + scope narrowing happen **before** key composition at every call site. Degraded/budget-timeout results are never cached (sentinel-throw + `shouldCache` predicate + budget-outside-cache). Scope-isolation unit tests pin all of this.
- **Panorama route authz.** All three routes call `resolveInstitutionalPanoramaActor()` (`app/api/panorama/_guard.ts`) which enforces the full page-guard invariant set: authenticated + not-erased (`deletedAt`) + role ∈ {admin,govt} + `accountType==='institutional'` + not-deactivated. Layer id validated via `isLayerId` (arbitrary `layer` → 404). `asOf` clamped to `[since, until]`; `basis`/`level`/`verified` can only pick between safe modes; `narrowGovtScope` intersects (never widens) govt scope; `adminProvince/Locality` only ever set for role `admin`. `unit-history` adds a second-fence `jurisdictionScopeContains` govt check (403 on out-of-scope).
- **`/p/[publicToken]` PII gating is server-enforced at the query level.** Phone/email/location are **fetched only when the `disclose_*_when_lost` flag is set** (SQL projects `null` otherwise) — not fetched-then-redacted. Rate-limited (60/min · 400/hr) before any data touch. Active pets expose zero owner PII. Email via admin API only when opted in.
- **Anonymous write surfaces are hardened.** `createWelfareReportAction` rate-limits anon (1/min · 3/hr, IP) and auth (10/hr, user id), plus honeypot + dwell-time. Sighting/finder actions rate-limit per (IP, publicToken), cap input lengths, strip EXIF, enforce anonymity (`recordedByUserId=null`), and use Zod payload validation + idempotency guards. `callerIp` correctly takes the **last** XFF segment / `x-real-ip` (not the spoofable first segment).
- **Upload handling.** `welfare-uploads.ts`: MAX_FILES=5, MAX_FILE_BYTES=25MB, MIME allowlist, randomized storage paths under the report id, `upsert:false`, rollback on partial failure, EXIF strip for JPEG/PNG/WebP. Evidence bucket is private (served only via short-lived signed URLs).
- **Enumeration resistance on the lookup.** `lookupPetForDenuncia` rate-limits (60/min · 200/hr), returns only `{found, petName, petStatus, ownerInitials}` (never the owner record), requires an exact 15-digit chip or `DIM-XXXX-XXXX` token shape (no fuzzy matching), and gates ownership resolution on the effective reporter id.
- **Headers & CSP.** `next.config.ts` sets X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, HSTS (2yr + preload), Permissions-Policy. `middleware.ts` ships an **enforcing** (line 193) per-request nonce CSP: `default-src 'self'`, `script-src 'self' 'nonce' 'strict-dynamic'` (no unsafe-inline/eval), `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`. Privacy-sensitive public routes get `Cache-Control: no-store` via `isPublicNoStoreRoute`.
- **Secrets/config.** No `.env` tracked (only `.env.local.example`); `.mcp.json` (untracked) holds only a Playwright launcher, no secrets. No `NEXT_PUBLIC_*` service/secret/role key anywhere. `createAdminClient` is `server-only` and reads `SUPABASE_SERVICE_ROLE_KEY` from server env. `emailRateLimitKey` hashes emails (SHA-256, no cleartext PII) before writing to `rate_limit_buckets`.
- **Rate-limiter is DB-backed & cross-worker.** `enforceRateLimit` uses an atomic UPSERT (`ON CONFLICT DO UPDATE count+1`) into `rate_limit_buckets` with windowed keys; the former per-worker in-memory limiter was removed (not cold-start-safe). Bounded cleanup batches avoid lock storms.

## Notes / conventions

- The known cosmetic CSP chunk violation was explicitly out of scope and not re-reported.
- No changes were made to any Panorama file, auth guard, or upload handler — those were audited read-only and found sound.
