// Cron fleet registry — the single source of truth for every cron in
// vercel.json (projection-cron audit 2026-07-03 B2: the registry lived
// inline in the cron-health route and had drifted from what the route
// handlers actually wrote — 3 name mismatches meant healthy crons were
// reported "never_ran" while their telemetry accumulated under an
// unregistered name).
//
// CANONICAL NAMING RULE: `cronName` is the snake_case of the route
// directory (`/api/cron/vaccine-due` → `vaccine_due`). Each route declares
// `const CRON_NAME = "<that name>"` and writes cron_runs under it. The
// fitness test (__tests__/cron-registry-parity.test.ts) asserts
// vercel.json ⇄ this registry ⇄ route CRON_NAME stay in lock-step —
// adding a cron without registering it here fails CI.

const DAILY_STALENESS_MS = 26 * 60 * 60 * 1000; // 26 hours
// Sub-daily crons need a tighter staleness so a single missed period is visible
// well before a full day passes (review 23 item 28): an hourly cron with a 26h
// window hides an outage for a day.
const HOURLY_STALENESS_MS = 2 * 60 * 60 * 1000; // 2 hours
const TWELVE_HOURLY_STALENESS_MS = 14 * 60 * 60 * 1000; // 14 hours (12h + margin)

export type CronRegistryEntry = {
  /** cron_runs.cron_name — snake_case of the route directory (canonical rule). */
  cronName: string;
  /** Max acceptable age of the last successful (status='ok') run. */
  maxStalenessMs: number;
  /** Cron expression as configured in vercel.json (display only). */
  schedule: string;
};

export const CRON_REGISTRY: CronRegistryEntry[] = [
  { cronName: "auto_expire_approvals", maxStalenessMs: DAILY_STALENESS_MS, schedule: "0 4 * * *" },
  { cronName: "business_rules_reeval", maxStalenessMs: DAILY_STALENESS_MS, schedule: "0 5 * * *" },
  {
    cronName: "close_followup_expired_adoptions",
    maxStalenessMs: DAILY_STALENESS_MS,
    schedule: "0 4 * * *",
  },
  {
    cronName: "close_rabies_observations",
    maxStalenessMs: DAILY_STALENESS_MS,
    schedule: "0 0 * * *",
  },
  {
    cronName: "close_stale_lost_episodes",
    maxStalenessMs: DAILY_STALENESS_MS,
    schedule: "0 4 * * *",
  },
  { cronName: "cron_health", maxStalenessMs: DAILY_STALENESS_MS, schedule: "0 10 * * *" },
  { cronName: "data_lifecycle", maxStalenessMs: DAILY_STALENESS_MS, schedule: "30 3 * * *" },
  {
    cronName: "drain_notification_dead_letter",
    maxStalenessMs: HOURLY_STALENESS_MS,
    schedule: "15 * * * *",
  },
  { cronName: "drain_outbox", maxStalenessMs: HOURLY_STALENESS_MS, schedule: "*/5 * * * *" },
  {
    cronName: "escalate_stale_disputes",
    maxStalenessMs: DAILY_STALENESS_MS,
    schedule: "0 4 * * *",
  },
  {
    cronName: "escalate_stale_welfare_cases",
    maxStalenessMs: DAILY_STALENESS_MS,
    schedule: "0 4 * * *",
  },
  { cronName: "evaluate_alerts", maxStalenessMs: DAILY_STALENESS_MS, schedule: "0 8 * * *" },
  {
    cronName: "expire_cross_org_transfers",
    maxStalenessMs: DAILY_STALENESS_MS,
    schedule: "0 4 * * *",
  },
  {
    cronName: "expire_decomiso_handoffs",
    maxStalenessMs: TWELVE_HOURLY_STALENESS_MS,
    schedule: "0 */12 * * *",
  },
  {
    cronName: "expire_foster_proposals",
    maxStalenessMs: DAILY_STALENESS_MS,
    schedule: "0 3 * * *",
  },
  { cronName: "expire_pet_transfers", maxStalenessMs: DAILY_STALENESS_MS, schedule: "0 4 * * *" },
  { cronName: "materialize_slots", maxStalenessMs: DAILY_STALENESS_MS, schedule: "0 2 * * *" },
  { cronName: "post_adoption_checkin", maxStalenessMs: DAILY_STALENESS_MS, schedule: "0 13 * * *" },
  { cronName: "process_eno_queue", maxStalenessMs: HOURLY_STALENESS_MS, schedule: "0 * * * *" },
  { cronName: "purge_scan_events", maxStalenessMs: DAILY_STALENESS_MS, schedule: "0 1 * * *" },
  { cronName: "reconcile_pet_status", maxStalenessMs: DAILY_STALENESS_MS, schedule: "0 9 * * *" },
  { cronName: "vaccine_due", maxStalenessMs: DAILY_STALENESS_MS, schedule: "0 12 * * *" },
];
