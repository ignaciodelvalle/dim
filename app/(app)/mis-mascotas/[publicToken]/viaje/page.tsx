// /mis-mascotas/[publicToken]/viaje — travel compliance copilot (movilidad
// Fase 1, Capability 4).
//
// Owner-path ONLY in Fase 1 (R4.2, mirrors generatePppExport's ownership
// stance): the org-mediated path is rejected even though requirePetAccess
// supports it.
//
// Projection contract (invariant #3): this RSC loads events + corridor
// reference data and passes them RESOLVED into deriveTravelCompliance —
// the aggregation itself is pure (R2.7).

import { and, asc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LnEmptyState } from "@/components/ui/EmptyState";
import { db, petEvents } from "@/db";
import { overlayAmendments } from "@/lib/infra/amendment";
import { requireOwnedPetByToken } from "@/lib/infra/pets";
import { deriveTravelCompliance, deriveTravelContext } from "@/lib/projections/travel-compliance";
import { type CorridorId, getCorridor } from "@/lib/reference/cross-border-corridors";
import { TravelExportButton } from "./TravelExportButton";
import { TravelObligationsPanel } from "./TravelObligationsPanel";
import { TravelSemaforo } from "./TravelSemaforo";

export default async function ViajePage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;
  const access = await requireOwnedPetByToken(publicToken);
  if (access.accessPath !== "owner") notFound(); // R4.2 — owner-only in Fase 1
  const { pet } = access;

  // One fetch: movement context + rabies doses + amendments (the D2 overlay
  // is applied so corrected travel dates project their current value).
  const rawEvents = await db
    .select({
      id: petEvents.id,
      eventType: petEvents.eventType,
      occurredAt: petEvents.occurredAt,
      payload: petEvents.payload,
    })
    .from(petEvents)
    .where(
      and(
        eq(petEvents.petId, pet.id),
        inArray(petEvents.eventType, [
          "movement_recorded",
          "vaccination_administered",
          "event_amended",
        ]),
      ),
    )
    .orderBy(asc(petEvents.occurredAt));

  const events = overlayAmendments(rawEvents);
  const movementEvents = events.filter((e) => e.eventType === "movement_recorded");

  if (movementEvents.length === 0) {
    // R4.4 — empty/onboarding state, never a 404 or a blank panel.
    return (
      <main className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="text-lg font-semibold">Viaje y movilidad</h1>
        <LnEmptyState
          variant="dashed"
          title="Sin movimientos registrados"
          description="Registrá un cambio de jurisdicción o un viaje planificado para ver los requisitos del corredor y el semáforo de cumplimiento."
          action={
            <Link href={`/mis-mascotas/${pet.publicToken}`} className="underline text-sm">
              Volver a la credencial
            </Link>
          }
        />
      </main>
    );
  }

  // Movement context → aggregation inputs (shared with the export use-case).
  const now = new Date();
  const context = deriveTravelContext(
    movementEvents.map((e) => (e.payload ?? {}) as Record<string, unknown>),
    now,
  );
  const corridors = context.corridorIds.map((id) => getCorridor(id as CorridorId));

  const state = deriveTravelCompliance({
    now,
    origin: {
      country: pet.jurisdictionCountry ?? "AR",
      province: pet.jurisdictionProvince,
      locality: pet.jurisdictionLocality,
    },
    destinations: context.destinations,
    corridors,
    travelDate: context.travelDate,
    events: events
      .filter((e) => e.eventType === "vaccination_administered")
      .map((e) => ({ eventType: e.eventType, payload: e.payload, occurredAt: e.occurredAt })),
  });

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 space-y-6">
      <header>
        <h1 className="text-lg font-semibold">Viaje y movilidad</h1>
        <p className="text-sm text-[var(--color-ln-mute)]">
          Requisitos de viaje para {pet.name}, según los movimientos registrados.
        </p>
      </header>

      <TravelSemaforo semaforo={state.semaforo} corridors={state.corridorsShown} />

      <section aria-label="Requisitos de viaje">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[.08em] text-[var(--color-ln-mute)]">
          Checklist de requisitos
        </h2>
        <TravelObligationsPanel obligations={state.obligations} />
      </section>

      <TravelExportButton petPublicToken={pet.publicToken} />

      <p className="text-xs text-[var(--color-ln-mute)]">
        <Link href={`/mis-mascotas/${pet.publicToken}`} className="underline">
          Volver a la credencial
        </Link>
      </p>
    </main>
  );
}
