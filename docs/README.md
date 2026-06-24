# docs/

Project documentation that doesn't belong in the repo root.

## archive/

Historical artifacts. **Nothing in here specifies the current codebase** — the authoritative current spec is [`AGENTS.md`](../AGENTS.md) at the repo root.

Contents:

- **2021 university-era artifacts** (paper, BMC, photos) — provenance of the original vision.
- **`poncho/`** — the Poncho design-system plan and the 2026-05-26 design-ref handoffs (`pantallas-pendientes-design.md` etc.). Poncho was physically removed (#450) and the handoff screens shipped via the handoff-fixes series (#455–#479).
- **`design-handoffs/`** — the numbered May-2026 feature handoffs (adoption handshake, foster pool, public adoptar, govt dashboards, vaccine due). All shipped.
- **Dated May-2026 planning/status/audit docs** (`*-2026-05-*.md`) — point-in-time snapshots, superseded by the shipped code.
- **Shipped specs & executed plans** — `docs/superpowers/specs/archive/` and `docs/superpowers/plans/archive/` hold the design specs whose features are live and the implementation plans that were executed. Moved here in the **2026-06-24 archive sweep** (docs↔code audit). The active `specs/` and `plans/` now hold only roadmaps, not-yet-built designs, and in-flight work.
- **Remediated critiques & audits (2026-06-24 sweep)** — `admin-design-critique-2026-06-22.md`, `ux-usability-audit.md` (+ `-live`), `panorama-design-critique-2026-06-23.md`, `2026-06-19-project-critique.md`, `Hallazgos Design System.md`, `ui-flow-review-2026-06.md`, and the two done `*-COWORK-HANDOFF.md`. Their findings shipped; kept here for provenance.

Living planning docs stay out of the archive: `docs/superpowers/plans/2026-05-27-spec-later-tracker.md` (code `TODO(spec-later)` markers link to it). **Note:** ~32 code comments still cite pre-sweep `docs/superpowers/specs/<file>.md` paths; these are stale-but-harmless prose pointers (the file now lives under `specs/archive/`) — not import paths, not checked by `link-integrity.test.ts`. Batch-update opportunistically.

The single source of truth for *what we're building today* remains [`AGENTS.md`](../AGENTS.md); the consolidated list of *what's still pending* is [`docs/superpowers/plans/2026-06-24-CONSOLIDATED-pending-backlog.md`](superpowers/plans/2026-06-24-CONSOLIDATED-pending-backlog.md).

| File                                | What it is                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| `CONAIISI DIM (Camera-Ready).docx`  | The team's 2021 paper for CONAIISI (Congreso Nacional de Ingeniería Informática), with the CABA stats and Argentine legal framework that grounds today's `AGENTS.md` "Project context" and "Legal framework" sections. |
| `Business Model Canvas.jpg`         | The 2021 BMC — keep partners / activities / value props / channels / segments overview.          |

When in doubt about *what we're building today*, read `AGENTS.md`. When you want to know *why we're building it this way*, the archive is here.
