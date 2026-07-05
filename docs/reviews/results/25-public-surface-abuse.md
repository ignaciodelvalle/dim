I've completed the adversarial audit and written the results to `docs/reviews/results/25-public-surface-abuse.md`. Summary of what I found across the four axes:

**Non-enumerability (axis 1): clean.** All public tokens (`DIM-`, `DEN-`, `CAS-`, `LBR-`) use the same high-entropy generator (31^8 keyspace, no sequential component, no internal-id leakage anywhere in public routes/payloads).

**Rate-limiting / anti-abuse (axis 2): the real gap area.** Found 6 issues:
- `logScanAction` (scan logging) — **zero rate limit, zero dedupe**, directly invokable independent of the page's own limiter → forgeable scan counts (**HIGH**)
- `/libreta/compartir/[shareToken]` — the most sensitive public surface (full medical history + owner name + microchip/tattoo) has **no rate limiting at all**, unlike its less-sensitive sibling `/p/[publicToken]` (**HIGH**)
- The share-view telemetry action — same gap (**MED**)
- `/casos/[publicCode]` — no throttling on a multi-join query (**MED**)
- `/denuncias/codigo/[code]` — no throttling on code lookup (**MED**)
- All anon write actions (sighting/finder/found-notify) rate-limit per-IP only, never per-token globally, so a distributed caller can still flood a single lost pet's owner (**MED**)

**Data minimization (axis 3): clean.** Verified query-level (not render-level) gating on phone/location/contact across `/p/[publicToken]`, `/perdidas`, `/denuncias/codigo`, and `/casos`.

**Scan/sighting integrity (axis 4):** the scan-forgery issue is captured in #1; sighting reports have weaker replay protection than finder-in-possession reports but share the same root cause as the per-IP-only rate-limit gap.
his same module tree.

2. `app/libreta/compartir/[shareToken]/page.tsx:47` · The Tier-2 shared-libreta public read path (full medical history + owner first name + microchip/tattoo codes) has **no `enforceRateLimit` call anywhere in the file** — unlike its lower-sensitivity sibling `/p/[publicToken]` which explicitly rate-limits before touching any row (60/min, 400/hr). A leaked or guessed `LBR-` token can be hammered without limit, and the surface is strictly more sensitive than the credential page it borrowed the pattern from. **HIGH** · Add the same per-IP `enforceRateLimit("libreta_share_page", ip, {maxPerMinute: 30, maxPerHour: 200})` gate used on `/p/[publicToken]` before the `libretaShareTokens` lookup.

3. `app/actions/libreta-share.ts:100` · `logLibretaShareViewAction` (fired by `ViewLogger.tsx` on every mount) is likewise unrated-limited and delegates straight to a DB write with no IP/token throttle. **MED** · Rate-limit the same way as #1/#2, keyed by `(shareToken, ip)`.

4. `lib/infra/case-queries.ts:191` (`getCaseDetailByPublicCode`, called from `components/casos/CaseDetailView.tsx:53`) · `/casos/[publicCode]` runs a multi-join case+events+parties query for anonymous visitors with **no rate limiting at all**. Existence isn't leaked (`notFound()` for both missing and non-public case kinds — good), but the endpoint is a free, unthrottled DB-cost lever for anyone scripting requests. **MED** · Add `enforceRateLimit("case_public_page", ip, {maxPerMinute: 30, maxPerHour: 300})` at the top of `CaseDetailView` before `getCaseDetailByPublicCode`.

5. `app/(public)/denuncias/codigo/[code]/page.tsx:89` · `DEN-XXXX-XXXX` code lookup has **no rate limiting** (contrast with `createWelfareReportAction`'s `welfare_anon` bucket in `src/modules/welfare/actions.ts:768`, which does throttle the write side). Data returned is already minimized (masked contact, coarsened location — good), but the read path itself is a free scraping/DoS lever. **MED** · Add `enforceRateLimit("denuncia_code_lookup", ip, {maxPerMinute: 20, maxPerHour: 100})` before the `welfareReports` select.

6. `lib/infra/rate-limit.ts:94` (`enforceRateLimit`) used by `src/modules/pets/application/sighting/report-pet-sighting.ts:61`, `notify-owner-of-found-pet.ts:43`, and `encontre/action.ts:53` · All three anonymous-write limits are keyed `(endpoint:publicToken, ip)` — **per-IP only, no per-token global cap**. A distributed caller (rotating IPs / a small botnet) can flood a single lost pet's owner with unlimited `note_added`/notification rows since nothing caps volume against the token itself, only against one IP at a time. **MED** · Add a second, IP-less bucket per action keyed solely on `publicToken` (e.g. `maxPerHour: 30` global) alongside the existing per-IP bucket.

**Data minimization (axis 3): clean.** `/p/[publicToken]` (page.tsx:407-524) fetches `phone`/location columns as SQL `null` literals when the owner's disclosure flag is off — never fetched-then-redacted. `/perdidas` listing (`lost-listing-read.ts:114-125`) splits the query by `discloseLastLocationWhenLost` before ever touching the payload column for non-disclosing pets. `/denuncias/codigo/[code]` masks contact (`maskEmail`/`maskPhone`) and coarsens location (`coarsenPoint(..., "approx")`) for the public receipt. `/casos/[publicCode]` hides event `.notes` and opener/closer identity for anonymous viewers and gates the location map to govt/admin only. No PII found in query params or public JSON payloads.

**Scan/sighting integrity (axis 4): see #1 above for scan forgery.** `reportFinderInPossessionAction` (`encontre/action.ts:172-191`) has a real content-based dedupe (`petId` + `finderContact` within 5 min) in addition to its rate limit; `reportPetSighting` (`report-pet-sighting.ts:184-200`) relies only on a client-supplied `clientIdempotencyKey` (attacker-controlled — trivially rotated) plus the per-`(token, ip)` rate limit from #6, so it has weaker replay protection than its sibling. Not flagged separately — same root cause as #6 (per-IP-only throttling); fixing #6 closes this too.
