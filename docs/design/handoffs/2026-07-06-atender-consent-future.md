# Atender (walk-in clinical signing) — consent model: pilot vs. future

## Context
`app/org/[orgToken]/atender/**` lets a matriculated vet sign a clinical event on a
pet the clinic does NOT hold custody of (the owner brings the pet). The consent
proxy today is: the acting member holds `event.write` on the org **AND** knows the
pet's DIM code (`DIM-XXXX-XXXX`).

## The known limitation (accepted for the pilot — PO decision 2026-07-06)
A Cursor security audit (`docs/reviews/results/audit-atender-walkin.md`, HIGH) is
correct that **"knows the DIM code" is a weak proof of presence**: the DIM code is
DIM's own **public Tier-0 credential** — resolvable with no auth at
`/p/[publicToken]`, printed on tags/posters, shared in lost-pet broadcasts. High
entropy stops *guessing*, not *exposure*. So a member with `event.write` could, in
principle, sign a clinical event onto a pet they never saw, using a code lifted
from a photo.

**Why it's acceptable for the pilot:**
- The event is **signed and attributed** to the acting member/org, append-only and
  auditable — abuse is traceable and, for a matriculado, professionally sanctionable.
- The surface exposes **no owner PII** and can perform **only** the 5 clinical
  writers (no custody/transfer/adoption).
- The lookup is now **rate-limited** (`atender_lookup`, 20/min · 100/hr per org+IP)
  so it can't be used as a bulk existence-oracle (this task).
- Pilot orgs are onboarded/trusted, not open self-serve at national scale.

## The proper model (post-pilot — build before opening beyond trusted orgs)
**Owner-per-visit authorization.** The owner, from their app (they're at the clinic
with their phone), mints a short-lived, single-use "autorizar consulta" code/QR — a
signed token bound to `(petId, clinicOrgId, ~15min TTL)`, exactly the pattern
`microchip-force-token` already uses. The vet enters/scans it. This makes consent
**explicit, per-visit, and exposure-proof** (the public DIM code alone no longer
authorizes a signature). Fallback for an owner without the app: an in-clinic OTP the
owner reads aloud, or a staff-witnessed attestation.

Effort: ~M (a new token type + issue/redeem endpoints + an owner-side "autorizar"
action + swap the atender entry from raw-code to token-redeem). Non-breaking: keep
the DIM-code path for trusted-org fallback, gate the "verified_professional"
provenance on the owner-authorized path once shipped.
