<!--
Short PR template — answer the five questions below. Delete the comments.
For details, see CONTRIBUTING.md.
-->

## What does this change, in one sentence?



## Which event types, cases, or tables does it touch?

<!-- If none, write "none". If it touches an event type, name it. -->

## New or modified RLS policies

<!-- List them or write "none". If a policy changed, paste the before/after. -->

## New tests, and what they cover

<!-- Pre-existing tests still green is a separate checkbox at the bottom. -->

## Linked spec under `docs/superpowers/`?

<!-- Path to the spec file, or "no spec — please push back if one is needed". -->

---

## Test plan

- [ ] `pnpm lint` clean
- [ ] `pnpm typecheck` clean
- [ ] `pnpm test` green (or note which tests need a live DB)
- [ ] `pnpm build` clean
- [ ] Manual smoke for affected user-facing flows
