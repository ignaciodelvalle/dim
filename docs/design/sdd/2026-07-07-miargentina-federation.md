# SDD — Mi Argentina federation (login + identity)

**Date:** 2026-07-07 · **Status:** design note (DOC ONLY — no code this cycle) · **Owner:** Ignacio Del Valle (PO)

> PO decision (locked): Mi Argentina federation is **external / pre-provisioned**. It "llega con el primer deploy de una localidad" — the convenio and the OIDC client credentials arrive together with the first real jurisdiction onboarding. There is **nothing to build speculatively**. This document freezes the callback contract and the exact wiring point so that, the day the convenio lands, Item 25b is a drop-in with zero surprise.

---

## Proposal

**Intent.** Let a citizen authenticate to MiMAR with their Mi Argentina identity (OIDC), inheriting a RENAPER-grade `dni_verified` signal instead of MiMAR's self-asserted DNI. This is institutional-legitimacy infrastructure, not a user-visible feature per se — it is the premise the whole product rests on (Invariant #6: "Mi Argentina federation is the premise — no decision may harm that path").

**Why now = documentation only.** The integration cannot be exercised without a real OIDC client issued by the Mi Argentina developer portal, which is gated on a signed convenio. Writing code against a guessed claim set would be building a wrong external format — the exact anti-pattern this backlog is meant to avoid. What we can and must do is guarantee that the seam is already cut so the wait costs zero refactor.

**Scope of this cycle.** None (no code). Deliverable is this contract note.

---

## Current state (what already exists — audited 2026-07-07)

The 25a scaffold is real and shippable-as-invisible. Nothing below is aspirational:

| Artifact | Path | State |
|---|---|---|
| Env gate | `lib/infra/miarg-oidc.ts` → `isMiArgOidcEnabled()` | Returns `false` unless all four `MIARG_OIDC_*` vars are set. Entire OIDC path is dark until then. |
| OIDC config reader | `lib/infra/miarg-oidc.ts` → `getMiArgOidcConfig()` | Reads issuer/client/secret/redirect; derives authorize+token endpoints. |
| Claim shape | `lib/infra/miarg-oidc.ts` → `MiArgClaims` | `sub`, `name?`, `dni_verified?`, `dni?`, `email?`. **Illustrative — to be confirmed against the real discovery doc in 25b.** |
| Profile upsert (signature only) | `lib/infra/miarg-oidc.ts` → `upsertProfileFromMiArgClaims()` | Body throws `not implemented`. Signature is **final**. |
| Callback route (gated stub) | `app/auth/miarg/callback/route.ts` | 404 when gate off; 501 when gate on but body not wired. |
| Illustrative demo view | `app/admin/acerca/integracion-miarg/page.tsx` | Non-hideable "vista ilustrativa" disclaimer. No OIDC. Admin-only. |
| Signup / login placeholders | `app/(auth)/signup/*`, `app/(auth)/login/LoginForm.tsx` | "Mi Argentina próximamente" affordance, no wire. |

**The seed-bypass that Mi Argentina replaces.** Today `dni_verified` is set by the self-serve flow at `/cuenta/verificar-dni` (`verifyDniAction`) — the user types their DNI, it is hashed (`hashDni`, never plaintext, Invariant #5), and `dni_verified=true` is written with an audit row. This is a **stand-in for the federated signal**: it proves "this account asserts this DNI" but not "the State vouches this DNI belongs to this human". Mi Argentina federation upgrades that same boolean from self-asserted to RENAPER-backed, and additionally sets `identity_source='miarg'` + `miarg_sub` (the stable FK to the federated identity). Everything downstream that reads `dni_verified` (petition prerequisites, vet-upgrade gate — see `docs/patterns/petition-prerequisites.md`) keeps working unchanged; only the *provenance* of the flag improves.

---

## Spec — the callback contract (frozen)

### R1 — Callback URL is stable

- **R1.1** The redirect URI is `https://<host>/auth/miarg/callback` and MUST match the `MIARG_OIDC_REDIRECT_URI` env var and the registration in the Mi Argentina developer portal. Changing the route path after registration breaks the convenio — treat `app/auth/miarg/callback/route.ts` as an ABI.

### R2 — Gate behavior is binary and invisible

- **R2.1** WHEN none of the four `MIARG_OIDC_*` vars are set, THEN the callback returns 404 and the email/password flow is entirely unaffected (no "Mi Argentina" active path). *(Already true — do not regress.)*
- **R2.2** WHEN the vars are set but the body is not implemented, THEN the callback returns a developer-readable 501 (never a silent success). *(Already true.)*

### R3 — Item 25b implementation contract (the drop-in)

When the convenio lands, 25b implements the callback body **in `app/auth/miarg/callback/route.ts` only**, calling the already-final signatures. Steps (from the file header, restated as acceptance criteria):

- **R3.1** Validate the `state` parameter against the value stashed at authorize-time (CSRF). Reject mismatch with 400.
- **R3.2** Exchange `code` → tokens at `getMiArgOidcConfig().tokenEndpoint` (authorization_code grant, PKCE code_verifier).
- **R3.3** Verify the `id_token` signature against the issuer JWKS. Reject invalid signature.
- **R3.4** Map verified claims → `MiArgClaims`, then call `upsertProfileFromMiArgClaims(userId, claims)`. This sets `miarg_sub`, `identity_source='miarg'`, `dni_hash`, `dni_last4`, `dni_verified = claims.dni_verified ?? false`, `dni_verified_at=now()`. **Never store the raw DNI** — hash at the boundary (Invariant #5).
- **R3.5** Handle `23505` on `miarg_sub` (the federated identity is already linked to a different MiMAR account) with a friendly, non-enumerating error — same discipline as the DNI-collision message in `completeIdentityAction`.
- **R3.6** Establish the MiMAR (Supabase Auth) session and redirect to the role-based landing (`/mis-mascotas` for owner).

### R4 — No new tables, no migration

- **R4.1** All target columns (`miarg_sub`, `identity_source`, `dni_hash`, `dni_last4`, `dni_verified`, `dni_verified_at`) already exist on `profiles`. 25b adds **zero** schema.

---

## Design

**Architecture: strangler seam, already cut.** The integration is a single well-known file (`callback/route.ts`) calling two already-frozen functions (`getMiArgOidcConfig`, `upsertProfileFromMiArgClaims`). No other file needs to change when 25b lands — that is the whole point of the 25a scaffold and it holds.

**Wiring point (the one place to touch):**
```
app/auth/miarg/callback/route.ts   ← implement R3.1–R3.6 here
  └─ lib/infra/miarg-oidc.ts        ← getMiArgOidcConfig(), upsertProfileFromMiArgClaims() (bodies)
```

**Environment provisioning (ops, when convenio lands):** set in Vercel env secrets — `MIARG_OIDC_ISSUER`, `MIARG_OIDC_CLIENT_ID`, `MIARG_OIDC_CLIENT_SECRET`, `MIARG_OIDC_REDIRECT_URI` (+ optional endpoint overrides). Setting them flips the gate; until every one is present the path stays dark (fail-safe, not fail-open).

**Claim-set risk.** `MiArgClaims` field names are illustrative. The real Mi Argentina OIDC discovery document is the source of truth; 25b's first task is to fetch `/.well-known/openid-configuration` and reconcile. This is contained to one type + one function body.

---

## Tasks (deferred — for the 25b cycle, gated on convenio)

- [ ] (25b) Obtain OIDC client credentials from the Mi Argentina developer portal (convenio prerequisite — **PO/legal, not code**).
- [ ] (25b) Fetch the real discovery doc; reconcile `MiArgClaims` field names + `dni_verified` semantics.
- [ ] (25b) Implement authorize-redirect + PKCE/state generation (new: `app/auth/miarg/authorize/route.ts` or inline on the login CTA).
- [ ] (25b) Implement R3.1–R3.6 in `callback/route.ts`.
- [ ] (25b) Implement `upsertProfileFromMiArgClaims` body per R3.4.
- [ ] (25b) Wire the login/signup "Acceder con Mi Argentina" CTA to the authorize route.
- [ ] (25b) e2e against the Mi Argentina staging IdP.

**This cycle: nothing to implement.** Contract frozen above.

---

## Open questions (for the convenio / 25b, NOT blocking anything today)

1. **Session bridging.** Does MiMAR mint its own Supabase Auth session post-federation, or does Mi Argentina remain the session authority (token refresh against their issuer)? Affects R3.6. → needs the convenio's technical annex.
2. **`dni_verified` trust transfer.** If Mi Argentina returns `dni_verified=false` for a citizen, does MiMAR keep any prior self-asserted `true`, or downgrade to the federated value? Proposed: federated value wins (it is authoritative), but log the transition. → PO decision at 25b.
3. **Account linking UX.** A user who already self-verified their DNI, then logs in via Mi Argentina under the same DNI — merge or block? The `miarg_sub` 23505 path (R3.5) currently blocks; a merge flow is a separate design. → defer to 25b.
4. **Real claim names.** Placeholder `sub/name/dni/dni_verified/email` must be confirmed. → 25b first task.
5. **Federated credential issuance (beyond login).** The backlog also lists "emisión federada de credenciales" as an ⚪ open question — Mi Argentina *issuing* a MiMAR credential, not just authenticating. Out of scope of the login contract; flagged for a future SDD.
