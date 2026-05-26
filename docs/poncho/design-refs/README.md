# Poncho design references

Source of truth for the Poncho redesign. Imported from `C:\Users\ignac\DIM\DIM\` (cowork's working directory) on 2026-05-26 so the repo can use these without depending on the external path.

> **For future cowork sessions**: please write outputs to `docs/poncho/design-refs/` directly. The external `C:\Users\ignac\DIM\DIM` path is not under version control and gets out of sync with the repo.

## Index

| File | Purpose |
|---|---|
| `spec-claude-design.md` | Component specs, shell-per-role rules, color tokens, typography. **The contract.** |
| `plan-cc-2026-05-26.md` | Executable plan with the chained sub-PR breakdown (this is what's being shipped) |
| `pantallas-pendientes-design.md` | List of screens still pending design from claude.ai/design |
| `prompts-claude-design-2026-05-26.md` | Prompts used to generate the Pantallas/* HTML wireframes |
| `reporte-pantallas-faltantes-2026-05-26.md` | Audit of what screens are missing vs the existing repo |
| `diseño-backlog-2026-05-26.md` | Open design decisions backlog |

## Companion wireframes

The Pantallas/ HTMLs (not in repo) live at `C:\Users\ignac\Downloads\Pantallas\`. Each has a companion `_dump_*.txt` (text-only DOM dump) that's parseable. Use those when comparing implementation vs design.
