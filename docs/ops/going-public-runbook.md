# Going-Public Runbook

## Premise

The repo is private (PO decision 2026-07-15) to protect design IP, while being maintained "publishable tomorrow" — no secrets, no plaintext PII, clean history. This runbook is what stands between "private" and "public." It must stay current: any change that reopens one of the blockers below must update this file in the same PR.

## Publication blockers (must resolve before any publication)

These MUST all be resolved before the repo (or any mirror of it) is made public.

1. **History rewrite or fresh-history public mirror required.** `docs/archive/mimar-go-to-market.md` exists in git history and MUST NOT ship publicly. Recommended approach: publish a **fresh-history mirror** (a new repo seeded from a clean tree snapshot, no ancestor history) rather than running a history-filtering tool (e.g. `git filter-repo`) on the working repo — rewriting the working repo's history is destructive to collaborators and CI. In addition to the GTM doc, scrub historical occurrences of the staging Supabase project ref and the Vercel account handle. Known commits carrying one or more of these values: `580133f6`, `3e673eef`, `ac04b4c3`, `2ef14b14`, `d1614c9d`, `23648108`, `6e4b9b87`. This list is a starting point, not a guarantee of completeness — re-scan full history before any publication.
2. **Open MED-2 security finding.** `docs/reviews/2026-07-10-security-pre-national.md` documents MED-2 (authenticated Panorama fan-out has no aggregate request-rate cap), currently open. Fix it before that doc — or any doc referencing it — is ever made public. Rule: never publish security reviews with open findings.
3. **Rights/consent for `public/landing/portada.jpg`.** This asset shows a real, identifiable face. Confirm rights/consent are on file before publication; if not, replace the asset.
4. **Seed demo persona names.** `scripts/seed-demo.ts` uses display names (Noelí Assandri, Graciela Saavedra, Dra. Lilian Marrone, Alejo Caride, Lucas Etcheverry). Confirm these are pseudonyms or that consent is on file; otherwise replace with fictional names before publication.

## Exclusion manifest (never in a public export)

- `docs/archive/mimar-go-to-market.md`
- `docs/reviews/*` — any security audit with unresolved findings
- Exact rate-limit thresholds and entropy math — keep qualitative wording public ("rate-limited", "high-entropy token"), keep exact numbers private

## License decision at publication time

`LICENSE` currently states all rights reserved. Publication requires an explicit license choice made at that time — one of:

- Full open source (e.g. MIT, Apache-2.0)
- Open-core, carving out only the credential-verification module
- Source-available (visible but not freely licensed)

This choice is deferred, not decided. See engram topic `governance/open-source-strategy` for the discussion record.

## Already verified clean (audit 2026-07-15)

- No secrets in the working tree or in full git history — no `.env` file ever committed, no keys/JWTs/DB dumps in any ref.
- Seed data is PII-clean — DNI is always hashed (never plaintext), phone numbers and CUITs are fake.
- `.gitignore` correctly covers `.env*`.
