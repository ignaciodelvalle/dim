Re-audit complete — written to `docs/reviews/results/25-public-surface-abuse-rerun.md`.

**Verdict: 2 of 6 findings fixed. Both HIGHs closed; 4 MEDs remain open, unchanged.**

**Fixed:**
1. `logScanAction` (scan forgery, was HIGH) — now has a per-`(token,ip)` abuse cap (10/min, 60/hr) plus a 1/min dedupe window, both gated before the DB insert, using the spoof-resistant `callerIp()` resolver. Tests pass (14/14).
2. `/libreta/compartir/[shareToken]` (was HIGH) — per-IP rate limit (30/min, 200/hr) now runs before the share-token lookup, tighter than its `/p` sibling since the payload is more sensitive.

**Still open (all MED, unchanged from the original audit):**
3. `logLibretaShareViewAction` telemetry action — no rate limit, still directly invocable.
4. `/casos/[publicCode]` — the multi-join case query has zero throttling.
5. `/denuncias/codigo/[code]` — code lookup has zero throttling (data returned is still properly minimized, just the read path is free to hammer).
6. All three anonymous write actions (sighting, found-notify, finder-in-possession) are still keyed `(endpoint:token, ip)` only — no IP-less global cap was added, so a distributed/rotating-IP caller can still flood a single lost pet's owner past any single-IP ceiling.

**Axes 1 and 3 re-verified clean, no regressions:**
- Non-enumerability: token generator untouched, still 31^8-keyspace, no sequential/internal-id leaks.
- Data minimization: re-checked the three previously-clean surfaces plus the new `credential-badges.ts` surface (added by an unrelated event-sourcing fix in this same remediation round) — its Tier-2 derivations are still properly gated behind `if (tier2Active)` at the query level, not fetch-then-hide.

The 3 remaining lookup-throttle gaps (#3–#5) are one-line additions of the exact pattern already proven correct in #1/#2. #6 needs a second, IP-less, token-only bucket added alongside the existing per-IP bucket in the three write actions.
d write) via `storedCoords` check.

Verified: `callerIp()` uses the spoof-resistant `x-real-ip` / last-`x-forwarded-for`-hop resolution (`lib/infra/rate-limit.ts:57-75`), so the gate isn't trivially bypassed by a forged header. Tests (`__tests__/scan-log-rate-limit.test.ts`, `__tests__/log-scan-location.test.ts`) pass — 14/14.

### FIXED — #2 `/libreta/compartir/[shareToken]` (was HIGH)

`app/libreta/compartir/[shareToken]/page.tsx:66-74` (commit `d7f6add2`). Per-IP `enforceRateLimit("libreta_share_page", ip, {maxPerMinute: 30, maxPerHour: 200})` runs **before** the `libretaShareTokens` lookup — correctly ordered so no row is read pre-throttle. Tighter than `/p/[publicToken]`'s cap (60/min, 400/hr), matching the higher sensitivity of the payload. Soft `ThrottleNotice` on breach (no information leak, no hard error). Good.

### STILL OPEN — #3 `logLibretaShareViewAction` (telemetry write, was MED)

`app/actions/libreta-share.ts:100-105` → `src/modules/pets/application/libreta-share/log-libreta-share-view.ts:15`. No `enforceRateLimit` call anywhere in either file. `ViewLogger.tsx` fires this on every mount of the now rate-limited page (#2), so the *page* read is throttled but this *action* (invoked client-side from within an already-loaded page, independently callable) is not. Lower severity than before #2 landed since an attacker must first get past the page's 30/min cap to have a live render to call it from — but it's still directly invocable as a server action without going through the page at all. **MED, unchanged.**

### STILL OPEN — #4 `/casos/[publicCode]`

`lib/infra/case-queries.ts:191` (`getCaseDetailByPublicCode`), called unconditionally at `components/casos/CaseDetailView.tsx:53`, before any auth/role resolution. No `enforceRateLimit` in either file. Confirmed via grep — zero matches for `enforceRateLimit` in `CaseDetailView.tsx`. Existence-leak protection (`notFound()`) is still intact, but the multi-join query remains a free, unthrottled DB-cost lever. **MED, unchanged.**

### STILL OPEN — #5 `/denuncias/codigo/[code]`

`app/(public)/denuncias/codigo/[code]/page.tsx` — no `enforceRateLimit` import or call anywhere in the file (confirmed by full read). Data minimization on this route is still correct (masked contact, coarsened location — see axis 3), but the code-lookup read path itself remains unthrottled. **MED, unchanged.**

### STILL OPEN — #6 anonymous write actions: per-IP only, no per-token global cap

Re-checked all three:
- `src/modules/pets/application/sighting/report-pet-sighting.ts:61-63` — `enforceRateLimit(\`sighting:${publicToken}\`, ip, {maxPerMinute: 1, maxPerHour: 10})`
- `src/modules/pets/application/public/notify-owner-of-found-pet.ts:43` — `enforceRateLimit(\`found_notify:${publicToken}\`, ip, ...)`
- `app/(public)/p/[publicToken]/encontre/action.ts:53` — `enforceRateLimit(\`finder_possession:${publicToken}\`, ip, ...)`

All three buckets are still keyed `(endpoint:publicToken, ip)` — identical shape to the original finding. No second, IP-less, token-only global bucket was added. A distributed caller (rotating IPs) can still flood a single lost pet's owner past any single-IP ceiling. **MED, unchanged.**

## Axis 3 — Data minimization: CLEAN (re-verified, including new surface area)

Re-verified the three previously-clean surfaces are still clean (`/p/[publicToken]` phone/location null-at-query-level, `/perdidas` split-query pattern, `/denuncias/codigo` masked contact + coarsened location, `/casos/[publicCode]` notes/identity hidden from anon).

New surface area since the original audit — `app/(public)/p/[publicToken]/credential-badges.ts` (commit `e7c18147`, unrelated remediation for an event-sourcing correctness bug, not this audit) — was checked for a data-minimization regression since it threads more clinical event data through the public page. Verified clean: `countActiveVaccineNames` / `deriveActiveMedications` / `isRabiesAtRisk` only derive already-Tier-2-scoped values (vaccine name dedup count, active drug names, a boolean) and the DB queries feeding them are still gated behind `if (tier2Active)` at the query level (`app/(public)/p/[publicToken]/page.tsx:306`), not fetched-then-hidden. No new PII path introduced.

## Axis 4 — Scan/sighting event integrity: PARTIALLY FIXED

**Scan forgery — FIXED.** See axis 2 #1. `logScan` now has both an abuse cap and a dedupe window, keyed off the trusted IP resolver, before the `pet_events` insert. Self-scan/scanner role split and location-privacy contract (no raw IP, coarse area only, GPS only for lost+consented) are all still intact — remediation only added throttling in front of the existing write, didn't touch the write's contract.

**Sighting replay protection — still weaker than its sibling, unchanged.** `reportPetSighting` (`report-pet-sighting.ts`) still relies on a client-supplied `clientIdempotencyKey` (attacker-controlled, trivially rotated) plus the per-`(token, ip)` rate limit from axis 2 #6. `reportFinderInPossessionAction` still has the stronger content-based dedupe (`petId` + `finderContact` within 5 min). Same root cause as #6 — not re-flagged separately.

---

## Summary table

| # | Finding | Original severity | Status |
|---|---|---|---|
| 1 | `logScanAction` — no rate limit/dedupe (scan forgery) | HIGH | **FIXED** |
| 2 | `/libreta/compartir/[shareToken]` — no rate limit | HIGH | **FIXED** |
| 3 | `logLibretaShareViewAction` — no rate limit | MED | Open |
| 4 | `/casos/[publicCode]` — no rate limit | MED | Open |
| 5 | `/denuncias/codigo/[code]` — no rate limit | MED | Open |
| 6 | Anon writes (sighting/found/finder) — per-IP only, no global token cap | MED | Open |

Both HIGH findings are closed. The remaining 4 are all MED, all the same class of gap (missing `enforceRateLimit` call or missing a second bucket), and all were pre-existing in the original audit — no new regressions introduced by the remediation commits. Non-enumerability and data-minimization remain clean, including under the new credential-badges surface area added since the original pass.

**Recommendation:** #3–#5 are one-line additions of the exact pattern already proven correct in #1/#2 (same `enforceRateLimit` call, same `callerIp` resolver) — low effort, low risk to bundle together. #6 requires a second bucket definition (IP-less, token-only) added alongside the existing per-IP bucket in the same three call sites.
