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

        {/* Secondary CTA — book a real appointment instead of (or in addition to) a reminder */}
        <div className="border-t border-neutral-200 dark:border-neutral-800 pt-6 space-y-1">
          <p className="text-xs text-neutral-500 dark:text-neutral-500">
            ¿Preferís ir directo a una clínica o campaña?
          </p>
          <Link
            href="/turnos/buscar?service_kind=vaccination_rabies"
            className="inline-flex items-center gap-1 text-sm text-neutral-700 dark:text-neutral-300 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50"
          >
            ¿Querés sacar turno con un veterinario? Buscar en mi zona →
          </Link>
        </div>
      </div>
    </main>
  );
}
