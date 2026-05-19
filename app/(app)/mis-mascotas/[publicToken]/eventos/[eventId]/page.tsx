// Owner-only event detail screen — AGENTS.md → v1 screens §"Event Detail".
// Renders the primary/secondary labels from lib/events.ts, occurred vs.
// recorded timestamps, every payload field as a key-value list, attachments,
// and (when location_lat/lng are present) an OSM map. credential_scanned
// events surface their scan-context fields for owner audit visibility.
//
// Stable URL: /mis-mascotas/{publicToken}/eventos/{eventId}. Safe to share
// across devices as long as the recipient is also signed in as the owner.

import { attachments, db, petEvents } from "@/db";
import { eventPayloadSummary } from "@/lib/events";
import { eventTypeLabel, formatDateTime } from "@/lib/format";
import { readPoint } from "@/lib/location";
import { requireOwnedPetByToken } from "@/lib/pets";
import { eventAttachmentSignedUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { and, eq } from "drizzle-orm";
import dynamic from "next/dynamic";
import Link from "next/link";
import { notFound } from "next/navigation";

// MapLibre is heavy and only relevant when the event carries a location.
// next/dynamic with a loading placeholder + the MapLibre runtime imported
// inside LocationMap's useEffect means the bundle only fetches MapLibre at
// view time. SSR returns the placeholder div, the client hydrates and
// lazy-loads. (Next 15 forbids `ssr: false` in Server Components.)
const LocationMap = dynamic(() => import("@/components/LocationMap"), {
  loading: () => (
    <div className="w-full h-64 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 animate-pulse" />
  ),
});

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ publicToken: string; eventId: string }>;
}) {
  const { publicToken, eventId } = await params;
  const session = await requireOwnedPetByToken(publicToken);
  // The (app) layout already redirects unauthenticated users to /login.
  const { pet } = session;

  const [event] = await db
    .select()
    .from(petEvents)
    .where(and(eq(petEvents.id, eventId), eq(petEvents.petId, pet.id)))
    .limit(1);
  if (!event) notFound();

  const summary = eventPayloadSummary(event.eventType, event.payload);
  const heading = summary.primary ?? eventTypeLabel(event.eventType);

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

  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const payloadEntries = Object.entries(payload).filter(([, v]) => v !== null && v !== undefined);

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-2xl mx-auto pt-6 space-y-6">
        <Link
          href={`/mis-mascotas/${pet.publicToken}/historial`}
          className="inline-block text-sm text-neutral-600 dark:text-neutral-400 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50"
        >
          ← Volver al historial de {pet.name}
        </Link>

        <header className="space-y-1">
          <p className="text-[10px] uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-500">
            {eventTypeLabel(event.eventType)}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            {heading}
          </h1>
          {summary.secondary && (
            <p className="text-sm text-neutral-600 dark:text-neutral-400">{summary.secondary}</p>
          )}
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
          <Detail label="Ocurrió" value={formatDateTime(event.occurredAt)} />
          <Detail label="Registrado" value={formatDateTime(event.recordedAt)} />
        </section>

        {event.notes && (
          <section className="space-y-1.5">
            <h2 className="text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-500">
              Notas
            </h2>
            <p className="text-sm text-neutral-900 dark:text-neutral-50 whitespace-pre-wrap">
              {event.notes}
            </p>
          </section>
        )}

        <section className="space-y-2">
          <h2 className="text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-500">
            Ubicación
          </h2>
          {point ? (
            <LocationMap lat={point.lat} lng={point.lng} />
          ) : (
            <p className="text-sm text-neutral-500 dark:text-neutral-500 italic">
              Sin ubicación registrada.
            </p>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-500">
            Detalle
          </h2>
          {payloadEntries.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-500 italic">
              Sin campos adicionales.
            </p>
          ) : (
            <dl className="border border-neutral-200 dark:border-neutral-800 rounded-xl divide-y divide-neutral-200 dark:divide-neutral-800">
              {payloadEntries.map(([key, value]) => (
                <div key={key} className="px-4 py-3 grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-3">
                  <dt className="text-xs font-mono text-neutral-500 dark:text-neutral-500 break-all">
                    {key}
                  </dt>
                  <dd className="sm:col-span-2 text-sm text-neutral-900 dark:text-neutral-50 break-words">
                    <PayloadValue value={value} />
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        {attachmentUrls.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-500">
              Adjuntos ({attachmentUrls.length})
            </h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {attachmentUrls.map((a) =>
                a.url ? (
                  <li key={a.id}>
                    <a href={a.url} target="_blank" rel="noopener noreferrer" className="block">
                      {a.mimeType.startsWith("image/") ? (
                        <img
                          src={a.url}
                          alt="Adjunto"
                          className="w-full h-48 rounded-lg border border-neutral-200 dark:border-neutral-800 object-cover"
                        />
                      ) : (
                        <span className="flex items-center justify-center w-full h-24 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 text-sm text-neutral-700 dark:text-neutral-300 underline underline-offset-4">
                          Ver adjunto ({a.mimeType})
                        </span>
                      )}
                    </a>
                  </li>
                ) : (
                  <li
                    key={a.id}
                    className="flex items-center justify-center w-full h-24 rounded-lg border border-dashed border-neutral-200 dark:border-neutral-800 text-xs text-neutral-500 dark:text-neutral-500"
                  >
                    Adjunto no disponible
                  </li>
                ),
              )}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-500">
        {label}
      </dt>
      <dd className="text-sm text-neutral-900 dark:text-neutral-50">{value || "—"}</dd>
    </div>
  );
}

// Stringify a payload value for display. Booleans render Sí/No, arrays
// comma-join, nested objects pretty-print as monospaced JSON.
function PayloadValue({ value }: { value: unknown }) {
  if (typeof value === "boolean") return <>{value ? "Sí" : "No"}</>;
  if (typeof value === "string" || typeof value === "number") return <>{String(value)}</>;
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="italic text-neutral-500">vacío</span>;
    if (value.every((v) => typeof v === "string" || typeof v === "number")) {
      return <>{value.join(", ")}</>;
    }
    return (
      <pre className="text-[11px] font-mono whitespace-pre-wrap text-neutral-700 dark:text-neutral-300">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }
  if (value && typeof value === "object") {
    return (
      <pre className="text-[11px] font-mono whitespace-pre-wrap text-neutral-700 dark:text-neutral-300">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }
  return <>{String(value)}</>;
}
