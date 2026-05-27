import {
  fetchCronRuns,
  fetchDecisionsMetrics,
  fetchGovtActivity,
  fetchQueueHealth,
  fetchUserMetrics,
} from "@/lib/admin-metrics";
import { requireAdminOrRedirect } from "@/lib/auth-guards";

const STATUS_LABEL: Record<string, string> = {
  ok: "OK",
  failed: "Falló",
  running: "Corriendo",
};

const STATUS_TONE: Record<string, string> = {
  ok: "text-gob-success",
  failed: "text-gob-danger",
  running: "text-gob-warning-text",
};

export default async function AdminSistemaPage() {
  await requireAdminOrRedirect();

  const [users, queue, decisions, govts, crons] = await Promise.all([
    fetchUserMetrics(),
    fetchQueueHealth(),
    fetchDecisionsMetrics(),
    fetchGovtActivity(),
    fetchCronRuns(),
  ]);

  return (
    <main className="px-6 py-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="space-y-1">
          <h1 className="text-3xl font-semibold text-gob-text">Salud del sistema</h1>
          <p className="text-sm text-gob-text-gray">Métricas operativas en vivo. Solo admin.</p>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card title="Usuarios">
            <Stat label="Personal" value={users.totalPersonal} />
            <Stat label="Institucional activo" value={users.totalInstitutionalActive} />
            <Stat
              label="Nuevos · 24h / 7d / 30d"
              value={`${users.new24h} / ${users.new7d} / ${users.new30d}`}
            />
          </Card>

          <Card title="Cola de aprobaciones">
            <Stat label="Pendientes" value={queue.pendingTotal} />
            <Stat label="Más vieja (días)" value={queue.oldestPendingDaysAgo ?? "—"} />
            <Stat
              label="14d+ / 30d+ / 60d+"
              value={`${queue.pending14dPlus} / ${queue.pending30dPlus} / ${queue.pending60dPlus}`}
            />
          </Card>

          <Card title="Decisiones">
            <Stat
              label="Aprobadas · 7d / 30d"
              value={`${decisions.approved7d} / ${decisions.approved30d}`}
            />
            <Stat
              label="Rechazadas · 7d / 30d"
              value={`${decisions.rejected7d} / ${decisions.rejected30d}`}
            />
            <Stat label="Revocaciones · 30d" value={decisions.revocations30d} />
          </Card>

          <Card title="Crons">
            {crons.length === 0 ? (
              <p className="text-sm text-neutral-500">
                Sin runs registrados. La tabla <code>cron_runs</code> aparece en Fase 14.
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {crons.map((c) => (
                  <li key={c.cronName} className="flex items-baseline justify-between gap-3">
                    <span className="text-gob-text-gray">{c.cronName}</span>
                    <span className="tabular-nums text-xs">
                      {c.lastRunAt
                        ? new Date(c.lastRunAt).toLocaleString("es-AR", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                      {c.lastStatus && (
                        <span className={`ml-2 ${STATUS_TONE[c.lastStatus] ?? ""}`}>
                          {STATUS_LABEL[c.lastStatus] ?? c.lastStatus}
                        </span>
                      )}
                      {c.itemsProcessed != null && (
                        <span className="ml-2 text-neutral-500">· {c.itemsProcessed} items</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gob-text">Actividad por govt</h2>
          {govts.length === 0 ? (
            <p className="text-sm text-neutral-500">No hay govts activos.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gob-border">
              <table className="w-full text-sm">
                <thead className="bg-gob-surface-alt">
                  <tr className="text-left text-xs uppercase tracking-wider text-neutral-500">
                    <th className="px-3 py-2">Govt</th>
                    <th className="px-3 py-2">Localidades</th>
                    <th className="px-3 py-2">Decisiones 30d</th>
                    <th className="px-3 py-2">Última acción</th>
                  </tr>
                </thead>
                <tbody>
                  {govts.map((g) => (
                    <tr key={g.userId} className="border-t border-gob-border">
                      <td className="px-3 py-2 font-medium">{g.displayName}</td>
                      <td className="px-3 py-2 tabular-nums">{g.localitiesCount}</td>
                      <td className="px-3 py-2 tabular-nums">{g.decisions30d}</td>
                      <td className="px-3 py-2 text-xs text-neutral-500">
                        {g.lastActionAt
                          ? new Date(g.lastActionAt).toLocaleDateString("es-AR", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gob-border p-4 space-y-2">
      <p className="text-xs uppercase tracking-wider text-neutral-500">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-gob-text-gray">{label}</span>
      <span className="text-sm font-medium tabular-nums">{value}</span>
    </div>
  );
}
