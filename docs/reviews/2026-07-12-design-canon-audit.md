# Design-canon audit — gob / admin / org data screens (2026-07-12)

> READ-ONLY audit. No code edited. Branch `integration/all-20260703`.
> Screens audited against the ten design invariants C1–C10
> (`docs/design/design-canon.md`). Each finding cites real `file:line`, the Cx it
> violates, the exact symptom, and a fix tier: **BOUNDED** (fixable in place —
> labeling C1, coherence C2, k<5 wording C3, disable C5, empty-state C10) or
> **STRUCTURAL** (C8 derive-don't-store, C9 shared-primitive → route to
> `docs/plans/jurisdiction-scope-primitive.md` / viz-suite #33, don't fix inline).
>
> **Headline:** the gob core screens (poblacion, censo, vigilancia, perdidas,
> mortalidad, programa, adopciones, analytics) are mature and largely canon-clean —
> `MapChoropleth.tsx` already gets C3 right (suppressed cells get a hatch pattern +
> "Datos insuficientes (protegidos por privacidad · k-anonimato)" tooltip,
> `MapChoropleth.tsx:606-612`, and the empty note distinguishes true-empty from
> all-suppressed, `:822-832`). The violations cluster in **one shipped k-anon leak
> (campanas)**, **admin/gob parity gaps**, and **org dashboard badge↔list
> coherence** — where two independently-written counts describe "the same" thing.

## Scoreboard

- **Bounded findings: 9** (fixable now, ranked below)
- **Structural findings: 5** (C9 duplication / parity → route to shared-primitive work)
- Highest impact: **F1 (campanas C3 k-anon leak)** — verified end-to-end, ships
  1–4-count localities to a government table *and* a downloadable CSV.

---

## C3 — Suppressed ≠ "sin datos" (highest yield, as predicted)

### F1 — campanas "Alcance geográfico" leaks k<5 locality counts *(BOUNDED — HIGH)* ✅ verified
- **Where:** `lib/analytics/campaign-metrics.ts:340-378` (`fetchGeoReach`) → rendered
  `app/gob/campanas/page.tsx:441-449` (`{r.attendedCount}` at `:446`) → exported raw
  in `app/gob/campanas/export/route.ts`.
- **Symptom:** `fetchGeoReach` groups attendances by `jurisdictionLocality` and
  returns every row's raw `attendedCount` with **no `suppressSmallCells` call** — the
  table then prints the count for every locality, including 1–4. The peer
  `lib/analytics/mortality-metrics.ts:221` runs the *identical* group-by-locality
  shape and correctly routes it through `suppressSmallCells<Cell>(cells, …)` with a
  visible "celdas ocultas (privacidad)" note (`app/gob/mortalidad/page.tsx:365-372`);
  `app/gob/analytics/page.tsx:415-419` does the same for `vetAccess`. campanas is the
  one screen that skipped the proven-safe primitive.
- **Why HIGH:** a real k-anonymity leak on government-facing health-service
  attendance by locality — a locality with 2 vaccinated animals is individually
  identifiable — and it round-trips into a CSV a funcionario can pass around. This is
  the exact panorama C3 bug, replicated.
- **Fix:** route `fetchGeoReach` output through `suppressSmallCells` (k=5) and render
  suppressed localities with the standard privacy note; suppress in the export route
  too. Bounded — the primitive and the peer pattern already exist in-repo.

### F2 — admin/inteligencia "Registros fantasma" KPI hides its suppression exclusion *(BOUNDED — HIGH)*
- **Where:** `app/admin/inteligencia/page.tsx:165-167` (sum) + `:217-225` (KPI caveat),
  vs the quality table at `:481-495`; upstream
  `lib/analytics/territorial-data-quality.ts:220-227`.
- **Symptom:** `totalGhosts` / `totalRecords` are summed only over `quality.rows`,
  which `fetchProvinceDataQuality` has already stripped of k<5-suppressed provinces
  and null-province ("unassigned") pets. The KPI's `info.caveat` (`:223`) never
  discloses this — but the table directly below it *does* ("N provincias ocultas por
  k<5 … registros sin provincia asignada no aparecen", `:481-495`). So the headline
  national count is a silent undercount that disagrees with the table under it.
- **Why HIGH:** the C3 undercount-that-disagrees pattern on the flagship admin
  intelligence surface — two surfaces on one screen contradict, silently.
- **Fix:** add the suppression/unassigned exclusion to the KPI caveat (and, ideally,
  surface the excluded magnitude so the number reconciles). Bounded wording + caveat.

---

## C2 — Coherence: label = number = list = table

### F3 — org dashboard "Transferencias entrantes pendientes" badge misses decomiso handoffs *(BOUNDED — HIGH)* ✅ verified
- **Where:** `lib/analytics/org-dashboard.ts:601-613` (`countPendingTransfers`),
  badge rendered `app/org/[orgToken]/page.tsx:611`; the inbox it summarizes is
  `app/org/[orgToken]/transferencias/recibidas/page.tsx` (decomiso rows ~`:124-159`,
  7-day legal deadline copy ~`:221-229`).
- **Symptom:** the counter filters `eq(cases.caseKind, "custody_transfer_handshake")`
  only — it never counts `custody_episode` (state-seizure / decomiso) handoffs. An org
  with an open decomiso handoff and zero handshakes shows a **`0` badge** (neutral
  tone) while a custody with a hard 7-day legal deadline sits unflagged in its inbox.
  Verified at the SQL level (only `custody_transfer_handshake` is matched).
- **Why HIGH:** the dashboard is the daily-loop summary meant to surface exactly this
  deadline; a `0` here is false reassurance on a legally time-boxed obligation.
- **Fix:** include the decomiso case kind in the pending-transfers count (or add a
  distinct decomiso badge). Bounded query change — but see F12 (it's the same
  duplicate-definition root).

### F4 — org dashboard "Casos abiertos" badge ≠ the casos list it links to *(BOUNDED — MED-HIGH)*
- **Where:** `lib/analytics/org-dashboard.ts:591-598` (`countOpenCases`) vs
  `lib/infra/case-queries.ts:511-562` (`listCasesForOrg`) rendered
  `app/org/[orgToken]/casos/page.tsx:53-65`.
- **Symptom:** the badge counts `openedByOrganizationId = org AND status='open'`. The
  linked list has no default status filter and includes cases where the org is opener
  **or** active custody holder, in any status — so `escalated` cases and
  holder-not-opener cases show in the list but never in the badge. Badge < list.
- **Why MED-HIGH:** two "org open cases" definitions have drifted (C9 root) surfacing
  as a visible C2 disagreement on the flagship "Pendientes" card.
- **Fix:** single-source the count and the list from one query/definition. Bounded.

### F5 — org "Denuncias de maltrato derivadas" badge unreconcilable to its list *(BOUNDED — MED)*
- **Where:** `lib/analytics/org-dashboard.ts:695-707` (`countDerivedWelfare`) vs
  `app/org/[orgToken]/maltrato/recibidos/page.tsx:142-150`.
- **Symptom:** the badge excludes `closed`/`duplicate`/`invalid` and already-`devuelto`
  interventions; the "Recibidos" list has **no** status/intervention filter (`limit
  100`), so clicking "derivadas: 3" can land on 15 mixed-status rows with no way to
  isolate the 3.
- **Why MED:** sensitive welfare domain, but rows carry status pills so the list stays
  legible — it just doesn't reconcile to the badge.
- **Fix:** give the list a default filter matching the badge's definition (or relabel
  the badge). Bounded.

### F6 — org censo per-species KPI ≠ the mascotas list it links to *(BOUNDED — LOW)*
- **Where:** `lib/analytics/org-census.ts:71-98` vs
  `app/org/[orgToken]/mascotas/page.tsx:102-129`.
- **Symptom:** censo KPIs filter `ownerships.role='shelter_custody'`; the linked
  `?species=…` list filters only `ownerOrganizationId + endedAt IS NULL` (no role
  restriction), so it also counts owner/co_owner/caretaker rows. Org holding
  non-shelter animals sees a censo count smaller than its own KPI's link target.
- **Why LOW:** most shelters are shelter_custody-only in practice; code paths diverge
  but rarely bite.
- **Fix:** align the role filter between census KPI and the list link. Bounded.

### F7 — campanas "Completitud" rate KPI shows a volume delta *(BOUNDED — MED-HIGH)*
- **Where:** `app/gob/campanas/page.tsx:136-145` (`completionDelta`) reused at
  `:227-233` (Completitud KPI); `computeDelta` at `campaign-metrics.ts:561-564`.
- **Symptom:** `completionDelta` is the percent-change of the raw completion **count**,
  but it's rendered as the delta chip on the **Completitud rate** tile (value =
  `completionRate`, a %). If the rate is flat at 72% while enrollment doubles, the tile
  reads "72% ↑ +100% vs período anterior" — implying the rate jumped when it didn't
  move. (The same delta is correct on the "Asistencias" count tile at `:239`.)
- **Why MED-HIGH:** a KPI's own value disagrees with its own delta indicator on a govt
  dashboard used to judge campaign trend.
- **Fix:** compute a rate-delta for the rate tile (or drop the chip there). Bounded.

---

## C1 — Numbers/columns name metric + unit

### F8 — admin/adopciones renders "—" for a genuine zero *(BOUNDED — MED)*
- **Where:** `app/admin/adopciones/page.tsx:104-106` ("En custodia"), `:116-120`
  ("En tránsito"), `:129-130` ("Adopciones").
- **Symptom:** `shelterOccupancy.occupied > 0 ? … : "—"` — a truly empty shelter (0 in
  custody) is displayed identically to a broken/unloaded metric. "No data" and
  "operationally zero" are conflated.
- **Fix:** show `0` for a real zero; reserve "—" for genuinely-absent data. Bounded.

### F9 — campanas count KPIs skip es-AR grouping *(BOUNDED — LOW)*
- **Where:** `app/gob/campanas/page.tsx:203,237,247` — `String(dashboard.totals.*)`.
- **Symptom:** raw `String()` on enrollment/completion/noShow counts; every peer screen
  (mortalidad, programa, adopciones) uses `.toLocaleString("es-AR")` for the same count
  KPIs, so `12345` shows here vs `12.345` elsewhere.
- **Fix:** `.toLocaleString("es-AR")`. Bounded, cosmetic.

### F10 — org checkins truncation caveat missing on the "Vencidos" count *(BOUNDED — LOW)*
- **Where:** `app/org/[orgToken]/checkins/page.tsx:108-109` (`CHECKIN_CAP=30` cap
  applied before the overdue/upcoming split at `:139-140`), notice only at `:196-200`.
- **Symptom:** the "Mostrando los primeros 30…" caveat renders only in the "Próximos"
  section; if overdue reminders alone exceed 30, the "Vencidos (N)" header silently
  undercounts with no caveat attached to that number.
- **Why LOW:** needs >30 simultaneous overdue check-ins for one org.
- **Fix:** attach the truncation caveat to whichever section is capped. Bounded.

---

## C4 / C5 — affordance and dead-ends

### F11 — admin ranked-table rows invite a click even when unlinkable *(BOUNDED — LOW)*
- **Where:** `app/admin/poblacion/page.tsx:328-330`, `app/admin/censo/page.tsx:384-386`.
- **Symptom:** every `<tr>` carries `hover:bg-ln-op-stripe/50 transition-colors`
  unconditionally, but the row is only clickable when `adminProvinceHref(row.province)`
  resolves (returns `null` for unresolvable names,
  `lib/infra/admin-province-link.ts:19-24`). Unlinkable rows still hover as if tappable.
- **Fix:** gate the hover affordance on link resolution. Bounded, edge case.

*(No error-on-tap C5 violations found — org queue actions use proper disable/confirm
patterns, e.g. the `ConfirmDialog` gate on "Devolver" in maltrato/recibidos, and the
gob/analytics deferred export correctly disables the Parquet option with a "próximamente"
reason. C5 is in good shape.)*

---

## Structural (C9 / parity) — route to shared-primitive work, do NOT fix inline

### F12 — org dashboard counters are bespoke re-definitions of their list queries *(STRUCTURAL — C9)*
Root cause behind F3/F4/F5/F6: `lib/analytics/org-dashboard.ts` hand-writes a second
`count()` for each "pending" surface (`countPendingTransfers`, `countOpenCases`,
`countDerivedWelfare`, org-census species counts) that must, but doesn't, match the
list query it badges. The durable fix is one shared definition per surface (the badge
and the list derive from the same query), not four independent tweaks — C8/C9 in spirit.

### F13 — admin/poblacion is a *subset*, not a superset, of gob/poblacion *(STRUCTURAL — C9)*
`app/admin/poblacion/page.tsx` header (`:1-15`) frames itself as gob/poblacion's
universal superset, but drops the entire "Cobertura antiparasitaria" (deworming) KPI
that gob ships (`app/gob/poblacion/page.tsx:33,256-274`). National admin sees *less*
than a province official. Route to the shared population-dashboard primitive.

### F14 — admin/poblacion + admin/censo silently swap the choropleth for a table *(STRUCTURAL — C9 + C2)*
`app/admin/poblacion/page.tsx` and `app/admin/censo/page.tsx` claim (header comments) to
"add a table on top of" their gob peers, but neither imports `MapChoroplethDynamic`; the
choropleth central to `app/gob/poblacion/page.tsx:417-435` and
`app/gob/censo/page.tsx:444-457` is absent, replaced (not augmented) by a table. Loses the
geographic pattern-recognition surface for the role with the widest oversight — and the
comment disagrees with the code (C2). Reconcile in the shared dashboard primitive.

### F15 — three bespoke inline empty states instead of `LnEmptyState` *(STRUCTURAL — C9)*
`app/admin/inteligencia/page.tsx:232-235,322-325,405-408`,
`app/admin/libro/page.tsx:275-280`, and `app/admin/auditoria/page.tsx:344` render ad hoc
`<p className="text-ln-op-mute">…</p>` empty states instead of the shared
`<LnEmptyState icon title description>` that admin/poblacion, admin/censo,
admin/adopciones and both gob peers use. Three divergent implementations, each lacking the
icon/title/description structure. Consolidate onto the shared primitive.

*(C8 derive-don't-store duplication across the jurisdiction-scope surfaces is already
covered by `docs/plans/jurisdiction-scope-primitive.md` — not re-audited here.)*

---

## Clean screens (audited, no canon violations)

- **gob:** mortalidad, programa, adopciones, analytics (+ `_components`) — mature; each
  carries prior-audit scar tissue (e.g. analytics' `RABIES_VACCINATION_RATE_LABEL_ES`
  disambiguation and `RegionRankingTable.tsx:125-131` footnote) that already prevents the
  C2 "two rabies numbers disagree" failure. poblacion, censo, vigilancia, perdidas — the
  audited baseline (every OpKpi labeled + `info{definition,formula,caveat}`; suppression
  disclosed as "períodos ocultos (privacidad)").
- **admin:** libro (`EventLedgerRow.tsx`, `view.ts`) — amendment-chain logic coherent,
  error states inline (C5-clean).
- **org:** `app/org/page.tsx`, `app/org/[orgToken]/page.tsx` (honest null-vs-zero: failed
  counters degrade to no-badge, never a fabricated `0`), casos/censo/mascotas/adopciones
  pages are internally coherent — their only issues are the *cross-file* badge mismatches
  above (F3–F6), not the screens themselves. `OrgMascotasBulkList` bulk-publish is a model
  C5 pattern (eligibility explained up front, per-item failure reasons).

## Suggested fix order (bounded, highest impact first)

1. **F1** campanas k-anon leak (C3) — privacy + CSV, verified.
2. **F3** org transfers badge misses decomiso (C2) — legal-deadline reassurance, verified.
3. **F2** admin/inteligencia ghost-KPI undercount caveat (C3/C2).
4. **F7** campanas Completitud rate-vs-volume delta (C2).
5. **F4** org casos badge ≠ list (C2).

Then F5, F8, F6, F9, F10, F11. Structural F12–F15 route to the shared-primitive /
jurisdiction-scope work (`docs/plans/jurisdiction-scope-primitive.md`, viz-suite #33).
