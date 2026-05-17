import { createVaccinationAction } from "@/app/actions/events";
import { db, reminders } from "@/db";
import { requireOwnedPetByToken } from "@/lib/pets";
import { and, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { VaccinationForm } from "./VaccinationForm";

export default async function NewVaccinationPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicToken: string }>;
  searchParams: Promise<{ reminderId?: string }>;
}) {
  const { publicToken } = await params;
  const { reminderId } = await searchParams;
  const session = await requireOwnedPetByToken(publicToken);
  const { pet } = session;

  // If routed from a pending reminder, pre-fill the vaccine name.
  let initialVaccineName: string | undefined;
  let validReminderId: string | undefined;
  if (reminderId) {
    const [reminder] = await db
      .select()
      .from(reminders)
      .where(
        and(
          eq(reminders.id, reminderId),
          eq(reminders.petId, pet.id),
          isNull(reminders.completedAt),
        ),
      )
      .limit(1);
    if (reminder) {
      initialVaccineName = reminder.title;
      validReminderId = reminder.id;
    }
  }

  const boundAction = createVaccinationAction.bind(null, pet.publicToken);

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
            Vacuna
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Registrá una vacuna aplicada a {pet.name}. Si conocés la fecha de la próxima dosis,
            creamos un recordatorio automático.
          </p>
        </div>
        <VaccinationForm
          action={boundAction}
          species={pet.species}
          initialVaccineName={initialVaccineName}
          sourceReminderId={validReminderId}
        />
      </div>
    </main>
  );
}
