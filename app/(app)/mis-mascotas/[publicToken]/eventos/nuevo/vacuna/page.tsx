import { db, reminders } from "@/db";
import { requireOwnedPetByToken } from "@/lib/pets";
import { createVaccinationAction } from "@/src/modules/events/actions";
import { and, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { VaccinationForm } from "./VaccinationForm";

export default async function NewVaccinationPage({
  params,
  searchParams,
}: {
  params: Promise<{
    publicToken: string;
    vaccineName?: string;
    occurredAt?: string;
    notes?: string;
  }>;
  searchParams: Promise<{
    reminderId?: string;
    vaccineName?: string;
    occurredAt?: string;
    notes?: string;
  }>;
}) {
  const { publicToken } = await params;
  const sp = await searchParams;
  const session = await requireOwnedPetByToken(publicToken);
  const { pet } = session;

  // If routed from a pending reminder, pre-fill the vaccine name from
  // its title. This is the original prefill path (kept intact).
  let initialVaccineName: string | undefined = sp.vaccineName ?? undefined;
  let validReminderId: string | undefined;
  if (sp.reminderId) {
    const [reminder] = await db
      .select()
      .from(reminders)
      .where(
        and(
          eq(reminders.id, sp.reminderId),
          eq(reminders.petId, pet.id),
          isNull(reminders.completedAt),
        ),
      )
      .limit(1);
    if (reminder) {
      // Reminder title wins over URL slot when both are present — the
      // reminder is the more reliable signal.
      initialVaccineName = reminder.title;
      validReminderId = reminder.id;
    }
  }

  // Captura-rápida URL-prefill slots (event-capture-registry).
  const defaults = {
    occurredAt: sp.occurredAt ?? null,
    notes: sp.notes ?? null,
  };

  const boundAction = createVaccinationAction.bind(null, pet.publicToken);

  return (
    <main className="min-h-screen p-6 bg-white ">
      <div className="max-w-md mx-auto pt-8 space-y-8">
        <Link
          href={`/mis-mascotas/${pet.publicToken}/eventos/nuevo`}
          className="inline-block text-sm text-gob-text-gray  underline underline-offset-4 hover:text-gob-text "
        >
          ← Otro tipo de evento
        </Link>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-gob-text ">Vacuna</h1>
          <p className="text-sm text-gob-text-gray ">
            Registrá una vacuna aplicada a {pet.name}. Si conocés la fecha de la próxima dosis,
            creamos un recordatorio automático.
          </p>
        </div>
        <VaccinationForm
          action={boundAction}
          species={pet.species}
          initialVaccineName={initialVaccineName}
          sourceReminderId={validReminderId}
          defaults={defaults}
        />
      </div>
    </main>
  );
}
