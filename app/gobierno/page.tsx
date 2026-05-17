import { and, desc, eq, gte } from "drizzle-orm";
import Link from "next/link";

import { approvalRequests, auditLog, db } from "@/db";
import { fetchVisiblePendingRequests } from "@/lib/approval-scope";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";

const ACTION_LABELS: Record<string, string> = {
  request_viewed: "Vio una solicitud",
  evidence_viewed: "Vio evidencia",
  request_approved: "Aprobó una solicitud",
  request_rejected: "Rechazó una solicitud",
  pii_queried: "Buscó por PII",
  admin_seeded: "Admin inicializado",
};

export default async function GobiernoDashboardPage() {
  const { user, profile, jurisdictions } = await requireAdminOrGovtOrRedirect();

  const pending = await fetchVisiblePendingRequests(profile, jurisdictions);

  // Decisions visible to this authority in the last 7 days.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentDecisions = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      performedAt: auditLog.performedAt,
      approvalRequestId: auditLog.approvalRequestId,
      payload: auditLog.payload,
    })
    .from(auditLog)
    .where(and(eq(auditLog.actorUserId, user.id), gte(auditLog.performedAt, sevenDaysAgo)))
    .orderBy(desc(auditLog.performedAt))
    .limit(10);

  const scopeLabel =
    profile.role === "admin"
      ? "universal"
      : jurisdictions.length === 0
        ? "sin localidades asignadas"
        : jurisdictions.map((j) => `${j.locality}, ${j.province}`).join(" · ");

  return (
    <main className="px-6 py-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Panel de gobierno
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Aprobá y rechazá solicitudes de verificación. Tu scope:{" "}
            <span className="font-mono text-xs">{scopeLabel}</span>.
          </p>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card
            label="Solicitudes pendientes"
            value={String(pending.length)}
            cta={pending.length > 0 ? { href: "/gobierno/cola", label: "Ir a la cola" } : null}
          />
          <Card label="Decisiones (últimos 7 días)" value={String(recentDecisions.length)} />
          <Card
            label="Mi rol"
            value={profile.role}
            sublabel={
              profile.role === "admin"
                ? "Acceso universal"
                : `${jurisdictions.length} localidad${jurisdictions.length === 1 ? "" : "es"}`
            }
          />
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
            Actividad reciente
          </h2>
          {recentDecisions.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-500">
              No tenés acciones registradas en los últimos 7 días.
            </p>
          ) : (
            <ul className="space-y-1">
              {recentDecisions.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-neutral-200 dark:border-neutral-800 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-neutral-900 dark:text-neutral-50">
                      {ACTION_LABELS[entry.action] ?? entry.action}
                    </p>
                  </div>
                  <time className="text-xs text-neutral-500 dark:text-neutral-500 tabular-nums whitespace-nowrap">
                    {new Date(entry.performedAt).toLocaleString("es-AR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>

        <PendingTeaser pending={pending} />
      </div>
    </main>
  );
}

function Card({
  label,
  value,
  sublabel,
  cta,
}: {
  label: string;
  value: string;
  sublabel?: string;
  cta?: { href: string; label: string } | null;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 space-y-2">
      <p className="text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-500">
        {label}
      </p>
      <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{value}</p>
      {sublabel && <p className="text-xs text-neutral-500 dark:text-neutral-500">{sublabel}</p>}
      {cta && (
        <Link
          href={cta.href}
          className="inline-block text-xs text-neutral-700 dark:text-neutral-300 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50"
        >
          {cta.label} →
        </Link>
      )}
    </div>
  );
}

function PendingTeaser({
  pending,
}: {
  pending: Awaited<ReturnType<typeof fetchVisiblePendingRequests>>;
}) {
  if (pending.length === 0) return null;
  const preview = pending.slice(0, 3);
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
        Próximas a revisar
      </h2>
      <ul className="space-y-2">
        {preview.map((req) => (
          <li
            key={req.id}
            className="flex items-center justify-between gap-3 rounded-md border border-neutral-200 dark:border-neutral-800 px-3 py-2"
          >
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm text-neutral-900 dark:text-neutral-50">{req.type}</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-500">
                {req.jurisdictionLocality}, {req.jurisdictionProvince}
              </p>
            </div>
            <Link
              href={`/gobierno/cola/${req.publicToken}`}
              className="text-xs text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-50 underline underline-offset-4"
            >
              Revisar →
            </Link>
          </li>
        ))}
      </ul>
      {pending.length > preview.length && (
        <Link
          href="/gobierno/cola"
          className="text-xs text-neutral-600 dark:text-neutral-400 underline underline-offset-4"
        >
          Ver las {pending.length} pendientes →
        </Link>
      )}
    </section>
  );
}

// Suppress unused export warning for the table import — drizzle imports may
// be tree-shaken aggressively in some configs.
void approvalRequests;
