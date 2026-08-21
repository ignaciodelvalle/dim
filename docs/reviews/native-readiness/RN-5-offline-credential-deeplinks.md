# RN-5 — Offline credential + deep links

> Adversarial read-only review, 2026-08-19. Builds on RN-1..RN-4 (not repeated).
> Verdict: **EXPENSIVE**, with the "verify offline" half a **BLOCKER**.

## The core split this review surfaces

The premise "the pet IS the credential, available offline" is TWO promises in
one sentence, in opposite states:
- **Offline DISPLAY** (owner shows their own pet's card, no signal) —
  EXPENSIVE but tractable.
- **Offline VERIFICATION** (a third party trusts it without the server) —
  BLOCKER, because it is not unbuilt, it is **undesigned**.

## Findings (ranked)

### F1 — BLOCKER (premise): there is no credential, there is a URL
`credentialQrUrl()` returns exactly `${origin}/p/${token}` — the entire QR
payload everywhere (chapita, cartel, credential face, service-dog present mode,
tag CSV). No claims, no issuance date, no expiry, no signature. package.json
has ZERO crypto/credential dependency (no jose/jsonwebtoken/VC lib; only
qrcode). Everything a verifier reads is computed at render time inside the
1423-line /p/ page. **Trust today = "this HTML arrived from mimar.ar over TLS
seconds ago."** Remove the network and a cached render, a screenshot and a
forgery are indistinguishable. Not "not built" — **not designed.**

### F2 — BLOCKER (mechanism): the platform actively FORBIDS caching the credential, in two places
1. public-cache-policy.ts stamps `no-store` on the whole /p/ subtree (+
   libreta/compartir, adoptar, casos, perdidas) — correct and load-bearing (a
   found pet kept serving "SE BUSCA" + owner phone from a CDN).
2. public/sw.js: "There is NO caching/offline layer here", and a fitness test
   FAILS THE BUILD if a fetch handler or caches.open ever appears.
The repo has a green test asserting the headline feature cannot exist. Honest,
but R5 starts below zero. The 2026-07-04 PWA gap analysis specified "Fase B —
Offline credential (the real feature)"; it never shipped, and its own open
question ("should the PUBLIC credential cache on a finder's phone? default NO
until reviewed") was never answered — that unanswered question IS R5.

### F3 — HIGH: the owner can't show their own QR offline, or with a stale session
Every QR is `await QRCode.toString(...)` in an RSC page body (7 sites) behind
auth cookies. No signal → browser offline error page. qrcode runs fine in a
browser; nothing forced server-side. Compounded by RN-2 F1 (8h timebox): an
owner force-logged-out at a vet counter can't render the QR even WITH signal.
Minimum cache for a Tier-0 card enumerated (token, name, species, sex, breed,
DOB, photo path, status, derived rabies semaphore, identity heading,
chip/tattoo flags, disclosure booleans, lost context) — **none client-derivable
today; all one server round-trip.**

### F4 — HIGH: /t/{serial} → /p/{token} is a random-to-random DB join, offline-unresolvable
Serials (TAG-) and tokens (DIM-) are independent CSPRNG draws, no derivable
relationship; lookup is a DB join + 307. Privacy construction is genuinely good
(projection cannot leak PII) but the physical tag is 100% server-dependent
forever. Live friction: a vet who scans a chapa lands on /p/ but /atender
accepts ONLY DIM- codes — the scan produces a value the clinical flow refuses;
the vet retypes off the footer.

### F5 — HIGH: scan logging is a client→server-action effect; offline it just doesn't happen
ScanLogger fires logScanAction from useEffect; the whole privacy contract
(abuse cap, 1/min IP dedupe, geo area, self-scan detection, first-stranger-scan
notify) is server-side and IP-and-minute shaped. Offline: no credential_scanned
row (the lost-pet scan trail loses exactly the dead-zone scans the feature
exists for); onboarding beat never fires; a queued-replay batch either gets
dropped wholesale by the 1/min dedupe or becomes a forgery channel for the
public scan count. No client-occurredAt path, no idempotency key on this write.

### F6 — HIGH: the staleness classes a cached credential gets WRONG (credential analog of RN-3 F12)
lost→found (shows SE BUSCA + owner phone for a pet at home — the exact bug
no-store fixed); erased subject keeps rendering; rabies VIGENTE seal on an
expired mandated vaccine; "profesional" respaldo for a revoked matrícula (RN-2
F3); identity heading backed by a changed jurisdiction rule; a clinical badge
before an event_amended correction (breaks the WAVE D1 supersede invariant);
custody-dispute bar bypassed. **None has a TTL, version, or freshness stamp;
there is no updatedAt on the projection to key a cache on.**

### F7 — MEDIUM: moving derivation client-side hands the clock to the subject
deriveRabiesSemaphore compares next_due_at against the SERVER clock; offline
`now` is the device clock the owner controls — set the date back, vencida →
vigente on the one mandated vaccine. Same for the service-dog risk warning and
the Tier-2 disclosure window. A property change, not a port; nothing in the
code says so.

### F8 — MEDIUM: the deep-link surface is undeclared and the prefix space is a minefield
No public/.well-known/ at all (no AASA, no assetlinks). Route inventory table
built (stability + logged-out + params). Collision hazards for naive globs: p
vs perdidas/privacidad; t vs terminos/transferencias/transparencia/turnos; r vs
refugios/registro/recuperar; adoptar vs adopciones. AASA /p/* and /t/* are safe
WITH the slash — and the repo already shows the failure mode: cache policy
lists "/adoptar" WITHOUT a trailing slash, matching any future /adoptarXYZ.

### F9 — MEDIUM: the one place the repo pretends to be native is a facade
mis-turnos check-in QR encodes `mimar://appointment/{APT}` — zero handlers,
zero protocol_handlers, already logged as OPEN. A phone camera can't open it.
Sets the wrong precedent (custom scheme, hijackable, vs universal link).

### F10 — MEDIUM: the PWA is not a foundation; barely a PWA today
manifest start_url "/" launches the marketing landing, not a wallet; no
shortcuts, no share_target, no protocol_handlers; SW registered only in the
owner shell and only when push is on (default OFF) → most installs have no SW.
Distraction for native, but manifest + icons + appleWebApp metadata are the
cheap half already done.

### F11 — MEDIUM: good news, and where it stops
The derivation layer is genuinely portable (credential-badges,
libreta-health-status, pet-compliance, amendment, event-confidence,
credential-claims, dim-token — all pure, DB-free, React-free, tested). BUT
credential-badges.ts lives INSIDE the route folder — the canonical public
projection is trapped in the Next tree (R6's problem, R5's cost). And per RN-4
A1 every attachment except the public photo is behind an RSC-minted signed URL,
so an offline libreta is impossible regardless. Offline ceiling today: Tier-0 +
primary photo.

### F12-F14 — LOW/MEDIUM
Throttles shaped for one human refreshing, not a verifier in a queue behind
NAT (CGNAT lens again). Time/locale correct on server, fragile on device (RN
Hermes ships without full ICU; still no profiles.timezone). The photo — the one
portable asset — renders through /_next/image and has the default 1h TTL, so an
"offline" wallet loses the pet's face after an hour.

## Ranked improvements (native cheaper AND web better today)

1. **Answer the 2026-07-04 open question in writing, before code.** Split the
   conflated premise: offline DISPLAY (own data, own device — no new
   disclosure) vs offline VERIFICATION (crypto + legal). Decide the verifier
   trust model and "may a stranger's phone cache /p/, for how long?". A day;
   everything below depends on it. Also decides if /p/ no-store can ever relax.
2. **`GET /api/v1/pets/{token}/credential` — Tier-0 as JSON with issuedAt +
   staleAfter.** RN-1 B5's page-loader extraction, credential-first (lift
   loadCredentialViewData into a use-case both page and route call). A cache
   can KNOW it's stale (F6); the degraded card degrades to real data.
3. **Move credential-badges.ts out of the route folder into
   lib/domain/credential/.** Pure move; the WAVE D1 supersede contract becomes
   reusable by opengraph-image, degraded card, cartel, libreta export.
4. **Render the owner's QR client-side** (qrcode runs in browsers). Removes
   server SVG from the two heaviest owner renders; the QR becomes a pure
   function of a cached string — cheapest step toward a wallet.
   (Hero + onboarding client-side since 2026-08-21 via
   `components/ui/CredentialQr.tsx` — cost: ~78 KB raw / ~20 KB gzipped of
   `qrcode` now in the client graph of both owner routes, which
   `lint:route-weight` does not watch; the other call sites are still
   server-side: chapita, cartel, asistencia/presentar, adoption signup,
   landing, mis-turnos.)
5. **Sign the Tier-0 payload (detached JWS), publish the JWK.** Adds jose + one
   signCredential(); emit the JWS in #2's API and as a footer string on printed
   sheets. Converts F1 from "undesigned" to "designed, phased"; the printed
   libreta/cartel/screenshot become checkable with a real expiry to bound F6.
6. **One deepLinkMap module + generated AASA/assetlinks + fitness test**
   (merge with RN-3 B22). The overlap assertion catches the p/perdidas,
   t/terminos and live "/adoptar"-without-slash classes on day one. Kill
   mimar://appointment in the same PR.
7. **Honest owner-scoped offline cache** — runtime-cache only the owner's OWN
   credentials via #2's JSON, never a stranger's /p/. Change the SW fitness
   test from "no fetch handler ever" to "caches only the allowlisted
   owner-credential route" — the test is the design doc. Pin the photo
   immutable (RN-4 B8) same PR.
8. **Close the chapa→clinic loop**: accept TAG- serials in resolveAtenderPet
   (already resolves via lookupTagBySerial); copy-to-clipboard the footer
   token. Removes a live re-typing step; defines what a scanner must accept.

## Verdict: EXPENSIVE (verify-offline half: BLOCKER)

Offline DISPLAY is EXPENSIVE-but-tractable: derivations pure and tested,
petPhotoUrl portable, degraded-card honesty pattern already written, QR is
qrcode on a cacheable token. Offline VERIFICATION is a BLOCKER because it is
UNDESIGNED — no signature, expiry, issuance date, revocation channel or crypto
dep anywhere; trust is 100% "server rendered this over TLS a second ago", which
holds right up to removing the server, at which point a cached credential, a
screenshot and a forgery are one artifact — while asserting rabies vigencia
against a clock the subject controls, "profesional" for a possibly-revoked vet,
a state-registration heading backed by a possibly-changed rule, and a SE BUSCA
banner with the owner's phone for a pet that came home. Real credit due: /p/ is
the most carefully built page in the repo, and the two mechanisms blocking
offline (no-store + the SW fitness test) are correct decisions, not oversights.
That is exactly why it's expensive — nothing here is a bug to fix, it is a
trust model to design, and every plausible offline shortcut breaks an invariant
someone already thought hard about.
