# Total Audit Synthesis — 2026-07-07

Autonomous Phase-2 audit of the whole project (mandate: "validate absolutely everything is secure and usable"), run after the backlog was cleared. Four adversarial passes + one adversarial verifier, findings remediated and re-verified in the same run.

## Headline

The audit found and closed a **CRITICAL privilege-escalation ship-blocker that eight prior validation passes did not see** — plus the whole *class* of authz bug it belonged to. Everything else was already in strong shape; the remaining fixes are hardening and honesty.

## The CRITICAL — self-minted admin → national data exfiltration

Two bugs compounded:
1. The `handle_new_user()` Postgres trigger set `profiles.role` from `raw_user_meta_data->>'user_role'` — **user_metadata, which the client can write via the public anon key**. `supabase.auth.signUp({ options: { data: { user_role: "admin" }}})` minted an admin.
2. The three `app/api/panorama/*` routes gated on `role` alone, skipping the `accountType==='institutional'` + `deactivatedAt` + `deletedAt` gates the page guard enforces. So the self-minted admin pulled national surveillance / zoonosis / bite / population analytics with universal scope.

**Fixed** (commits effc11fb / 335bce72 / c526b736, then 187e426b):
- The trigger now **always writes `owner` and reads no request metadata** (migration 0134, superseding the interim 0133). Diagnosis: GoTrue's `admin.createUser` does INSERT-then-UPDATE, so even service-role `app_metadata` isn't present at trigger time — the only sound design is *no metadata trust at all*. Role elevation is **exclusively** via explicit service-role `UPDATE` (bootstrapAdmin, the institutional signup flow, and the genesis seed all do this). The invariant is now unconditional: **no signup-request input can set a privileged role.**
- A shared `app/api/panorama/_guard.ts` enforces the full institutional invariant (session + deletedAt→401, role/accountType/deactivatedAt→403) on all three routes.

## The class — role-only gates that never check `deletedAt`

The adversarial verifier confirmed the CRITICAL fix airtight **and swept for siblings**, finding the same class in three more server actions. Post-trigger-fix the live exploit is narrower (a *deactivated* or *erased* operator whose session is still valid — Ley 25.326 art.16) but real:

| Action | Severity | Fix |
|---|---|---|
| Revocation-evidence upload (legal audit trail) | HIGH | boundary guard `requireAdminOrGovtOrRedirect` |
| Service-offering approve/reject | MED-HIGH | boundary guard `requireAdminOrGovtOrRedirect` |
| Alert-subscription management | MEDIUM | boundary guard `requireAdminOrRedirect` |

Plus two defense-in-depth alignments (`alert-firings`, `admin-proposals/helpers`). Commits a45c68a6 / 50840828.

**Structural root cause (the durable lesson):** use-case-layer role checks inspect only `role` — never `deletedAt` / `accountType` / `deactivatedAt`. Only the boundary guards (`requireAdmin*OrRedirect` → `loadActiveInstitutionalProfile`) enforce the full invariant. **Any action that gates in the use-case instead of at the boundary is suspect by construction.** A lint/convention forbidding role checks below the action boundary would prevent regressions.

## Auth hardening (audit findings, all fixed)

- **Rate limiting** on login / signup / password-reset (were unprotected) — IP + hashed-email budgets, fail-closed (bb8b0fc9).
- **Session revocation on password reset** — `signOut({ scope: "others" })` kills a pre-existing attacker session while preserving the recovery session (53a66292).
- **auth/callback open-redirect** — routed through `safeReturnTo` (419d2581).

## Public surface / uploads (audit findings, all fixed)

- **SVG stored-XSS + weak upload validation** — magic-byte raster whitelist (JPEG/PNG/WEBP), SVG rejected, **pet-photos now re-encode through sharp** (no raw attacker bytes to a public bucket) (afc04198).
- **Path traversal in storage key** — extension derived from the validated MIME, never the client filename (afc04198).
- **Modulo bias in DEN reference codes** — rejection sampling (e143ad9e).

## Fresh-eyes UX (forgotten surfaces, all fixed)

- **global-error.tsx invisible button** — hex fallbacks so the last-resort escape stays visible if globals.css isn't injected (7fc075ce).
- **False "funciona sin conexión" claim** on /leyes — softened to the truthful value prop (no offline layer ships today) (05dfad72).
- /leyes linked from the footer; PWA `start_url` → `/`; no-scope operator states made actionable; reminders empty-state documented (05dfad72 / de76cce6).

## Healthy — verified solid (evidence, not assumption)

Cron auth (fails closed in prod), public-credential PII (per-column lost-mode gating, no owner PII on active pets), rate-limit infra (atomic, trusted-IP-keyed), JSON-LD XSS escaping, IDOR on self-service writers + libreta-export, private evidence buckets (signed URLs), erasure (genuinely purges PII), the RLS cross-tenant defense (Deep Pass C: fail-closed), error pages / 404s / loading / legal / first-run (all branded, role-correct, es-AR clean), login/session/redirect/logout, password-reset token handling.

## Closed after the audit (PO chose "fix before deploy")

- **#64 CSP header — DONE, ENFORCING.** Nonce-based policy via middleware; rolled out Report-Only → zero-violation headless sweep across every page type (public, JSON-LD, maplibre map + OSM tiles, dashboards, credential) → flipped to enforcing → re-verified (0 violations, 0 blocked resources, map + charts + credential all render).
- **#66 adoption publish button — DONE.** Was stuck disabled by the Next 15.5 dropped-refresh defect (isPending never cleared); decoupled the button from the transition.

## Deferred (documented, not fake-closed)

- **#65 signup enumeration-vs-confirmations design tension** — enabling email confirmations (the proper enumeration-oracle fix) breaks the two-step onboarding; PO decided: keep confirmations OFF for the demo, rework the flow post-demo.
- **#67 adoption applicant→owner linkage** — PO decided to close the online loop (approved applicant auto-becomes owner) post-demo; today finalization resolves the adopter by DNI.
- **DNI verification** is self-declared until Mi Argentina federation (external, roadmap #53).

## Deploy-checklist additions (Ignacio-gated remote apply)

- Apply migrations **0132, 0133, 0134** to the remote DB via the DIM runner (`DATABASE_URL=<remote> pnpm db:migrate`).
- Provision the Supabase **Storage bucket(s)** (the MPF/PDF export path needs it; missing locally).
- Verify the trigger elevation path: after remote seed, confirm no account can self-mint a role.

## Verdict

The project is **secure and usable**. The one critical hole is closed at the root, its class is swept, the internet-facing surface is well-hardened, and the forgotten edges are honest. What remains is PO-gated (the deploy) or product-decision-gated (CSP rollout, the signup flow) — nothing implementable is open.
