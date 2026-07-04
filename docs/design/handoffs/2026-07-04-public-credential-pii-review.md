# Public credential privacy audit — MiMAR / DIM

## Ground truth

| Field | Value |
|---|---|
| **Branch** | `integration/all-20260703` |
| **HEAD** | `3f4b4d0d` |
| **Scope** | Citizen/public surfaces: `/p/[publicToken]`, finder flows, Tier-2 share, scan retention — not govt/PostgREST operator paths |

---

## Tier-boundary map

| Surface | Unlock condition | What is exposed | Gated correctly? |
|---|---|---|---|
| **Tier 0** (active `/p/{token}`) | Anyone with QR/URL | Pet photo, name, species/breed/sex, age in years, vaccination yes/no (+ confidence badge if verified), microchip/tattoo **boolean**, `DIM-XXXX-XXXX`, optional Tier-0+ emergency banner (no drug names), optional PPP badge, optional service-dog banner, optional origin-org badge (org opt-in), optional `discloseConditionsPublicly` conditions | **CONFIRMED** — no owner name/phone/email/DNI/address on active path (`page.tsx:6-7`, `587-876`). Microchip **number** not rendered (only Sí/No at `803-804`). |
| **Tier 0+** | `pets.emergencyInfoVisible` | Generic medical alert; CTA to scan QR | **CONFIRMED** — no owner contact or drug names (`617-635`). |
| **Tier 1 (lost)** | `pet.status === 'lost'` | Lost UI replaces active credential (`534-584`). Owner first name, phone, last-seen text/coords, tattoo **code**+photo — each gated by `disclose_*_when_lost`. Animal `lost_description` always shown (by design). Finder/sighting CTAs. | **CONFIRMED** for render + fetch — SQL projects `null` when prefs off (`407-431`, double-gated at `565-575`). **Note:** `discloseEmailWhenLost` triggers admin email fetch (`481-490`) but email is **not** rendered on `/p` — only on `/encontre` when form disabled (`91-149`). |
| **Tier 2 público** | `tier2PublicPermanent \|\| tier2PublicEnabledUntil > now` | Curated medical summary: vaccine counts, sterilization, **active medication names**, permanent conditions | **CONFIRMED** on active pets only — lost branch returns before Tier-2 block (`534` vs `761-788`). Owner opt-in via `enableTier2PublicAction` (`app/actions/tier2-public.ts`). |
| **Tier 2 share** (`/libreta/compartir/{LBR-…}`) | Valid bearer token (unguessable, revocable, expiring) | **Full libreta**: all libreta event types + payloads (vet names, chip numbers in timeline, batch/lab fields where present), header microchip/tattoo **full codes**, owner **first name** chip, pet `publicToken` | **CONFIRMED as designed bearer credential** — gates at `validateShareToken` + deceased check (`99-102`). High impact if leaked; not a boundary bug. |
| **Finder: “Avisar al dueño”** | Tier 0 form on active credential | Collects finder name + contact; writes **owner notification only** — no PII returned to anon caller | **CONFIRMED** (`notify-owner-of-found-pet.ts:73-113`). |
| **Finder: sighting** | Pet lost | Coords + optional description/photo/contact; `recordedByUserId` always `null` | **CONFIRMED** (`report-pet-sighting.ts:189-190`). |
| **Finder: in possession** | Lost + `allowFinderFormWhenLost` | Finder PII in event payload → owner feed/notifications | **CONFIRMED** for owner-only visibility; see session-bleed finding below. |
| **OG / share preview** | Social crawler | Pet name, species, photo, “SE BUSCA” badge — no owner/location | **CONFIRMED** (`opengraph-image.tsx:11-13`, `57-67`). |
| **`/perdidas` listing** | Public index | Pet identity + gated last-seen text; microchip as **“Con chip”** badge only | **CONFIRMED** — location query split like Item 27 (`lost-listing-read.ts:114-223`); UI does not show full chip (`perdidas/page.tsx:367-368`). |

---

## What is correctly gated (credit)

1. **Query-level disclosure on lost credential** — phone/location fetched as SQL `null` when prefs off, not fetch-then-redact (`page.tsx:407-431`).
2. **Scan write contract** — scanner rows: `recordedByUserId = NULL`, coarse `scan_ip_area` only, `scan_coords` only if lost + server re-check + client consent (`log-scan.ts:101-127`).
3. **Scan retention** — 90-day cron deletes entire scanner `credential_scanned` rows including location fields (`scan-retention.ts:63-99`, `app/api/cron/purge-scan-events/route.ts`, `vercel.json:73`).
4. **No DNI on public routes** — grep of `app/(public)` shows zero `dni*` usage; DNI handling is hash/last4 in authenticated flows only.
5. **OG image** — Tier-0 pet fields only; metadata explicitly avoids owner PII (`page.tsx:62-68`, `opengraph-image.tsx:11-13`).
6. **Libreta share lifecycle** — max 5 active tokens, expiry, revoke, deceased terminal state (`create-libreta-share.ts:17-47`, `libreta/compartir/.../page.tsx:99-102`).
7. **Sighting reports** — hard-anonymized authorship (`report-pet-sighting.ts:189-190`).
8. **CredentialFace** — owner profile component only; **not** mounted on `/p/[publicToken]` (public lost path uses `LostPublicCredential`).

---

## Findings (severity-ranked)

| Severity | Tier | File:line | What leaks / why safe | Fix (recommendation only) |
|---|---|---|---|---|
| **High** | Share | `app/libreta/compartir/[shareToken]/page.tsx:105-196` + `LibretaSanitariaView.tsx:88-140` + `events.ts:229-235` | Leaked `LBR-*` token exposes **full medical libreta** (events + payloads), **full microchip/tattoo**, vet/clinic names, medication history. By design, but government-scale blast radius. | Treat share tokens like credentials: short default TTL, owner education, optional vet-scoped redaction mode, rate-limit share route, consider omitting chip plaintext from share header when not clinically necessary. |
| **Medium** | Tier 1 | `db/schema.ts:598-603` | **Defaults opt-in owner PII when lost:** first name, phone, last location default `true`; email default `false`. New owners may expose contact/location without explicit consent step. | Lost-marking wizard should require **affirmative** disclosure choices; consider safer defaults (all false except finder form). |
| **Medium** | Finder | `app/(public)/p/[publicToken]/encontre/action.ts:235-290` | Logged-in finder reports attach `recordedByUserId` + `authorVerified=true` to `note_added` — links finder to DIM account in owner historial/feeds. Anonymous intent broken for logged-in users. | For public finder flows, **always** `recordedByUserId: null` (mirror sighting + scan contract); keep finder identity only in payload fields they typed. |
| **Medium** | Tier 0/2 | `page.tsx:663-667`, `Tier2MedicalView.tsx:52-53` | `permanentConditionsOther` free text rendered publicly when owner toggles `discloseConditionsPublicly` / Tier-2 — owner may paste PII into “otra”. | Validate/warn on save; strip phone/email patterns; or restrict “otra” to predefined vocab on public surfaces. |
| **Low** | Scan | `ScanLogger.tsx:79-81` vs `lib/infra/lost-mode.ts:228-234` | Consent copy: “Le avisamos a su familia dónde fue vista” — but owner feed sets scan `localityLabel: null` and **no read path** uses `scan_coords`/`scan_ip_area` (write-only in repo). Misleading consent; latent risk if UI wired later without review. | Either surface coarse scan area / consented coords to owner feed, or soften copy to match actual retention/disclosure. |
| **Low** | Tier 1 | `page.tsx:481-517` | When `discloseEmailWhenLost`, email fetched via admin API but **not shown** on `/p` (only `/encontre` fallback). Unnecessary PII touch in server memory. | Remove email fetch from main credential page; fetch only on routes that render it. |
| **Low** | Tier 0 | `page.tsx:114-122`, `lib/infra/publicToken.ts:5-7` | Public token entropy ~31⁸; rate limit 60/min/IP slows enumeration but doesn’t prevent distributed guessing. | Monitor enumeration; plan token width increase with migration strategy (already noted in code). |
| **Low** | Share | `app/libreta/compartir/[shareToken]/page.tsx:201` | Footer repeats bearer token in HTML (already in URL). | Omit token from footer or show truncated form. |
| **Info** | Tier 1 | `LostPublicCredential.tsx:232-259` | Full **tattoo code** shown in lost mode (not on active credential). Intentional D3 / Ord. CABA alignment. | Document in privacy checklist as deliberate Tier-1 animal-ID exception. |
| **Info** | Index | `app/sitemap.ts:76-80` | All lost pets’ `/p/{token}` URLs enumerated for crawlers. | Expected for reunification SEO; ensure `/p` rate limits hold under crawler load. |

**SUSPECTED (not fully traced):** Govt timeline helpers resolving `recordedByUserId` for non-scanner events — out of scope here; scanner rows are NULL by contract.

---

## Area summaries

### 1. Tier boundaries on `/p/[publicToken]`

Primary render: `app/(public)/p/[publicToken]/page.tsx`. Lost mode delegates to `LostPublicCredential.tsx` (not `CredentialFace`, which is owner-authenticated).

**Gating logic (quoted patterns):**

```272:273:app/(public)/p/[publicToken]/page.tsx
  const tier2Active =
    pet.tier2PublicPermanent || (!!tier2EnabledUntil && tier2EnabledUntil > new Date());
```

```412:420:app/(public)/p/[publicToken]/page.tsx
    const showLocation = pet.discloseLastLocationWhenLost;
    const showPhone = pet.disclosePhoneWhenLost;
    // ...
          phone: showPhone ? profiles.phone : sql<string | null>`null`,
```

```565:566:app/(public)/p/[publicToken]/page.tsx
          ownerFirstName={pet.discloseFirstNameWhenLost ? lostContext.ownerFirstName : null}
          ownerPhoneE164={pet.disclosePhoneWhenLost ? lostContext.phone : null}
```

Disclosure prefs written via `setPetDisclosurePrefsAction` (owner UI in `LostCaseBlock` / `LostDisclosureCard`). Tier-2 público via `enableTier2PublicAction` / `revokeTier2PublicAction`.

### 2. DNI never in plaintext

**CONFIRMED** on citizen surfaces: no `dni`, `dniLast4`, or `hashDni` in `app/(public)/**`. Storage uses `dni_hash` / `dni_last4` (`db/schema.ts:414-415`). Claim flows (`/mis-mascotas/reclamar`, `/reclamar-dni`) are **authenticated**, not anon QR paths.

### 3. Owner identity leakage (anon path)

| Vector | Status |
|---|---|
| Event provenance on `/p` | **Safe** — no timeline on public credential |
| Vet names on `/p` | **Safe on Tier 0**; **exposed on Tier-2 share**, not Tier-2 público summary |
| Org name | **Opt-in** origin-org badge only (`820-842`) |
| Emergency contacts | **Not on `/p`** (owner profile feature) |
| QR URL / `publicToken` | **Public by design** |
| `og:image` | **CONFIRMED Tier-0 only** |
| Layout session | **Safe** — “Volver a mi app” only for logged-in viewer (`layout.tsx:36-57`), not broadcast to other viewers |

### 4. Scan data privacy

| Check | Result |
|---|---|
| Write: `scan_ip_area` coarse | **CONFIRMED** (`scan-geo.ts`, `log-scan.ts:104`) |
| Write: no scanner `recordedByUserId` | **CONFIRMED** (`log-scan.ts:126`) |
| Write: `scan_coords` only lost + coords | **CONFIRMED** (`log-scan.ts:108-114`) |
| Read: public anon path | **CONFIRMED** — scan payloads not rendered on `/p` |
| Read: owner lost feed | **CONFIRMED** — scans show “Ubicación desconocida” (`lost-mode.ts:233`); coords **not read anywhere in app UI** |
| Scanner identity re-link | **CONFIRMED absent** for `credential_scanned` scanner rows |

### 5. Tier-2 medical share (`/libreta/compartir/[shareToken]`)

| Control | Detail |
|---|---|
| Unguessable | `LBR-XXXX-XXXX`, ~31⁸ entropy (`publicToken.ts:67-68`) |
| Revocable | `revokeLibretaShareForUser` |
| Scoped | One pet per token |
| Expiry | `expiresAt` nullable (permanent allowed) |
| Active cap | 5 per pet (`create-libreta-share.ts:17-47`) |
| Leaked link exposes | Full libreta, chip/tattoo, vet names, owner first name, DIM token |

### 6. Retention

**CONFIRMED:** `purgeExpiredScanEvents()` deletes scanner `credential_scanned` rows **wholesale** after 90 days — all payload fields including `scan_ip_area` / `scan_coords`. Cron: `/api/cron/purge-scan-events` daily. Self-scans retained without location (correct).

Other PII TTLs on this surface: finder/sighting events are **not** scan-purged (full retention in `pet_events` append-only) — finder contact in payloads persists indefinitely unless a separate policy is added.

### 7. Finder / sighting forms

| Form | PII collected | Minimized? | Session bleed? |
|---|---|---|---|
| `FoundPetForm` | Name, phone/email, optional message | Required contact | **No** — notification only, no auth link |
| `PetSightingForm` | Coords, optional desc/photo/contact | Coords required | **No** — `recordedByUserId: null` |
| `FinderInPossessionForm` | Name, phone/email, coords, photo, condition | Required contact + coords | **Yes if logged in** — `recordedByUserId` set (`encontre/action.ts:244-246`) |
| `/encontre` prefill | Loads session profile into form | User can edit | Prefill is UX-only; bleed is on **submit** |

Rate limits: found notify, sighting, possession — 1/min, 10/hr per `(IP, token)`.

---

## Top privacy risks before government handoff

1. **Bearer libreta share links** — A single leaked `LBR-*` URL is a durable, rich medical + identifier export with no step-up auth. Highest citizen-surface blast radius.
2. **Lost-mode defaults** — First name, phone, and last location public **by default** when a pet is marked lost; many owners will never toggle prefs off.
3. **Logged-in finder ↔ account linking** — Possession reports can deanonymize finders who happen to be signed in.
4. **Scan location consent vs delivery gap** — Precise coords are stored under consent, but owners don’t see them in the feed today; fixing that without re-audit could over-expose scanner locations.
5. **Public token as permanent identifier** — QR URL is a lifelong capability URL; rate limits help abuse but not secrecy once shared.

---

## Verdict

| Claim | Holds at source? |
|---|---|
| **“No DNI in plaintext”** | **Yes** for citizen/public render and anon finder paths audited. DNI exists only as hash/last4 in authenticated/admin flows; no public route renders it. |
| **“Privacy by construction” (Tier 0/1/2)** | **Mostly yes**, with material caveats: (a) Tier-1 **defaults are permissive**, not privacy-preserving by default; (b) Tier-2 **share** is intentionally wide-open to bearer holders; (c) owner free-text and finder session linking are edge leaks; (d) scan location is well-constrained on **write** and **retention**, but **read/consent UX is incomplete**. |

Overall: the architecture (query-level gates, scan anonymization, append-only exceptions for TTL, separate share token) is sound and traceable in code. For a government-facing capstone, prioritize **share-token governance**, **affirmative lost disclosure UX**, and **anonymous finder authorship invariants** before treating the citizen credential as production-grade for Ley 25.326-scale scrutiny.
