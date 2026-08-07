1. `components/ui/ConfirmDialog.tsx:74` · `useRef(\`…${Math.random()}…\`)` runs on SSR and again on hydrate → mismatched `aria-labelledby` id · **HIGH** · Replace with `useId()`.

2. `app/(app)/mis-mascotas/[publicToken]/page.tsx:699` · `<SheetMounter>` calls `useSearchParams()` with no `<Suspense>` ancestor (unlike `mis-turnos` / `org` pet pages) · **MED** · Wrap `<SheetMounter … />` in `<Suspense fallback={null}>`.

3. `app/(public)/refugios/[orgToken]/page.tsx:218` · Seven `*Sheet` client mounts (`ContactarSheet`, `CompartirOrgSheet`, …) all use `useSearchParams()` with no Suspense · **MED** · Wrap the sheet block in one `<Suspense fallback={null}>`.

4. `app/org/[orgToken]/cobertura/page.tsx:48` · `<CoverageEditor>` uses `useSearchParams()` without Suspense · **MED** · Wrap in `<Suspense fallback={null}>`.

5. `app/(app)/mis-mascotas/[publicToken]/page.tsx:321` · `resolveBusinessRule`, lost-episode/scans, and `fetchPetEventsForProfileV2` run back-to-back after stage 2 though independent · **MED** · `Promise.all` those three after stage 2.

6. `app/gob/maltrato/[id]/page.tsx:139` · Attachments, actor lookup, subject pet, and derivable orgs are four sequential awaits · **MED** · Batch independent reads in one `Promise.all`.

7. `app/(app)/mis-mascotas/[publicToken]/page.tsx:210` + `:568` · Page already loads `allCases` (cap 50) then `<PetOpenCasesSection>` re-queries open cases inside `credencialContent` · **MED** · Reuse `allCases` (or pass prefetched rows) instead of a second fetch.

8. `app/(app)/mis-mascotas/[publicToken]/page.tsx:149-589` · Entire pet profile blocks on ~5 fetch stages before JSX; `<Suspense>` at `:622` cannot stream the shell · **MED** · Split slow slices into async child RSCs each behind Suspense (keep auth/404 gate eager).

9. `components/pet-profile/LibretaFace.tsx:1` · Whole Libreta face is `'use client'` but only badges/ledger/actions need it; imports server `AsientoCard` into the client bundle · **MED** · Split: server `LibretaFace` shell + small client islands (`VacunasStatusBadges`, `FutureLedgerList`).

10. `components/ui/dashboard/CaseQueue.tsx:324` · `ageCaseDays()` uses `Date.now()` during render → SLA pill text can differ SSR vs hydrate · **MED** · Pass precomputed `ageDays` from the server page or compute in `useEffect` after mount.

11. `components/pet-profile/LibretaFace.tsx:119` · `s.date.getTime()` assumes `Date`; server-action payload may deserialize dates as strings · **MED** · Normalize with `new Date(s.date)` before `.getTime()`.

12. `app/(public)/refugios/[orgToken]/OrgHero.tsx:43` · `Date.now()` in Server Component controls “Desde {año}” chip · **LOW** · Compare against a server `now` passed from the page or use calendar-year-only logic.

**clean:** Server pages import chart/map code only via `*Dynamic` (`ssr: false`); `FlipCard`/`LandingHero`/`CountUp` keep `matchMedia` out of render; server actions (not inline callbacks) cross form boundaries; `AppShell`/`PanoramaShell` server→client composition is valid; no server page imports a non-dynamic map/chart client module directly.
