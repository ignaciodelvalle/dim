import { createMedicationEndAction } from "@/app/actions/events";
import { db, petEvents } from "@/db";
import { formatDate } from "@/lib/format";
import { requireOwnedPetByToken } from "@/lib/pets";
import { and, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { MedicationEndForm } from "./MedicationEndForm";

export default async function NewMedicationEndPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;
  const session = await requireOwnedPetByToken(publicToken);
  const { pet } = session;

  // Fetch all medication events for this pet in one query, then compute open
  // ones in app code (simpler than a SQL anti-join for v1).
  const medicationEvents = await db
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
        inArray(petEvents.eventType, ["medication_started", "medication_stopped"]),
      ),
    );

  // Collect the IDs of started events that have been stopped.
  const stoppedIds = new Set<string>();
  for (const event of medicationEvents) {
    if (event.eventType === "medication_stopped") {
      const payload = (event.payload ?? {}) as Record<string, unknown>;
      const ref = payload.medication_started_event_id;
      if (typeof ref === "string" && ref) stoppedIds.add(ref);
    }
  }

  // An open medication is a started event with no matching stopped event.
  const openMedications = medicationEvents
    .filter((e) => e.eventType === "medication_started" && !stoppedIds.has(e.id))
    .map((e) => {
      const payload = (e.payload ?? {}) as Record<string, unknown>;
      const drugName = typeof payload.drug_name === "string" ? payload.drug_name : "Medicamento";
      return {
        id: e.id,
        drugName,
        startedDate: formatDate(e.occurredAt),
      };
    });

  const boundAction = createMedicationEndAction.bind(null, pet.publicToken);

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-md mx-auto pt-8 space-y-8">
        <Link
          href={`/mis-mascotas/${pet.publicToken}/eventos/nuevo`}
          className="inline-block text-sm text-neutral-600 dark:text-neutral-400 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50"
        >
          ← Otro tipo de evento
        </Link>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Fin de medicación
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Cerrá un tratamiento activo de {pet.name}.
          </p>
        </div>

        {openMedications.length === 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              No tenés medicaciones abiertas para {pet.name}.
            </p>
            <Link
              href={`/mis-mascotas/${pet.publicToken}`}
              className="inline-block text-sm text-neutral-600 dark:text-neutral-400 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50"
            >
              ← Volver al perfil
            </Link>
          </div>
        ) : (
          <MedicationEndForm action={boundAction} openMedications={openMedications} />
        )}
      </div>
    </main>
  );
}
