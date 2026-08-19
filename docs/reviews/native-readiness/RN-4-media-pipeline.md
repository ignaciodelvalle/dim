# RN-4 — Media pipeline

> Adversarial read-only review, 2026-08-19. Verdict: **EXPENSIVE**.
> Builds on RN-1/2/3 (not repeated). ⚠️ Contains LIVE security findings that
> exist today independent of native — see A2/B2.

## Findings (ranked)

### A1 — BLOCKER: no non-browser client can READ a private attachment
Every private-bucket signed URL is minted INSIDE an RSC page body
(eventAttachmentSignedUrl / welfareAttachmentSignedUrl in lib/infra/storage.ts,
consumed only by pages/use-cases). All 33 route handlers: zero return a signed
URL or storage path. So a native app can show a pet's PUBLIC primary photo but
NOT a single vaccine card, vet receipt, tattoo photo, adoption contract, or
found-pet photo. The libreta — the flagship artifact — is half-blind on
native. The media twin of RN-1's "reads ~0% wrappable", and worse.

### A2 — ⚠️ LIVE HOLE: a browser-direct, fully-unprotected upload path already exists
`lib/ui/use-evidence-upload.ts:86` uploads straight from the browser to the
`revocations` bucket with the anon client — no magic-byte sniff, no sharp
re-encode, no size cap, client-controlled contentType and path. The bucket
policy is `with check (bucket_id = 'revocations')` → **any authenticated
account in the country can write arbitrary bytes under any key.** The same
`bucket_id = '<name>'`-only INSERT grant exists for **pet-photos**
(db/storage.sql:29-32) and **event-attachments** (db/storage.sql:80-83) — so
TODAY any signed-up account can bypass uploadAttachmentIfPresent entirely with
6 lines of supabase-js. Server-side validation is a convention, not an enforced
boundary. This is exactly the architecture a native team copies on day one —
the version with none of the protections.

### A3 — HIGH: `avatars` is broken end-to-end since its bucket was created
Validation is a zod parse of CLIENT-supplied mime/size (fileBlob never
inspected); uploads as service-role so `owner` ≠ user while RLS gates SELECT on
`auth.uid() = owner` (owner can never read it); persists a `/object/sign/...`
URL with no `?token=` (invalid). Avatar upload "succeeds" and never displays.
Table-stakes for Phase 1.

### A4 — HIGH: two of the four Phase-2 media flows are greenfield
Intake writes `has_photo: false` as a literal; no File parsed, no upload
helper. Bite reports carry no evidence upload. "Intake photos at the kennel
door" and "bite evidence" are build, not port.

### A5 — HIGH: the retry path leaks storage objects (native retries are common)
Upload happens before the tx; cleanup runs only on !ok/throw. But
insertEventIdempotent returns wasNoop and the use-case returns early BEFORE
insertAttachment — wasNoop never reaches the action. Retry on flaky 4G →
second photo uploaded, event no-ops, cleanup skipped → permanent silent
orphan. 15 event call sites share this. pets/actions.ts already handles it —
the pattern is known, just not propagated. (This is RN-1 B6's storage cost.)

### A6 — MEDIUM: EXIF/GPS stripping inconsistent and invisible
pet-photos: always re-encoded (safe, and public). event-attachments:
stripMetadata is OPT-IN, passed by only 2 of ~30 sites — all 15 events sites,
7 atender sites, tattoo, adoption, checkin upload ORIGINALS with GPS intact
(private bucket, but the raw bytes are what a 7-day MPF signed URL hands over).
welfare-evidence: strips only jpeg/png/webp — **HEIC (the iPhone default)
passes through with GPS.** Native amplifies: phone GPS always on, HEIC always
default.

### A7 — MEDIUM: decomiso uploads arbitrary bytes with attacker-chosen Content-Type
No MIME check at all (only count≥2, size≤25MB); key extension derived from
client filename. A govt operator can store text/html and get a signed URL that
renders attacker HTML on the *.supabase.co origin. uploads.ts explicitly closed
this hole; decomiso reintroduces it. welfare-uploads validates the
CLIENT-declared MIME with no magic-byte fallback.

### A8 — MEDIUM: incoherent size caps + two live web bugs
- next.config.ts bodySizeLimit "50mb" under a comment describing 5×25MB =
  125MB — a 3-file 25MB denuncia is rejected by Next before the friendly
  error, reporter sees a transport error. (Also: verify the actual Vercel
  function body ceiling before relying on any number.)
- `org-logos` is READ by storage.ts but created by NO migration — only prose
  in a runbook. The bucket-exists test can't catch it (scans storage.from
  literals; orgLogoUrl builds a string). Same blind spot as pet-attachments
  and avatars.
- Adoption contract path rejects PDFs (raster-only allowlist).

### A9 — MEDIUM: no orphan GC; erasure misses two buckets
Cleanup is per-call-site, best-effort, error-swallowing. No storage GC cron
(24 crons, none touches storage). Erasure deletes only event-attachments +
pet-photos keyed on pet_id — NOT the subject's avatar, their welfare-evidence
uploads, or zero-parent staged rows. For a Ley 25.326 art.16 claim, a
GPS-bearing HEIC on a denuncia surviving deletion is the awkward one.

### A10 — LOW: download path native-friendly where public, cache-naive everywhere
petPhotoUrl/orgLogoUrl are pure string builders — usable from native unchanged.
But no upload sets cacheControl (default 1h; keys are immutable UUIDs, so
`31536000, immutable` is free); image transformation is commented out in
config.toml (phone uploads 5MB, list re-downloads 5MB); MPF export signed URLs
live 7 days; no rate limit on any upload path.

### A11 — GOOD NEWS: the offline capture model is already viable
`attachments` XOR check explicitly permits zero parents (documented as a valid
transient state); revocations stage-then-claim is implemented and tested, with
a claim predicate checking both "still unclaimed" and "uploaded by the actor".
That is exactly the field-vet offline-queue contract. **Schema ready;
validation and endpoint not.**

## Ranked improvements (native cheaper AND web better today)

1. **`POST /api/v1/uploads` — one server-minted scoped upload ticket
   (keystone).** Supabase's createSignedUploadUrl is used NOWHERE today.
   Server authorizes the purpose, picks bucket+UUID key, returns a signed PUT
   + stages a zero-parent row; validation (magic bytes + sharp re-encode)
   moves to a post-upload verify step; nothing may claim an unverified row.
   First step: extract detectRasterMime + stripExif into lib/media/validate.ts
   operating on Buffer not File. Web: kills the 125MB-through-50MB dead-end.
2. **Close the `bucket_id`-only INSERT grants — same PR as #1.** Drop the
   blanket policies; add a fitness test asserting no bucket has an INSERT
   policy whose with-check mentions only bucket_id (fails today — the point).
3. **Kill the browser-direct revocations upload; route through #1.** One hook,
   three call sites. First step (5 lines, immediate): make
   uploadRevocationEvidence reject any storagePath it didn't itself mint.
4. **Surface wasNoop and clean up on it** (RN-1 B6's storage half). Reference
   impl already in pets/actions.ts. Stops silently accumulating orphans on
   every double-tap.
5. **Make EXIF stripping the DEFAULT, extend to HEIC.** Invert the opt-in at
   uploads.ts; add HEIC/HEIF to welfare-uploads (the format that currently
   keeps its GPS). Live PII leak fix for web today.
6. **Fix `avatars`** — route through uploadAttachmentIfPresent, store the path
   not a fake URL, sign at render. Cheapest whole-feature win here (~30 lines).
7. **Storage↔DB reconciliation cron (report-only first) + erasure
   completeness** (avatars, welfare-evidence, zero-parent rows).
8. **cacheControl immutable on every upload + enable Storage image
   transformation.** Free correctness; measurable on /mis-mascotas same day.

## Verdict: EXPENSIVE

Not BLOCKER: petPhotoUrl is native-usable unchanged, and the attachments table
already permits AND implements the stage-then-claim contract an offline
field-capture queue needs. Someone thought about this. But R4 is honestly two
builds, not a port: READS have no callable surface (33 handlers, zero mint a
signed URL — every attachment URL is born in an RSC page body), and WRITES
have their security core welded to a File from a FormData from a server action.
Worse, the one direct-to-storage path that exists is the unprotected one, and
the blanket INSERT grants make that bypass available today from a browser
console to any account. Add greenfield intake/bite media, a silently-broken
avatar feature, an org-logos bucket no migration creates, a 50MB limit under a
125MB comment, unstripped iPhone HEIC GPS, and zero GC — and it's 3-5 focused
weeks. B1+B2 together collapse most of it, but they must land together or you
just add a third way to upload.

## ⚠️ Flag for PO (independent of native)
A2/B2 is a live authorization hole in the CURRENT web app: blanket
`bucket_id`-only INSERT grants on pet-photos, event-attachments, and
revocations let any authenticated account write arbitrary bytes bypassing all
server-side validation. Worth scheduling regardless of the native timeline.
