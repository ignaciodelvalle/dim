# `@dim/contract`

The framework-free DIM domain contract. This is the package a React Native app
installs; everything else about the native programme depends on it existing.

## The one rule

**Zero runtime dependencies, zero framework.** No `next`, no `react`, no
`drizzle-orm`, no `@/*` app aliases, and nothing in `dependencies`. If it cannot
be imported by a Metro bundler with nothing else installed, it does not belong
here.

`scripts/check-contract-purity.ts` (`pnpm lint:contract`) enforces this, and it
has been observed failing on all four of its rules — a forbidden import, an
app-alias import, a declared dependency, and an empty corpus.

## What is in it

| Entry point | Contents |
| --- | --- |
| `@dim/contract` | everything below, one barrel |
| `@dim/contract/events` | `EVENT_TYPES` + `EventType` — the event-catalog source of truth |
| `@dim/contract/viz` | `viz-scales` colour tokens and the `color-distance` (ΔE00 / contrast) instrument that pins them |

## Packaging choices, and why

**TypeScript source is published, not a `dist/`.** `exports` points at
`./src/**/*.ts`. There is no build step and therefore no stale-artifact failure
mode, no build ordering to teach `pnpm verify`, and no second copy of the code
to get out of sync. Every consumer that matters already compiles TypeScript:
Next's SWC loader, Vitest's esbuild, `tsx`, and Metro via Babel. The cost is
that a consumer which cannot compile TS cannot use the package — acceptable, and
reversible later by adding a build without changing a single import site.

**Both `exports` and `main`/`types`.** The `exports` map is what modern
resolvers read; `main`/`types` are the fallback for tooling that still ignores
`exports` (older Metro resolver configurations among them). They point at the
same file, so the two can never disagree.

**Subpath entry points.** A consumer that only needs the event vocabulary should
not have to name the visualization module. The root barrel exists for
convenience; `./events` and `./viz` exist so the dependency a file actually has
is visible in its import line.

**`"type": "module"`, `sideEffects: false`.** ESM matches the repo, and the
package is pure declarations and pure functions — nothing here runs on import,
so bundlers may drop whatever a consumer does not use.

**No `transpilePackages` entry in `next.config.ts` — verified, not assumed.**
Next only needs `transpilePackages` for code its SWC loader would otherwise
skip. Reading `next/dist/build/webpack-config.js`: `resolve.symlinks` is `true`
(line 251), so webpack resolves `node_modules/@dim/contract` through pnpm's
symlink to its real path under `packages/contract/`; the loader's `include` is
the project directory (lines 373–386), which contains `packages/`; and the
`exclude` predicate only rejects paths containing `node_modules` (line 368). The
real path satisfies all three, so the package is compiled like any other app
source. Empirically confirmed on the other three toolchains too — `tsc`,
Vitest, `tsx` (via `pnpm lint:titular-gate`) and drizzle-kit's esbuild bundle
(via `pnpm db:generate`) all resolve `@dim/contract/events` unaided.

## Adding to it

Something belongs here when it is a fact about the domain that a client needs
and that carries no infrastructure with it: enums, unions, pure derivation, pure
math, colour tokens. Something does not belong here when it needs a database, a
request, a filesystem, or a renderer.

Adding a dependency is a deliberate architectural change: rule 5 of
`scripts/check-contract-purity.ts` fails the build until the reason is written
down in that file.
