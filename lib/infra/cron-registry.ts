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
// fitness test (__tests__/cron-registry-parity.test.ts) asserts this registry
// ⇄ the JOB route directories ⇄ route CRON_NAME ⇄ DAILY_JOB_ORDER stay in
// lock-step — adding a cron without registering it here fails CI.
//
// FLEET CONSOLIDATION (Vercel Hobby cron limits, 2026-07-07): the 22 jobs no
// longer each have a vercel.json entry. A single daily dispatcher
// (/api/cron/daily, 0 4 * * *) runs every job in sequence (see
// lib/infra/cron-dispatcher.ts). Each job still writes its OWN cron_runs row
// under its own name, so cron-health monitors the fleet exactly as before —
// this registry is unchanged in membership. What changed: every job now runs
// once daily via the dispatcher, so the sub-daily entries that previously had
// tighter staleness windows are folded to the daily window (Hobby cannot run
// anything sub-daily; the minimum plan for sub-daily cadence is Vercel Pro).
//
// STANDALONE SCHEDULED JOB (cube-ON decision, 2026-07-24 K4/S3): `refresh_cube`
// is registered + monitored like any job, but it does NOT run inside the daily
// dispatcher (its ~105s build exceeds the dispatcher's 55s budget). It has its
// OWN vercel.json cron entry (0 3 * * *, one hour AHEAD of the daily bag) and
// its own 300s function (vercel.json `functions` pin). This uses the 2nd and
// LAST Hobby cron slot — Hobby allows exactly 2 cron jobs, both daily. Any
// sub-daily cube refresh cadence (e.g. */15) requires Vercel Pro (fase 3).

const DAILY_STALENESS_MS = 26 * 60 * 60 * 1000; // 26 hours

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
    maxStalenessMs: DAILY_STALENESS_MS,
    schedule: "0 4 * * *",
  },
  { cronName: "drain_outbox", maxStalenessMs: DAILY_STALENESS_MS, schedule: "0 4 * * *" },
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
    cronName: "expire_caretaker_grants",
    maxStalenessMs: DAILY_STALENESS_MS,
    schedule: "0 4 * * *",
  },
  {
    cronName: "expire_cross_org_transfers",
    maxStalenessMs: DAILY_STALENESS_MS,
    schedule: "0 4 * * *",
  },
  {
    cronName: "expire_decomiso_handoffs",
    maxStalenessMs: DAILY_STALENESS_MS,
    schedule: "0 4 * * *",
  },
  {
    cronName: "expire_foster_proposals",
    maxStalenessMs: DAILY_STALENESS_MS,
    schedule: "0 3 * * *",
  },
  { cronName: "expire_pet_transfers", maxStalenessMs: DAILY_STALENESS_MS, schedule: "0 4 * * *" },
  { cronName: "materialize_slots", maxStalenessMs: DAILY_STALENESS_MS, schedule: "0 2 * * *" },
  { cronName: "post_adoption_checkin", maxStalenessMs: DAILY_STALENESS_MS, schedule: "0 13 * * *" },
  { cronName: "process_eno_queue", maxStalenessMs: DAILY_STALENESS_MS, schedule: "0 4 * * *" },
  { cronName: "purge_scan_events", maxStalenessMs: DAILY_STALENESS_MS, schedule: "0 1 * * *" },
  { cronName: "reconcile_pet_status", maxStalenessMs: DAILY_STALENESS_MS, schedule: "0 9 * * *" },
  // Standalone scheduled job — its own vercel.json cron (NOT in DAILY_JOB_ORDER;
  // see the STANDALONE SCHEDULED JOB note above).
  { cronName: "refresh_cube", maxStalenessMs: DAILY_STALENESS_MS, schedule: "0 3 * * *" },
  { cronName: "vaccine_due", maxStalenessMs: DAILY_STALENESS_MS, schedule: "0 12 * * *" },
];

// es-AR display labels for the cron fleet. The snake_case `cronName` is the
// canonical internal key (cron_runs.cron_name, route dirs, telemetry) and MUST
// stay intact everywhere; this map is display-ONLY, for operator-facing surfaces
// like the CronsDownBanner "Detalle técnico" list — a funcionario should read
// "Recordatorio de vacunas por vencer", never the raw `vaccine_due`
// (recorrido-80 QA: raw process names surfaced as English-looking text on
// /admin). Keyed by cronName; unmapped names fall back to the raw key.
const CRON_DISPLAY_LABELS: Record<string, string> = {
  auto_expire_approvals: "Vencimiento de aprobaciones",
  business_rules_reeval: "Reevaluación de reglas de negocio",
  close_followup_expired_adoptions: "Cierre de seguimientos de adopción vencidos",
  close_rabies_observations: "Cierre de observaciones antirrábicas",
  close_stale_lost_episodes: "Cierre de episodios de pérdida vencidos",
  // Wrapper/dispatcher jobs — NOT in CRON_REGISTRY (they run/monitor the fleet
  // rather than being monitored jobs), but they write their OWN cron_runs rows,
  // so they surface on /admin/sistema + the CronsDownBanner and need es-AR labels
  // too (M2, cowork demo 2026-07-17: "cron_daily" showed raw in Detalle técnico).
  cron_daily: "Corrida diaria de procesos",
  cron_health: "Chequeo de salud de procesos",
  data_lifecycle: "Ciclo de vida de datos",
  drain_notification_dead_letter: "Reintento de notificaciones fallidas",
  drain_outbox: "Envío de notificaciones pendientes",
  escalate_stale_disputes: "Escalamiento de disputas demoradas",
  escalate_stale_welfare_cases: "Escalamiento de denuncias de bienestar demoradas",
  evaluate_alerts: "Evaluación de alertas de vigilancia",
  expire_caretaker_grants: "Vencimiento de cuidados temporales",
  expire_cross_org_transfers: "Vencimiento de transferencias entre organizaciones",
  expire_decomiso_handoffs: "Vencimiento de entregas por decomiso",
  expire_foster_proposals: "Vencimiento de propuestas de tránsito",
  expire_pet_transfers: "Vencimiento de transferencias de mascotas",
  materialize_slots: "Generación de turnos disponibles",
  post_adoption_checkin: "Seguimiento posterior a la adopción",
  process_eno_queue: "Procesamiento de la cola ENO",
  purge_scan_events: "Depuración de escaneos de credenciales",
  reconcile_pet_status: "Reconciliación de estados de mascotas",
  // Standalone scheduled job (own vercel.json cron 0 3 * * * + 300s function;
  // registered in CRON_REGISTRY above). Surfaces on /admin/sistema like any row.
  refresh_cube: "Actualización del cubo de análisis",
  vaccine_due: "Recordatorio de vacunas por vencer",
};

/**
 * es-AR display label for a cron name. Display-only — never changes the internal
 * key. Unknown names fall back to the raw key (forward-compat: a new cron shows
 * its snake_case name until a label is added, never crashes).
 */
export function cronDisplayLabel(cronName: string): string {
  return CRON_DISPLAY_LABELS[cronName] ?? cronName;
}
