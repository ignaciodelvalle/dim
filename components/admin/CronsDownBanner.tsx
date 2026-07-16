// CronsDownBanner — a single operator-facing banner shown on /admin and
// /admin/sistema when ANY background job's most recent run failed
// (operator-trust T3).
//
// WHY: an operator does not need — and should not be alarmed by — curl/Vercel
// internals. The headline states the impact in plain es-AR and the action
// ("avisá a soporte"); the technical identifiers (the failing cron names) live
// under a collapsed "Detalle técnico" disclosure.
//
// Honest in both environments: locally a failure is usually vitest polluting
// the shared cron_runs table, while in prod cron_runs only receives rows from
// real Vercel cron executions — so a failed latest status there is a genuine
// incident. The banner mirrors telemetry either way (see fetchFailedCronNames).
//
// PRESENTATIONAL / server component. It renders nothing when the fleet is
// healthy, so callers can mount it unconditionally.

export function CronsDownBanner({
  failedCronNames,
  /** When false, the "Ver detalle" link to /admin/sistema is hidden (already there). */
  showSistemaLink = true,
}: {
  failedCronNames: string[];
  showSistemaLink?: boolean;
}) {
  if (failedCronNames.length === 0) return null;

  return (
    <div
      role="alert"
      className={[
        "flex flex-col gap-2 rounded-[var(--radius-md)]",
        "border border-ln-op-danger-bd border-l-[4px] border-l-ln-op-danger",
        "bg-ln-op-danger-bg px-4 py-3",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <b className="text-[var(--text-sm)] font-bold text-ln-op-danger">
          Procesos automáticos caídos {"·"} avisá a soporte
        </b>
        {showSistemaLink && (
          // Plain <a> (not next/link) — operator-trust T2: a soft <Link> on this
          // dense dashboard can silently drop under the Next 15.5 client-router
          // defect. A real anchor hard-navigates so the click always lands.
          <a
            href="/admin/sistema"
            className="text-[var(--text-sm)] font-semibold text-ln-op-danger underline underline-offset-2"
          >
            Ver detalle {"->"}
          </a>
        )}
      </div>
      <p className="text-[var(--text-sm)] text-ln-op-danger opacity-85">
        {failedCronNames.length === 1
          ? "Un proceso automático no está corriendo. Avisale al equipo de soporte para que lo revise; algunas tareas del sistema pueden estar demoradas."
          : `${failedCronNames.length} procesos automáticos no están corriendo. Avisale al equipo de soporte para que los revise; algunas tareas del sistema pueden estar demoradas.`}
      </p>
      <details className="text-[var(--text-sm)] text-ln-op-danger opacity-85">
        <summary className="cursor-pointer select-none font-medium">Detalle técnico</summary>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 font-ln-mono text-[var(--text-xs)]">
          {failedCronNames.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
