# Panorama campaign — 2026-07-12 (autonomous run)

> Consolidation of four QA rounds + Cowork round-3 + the "generalize the learnings" ask. The PO
> granted an autonomous run: review → plan → tasks → complete the buildable pendings. This doc is the
> spine. Grounded against `integration/all-20260703`. Companion: `docs/reviews/2026-07-12-panorama-qa-rootcause.md`
> (rounds 1-3 triage) + `docs/reviews/2026-07-12-cowork-qa-ronda3-panorama-ux.md` (Cowork funcionario run).

## The design canon (reusable — this is the generalizable output)

Ten design invariants distilled from the panorama QA. They are NOT panorama-specific; they are the
checklist every data screen (gob analytics, admin dashboards, org panels) must pass. "Learned from"
cites the panorama symptom that taught it.

| # | Invariant | Learned from | Universal? |
|---|---|---|---|
| C1 | **Every number/column/list names its metric + unit.** | the `-49`; Registros "Valor 204%" | ✅ every dashboard/table |
| C2 | **Coherence: label = number = map = table, always.** No surface contradicts another. | card 64,4% vs map "sin datos"; Registros "0" vs 5 rows | ✅ any aggregate+detail screen |
| C3 | **Suppressed ≠ "sin datos" — say "protegido por k<5"** when an aggregate exists but detail is k-suppressed. | 64,4% aggregate, locality detail suppressed | ✅ any k-anon surface |
| C4 | **Clickable things look AND behave clickable** — a clear mental model (radio vs checkbox). | cards look like KPIs, act like layer toggles | ✅ cards/chips everywhere |
| C5 | **Disable + explain; never error-on-tap.** | province-only coverage chip | ✅ conditional actions |
| C6 | **Progressive disclosure: the collapsed state is useful alone; expand adds MORE.** | legend/scale visibility | ✅ any disclosure/tooltip |
| C7 | **One uniform update model — no jarring full reloads.** | custom período reload (Root B) | ✅ multi-control screens |
| C8 | **Don't store what you can derive** (two surfaces reading one value can't diverge). | derived preset; jurisdiction-scope ×16 | ✅ structural spine |
| C9 | **One job = one shared primitive, consistent look.** | Registros/Estadísticas/Timeline = 3 bespoke tables; 2 switchers | ✅ component consistency |
| C10 | **The initial/empty state must not read as "vacío"** when data exists. | opens on "Registros 0" | ✅ every screen default |

Map-only (do NOT generalize beyond the other maps, #51): decoupled navigation (click=drill), LOD.

## Workstreams

### WS-1 — Cowork round-3 panorama fixes (autonomous now)
Concrete bugs from the funcionario run. Priorities are Cowork's.
- **P1.1 Registros (C1,C2):** "Total: 0 registros" ↔ 5 rows with values — separate the *event count* from the *per-unit value*; label the "Valor" column with the active metric + unit; resolve `% > 100` (state what it's a % of, or use absolutes). `MapDataTable.tsx` + the Registros dock pane.
- **P1.2 Card ↔ map "sin datos" (C3):** when the aggregate exists but per-locality detail is k-suppressed, say "detalle por localidad protegido por k<5" instead of "Sin datos para esta capa". `SituationalMap.tsx:3629` empty-overlay copy + the condition that distinguishes true-empty from suppressed.
- **P1.3 Delta stuck on scrub (C2):** delta sticks at "+63 pts", never clears returning to "último evento"; "Ahora" disabled → only reload fixes. Recompute/clear the delta on asOf change + always allow "Ahora" to reset. `PanoramaConsole.tsx` delta + asOf reset path.
- **P2.4 KPI value vs timeline (C2):** scrubbing changes map+label+Registros but not the big KPI number. Either the number follows `asOf`, or it is explicitly labeled "estado actual" and visibly does-not-track. (Honor the HYBRID: temporal KPIs track, stock KPIs = "estado actual" — but make the not-tracking EXPLICIT so it never reads as a lie.)
- **P2.5 "Peores 10" (C1,C2,C10):** label the ranking metric; make it follow the active preset (brotes → worst by brotes); for small scopes offer a fallback ("rankeo tus N localidades") instead of "sin datos suficientes".
- **P3.6 Simple/Detalle consistency (C9):** still present in *Capas del mapa* and *Reproducción temporal* — unify (remove or make each label mean the same thing).
- **P3.7 Cards radio-vs-checkbox (C4):** clarify the model; the tooltip must not promise "pintar" a metric that yields "sin datos". (Ties to the derived-preset model, WS-4/P2.)
- **P3.8 `layers` self-rewrite (C8):** the URL `layers` rewrites itself on navigation → the user's view isn't preserved / links don't reproduce. (Ties to the commit-unify + ViewState boundary.)
- Also: initial state opens on "Registros 0" → open on the map/Estadísticas (C10).

### WS-2 — Root B: unify the update model (autonomous now)
Make período commit **shallow + client refetch** like the other 11 controls (only período full-reloads today, `PeriodPanel.tsx:51`). Machinery already exists (`applyPreset` proves shallow período works; `resyncBoardFromUrl` handles popstate coherence). Behavioral parity check like P1b. Fixes C7.

### WS-3 — Design canon: codify + audit + apply (autonomous now)
- Codify the canon (this doc's table) as the auditable reference.
- **Audit** gob analytics (`poblacion/censo/perdidas/vigilancia/adopciones/campanas/mortalidad/programa`), admin (`inteligencia/libro/auditoria`), org panels against C1-C10 → violations with file:line, ranked.
- **Apply** the bounded fixes the audit surfaces (labeling C1, coherence C2, k<5 messaging C3, empty-states C10). Structural ones (C8/C9) route to WS-5 / #33.

### WS-4 — ViewState continuation (STAGED, multi-session — plan + tasks only this run)
P2 (capability gate + **derived preset**, the P3.7/item-1 root fix) → P3 (first-class Encoding + inset → structurally fixes card/CABA "sin datos" disappearance) → P4 (LOD + decoupled navigation → structurally fixes ghosting; CABA inset-drill already shipped) → P5 (gifts: embed/presentation/"explain this view"). P1b is landed + review-clean. See `panorama-viewstate-design.md`.

### WS-5 — jurisdiction-scope primitive (STAGED — plan exists)
Execute `docs/plans/jurisdiction-scope-primitive.md` (the C8/C9 structural fix for the 16-file scope duplication). Own worktree, fence review gate. After WS-4 P1b settles.

### WS-6 — Integration (autonomous now)
Merge the fence lane (security-reviewed clean) onto the integration branch; single rebuild of :3000 after all WS-1/2/3 land; push the integration branch.

## Sequencing (this autonomous run)
1. WS-3 audit launches read-only in parallel (independent of panorama writers).
2. WS-1 P1 fixes (the data-coherence bugs — highest user impact) → review → commit.
3. WS-2 Root B → parity check → review → commit.
4. WS-1 P2/P3 fixes → review → commit.
5. WS-3 apply the audit's bounded fixes → review → commit.
6. WS-6: fence merge → one rebuild → push.
7. Report: everything done + the staged WS-4/WS-5 clearly handed off + any batched questions.

## Definition of done (per work-unit)
Targeted `pnpm vitest` green (never `pnpm build` under the live server — stop→build→restart only at the WS-6 rebuild gate); fresh adversarial review on the risky units (Root B, any coherence fix); conventional commits, no AI attribution; canon-compliant (C1-C10) for every surface touched.
