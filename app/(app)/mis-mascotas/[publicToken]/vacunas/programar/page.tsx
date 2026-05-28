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
    <main className="min-h-screen p-6 bg-white ">
      <div className="max-w-md mx-auto pt-8 space-y-8">
        <Link
          href={`/mis-mascotas/${pet.publicToken}`}
          className="inline-block text-sm text-gob-text-gray  underline underline-offset-4 hover:text-gob-text "
        >
          ← Volver a {pet.name}
        </Link>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-gob-text ">Programar vacuna</h1>
          <p className="text-sm text-gob-text-gray ">
            Anotá la próxima vacuna de {pet.name} para no olvidártela. Vas a verla en "Próximas
            vacunas" hasta que la marques como aplicada.
          </p>
        </div>
        <ScheduleVaccineForm action={boundAction} species={pet.species} />

        {/* Secondary CTA — book a real appointment instead of (or in addition to) a reminder */}
        <div className="border-t border-gob-border  pt-6 space-y-1">
          <p className="text-xs text-gob-text-muted ">
            ¿Preferís ir directo a una clínica o campaña?
          </p>
          <Link
            href="/turnos/buscar?service_kind=vaccination_rabies"
            className="inline-flex items-center gap-1 text-sm text-gob-text-gray  underline underline-offset-4 hover:text-gob-text "
          >
            ¿Querés sacar turno con un veterinario? Buscar en mi zona →
          </Link>
        </div>
      </div>
    </main>
  );
}
