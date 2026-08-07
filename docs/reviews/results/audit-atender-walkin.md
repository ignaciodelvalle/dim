## Audit complete

I reviewed the full walk-in flow (`atender-access.ts`, `actions.ts`, the two pages, `CodeEntryForm.tsx`, `AtenderCaptureMounter.tsx`), diffed the provenance mapping against `lib/infra/pet-access.ts` line-by-line, and traced every writer import. Results are in `docs/reviews/results/audit-atender-walkin.md`. Summary:

**Real findings (2):**

1. **HIGH — the consent-proxy premise is architecturally broken.** The design treats "knowing the DIM code" as a stand-in for "the pet is physically here," but that same code is DIM's own public Tier‑0 credential — resolvable with zero auth at `/p/[publicToken]`, and by design meant to be printed on tags/posters and shared for lost-pet broadcasts. High entropy prevents *guessing*, but does nothing against *exposure*, which the system itself encourages. Net effect: any org member with `event.write` anywhere in the country (every self-serve `vet_individual` gets it implicitly) can permanently sign clinical events onto a pet they never saw, using a code lifted from a photo or social post.

2. **MED — no rate limiting or audit trail on the code lookup.** The anonymous `/p/[publicToken]` page explicitly rate-limits per IP to stop exactly this kind of token-space enumeration; the atender lookup (authenticated, but with a much larger caller pool) has no such guard and doubles as a national existence-oracle (confirms a code is live + returns name/species/status) with unlimited attempts.

**Confirmed clean (5):** no owner-PII leakage in the pet resolver; authz fail-closed for non-members and members without `event.write`; the erased-account lockout is applied; the #43 provenance mapping is byte-identical to the canonical one (gated on `matriculaVerified`, never `organizations.verified`); only the 5 clinical writers are reachable (no custody/transfer/adoption path); and `authorOrganizationId` is always DB-resolved from the URL token ∩ the caller's own membership, so there's no confused-deputy angle.That background `find` command finished — it was just locating the decomiso lookup file for comparison (turned up results in `.claude/worktrees/*` plus the canonical `src/modules/decomiso/application/decomiso-pet-lookup/lookup-pet-for-decomiso.ts` and `app/actions/decomiso-pet-lookup.ts`). I already used that file's contents earlier in the audit, so no follow-up is needed — the audit results are complete and written to `docs/reviews/results/audit-atender-walkin.md`.
ed on signer + org.

3. Clean — PII: `resolveAtenderPet` (`atender-access.ts:196-207`) selects only `id/publicToken/name/species/status` from `pets`; no join to `ownerships` or `profiles` for owner data anywhere in the atender path.

4. Clean — authz bypass: non-member fails closed (`atender-access.ts:114-116`); member without `event.write` fails closed (`atender-access.ts:140-146`); self-erased account (`deletedAt`) lockout is applied (`atender-access.ts:118-134`), same guard as `requirePetAccess` (`lib/infra/pet-access.ts:119-143`); admin-role implicit grant delegates to the identical `getGrantedCapabilities` used by the custody path (`src/modules/organizations/infrastructure/authz-resolver.ts:89-112`) — no separate/weaker admin shortcut was introduced.

5. Clean — provenance integrity: the `vet`/`shelter` mapping (`atender-access.ts:151-161`) is logically identical to the canonical mapping in `lib/infra/pet-access.ts:208-214` — both gate `verified_professional` on `profiles.matriculaVerified` alone, never on `organizations.verified`. No drift between the two.

6. Clean — scope creep: `actions.ts` imports exactly the 5 clinical writers (`createVaccination`, `createDeworming`, `createClinicalInfo`, `createMedicationStart`, `createNote`); no custody/transfer/adoption/ownership writer is imported or reachable anywhere under `atender/**`.

7. Clean — cross-org confused deputy: `eventAuthorship.authorOrganizationId` is always the DB-joined `organizations.id` resolved from `orgToken` ∩ the caller's own active membership (`atender-access.ts:96-116`); it is never taken from client input, so the URL `orgToken` cannot be used to attribute an event to an org the caller doesn't belong to.
