# Cursor adversarial review — a11y round 392919a0..be65fd79 (2026-07-12)

> 0 CRITICAL. 4 confirmed WARNINGs + 2 suspects routed to the #49 executor (owner of the
> files). Gate: not approved until the fix round.

## Judgment Day — panorama a11y round `392919a0..be65fd79`

**Round:** 1 (read-only — no fixes)  
**Skill Resolution:** none — no skill registry; a11y + contrast criteria applied  
**Note:** Ask-mode blocked `git log`/`git diff`; both judges reviewed working-tree files + `docs/reviews/2026-07-12-panorama-a11y-audit.md`.

### Verdict table

| Finding | Judge A | Judge B | Severity | Status |
|---------|---------|---------|----------|--------|
| Map `role="application"` is incomplete / heavy (dual Tab stops, MapLibre + zoom still nested; APG last-resort) | ✅ | ✅ | WARNING (real) | **Confirmed** |
| Collapsed dock = `tablist`/`tab` with no `tabpanel` (conditional `aria-controls` fixes IDREF, not APG) | ✅ | ✅ | WARNING (real) | **Confirmed** |
| Scope focus-restore untested (`activeElement` / `toHaveFocus` missing; M2 only locks live text) | ✅ | ✅ | WARNING (real) | **Confirmed** |
| Global `ln-op-*` token bump; `contrast-audit.md` not updated | ✅ | ✅ | WARNING (real) | **Confirmed** |
| `--color-ln-op-faint` still fails AA on `#eef1f4` (~4.15:1; comment only claims white) | ❌ | ✅ | WARNING (real) | **Suspect** |
| Dock roving `focusIndex` not synced on click (mixed keyboard+mouse leaves wrong `tabIndex={0}`) | ✅ | ❌ | WARNING (real) | **Suspect** |
| Expandir lacks `aria-controls` when panel exists | SUGGESTION | WARNING (real) | — | **Contradiction (severity)** |
| Map focus steal on open pill + map drill | ✅ | ❌ | WARNING (real) | **Downgraded → INFO** — `wasOpen` guard already present; outside `pointerdown` closes first |
| `application` mode / Escape exit | theoretical | (bundled) | WARNING (theoretical) | INFO |
| mute/faint hierarchy collapse | ✅ | ✅ | SUGGESTION | INFO |
| PresetPanel `ul`→`div`; test gaps (collapse IDREF, map role) | — | ✅ | SUGGESTION | INFO |

**Counts:** Confirmed CRITICAL **0** · Confirmed real WARNING **4** · Suspect **2** · Severity contradiction **1** · INFO (theoretical/suggestion) **several**

---

### Confirmed (both judges)

1. **SituationalMap `role="application"`** — Addresses axe nested-interactive vs `img`, but audit A3’s dual Tab stops (wrapper + MapLibre canvas) and zoom controls inside the widget remain. Heavier AT mode than `region`.
2. **PanoramaDock collapsed tabs** — No dangling IDREF when collapsed, but APG tabs without a live `tabpanel` remain.
3. **Focus-restore coverage** — `OverlayDisclosure` restores focus when `wasOpen`; tests never assert focus on `panorama-scope-pill` after a keyboard `<select>` commit (only live-region text via map drill).
4. **Global contrast tokens** — `mute` / `faint` / `rail-mute` changed app-wide; `docs/a11y/contrast-audit.md` has no rows for the new hexes (Ley 26.653 evidence drift).

### Suspect (one judge)

- **Faint on page canvas** still under 4.5:1 on `#eef1f4` (needs measured confirmation).
- **Dock click doesn’t clear/set `focusIndex`** — looks like a real APG roving-tabindex bug; only Judge A flagged it.

### PresetPanel / live announce

`role="presentation"` on `<li>` and the scope `aria-live` region look correctly aimed at A4 / M2. No confirmed issue there.

---

**Round 1 gate:** not approved — **4 confirmed real WARNINGs**.

Per Judgment Day: I won’t change code unless you ask. Want a fix round for the four confirmed items (and optionally the dock `focusIndex` suspect)?
