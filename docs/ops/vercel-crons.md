# Cron inventory — Vercel Hobby (staging) vs. production

The app declares scheduled jobs under `/api/cron/*`. Vercel's **Hobby** plan caps
cron jobs hard (a small number, **daily schedules only** — sub-daily schedules are
rejected at deploy-creation time, which surfaces as an instant "Deployment failed").

To keep the staging project (Hobby) deployable, `vercel.json` declares only **2
daily crons**. The remaining jobs are triggered **externally** (a separate scheduler
that hits the endpoints on a timer). On a paid plan (Pro), the full set below can be
restored directly into `vercel.json`.

## Declared in `vercel.json` (Hobby-safe, in-platform)

| Endpoint | Schedule | Purpose |
|----------|----------|---------|
| `/api/cron/vaccine-due` | `0 12 * * *` | Daily vaccine-due reminder sweep |
| `/api/cron/data-lifecycle` | `30 3 * * *` | Daily data-lifecycle / retention pass |

## Triggered externally (not in `vercel.json` on Hobby)

These must be invoked by an external scheduler (e.g. a GitHub Actions cron in a
companion repo) hitting the same paths. Schedules are the production targets.

| Endpoint | Schedule | Notes |
|----------|----------|-------|
| `/api/cron/drain-outbox` | `*/5 * * * *` | Every 5 min — notification outbox drain (highest frequency) |
| `/api/cron/process-eno-queue` | `0 * * * *` | Hourly — ENO queue processing |
| `/api/cron/close-rabies-observations` | `0 */12 * * *` | Every 12h |
| `/api/cron/expire-decomiso-handoffs` | `0 */12 * * *` | Every 12h |
| `/api/cron/post-adoption-checkin` | `0 13 * * *` | Daily |
| `/api/cron/expire-foster-proposals` | `0 3 * * *` | Daily |
| `/api/cron/auto-expire-approvals` | `0 4 * * *` | Daily |
| `/api/cron/close-stale-lost-episodes` | `0 4 * * *` | Daily |
| `/api/cron/close-followup-expired-adoptions` | `0 4 * * *` | Daily |
| `/api/cron/escalate-stale-welfare-cases` | `0 4 * * *` | Daily |
| `/api/cron/escalate-stale-disputes` | `0 4 * * *` | Daily |
| `/api/cron/expire-cross-org-transfers` | `0 4 * * *` | Daily |
| `/api/cron/expire-pet-transfers` | `0 4 * * *` | Daily |
| `/api/cron/materialize-slots` | `0 2 * * *` | Daily |
| `/api/cron/business-rules-reeval` | `0 5 * * *` | Daily |

## Notes

- For staging QA, exact cron timing is not critical; the external scheduler can run
  these less frequently than the production schedules above.
- Cron endpoints should be protected (shared secret / `CRON_SECRET` header) so only
  the intended scheduler can invoke them.
- When promoting to a paid Vercel plan, move the external rows back into
  `vercel.json` and drop the external scheduler if no longer needed.
