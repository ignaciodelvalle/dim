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
import { db, eventNotificationOutbox, petEvents, pets } from "@/db";
import type { EventType } from "@/db/schema";
import { requireAdminOrRedirect } from "@/lib/infra/auth-guards";
import { buildBreachCue, buildStatusLabel, enoExternalDeliveryNote } from "@/lib/infra/outbox-list";
import { AR_TIME_ZONE, eventTypeLabel } from "@/lib/utils/format";

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
    timeZone: AR_TIME_ZONE,
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

  // W3: resolve the source event's pet to a human label + public credential link
  // so the "Evento origen" card leads with "Mascota: <nombre>" instead of a bare
  // UUID. The raw ids stay available under the "Detalle técnico" disclosure below.
  const [petRow] = sourceEvent
    ? await db
        .select({ publicToken: pets.publicToken, name: pets.name })
        .from(pets)
        .where(eq(pets.id, sourceEvent.petId))
        .limit(1)
    : [];

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
        <h1 className="text-[var(--text-title)] font-semibold text-ln-op-ink">
          {TARGET_KIND_LABEL[row.targetKind] ?? row.targetKind}
        </h1>
        <p className="text-[var(--text-sm)] text-ln-op-ink-2">
          {jurisdiction || "Sin jurisdicción"}
        </p>
        <OpCodeBadge tone="neutral">{row.id}</OpCodeBadge>
      </header>

      {/* Delivery state */}
      <OpCard>
        <OpCardHead title="Estado de entrega" />
        <OpCardBody>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
            <dt className="text-sm text-ln-op-mute">Estado</dt>
            <dd className="text-[var(--text-sm)] text-ln-op-ink">{buildStatusLabel(row.status)}</dd>

            <dt className="text-sm text-ln-op-mute">Intentos</dt>
            <dd className="text-[var(--text-sm)] text-ln-op-ink">{row.attempts}</dd>

            <dt className="text-sm text-ln-op-mute">Ultimo intento</dt>
            <dd className="text-[var(--text-sm)] text-ln-op-ink">{fmt(row.lastAttemptAt)}</dd>

            <dt className="text-sm text-ln-op-mute">Proximo reintento</dt>
            <dd className="text-[var(--text-sm)] text-ln-op-ink">{fmt(row.nextRetryAt)}</dd>

            <dt className="text-sm text-ln-op-mute">Entregado</dt>
            <dd className="text-[var(--text-sm)] text-ln-op-ink">{fmt(row.deliveredAt)}</dd>

            <dt className="text-sm text-ln-op-mute">Creado</dt>
            <dd className="text-[var(--text-sm)] text-ln-op-ink">{fmt(row.createdAt)}</dd>

            <dt className="text-sm text-ln-op-mute">SLA vence</dt>
            <dd className="text-[var(--text-sm)] text-ln-op-ink">
              {fmt(row.slaDueAt)}
              {cue === "breach" && (
                <span className="ml-2 text-ln-op-danger font-semibold text-[var(--text-xs)]">
                  (INCUMPLIDO)
                </span>
              )}
            </dd>
          </dl>

          {/* ENO honest-delivery note (C2, 2026-07-22): an eno_authority row's
              "Entregado" status means our outbox pipeline processed it, not
              that the external health authority received it — no receiving
              endpoint exists yet. States reality; never "próximamente" (the
              pipeline itself is real and running today). */}
          {enoExternalDeliveryNote(row.targetKind) && (
            <p className="mt-3 text-[var(--text-sm)] text-ln-op-mute">
              {enoExternalDeliveryNote(row.targetKind)}
            </p>
          )}

          {row.lastError && (
            <div className="mt-3 space-y-1">
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-ln-op-mute">
                Ultimo error
              </p>
              <pre className="rounded-[var(--radius-md)] bg-ln-op-danger-bg border border-ln-op-danger-bd p-3 text-[var(--text-xs)] text-ln-op-danger overflow-auto whitespace-pre-wrap break-words">
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
          <pre className="rounded-[var(--radius-sm)] bg-ln-op-stripe p-3 text-[var(--text-xs)] text-ln-op-ink-2 overflow-auto whitespace-pre-wrap break-words">
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
                {petRow && (
                  <>
                    <dt className="text-sm text-ln-op-mute">Mascota</dt>
                    <dd className="text-[var(--text-sm)]">
                      <Link
                        href={`/p/${petRow.publicToken}`}
                        className="text-ln-op-azul underline underline-offset-2 hover:opacity-80"
                      >
                        {petRow.name}
                      </Link>
                    </dd>
                  </>
                )}
                <dt className="text-sm text-ln-op-mute">Tipo</dt>
                <dd>
                  <OpCodeBadge tone="blue">
                    {eventTypeLabel(sourceEvent.eventType as EventType)}
                  </OpCodeBadge>
                </dd>
                <dt className="text-sm text-ln-op-mute">Ocurrido</dt>
                <dd className="text-[var(--text-sm)] text-ln-op-ink">
                  {fmt(sourceEvent.occurredAt)}
                </dd>
                <dt className="text-sm text-ln-op-mute">Registrado</dt>
                <dd className="text-[var(--text-sm)] text-ln-op-ink">
                  {fmt(sourceEvent.recordedAt)}
                </dd>
                <dt className="text-sm text-ln-op-mute">Rol del autor</dt>
                <dd className="text-[var(--text-sm)] text-ln-op-ink flex items-center gap-1.5">
                  {sourceEvent.authorRole}
                  {sourceEvent.authorVerified && <OpPill tone="ok">verificado</OpPill>}
                </dd>
              </dl>

              {/* W3: raw identifiers are UUID soup for a human triaging a breach.
                  Keep them available (an operator sometimes needs the exact id for
                  a support trace) but collapsed by default so the card leads with
                  the human context above. */}
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.1em] text-ln-op-mute">
                  Detalle técnico
                </summary>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                  {sourceEvent.authorOrganizationId && (
                    <>
                      <dt className="text-sm text-ln-op-mute">Organización</dt>
                      <dd className="font-mono text-[var(--text-xs)] text-ln-op-mute break-all">
                        {sourceEvent.authorOrganizationId}
                      </dd>
                    </>
                  )}
                  {sourceEvent.recordedByUserId && (
                    <>
                      <dt className="text-sm text-ln-op-mute">Usuario</dt>
                      <dd className="font-mono text-[var(--text-xs)] text-ln-op-mute break-all">
                        {sourceEvent.recordedByUserId}
                      </dd>
                    </>
                  )}
                  <dt className="text-sm text-ln-op-mute">Pet ID</dt>
                  <dd className="font-mono text-[var(--text-xs)] text-ln-op-mute break-all">
                    {sourceEvent.petId}
                  </dd>
                  <dt className="text-sm text-ln-op-mute">Event ID</dt>
                  <dd className="font-mono text-[var(--text-xs)] text-ln-op-mute break-all">
                    {sourceEvent.id}
                  </dd>
                </dl>
              </details>

              {/* Event payload — the canonical record of what actually happened */}
              <div className="space-y-1 pt-3">
                <p className="text-xs font-bold uppercase tracking-[0.1em] text-ln-op-mute">
                  Payload del evento
                </p>
                <pre className="rounded-[var(--radius-sm)] bg-ln-op-stripe p-3 text-[var(--text-xs)] text-ln-op-ink-2 overflow-auto whitespace-pre-wrap break-words">
                  {JSON.stringify(sourceEvent.payload, null, 2)}
                </pre>
              </div>
            </>
          ) : (
            <p className="text-[var(--text-sm)] text-ln-op-mute">
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
                Este botón no entrega la notificación al instante. La vuelve a poner en cola para
                que el sistema la reintente en el próximo ciclo de envío (máximo 5 minutos).
              </span>
              <RetryOutboxButton rowId={row.id} />
            </span>
          }
        />
      )}

      {row.status === "delivered" && (
        <p className="text-[var(--text-sm)] text-ln-op-ok font-semibold">
          Esta fila ya fue entregada exitosamente. No se requiere acción.
        </p>
      )}
    </div>
  );
}
