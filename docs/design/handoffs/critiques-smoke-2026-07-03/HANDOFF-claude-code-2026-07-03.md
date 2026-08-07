# Handoff to Claude Code — MiMAR QA clickthrough → fixes

## Context
A full manual QA clickthrough of MiMAR (codename DIM) was done on build `d4b2516c`, running at http://localhost:3000 against local Supabase (data intact). All five reachable roles were exercised one session at a time, every major route walked, at desktop width. Findings are written up as a ranked summary plus one doc per role.

## Read these first (this folder)
1. `SUMMARY-2026-07-03.md` — ranked cross-cutting issues + suggested fix order. **Start here.**
2. `critique-owner-2026-07-03.md`, `critique-vet-…`, `critique-org-admin-…`, `critique-govt-…`, `critique-admin-…` — per-role detail with severities, exact routes, and repro notes.

(Full path if you're running in the code repo: `C:\Users\ignac\DIM\DIM\critiques-smoke-2026-07-03\`.)

## Your job
Read the summary and per-role docs, then for **each** finding decide whether it's a real code bug worth fixing — and if so, fix it. Rules:
- **Verify before fixing.** Reproduce/confirm each item against the code; don't patch blindly from the doc.
- **Separate data from code.** Many noisy items are seed/test artifacts (duplicate `uc-cd-govt` accounts, `PANO-Seed-Owner`, future-dated events, junk names like `E2EPet-…`). Treat those as data, not bugs — **unless the display/render logic itself is wrong** (e.g. a list with no pagination is a code issue; the duplicate rows are data).
- **Mutations were not exercised.** The QA pass submitted no forms and fired no approvals/verifications/overrides, so server-action/submit-side logic was not tested. Keep that in mind when reasoning about "it's reachable" findings.
- **When unsure whether something is intended vs a bug, leave a note instead of guessing.**
- Where the repo already has coverage, add/adjust a test (`pnpm test`, `pnpm e2e`, and the `lint:authz` / `lint:rls` guard scripts).

## Repro setup
- App: localhost:3000, build `d4b2516c`, local Supabase.
- Accounts (password `Test1234!`): `owner@dim.test`, `lilian@dim.test` (vet), `alejo@dim.test` (admin of all 4 orgs), `govt@dim.test`, `admin@dim.test`.
- Org tokens: Refugio `DIM-TC7Z-APW6` · Clínica `DIM-6TZM-DUJZ` · Red de rescate `DIM-KN7W-JTB8` · Autoridad sanitaria `DIM-PWZR-B75C`.

## Priority order

**1. [BLOCKER] Adoptions/Operaciones crash.**
`/org/DIM-TC7Z-APW6/adopciones` throws the error boundary ("Algo salió mal", digest `372514334`); console: `Error: An error occurred in the Server Components render`. The same route renders fine on `DIM-KN7W-JTB8` and `DIM-PWZR-B75C`, which have **zero** active adoptions — the shelter (`DIM-TC7Z-APW6`) shows "2 adopciones en curso". It's a **data-dependent server render on active-adoption rows.** Reproduce with an active adoption, find the null/enum/date that blows up, fix, and confirm the panel KPI "Adopciones en curso" deep-links land on the right tab.

**2. Localization pass (spans owner/org/govt/admin).**
Route species/disease/signal enums and section labels through i18n. Raw leaks seen: `dog`/`cat`/`guinea_pig`/`rabbit`, `lepto`/`rabies_suspected`, UI words `PETS`/`Signals`. Add missing Spanish accents: `investigacion`, `verificacion`, `JURISDICCION`, `ACCION`, `Metodos`, "desde aca".

**3. Metric consistency / self-contradiction.**
(a) "Cobertura antirrábica" = **42%** on `/gob` + `/gob/panorama` but **54%** on `/gob/analytics` + `/gob/vigilancia`, under one label → unify definition or disambiguate labels. (b) `/admin/sistema` "SLA ENO **100%**" tagged Normal next to "**12 en breach**" (confirmed by `/admin/outbox` = 12 INCUMPLIMIENTO). (c) Owner pet header "**AL DÍA**" vs "**0 DE 3 AL DÍA**" compliance → drive both badges from one selector.

**4. Admin consoles don't scale.**
`/admin/auditoria` is buried under ~150 identical "Mutación forzada… (override)" rows → collapse/group repeated actions and/or default-exclude system-backfill actors. Add search/filter/pagination to `/admin/govts`, `/admin/usuarios`, and the `/admin/sistema` "actividad por govt" table. Reconcile `/admin/usuarios` rows that all show "Sin acciones disponibles" with the dashboard's promise that admins manage govt accounts (or link out to the detail pages that do).

**5. Vet menu/permission gating.**
A vet without `bite.report` can still open the full `/org/[org]/mordedura/nuevo` create form, contradicting "cada permiso habilita su módulo en el menú." Gate the route (redirect to a request-permission state) or hide the sidebar item — and confirm the underlying server action is blocked too.

**6. Owner nav polish + vet identity.**
Reset scroll to top on client navigation (credential/account pages open scrolled mid/bottom); audit the recurring large trailing whitespace / page-shell min-height; fix the `/denuncias/mias` breadcrumb ("← MIS MASCOTAS" → Inicio/Denuncias). Vet personal greeting renders "Buen día, **Dra..**" (doubled period + title instead of name) — unify name resolution with the org portal's "Dra. Lilian Marrone".

**7. Label unification + data-integrity display.**
One name for the abuse module (sidebar "Maltrato" / topbar "Bienestar" / title "Investigaciones de maltrato"); `/admin/usuarios` header mislabeled "MIMAR GOBIERNO"; align sidebar "Mascotas" with page title "Animales en custodia". Validate/clamp event dates so future-dated events (`15/10/26`, `31/12/26`) don't render as live; make "Top N" headings match row counts; normalize case-code casing on render.

**Also (not from a single screen):** org and govt pages were consistently slow to paint under dev — worth a production perf profile on `/org/*` and `/gob/*`.

## Don't touch (working well — avoid regressions)
Capability model + "Tus permisos"; privacy layer (Tier-0 public credential, k-anonymity suppression, "Buscó por PII" audit); legal-citation surfaces; the event-sourced cross-role model (one rabies case renders consistently across owner/govt/admin); natural-language libreta logging.
