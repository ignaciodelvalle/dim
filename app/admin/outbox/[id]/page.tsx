// Admin Outbox detail page — shows a single outbox row with full payload,
// delivery history, and a manual retry button.
//
// IMPORTANT — the "Reintentar ahora" button does NOT deliver synchronously.
// It resets next_retry_at = now() and status = pending so the drainer cron
// picks the row up within 5 minutes. This is documented in the UI.

import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { db, eventNotificationOutbox, petEvents } from "@/db";
import { buildBreachCue, buildStatusLabel } from "@/lib/outbox-list";

import { retryOutboxRowAction } from "../actions";

const TARGET_KIND_LABEL: Record<string, string> = {
  govt_webhook: "Webhook govt",
  eno_authority: "Autoridad ENO",
  audit_export: "Exportación auditoría",
  internal_dashboard: "Dashboard interno",
};

const BREACH_CUE_SYMBOL: Record<string, string> = {
  delivered: "🟢",
  ok: "🟡",
  breach: "🔴",
  failed: "⛔",
};

function fmt(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default async function AdminOutboxDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [row] = await db
    .select()
    .from(eventNotificationOutbox)
    .where(eq(eventNotificationOutbox.id, id))
    .limit(1);

  if (!row) notFound();

  // Load source event for context — non-blocking if missing (FK cascade may
  // have removed it in test teardown, but production should always have it).
  const [sourceEvent] = await db
    .select({
      id: petEvents.id,
      eventType: petEvents.eventType,
      occurredAt: petEvents.occurredAt,
      petId: petEvents.petId,
    })
    .from(petEvents)
    .where(eq(petEvents.id, row.sourceEventId))
    .limit(1);

  const cue = buildBreachCue(row.status, row.slaDueAt);
  const symbol = BREACH_CUE_SYMBOL[cue];
  const jurisdiction = [row.targetJurisdictionLocality, row.targetJurisdictionProvince]
    .filter(Boolean)
    .join(", ");

  const canRetry = row.status === "pending" || row.status === "failed";

  return (
    <main className="px-6 py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <Link
          href="/admin/outbox"
          className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-50"
        >
          ← Volver al outbox
        </Link>

        {/* Header */}
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
            {symbol} {TARGET_KIND_LABEL[row.targetKind] ?? row.targetKind}
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {jurisdiction || "Sin jurisdicción"} · {buildStatusLabel(row.status)}
          </p>
          <p className="text-[10px] font-mono text-neutral-400 dark:text-neutral-600">{row.id}</p>
        </header>

        {/* Delivery state */}
        <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Estado de entrega
          </h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-neutral-500">Estado</dt>
            <dd className="text-neutral-900 dark:text-neutral-100">
              {buildStatusLabel(row.status)}
            </dd>

            <dt className="text-neutral-500">Intentos</dt>
            <dd className="text-neutral-900 dark:text-neutral-100">{row.attempts}</dd>

            <dt className="text-neutral-500">Último intento</dt>
            <dd className="text-neutral-900 dark:text-neutral-100">{fmt(row.lastAttemptAt)}</dd>

            <dt className="text-neutral-500">Próximo reintento</dt>
            <dd className="text-neutral-900 dark:text-neutral-100">{fmt(row.nextRetryAt)}</dd>

            <dt className="text-neutral-500">Entregado</dt>
            <dd className="text-neutral-900 dark:text-neutral-100">{fmt(row.deliveredAt)}</dd>

            <dt className="text-neutral-500">Creado</dt>
            <dd className="text-neutral-900 dark:text-neutral-100">{fmt(row.createdAt)}</dd>

            <dt className="text-neutral-500">SLA vence</dt>
            <dd className="text-neutral-900 dark:text-neutral-100">
              {fmt(row.slaDueAt)}
              {cue === "breach" && (
                <span className="ml-2 text-red-600 font-semibold text-xs">(INCUMPLIDO)</span>
              )}
            </dd>
          </dl>

          {row.lastError && (
            <div className="mt-3 space-y-1">
              <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                Último error
              </p>
              <pre className="rounded bg-neutral-100 dark:bg-neutral-900 p-3 text-xs text-red-700 dark:text-red-400 overflow-auto whitespace-pre-wrap break-words">
                {row.lastError}
              </pre>
            </div>
          )}
        </section>

        {/* Payload snapshot */}
        <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Payload snapshot
          </h2>
          <pre className="rounded bg-neutral-50 dark:bg-neutral-900 p-3 text-xs text-neutral-700 dark:text-neutral-300 overflow-auto whitespace-pre-wrap break-words">
            {JSON.stringify(row.payloadSnapshot, null, 2)}
          </pre>
        </section>

        {/* Source event */}
        <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Evento origen
          </h2>
          {sourceEvent ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt className="text-neutral-500">Tipo</dt>
              <dd className="font-mono text-xs text-neutral-900 dark:text-neutral-100">
                {sourceEvent.eventType}
              </dd>
              <dt className="text-neutral-500">Ocurrido</dt>
              <dd className="text-neutral-900 dark:text-neutral-100">
                {fmt(sourceEvent.occurredAt)}
              </dd>
              <dt className="text-neutral-500">Pet ID</dt>
              <dd className="font-mono text-xs text-neutral-500">{sourceEvent.petId}</dd>
              <dt className="text-neutral-500">Event ID</dt>
              <dd className="font-mono text-xs text-neutral-500">{sourceEvent.id}</dd>
            </dl>
          ) : (
            <p className="text-sm text-neutral-500">
              Evento origen no encontrado (puede haber sido eliminado).
            </p>
          )}
        </section>

        {/* Manual retry */}
        {canRetry && (
          <section className="rounded-lg border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-3">
            <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
              Reintentar manualmente
            </h2>
            <p className="text-xs text-amber-800 dark:text-amber-200">
              Este botón no entrega la notificación de forma sincrónica. Resetea{" "}
              <code className="font-mono">next_retry_at = now()</code> y{" "}
              <code className="font-mono">status = pending</code> para que el cron de drenaje lo
              procese en el próximo ciclo (máximo 5 min).
            </p>
            <form
              action={async () => {
                "use server";
                await retryOutboxRowAction(row.id);
              }}
            >
              <button
                type="submit"
                className="text-sm px-4 py-2 rounded-md bg-amber-700 dark:bg-amber-600 text-white hover:opacity-90 font-medium"
              >
                Reintentar ahora
              </button>
            </form>
          </section>
        )}

        {row.status === "delivered" && (
          <p className="text-sm text-emerald-700 dark:text-emerald-400">
            Esta fila ya fue entregada exitosamente. No se requiere acción.
          </p>
        )}
      </div>
    </main>
  );
}
