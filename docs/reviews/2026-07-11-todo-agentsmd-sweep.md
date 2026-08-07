# TODO-sweep + AGENTS.md drift (2026-07-11)

> READ-ONLY inventory. Clusters A/B/C got tracked tasks (#28/#29/#30); Mission-2 AGENTS.md
> corrections feed task #27 (post-#21 hygiene batch).

## Mission 1 — in-code debt without a ticket (now tracked)

- **Cluster A → task #28 (blocked on convenio):** Mi Argentina OIDC/DNI stub — 10 files,
  ~14 `TODO(25b)`/`TODO(mi-argentina)` hits. `app/auth/miarg/callback/route.ts` is a hard 501;
  `lib/infra/miarg-oidc.ts` has 5 gaps (discovery validation, token exchange, claims upsert);
  matching notes in `dni-hash.ts`, `verify-dni.ts`, `DniVerifyForm.tsx`,
  `request-vet-upgrade.ts`, `generate-ppp-export.ts`, `seed-test-users.ts`. Well-gated
  (404-when-unconfigured). Loosely covered by AGENTS.md open-questions rows but had no
  numbered home.
- **Cluster B → task #29:** Prov. Buenos Aires PPP export never implemented
  (`TODO(F2-prov-ba-v2)` ×4 in `lib/analytics/ppp-exports.ts` +
  `generate-ppp-export.ts`) — non-CABA pets hard-fail with `ppp_prov_ba_not_implemented`.
  Live legal gap (Ley 14.107) documented in AGENTS.md but unticketed.
- **Cluster C → task #30:** denuncia-wizard `TODO(M-followup)` pair (org-side wizard to
  retire `WelfareReportForm.tsx`; `LocationFields` onChange refactor in `DenunciaWizard.tsx`)
  — re-discovered twice (2026-05-21 archive §4.15, 2026-07-10 surface-coverage audit) without
  ever becoming an issue.

**Tracked-elsewhere (no action):** `authority.ts` dispatch TODOs (Ley 14.346 pipeline,
AGENTS.md legal framework), `vaccine-reminder-state.ts` ENO TODO (live spec C-D2),
`cross-border-corridors.ts` citation-pending (feature table), `get-panorama-kpis.ts` bbox
(active #21-24 work).

**Trivial (fold into #27 or ignore):** deprecated re-exports (`caseEvents` aliases,
`case-cron.ts` authorizeCronRequest, `WizardShell` landmark note), E5-followup multi-series
chart notes, brotes filter-chips future note, denuncia-autosave deferred note.

## Mission 2 — AGENTS.md drift (corrections for #27's docs refresh)

1. **Roles table (~line 190), vet row is now false:** since `6bba0af2` a vet with exactly ONE
   non-admin membership lands directly on `/org/[token]`; `/cuenta/memberships` only for 2+.
   Add the fourth branch.
2. **Welfare denuncias inventory row (~line 1065) stale by omission:** `/gob/moderacion`
   (jurisdiction-scoped queue + triage actions) shipped 2026-07-08/10 — the row only lists
   `/admin/moderacion`. List both, note the shared `buildModerationQueueConditions` predicate.
3. **Design rules §Operator variant (~line 1247):** add the panorama exception — `/gob|admin/
   panorama` is the one viewport-locked "fixed console" (no page scroll), per v2C.
4. **Feature inventory has NO panorama section at all:** add `### Panorama / situational
   console` rows (light theme since `fd757227`, event-points mode, v2C fixed console, cube
   status incl. CUBE_READS flag).

Also from the inverse sweep (same #27 batch): AGENTS.md + superpowers README cite migrated
`lib/*.ts` root paths (`scan-retention`, `miarg-oidc`, `owner-nudges`, `auth-guards`,
`govt-dashboards`, `campaign-metrics`) that now live under `lib/infra|analytics/*`.

`docs/agents/README.md`: no drift found.
