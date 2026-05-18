import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { fetchDiseaseSummary, fetchSurveillanceSignals } from "@/lib/govt-dashboards";

import { DiseaseSummaryTable } from "./_components/DiseaseSummaryTable";
import { SurveillanceFiltersBar } from "./_components/SurveillanceFiltersBar";

const DAY_MS = 24 * 60 * 60 * 1000;

export default async function GobVigilanciaPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; disease?: string }>;
}) {
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();
  const sp = await searchParams;
  const days = Math.max(1, Math.min(90, Number(sp.days ?? 30) || 30));
  const since = new Date(Date.now() - days * DAY_MS);
  const diseaseCode = sp.disease ? sp.disease : null;

  const [signals, summary] = await Promise.all([
    fetchSurveillanceSignals({ role: profile.role }, jurisdictions, {
      since,
      diseaseCode,
    }),
    fetchDiseaseSummary({ role: profile.role }, jurisdictions),
  ]);

  const noScope = profile.role === "govt" && jurisdictions.length === 0;

  return (
    <main className="px-6 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Vigilancia epidemiológica
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Señales de zoonosis y enfermedades reportables detectadas en tu cobertura.
          </p>
        </header>

        {noScope && (
          <div className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
            Tu cuenta no tiene localidades asignadas. Pedí a un administrador que te asigne al menos
            una.
          </div>
        )}

        <SurveillanceFiltersBar days={days} diseaseCode={diseaseCode} />

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
            Resumen por enfermedad (30 días)
          </h2>
          <DiseaseSummaryTable summary={summary} />
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
            Detalle ({signals.length})
          </h2>
          {signals.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              No hay señales en este período.
            </p>
          ) : (
            <ul className="space-y-2">
              {signals.map((s) => (
                <li
                  key={s.signalEventId}
                  className="rounded-lg border border-neutral-200 dark:border-neutral-800 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                        {s.diseaseName}
                      </p>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        {s.petName} · {s.petSpecies}
                      </p>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        {s.locality ?? "—"}, {s.province ?? "—"}
                      </p>
                    </div>
                    <time className="text-xs text-neutral-500 dark:text-neutral-400 tabular-nums whitespace-nowrap">
                      {new Date(s.detectedAt).toLocaleString("es-AR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </time>
                  </div>
                  <p className="text-[10px] font-mono text-neutral-400 dark:text-neutral-600 mt-1">
                    {s.petPublicToken}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Placeholders for the broader sanitary-authority views — see
            docs/superpowers/specs/2026-05-18-admin-page-next-phases-design.md
            §future-phases for vaccination coverage + mortality clusters. */}
        <section className="rounded-lg border border-dashed border-neutral-200 dark:border-neutral-800 p-4 space-y-1">
          <p className="text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-500">
            Cobertura de vacunación
          </p>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Próximamente.</p>
        </section>
        <section className="rounded-lg border border-dashed border-neutral-200 dark:border-neutral-800 p-4 space-y-1">
          <p className="text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-500">
            Clusters de mortalidad
          </p>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Próximamente.</p>
        </section>
      </div>
    </main>
  );
}
