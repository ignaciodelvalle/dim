// Admin Outbox detail page — shows a single outbox row with full payload,
// delivery history, and a manual retry button.
//
// IMPORTANT — the "Reintentar ahora" button does NOT deliver synchronously.
// It resets next_retry_at = now() and status = pending so the drainer cron
// picks the row up within 5 minutes. This is documented in the UI.

import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  OpBreach,
  OpCallout,
  OpCard,
  OpCardBody,
  OpCardHead,
  OpCodeBadge,
  OpCrumbs,
  OpPill,
} from "@/components/ui/dashboard";
import { db, eventNotificationOutbox, petEvents } from "@/db";
import type { EventType } from "@/db/schema";
import { requireAdminOrRedirect } from "@/lib/infra/auth-guards";
import { buildBreachCue, buildStatusLabel } from "@/lib/infra/outbox-list";
import { eventTypeLabel } from "@/lib/utils/format";

import { RetryOutboxButton } from "./RetryOutboxButton";

const TARGET_KIND_LABEL: Record<string, string> = {
  govt_webhook: "Webhook de gobierno",
  eno_authority: "Autoridad ENO",
  audit_export: "Exportación auditoría",
  internal_dashboard: "Panel interno",
};

type PillTone = "ok" | "neutral" | "danger" | "escalated";
const STATUS_PILL_TONE: Record<string, PillTone> = {
  pending: "neutral",
  delivered: "ok",
  failed: "escalated",
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
  await requireAdminOrRedirect();

  const { id } = await params;

  const [row] = await db
    .select()
    .from(eventNotificationOutbox)
    .where(eq(eventNotificationOutbox.id, id))
    .limit(1);

  if (!row) notFound();

  // Load source event with full context — payload + provenance fields so an
  // operator triaging a delivery breach can see the underlying event without
  // a separate SQL trip. Non-blocking if missing (FK cascade may remove the
  // event in test teardown, but production should always have it).
  const [sourceEvent] = await db
    .select({
      id: petEvents.id,
      eventType: petEvents.eventType,
      occurredAt: petEvents.occurredAt,
      recordedAt: petEvents.recordedAt,
      petId: petEvents.petId,
      payload: petEvents.payload,
      authorRole: petEvents.authorRole,
      authorVerified: petEvents.authorVerified,
      authorOrganizationId: petEvents.authorOrganizationId,
      recordedByUserId: petEvents.recordedByUserId,
    })
    .from(petEvents)
    .where(eq(petEvents.id, row.sourceEventId))
    .limit(1);

  const cue = buildBreachCue(row.status, row.slaDueAt);
  const jurisdiction = [row.targetJurisdictionLocality, row.targetJurisdictionProvince]
    .filter(Boolean)
    .join(", ");

  const canRetry = row.status === "pending" || row.status === "failed";

  return (
    <div className="max-w-3xl space-y-6">
      <OpCrumbs
        items={[
          { label: "Bandeja de salida", href: "/admin/outbox" },
          { label: TARGET_KIND_LABEL[row.targetKind] ?? row.targetKind },
        ]}
      />

      {/* SLA breach banner */}
      {cue === "breach" && (
        <OpBreach
          title="Incumplimiento de SLA detectado"
          detail={`Este item supero el deadline de entrega. Estado: ${buildStatusLabel(row.status)}.`}
        />
      )}

      {/* Header */}
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <OpPill tone={STATUS_PILL_TONE[row.status] ?? "neutral"}>
            {buildStatusLabel(row.status)}
          </OpPill>
        </div>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">
          {TARGET_KIND_LABEL[row.targetKind] ?? row.targetKind}
        </h1>
        <p className="text-[13px] text-ln-op-ink-2">{jurisdiction || "Sin jurisdicción"}</p>
        <OpCodeBadge tone="neutral">{row.id}</OpCodeBadge>
      </header>

      {/* Delivery state */}
      <OpCard>
        <OpCardHead title="Estado de entrega" />
        <OpCardBody>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
            <dt className="text-sm text-ln-op-mute">Estado</dt>
            <dd className="text-[13px] text-ln-op-ink">{buildStatusLabel(row.status)}</dd>

            <dt className="text-sm text-ln-op-mute">Intentos</dt>
            <dd className="text-[13px] text-ln-op-ink">{row.attempts}</dd>

            <dt className="text-sm text-ln-op-mute">Ultimo intento</dt>
            <dd className="text-[13px] text-ln-op-ink">{fmt(row.lastAttemptAt)}</dd>

            <dt className="text-sm text-ln-op-mute">Proximo reintento</dt>
            <dd className="text-[13px] text-ln-op-ink">{fmt(row.nextRetryAt)}</dd>

            <dt className="text-sm text-ln-op-mute">Entregado</dt>
            <dd className="text-[13px] text-ln-op-ink">{fmt(row.deliveredAt)}</dd>

            <dt className="text-sm text-ln-op-mute">Creado</dt>
            <dd className="text-[13px] text-ln-op-ink">{fmt(row.createdAt)}</dd>

            <dt className="text-sm text-ln-op-mute">SLA vence</dt>
            <dd className="text-[13px] text-ln-op-ink">
              {fmt(row.slaDueAt)}
              {cue === "breach" && (
                <span className="ml-2 text-ln-op-danger font-semibold text-[11px]">
                  (INCUMPLIDO)
                </span>
              )}
            </dd>
          </dl>

          {row.lastError && (
            <div className="mt-3 space-y-1">
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-ln-op-mute">
                Ultimo error
              </p>
              <pre className="rounded-[var(--radius-md)] bg-ln-op-danger-bg border border-ln-op-danger-bd p-3 text-[11px] text-ln-op-danger overflow-auto whitespace-pre-wrap break-words">
                {row.lastError}
              </pre>
            </div>
          )}
        </OpCardBody>
      </OpCard>

      {/* Payload snapshot */}
      <OpCard>
        <OpCardHead title="Payload snapshot" />
        <OpCardBody>
          <pre className="rounded-[var(--radius-sm)] bg-ln-op-stripe p-3 text-[11px] text-ln-op-ink-2 overflow-auto whitespace-pre-wrap break-words">
            {JSON.stringify(row.payloadSnapshot, null, 2)}
          </pre>
        </OpCardBody>
      </OpCard>

      {/* Source event — type, timestamps, author provenance, full payload */}
      <OpCard>
        <OpCardHead title="Evento origen" />
        <OpCardBody>
          {sourceEvent ? (
            <>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
                <dt className="text-sm text-ln-op-mute">Tipo</dt>
                <dd>
                  <OpCodeBadge tone="blue">
                    {eventTypeLabel(sourceEvent.eventType as EventType)}
                  </OpCodeBadge>
                </dd>
                <dt className="text-sm text-ln-op-mute">Ocurrido</dt>
                <dd className="text-[13px] text-ln-op-ink">{fmt(sourceEvent.occurredAt)}</dd>
                <dt className="text-sm text-ln-op-mute">Registrado</dt>
                <dd className="text-[13px] text-ln-op-ink">{fmt(sourceEvent.recordedAt)}</dd>
                <dt className="text-sm text-ln-op-mute">Rol del autor</dt>
                <dd className="text-[13px] text-ln-op-ink flex items-center gap-1.5">
                  {sourceEvent.authorRole}
                  {sourceEvent.authorVerified && <OpPill tone="ok">verificado</OpPill>}
                </dd>
                {sourceEvent.authorOrganizationId && (
                  <>
                    <dt className="text-sm text-ln-op-mute">Organizacion</dt>
                    <dd className="font-mono text-[11px] text-ln-op-mute">
                      {sourceEvent.authorOrganizationId}
                    </dd>
                  </>
                )}
                {sourceEvent.recordedByUserId && (
                  <>
                    <dt className="text-sm text-ln-op-mute">Usuario</dt>
                    <dd className="font-mono text-[11px] text-ln-op-mute">
                      {sourceEvent.recordedByUserId}
                    </dd>
                  </>
                )}
                <dt className="text-sm text-ln-op-mute">Pet ID</dt>
                <dd className="font-mono text-[11px] text-ln-op-mute">{sourceEvent.petId}</dd>
                <dt className="text-sm text-ln-op-mute">Event ID</dt>
                <dd className="font-mono text-[11px] text-ln-op-mute">{sourceEvent.id}</dd>
              </dl>

              {/* Event payload — the canonical record of what actually happened */}
              <div className="space-y-1 pt-3">
                <p className="text-xs font-bold uppercase tracking-[0.1em] text-ln-op-mute">
                  Payload del evento
                </p>
                <pre className="rounded-[var(--radius-sm)] bg-ln-op-stripe p-3 text-[11px] text-ln-op-ink-2 overflow-auto whitespace-pre-wrap break-words">
                  {JSON.stringify(sourceEvent.payload, null, 2)}
                </pre>
              </div>
            </>
          ) : (
            <p className="text-[13px] text-ln-op-mute">
              Evento origen no encontrado (puede haber sido eliminado).
            </p>
          )}
        </OpCardBody>
      </OpCard>

      {/* Manual retry */}
      {canRetry && (
        <OpCallout
          icon={<span>&#9888;</span>}
          title="Reintentar manualmente"
          body={
            <span className="space-y-2 block">
              <span className="block">
                Este botón no entrega la notificación de forma sincrónica. Resetea{" "}
                <code className="font-mono text-xs">next_retry_at = now()</code> y{" "}
                <code className="font-mono text-xs">status = pending</code> para que el cron de
                drenaje lo procese en el próximo ciclo (máximo 5 min).
              </span>
              <RetryOutboxButton rowId={row.id} />
            </span>
          }
        />
      )}

      {row.status === "delivered" && (
        <p className="text-[13px] text-ln-op-ok font-semibold">
          Esta fila ya fue entregada exitosamente. No se requiere acción.
        </p>
      )}
    </div>
  );
}
