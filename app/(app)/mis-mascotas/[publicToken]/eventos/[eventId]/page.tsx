// Event detail screen — Libreta Nacional redesign.
// Presentation only; data fetching and payload rendering logic unchanged.

import dynamic from "next/dynamic";
import Link from "next/link";
import { notFound } from "next/navigation";

import { fetchLatestAmendmentsForEvents } from "@/app/actions/amendment";
import { AmendedBadge } from "@/components/ui/AmendedBadge";
import { LnCard, LnCardBody, LnCardHead } from "@/components/ui/Card";
import { attachments, db, petEvents } from "@/db";
import type { EventType } from "@/db/schema";
import { readPoint } from "@/lib/domain/location";
import { upcastPayload } from "@/lib/events/event-upcasters";
import { eventPayloadSummary } from "@/lib/events/events";
import { requireOwnedPetByToken } from "@/lib/infra/pets";
import { eventAttachmentSignedUrl } from "@/lib/infra/storage";
import { createClient } from "@/lib/supabase/server";
import { eventTypeLabel, formatDateTime } from "@/lib/utils/format";
import { and, eq } from "drizzle-orm";
import { AmendEventButton } from "./AmendEventButton";

const LocationMap = dynamic(() => import("@/components/LocationMap"), {
  loading: () => (
    <div className="w-full h-[240px] rounded-[4px] border border-[var(--color-ln-line)] bg-[var(--color-ln-stripe)] animate-pulse" />
  ),
});

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ publicToken: string; eventId: string }>;
}) {
  const { publicToken, eventId } = await params;
  const session = await requireOwnedPetByToken(publicToken);
  const { pet, accessPath } = session;

  const [event] = await db
    .select()
    .from(petEvents)
    .where(and(eq(petEvents.id, eventId), eq(petEvents.petId, pet.id)))
    .limit(1);
  if (!event) notFound();

  const eventType = event.eventType as EventType;
  const summary = eventPayloadSummary(event.eventType, event.payload);
  const heading = summary.primary ?? eventTypeLabel(eventType);

  const eventAttachments = await db
    .select()
    .from(attachments)
    .where(eq(attachments.eventId, event.id));
  const supabase = await createClient();
  const attachmentUrls = await Promise.all(
    eventAttachments.map(async (a) => ({
      id: a.id,
      mimeType: a.mimeType,
      url: await eventAttachmentSignedUrl(supabase, a.storagePath),
    })),
  );

  const point = readPoint(event);
  const payload = (upcastPayload(event.eventType as EventType, event.payload) ?? {}) as Record<
    string,
    unknown
  >;
  const payloadEntries = Object.entries(payload).filter(([, v]) => v !== null && v !== undefined);

  // D2 — Check for amendments on this event.
  const amendmentsMap = await fetchLatestAmendmentsForEvents(pet.id, [event.id]);
  const latestAmendment = amendmentsMap.get(event.id) ?? null;

  // D3 — Capability gate: owner path can amend. Org-path (shelter) cannot
  // amend owner events in v1 (spec says "whoever can write that event_type").
  // Owner-path is always allowed per requireOwnedPetByToken.
  const canAmend = accessPath === "owner";

  return (
    <div className="mx-auto max-w-2xl px-[32px] py-[28px] pb-[48px]">
      {/* Back */}
      <Link
        href={`/mis-mascotas/${pet.publicToken}?tab=historial`}
        className="mb-[20px] inline-block font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline hover:underline"
      >
        ← Historial de {pet.name}
      </Link>

      {/* Header */}
      <div className="mb-[24px]">
        <p className="font-[var(--font-ln-mono)] text-xs uppercase tracking-[.3em] text-[var(--color-ln-mute)]">
          {eventTypeLabel(eventType)}
        </p>
        <h1 className="mt-[4px] font-[var(--font-ln-serif)] text-2xl font-semibold leading-tight tracking-[-0.01em] text-[var(--color-ln-ink)]">
          {heading}
        </h1>
        {summary.secondary && (
          <p className="mt-[4px] text-[13px] text-[var(--color-ln-mute)]">{summary.secondary}</p>
        )}
        {/* Author chip + amended badge */}
        <div className="mt-[10px] flex flex-wrap items-center gap-[6px]">
          <AuthorChip role={event.authorRole} verified={event.authorVerified} />
          {latestAmendment && (
            <AmendedBadge
              amendedAt={latestAmendment.occurredAt}
              originalHref={`/mis-mascotas/${pet.publicToken}?tab=historial`}
            />
          )}
        </div>
      </div>

      {/* Append-only banner + amend affordance */}
      <div
        className="mb-[16px] flex flex-col gap-[10px] rounded-[4px] border border-[var(--color-ln-line)] bg-[var(--color-ln-stripe)] px-[14px] py-[10px]"
        role="note"
      >
        <p className="font-[var(--font-ln-mono)] text-[11px] text-[var(--color-ln-mute)]">
          Este registro no se puede editar ni borrar — la libreta es un historial inmutable. Si hay
          un dato incorrecto, podés registrar una corrección que queda acreditada en el historial.
        </p>
        <AmendEventButton
          eventId={event.id}
          eventType={event.eventType}
          currentPayload={payload}
          canAmend={canAmend}
          publicToken={publicToken}
        />
      </div>

      <div className="flex flex-col gap-[16px]">
        {/* Timestamps */}
        <LnCard>
          <LnCardHead title="Fechas" />
          <LnCardBody>
            <div className="grid grid-cols-1 gap-[12px] sm:grid-cols-2">
              <Detail label="Ocurrió" value={formatDateTime(event.occurredAt)} />
              <Detail label="Registrado" value={formatDateTime(event.recordedAt)} />
            </div>
          </LnCardBody>
        </LnCard>

        {/* Notes */}
        {event.notes && (
          <LnCard>
            <LnCardHead title="Notas" />
            <LnCardBody>
              <p className="text-[13.5px] text-[var(--color-ln-ink-2)] whitespace-pre-wrap">
                {event.notes}
              </p>
            </LnCardBody>
          </LnCard>
        )}

        {/* Location */}
        <LnCard>
          <LnCardHead title="Ubicación" />
          <LnCardBody>
            {point ? (
              <LocationMap lat={point.lat} lng={point.lng} />
            ) : (
              <p className="text-[13px] text-[var(--color-ln-mute)] italic">
                Sin ubicación registrada.
              </p>
            )}
          </LnCardBody>
        </LnCard>

        {/* Payload detail */}
        <LnCard>
          <LnCardHead title="Detalle" />
          <LnCardBody>
            {payloadEntries.length === 0 ? (
              <p className="text-[13px] text-[var(--color-ln-mute)] italic">
                Sin campos adicionales.
              </p>
            ) : (
              <dl className="divide-y divide-[var(--color-ln-line-2)]">
                {payloadEntries.map(([key, value]) => (
                  <div
                    key={key}
                    className="grid grid-cols-1 gap-[4px] py-[10px] first:pt-0 last:pb-0 sm:grid-cols-3 sm:gap-[12px]"
                  >
                    <dt className="font-[var(--font-ln-mono)] text-[10.5px] text-[var(--color-ln-mute)] break-all">
                      {key}
                    </dt>
                    <dd className="text-[13px] text-[var(--color-ln-ink-2)] break-words sm:col-span-2">
                      <PayloadValue value={value} />
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </LnCardBody>
        </LnCard>

        {/* Attachments */}
        {attachmentUrls.length > 0 && (
          <LnCard>
            <LnCardHead title={`Adjuntos (${attachmentUrls.length})`} />
            <LnCardBody>
              <ul className="grid grid-cols-1 gap-[10px] sm:grid-cols-2">
                {attachmentUrls.map((a) =>
                  a.url ? (
                    <li key={a.id}>
                      <a href={a.url} target="_blank" rel="noopener noreferrer" className="block">
                        {a.mimeType.startsWith("image/") ? (
                          <img
                            src={a.url}
                            alt="Adjunto"
                            className="h-[192px] w-full rounded-[4px] border border-[var(--color-ln-line)] object-cover"
                          />
                        ) : (
                          <span className="flex h-[96px] w-full items-center justify-center rounded-[4px] border border-[var(--color-ln-line)] bg-[var(--color-ln-stripe)] text-[13px] text-[var(--color-ln-azul)] no-underline hover:underline">
                            Ver adjunto ({a.mimeType})
                          </span>
                        )}
                      </a>
                    </li>
                  ) : (
                    <li
                      key={a.id}
                      className="flex h-[96px] w-full items-center justify-center rounded-[4px] border border-dashed border-[var(--color-ln-line-strong)] text-sm text-[var(--color-ln-mute)]"
                    >
                      Adjunto no disponible
                    </li>
                  ),
                )}
              </ul>
            </LnCardBody>
          </LnCard>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="font-[var(--font-ln-mono)] text-xs uppercase tracking-[.08em] text-[var(--color-ln-mute)]">
        {label}
      </dt>
      <dd className="mt-[2px] text-[13px] text-[var(--color-ln-ink-2)]">{value || "—"}</dd>
    </div>
  );
}

const AUTHOR_ROLE_LABELS: Record<string, string> = {
  owner: "Dueño/a",
  vet: "Veterinario/a",
  shelter: "Refugio",
  govt: "Autoridad pública",
  system: "Sistema",
  scanner: "Lector de chip",
  finder: "Hallador",
};

function AuthorChip({ role, verified }: { role: string; verified: boolean }) {
  const label = AUTHOR_ROLE_LABELS[role] ?? role;
  return (
    <span className="inline-flex items-center gap-[5px] rounded-full border border-[var(--color-ln-line-strong)] bg-[var(--color-ln-card)] px-[9px] py-[3px] font-[var(--font-ln-mono)] text-[10.5px] text-[var(--color-ln-ink-2)]">
      {label}
      {verified && (
        <span
          className="inline-flex h-[13px] w-[13px] items-center justify-center rounded-full bg-[var(--color-ln-ok)] text-white"
          title="Verificado"
          aria-label="verificado"
          style={{ fontSize: 8 }}
        >
          ✓
        </span>
      )}
    </span>
  );
}

function PayloadValue({ value }: { value: unknown }) {
  if (typeof value === "boolean") return <>{value ? "Sí" : "No"}</>;
  if (typeof value === "string" || typeof value === "number") return <>{String(value)}</>;
  if (Array.isArray(value)) {
    if (value.length === 0)
      return <span className="italic text-[var(--color-ln-mute)]">vacío</span>;
    if (value.every((v) => typeof v === "string" || typeof v === "number")) {
      return <>{value.join(", ")}</>;
    }
    return (
      <pre className="font-[var(--font-ln-mono)] text-[11px] whitespace-pre-wrap text-[var(--color-ln-ink-2)]">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }
  if (value && typeof value === "object") {
    return (
      <pre className="font-[var(--font-ln-mono)] text-[11px] whitespace-pre-wrap text-[var(--color-ln-ink-2)]">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }
  return <>{String(value)}</>;
}
