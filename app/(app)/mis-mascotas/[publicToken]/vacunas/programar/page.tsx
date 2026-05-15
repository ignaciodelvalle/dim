import { createVaccineReminderAction } from "@/app/actions/reminders";
import { requireOwnedPetByToken } from "@/lib/pets";
import Link from "next/link";
import { ScheduleVaccineForm } from "./ScheduleVaccineForm";

export default async function ScheduleVaccinePage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;
  const session = await requireOwnedPetByToken(publicToken);
  if (!session) return null;
  const { pet } = session;

  const boundAction = createVaccineReminderAction.bind(null, pet.publicToken);

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-md mx-auto pt-8 space-y-8">
        <Link
          href={`/mis-mascotas/${pet.publicToken}`}
          className="inline-block text-sm text-neutral-600 dark:text-neutral-400 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50"
        >
          ← Volver a {pet.name}
        </Link>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Programar vacuna
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Anotá la próxima vacuna de {pet.name} para no olvidártela. Vas a verla en "Próximas
            vacunas" hasta que la marques como aplicada.
          </p>
        </div>
        <ScheduleVaccineForm action={boundAction} species={pet.species} />
      </div>
    </main>
  );
}
