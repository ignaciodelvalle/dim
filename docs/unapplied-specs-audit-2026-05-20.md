# Audit — Specs & plans not yet applied

**Date:** 2026-05-20
**Scope:** every spec/plan across `C:\Users\ignac\DIM\DIM` and `C:\dev\dim` whose status is **not** ✅ in `docs/superpowers/README.md`, plus the freshly written infra plans (`action-plan-2026-05-20.md`, `docs/testing/PLAN.md`).
**Ordering rule:** urgency × value added. Blockers first; then security/foundation; then features (cheap wins → big-leverage → niche).

---

## Tier 0 — Hard blockers (do these or nothing else durably ships)

| Rank | Item | Source | Urgency | Value | Effort |
|---|---|---|---|---|---|
| 1 | **Working-tree recovery** — `C:\Users\ignac\DIM\DIM` is the corrupted tree (116 truncated files, `.git/index` unreadable). Move to `C:\dev\dim`, out of any sync folder. | `docs/action-plan-2026-05-20.md` Phase 0 | 🔴🔴🔴 | Foundational | A few hours, manual |

Nothing below is durable until Phase 0 is done. The "DIM" folder you're sitting in is the broken one; the working repo is `C:\dev\dim`.

---

## Tier 1 — Foundation infra (cheap, blocks/unblocks everything downstream)

| Rank | Item | Source | Urgency | Value | Effort |
|---|---|---|---|---|---|
| 2 | **Convention scaffolding** — `CONTRIBUTING.md`, PR/issue templates, `CODEOWNERS`, add `pnpm test` + `db-check` to `ci.yml`, branch protection. | `action-plan-2026-05-20.md` Phase 1 | 🔴🔴 | High (sets rails for every Claude Code session after) | ~2h |
| 3 | **Test-gating in CI** (`pnpm test` step) | `docs/testing/PLAN.md` Fase 0 + action-plan Phase 1.5 | 🔴🔴 | Without it, every other test is theater | 1 day |
| 4 | **Coverage targets in `vitest.config.ts`** (D2 of testing doctrine: branch coverage by folder) | `docs/testing/PLAN.md` Fase 0 / D2 | 🔴 | Catches regressions automatically | 1h |
| 5 | **Postgres-in-CI** (Supabase action or docker-compose) | `docs/testing/PLAN.md` Fase 0 / D1, D12 | 🔴 | Enables actually running tests in CI | 3h |

---

## Tier 2 — Security batch (one PR each, all from Project Review §2)

These are real findings against `HEAD`, not just the corrupted tree. Order matters — do top-down.

| Rank | Item | Source | Severity | Effort |
|---|---|---|---|---|
| 6 | **Gate `claimStubProfileAction`** behind `STUB_CLAIM_ENABLED=false` until Mi Argentina lands. Today: anyone who knows a DNI can claim that profile. | action-plan §2.1 + review §2.1 | **Critical** if any prod data exists | ½ day |
| 7 | **Notifications outside transactions** — `cross-org-transfer`, `foster-proposals`, `foster-volunteers`, `adoption-applications`. A notif insert failure today rolls back the *whole* user intent. | action-plan §2.2 + review §2.5 | High | ½–1 day |
| 8 | **Restrict libreta-share revocation** to creator + admin (current code lets any later owner / foster revoke vet access). | action-plan §2.3 + review §2.2 | Medium-High (product decision wrapped in security risk) | 1h |
| 9 | **Sanitize `next` redirect** in `dni-verification.ts` (use `new URL()` parsing, not string `.includes()`). | action-plan §2.4 + review §2.3 | Medium | 1h |
| 10 | **Cross-org-transfer accept re-derives receiver from case row**, not from event payload. | action-plan §2.5 + review §2.4 | Medium | ½ day |
| 11 | **Public-token generator** — rejection-sampling fix for modulo bias + collision retry loop. | action-plan §2.6 + review §2.6 | Low today, scales with users | 2h |

---

## Tier 3 — DB & RLS hygiene (one PR, big leverage)

| Rank | Item | Source | Effort |
|---|---|---|---|
| 12 | **`ON DELETE` clauses on the ~42 FKs that default to RESTRICT** (most should be `set null` for audit fields). | action-plan §3.1 + review §3.1 | 1 day |
| 13 | **Add FK indexes** on `auditLog.*`, `adoptionApplications.*`, `approvalRequests.*`, `pets.adoptionEligibilitySetByUserId`, etc. | action-plan §3.2 + review §3.2 | ½ day |
| 14 | **Mirror migration CHECK constraints into Drizzle** (`pets` adoption-eligibility — 0023). | action-plan §3.3 + review §3.3 | 2h |
| 15 | **Audit-log the `app.allow_event_mutation` escape hatch** (today it's silent). | action-plan §3.4 + review §3.4 | 2h |
| 16 | **Atomic projection rebuild per pet** (advisory lock in `rebuild-projections.ts`). | action-plan §3.5 + review §3.5 | 1h |

---

## Tier 4 — Convention enforcement (mechanical guardrails)

| Rank | Item | Source | Effort |
|---|---|---|---|
| 17 | **Server-action auth-call enforcement test** (every exported async in `app/actions/` must call `requireUser`/`requireCapability`/etc., or carry `// @no-auth-required`). | action-plan §4.1 + review §2.7 | ½ day |
| 18 | **Widen RLS smoke** to (anon read, anon write, wrong-org read, wrong-org write) × major tables. | action-plan §4.2 + review §5.3 | 1 day |
| 19 | **`docs/event-design-checklist.md`** (already exists — link from CONTRIBUTING + PR template). | action-plan §4.3 | 1h |
| 20 | **`schemaVersion: z.literal(1)` on every event payload** + backfill SQL gated by the GUC. | action-plan §4.4 | ½ day |

---

## Tier 5 — Cheap feature wins (½–1 day, high signal)

| Rank | Item | Plan | Effort |
|---|---|---|---|
| 21 | **CABA barrios import execution** — script already written, just run + verify + tweak combobox ranking. | `2026-05-19-caba-barrios-import-execution.md` | ½ day |
| 22 | **Fix vet portal routing** (`professional.provider` → `/pro` instead of `/mis-mascotas`). | `2026-05-19-fix-vet-portal-routing.md` | ½–1 day |
| 23 | **Fix service-dog 404** (hide `/asistencia` link for non-owners, friendly message instead of 404). | `2026-05-19-fix-service-dog-404.md` | ½ day |
| 24 | **Bulk revoke UI** (server action exists; needs 4 queue UIs + bulk attachment uploader). | `2026-05-18-admin-page-fases-10-14.md` Fase 13 follow-up | ½ day |
| 25 | **Extract `inputClass`/`labelClass` to `lib/form-classes.ts`** (today copy-pasted across 12 forms). | review §4.1 | 30 min |
| 26 | **Apply `db/foster_rls.sql` in Supabase Studio** (foster pool follow-up). | `2026-05-18-foster-volunteers-pool.md` | 15 min |
| 27 | **Configure rabies cron in `vercel.json`** (handler exists, schedule doesn't). | `2026-05-18-bite-rabies-observation.md` follow-up | 15 min |
| 28 | **Validate canonical jurisdiction in remaining 5 server actions** (vet upgrade, org creation, service-offerings, welfare, events). | `2026-05-18-localities-catalog-indec.md` follow-up | ½ day |

---

## Tier 6 — Big-leverage features (Ready for Claude Code, plan written)

These have full plans/specs and unblock multiple downstream items.

| Rank | Item | Plan | Effort | Unblocks |
|---|---|---|---|---|
| 29 | **Sistema de casos (expedientes)** — schema + 7 case_kinds + cascade close + RLS + UI. The single biggest piece pending. | `2026-05-19-cases-system.md` (7 fases A-G) | **2–3 weeks** | Cross-org transfer UX, org abuse investigation, decomiso chain, bite-from-unowned, adoption v1.4 addendum |
| 30 | **Adoption handshake unified** (28-question structured form + per-adoption contract PDF with merge fields + applicant consent loop). Replaces the broken `finalizeAdoptionAction`. | `2026-05-20-adoption-handshake-unified.md` (8 fases) | ~7 days | Closes the biggest correctness hole in the adoption flow |

---

## Tier 7 — Smaller features (Ready for CC, no upstream block)

| Rank | Item | Plan / Spec | Effort |
|---|---|---|---|
| 31 | **Performed-by autocomplete** (vets/clinics linked + free text fallback, 6 event types). Independent. | spec `2026-05-19-performed-by-autocomplete-design.md` — needs plan | 5–6 days |
| 32 | **Pet profile v2 + Achievements** (v1.0 timeline removal + 5 achievement chips; v1.1 PPP card + Service Dog credential). | spec `2026-05-19-pet-profile-v2-design.md` v1.1 — needs plan | ~1 week |
| 33 | **Pregnancy tracking** (`clinical_info_logged(sub_kind='pregnancy')` + `pets.pregnancy_status`). Activates Achievement A4. | spec `2026-05-19-pregnancy-tracking-design.md` — needs plan | 5 days |
| 34 | **ENO vet direct report + owner alerts** (extends symptom surveillance). | spec `2026-05-19-eno-vet-direct-report-and-owner-alerts-design.md` — needs plan | 5 days |
| 35 | **Govt business rules POC** (per-jurisdiction config, 3 PPP rule_types). Independent. | spec `2026-05-19-govt-business-rules-poc-design.md` — needs plan | 7–9 days |

---

## Tier 8 — Depends on Sistema de casos (do *after* rank #29)

| Rank | Item | Plan / Spec | Effort |
|---|---|---|---|
| 36 | **Cross-org transfer UX** (activates `custody_transfer_handshake` case kind). | spec `2026-05-19-cross-org-transfer-ux-design.md` — needs plan | 5 days |
| 37 | **Org abuse investigation** (verified-org reports auto-critical + priority queue). | spec `2026-05-19-org-abuse-investigation-design.md` — needs plan | 4–5 days |
| 38 | **Decomiso → refugio chain** (Ley 14.346 — govt-side UI). | spec `2026-05-19-decomiso-welfare-authority-design.md` — needs plan | 7–8 days |
| 39 | **Adoption listing v1.4 addendum** (consent + applicant-history scope-bound view + RLS extensions). | `2026-05-18-adoption-listing-public-design.md` v1.4 | TBD |
| 40 | **Bite from unowned animal** (`temporary_pet_descriptions` + reconciliation hook on signup). | spec `2026-05-19-bite-from-unowned-animal-design.md` — needs plan | 8 days |

---

## Tier 9 — Spec-only, pending decisions before plan can be written

| Rank | Item | Source | Notes |
|---|---|---|---|
| 41 | **Physical tag** (`/t/[serial]` → `/p/[publicToken]`). | spec `2026-05-18-physical-tag-design.md` v1.0 §15 | Decide: material/fabricante (AR vs import), auto-revoke on death, DIY QR. |
| 42 | **Pet spaces catalog** (7 kinds, MapLibre, govt curation + org self-request). | spec `2026-05-19-pet-spaces-catalog-design.md` v1.0 §15 | 8 open questions before plan. ~2–3 weeks once decided. |

---

## Tier 10 — Long-horizon (testing PLAN.md Fases 2-4, ship later)

| Rank | Item | Source | When |
|---|---|---|---|
| 43 | **Property-based testing** for validators / business rules. | `docs/testing/PLAN.md` Fase 2A | Post pre-release |
| 44 | **Dataset adversarial** in `seed:test`. | Fase 2B | Post pre-release |
| 45 | **Visual regression** (Chromatic or Playwright snapshots). | Fase 2D | Post pre-release |
| 46 | **k6 load testing** (5 escenarios, baseline/spike/soak/feed/token). | Fase 3B | When approaching scale |
| 47 | **Chaos engineering basics** (Supabase down, token expired mid-form, etc.). | Fase 4A | Scale stage |
| 48 | **IDOR fuzzing automatizado**, PII leak detection, captcha, external pen test. | Fase 4B–4E | Scale stage |

---

## Summary — what to do this week

1. **Phase 0** — move to `C:\dev\dim`, kill OneDrive/Dropbox, `pnpm install`, `pnpm typecheck`, `pnpm test`, `pnpm dev`. **Until this is green, nothing else lands.**
2. **Phase 1** — `CONTRIBUTING.md` + PR/issue templates + add `pnpm test` to CI. ~2h.
3. **Phase 2.1** — gate `claimStubProfileAction` behind a flag. This is the only **critical** security finding. ½ day.
4. Then knock out Phase 2.2–2.6 (security batch) one PR at a time.
5. Then Phase 3 (DB hygiene) as one big migration PR.
6. Then start *either* the cases system (rank #29, biggest leverage) *or* the adoption handshake (rank #30, biggest correctness fix). Both are 1–3 weeks; pick based on which user pain you want to address first.

---

## What to do with this audit

This file lives at `C:\Users\ignac\DIM\DIM\docs\unapplied-specs-audit-2026-05-20.md`, which is the corrupted tree — once you've migrated to `C:\dev\dim`, copy it to `C:\dev\dim\docs\unapplied-specs-audit-2026-05-20.md` so it survives the move.
