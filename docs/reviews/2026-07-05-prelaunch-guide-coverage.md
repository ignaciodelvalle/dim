# Pre-launch review guide (MiMAR-guia-revision-CC) — coverage map

The PO's pre-launch guide maps 8 areas (A–H) of "where to look". This maps each to
existing adversarial reviews (already run + remediated) vs the new gap briefs derived
to Cursor for the areas not yet covered.

| Guide area | Coverage | Reviews |
|---|---|---|
| **A** Authz / multi-tenant isolation | ✅ Covered + remediated | 03-authz, 04-rls, 21-authz-scoping, **24-tenant-isolation** (wave A2: locality-pair scoping on gob/decomiso/intake). Residual: k-anonymity edge when a filter shrinks N — folded into brief 25. |
| **B** Public / unauthenticated surface | 🔶 **GAP → derived** | **brief 25-public-surface-abuse** — non-enumerability, rate-limiting/anti-abuse, server-side privacy-toggle enforcement, scan/sighting integrity. (05-privacy-pii covers PII tiers, not enumeration/abuse.) |
| **C** Ownership / transfers / disputes | 🔶 **GAP → derived** | **brief 26-ownership-trust-chain** — claim-fraud evidence, dual-consent transfer, dispute adjudication, expiry idempotency. (23 covered the release/return authz surface Writers; the trust chain itself was not audited.) |
| **D** Mobile / PWA / offline | 🟡 Partial (known gap) | PWA gap analysis exists (docs/design/handoffs pwa); #28 native-mobile polish done; offline credential is a phased, PO-known gap — not re-derived. |
| **E** Ledger integrity + read-models | ✅/🔶 Partial → derived | 01-event-sourcing (append-only triggers, shipped in migration 0127), full-lock #40, projections made event-derivable. **GAP → brief 27-erasure-vs-immutability**: Ley 25.326 erasure vs immutability, corrections superseding in ALL consumers, event schema versioning, transactional-vs-cached derived state. |
| **F** Mutation hygiene (Server Actions) | ✅ Covered | 07-server-actions, idempotency guards (#10/P3), validated insert boundary (#32). |
| **G** Cron / outbox / notifications | ✅ Covered + remediated | 15-notifications, **23-cron-scale** (wave A1: 500-on-fail, keyset batching, CRON_ALERT_WEBHOOK alerting, drain schedules), dead-letter drainer. Delivery channels (email/SMS/push) remain PO-gated. |
| **H** Auth / session | 🔶 **GAP → derived** | #44 login field bugs + #50/#48 reliable logout done. **GAP → brief 28-auth-recovery-session-hardening**: password-reset/recovery flow, session rotation, login brute-force/rate-limit, Mi Argentina SSO readiness. |

## Derived to Cursor (this session)
Briefs 25–28 written to `docs/reviews/briefs/`; results land in `docs/reviews/results/25-28`.
Priority per the guide (security + data integrity before launch): **B (25), E (27)** first, then **C (26), H (28)**.

Prior wave: reviews 01–24 (briefs + results in the same dirs); synthesis in `2026-07-05-synthesis.md`.
