# docs/

Project documentation that doesn't belong in the repo root. The single source of
truth for *what we're building today* is [`AGENTS.md`](../AGENTS.md) at the repo root.

| Directory | What it holds |
| --- | --- |
| [`architecture/`](architecture/) | System context, data model, authorization, privacy controls, the conventions canon and the generated facts census. |
| [`adr/`](adr/) | Architecture decision records. |
| [`agents/`](agents/) | Standing contracts for the agents that work on this repo (start at `agents/README.md`). |
| [`superpowers/`](superpowers/) | Design specs and implementation plans (index: `superpowers/README.md`). |
| [`ops/`](ops/) | Engineering runbooks: local dev, migrations, DB bootstrap, advisory allowlist, load probe. |
| [`db/`](db/), [`testing/`](testing/), [`patterns/`](patterns/) | Database, testing and code-pattern notes. |
| [`mobile/`](mobile/) | Mobile build profiles, emulator runbook, OTA policy. |
| [`design/`](design/) | The design canon (`design-canon.md`) and the two-mode design system. |
| [`a11y/`](a11y/) | Accessibility audits. |
| [`datos-abiertos/`](datos-abiertos/) | Open-data publication notes. |
| [`onboarding/`](onboarding/) | Guides for each kind of user. |

## Internal material lives in a private companion repository

This repository is public so the code can be audited. Internal operational
material — deploy and cutover playbooks, incident runbooks, review and audit
reports, plans and handoffs, demo and pilot material, presentations, design
handoffs and the historical archive — lives in a private companion repository,
**dim-interno**, under the same relative paths (for example
`dim-interno: docs/ops/cutover-playbook.md`). References written as
`dim-interno:docs/…` in code comments and docs point there; they are not
resolvable from this repository by design.

Moving that material out did not rewrite history: files that were published in
earlier commits remain in this repository's history.
