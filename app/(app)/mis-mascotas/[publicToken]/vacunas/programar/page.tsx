// Programar vacuna — Libreta Nacional redesign.
// Presentation only; ScheduleVaccineForm and server action unchanged.

import Link from "next/link";

import { createVaccineReminderAction } from "@/app/actions/reminders";
import { requireOwnedPetByToken } from "@/lib/pets";
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
    <div className="mx-auto max-w-md px-[32px] py-[28px] pb-[48px]">
      {/* Back */}
      <Link
        href={`/mis-mascotas/${pet.publicToken}`}
        className="mb-[20px] inline-block font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline hover:underline"
      >
        ← {pet.name}
      </Link>

      {/* Header */}
      <div className="mb-[24px]">
        <h1 className="m-0 font-[var(--font-ln-serif)] text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ln-ink)]">
          Programar vacuna
        </h1>
        <p className="mt-[5px] text-[14px] text-[var(--color-ln-mute)]">
          Anotá la próxima vacuna de {pet.name} para no olvidártela. Vas a verla en "Próximas
          vacunas" hasta que la marques como aplicada.
        </p>
      </div>

      <ScheduleVaccineForm action={boundAction} species={pet.species} />

      {/* Secondary CTA */}
      <div className="mt-[28px] border-t border-[var(--color-ln-line-2)] pt-[20px]">
        <p className="font-[var(--font-ln-mono)] text-[10.5px] text-[var(--color-ln-mute)]">
          ¿Preferís ir directo a una clínica o campaña?
        </p>
        <Link
          href="/turnos/buscar?service_kind=vaccination_rabies"
          className="mt-[4px] inline-block font-[var(--font-ln-mono)] text-[11px] text-[var(--color-ln-azul)] no-underline hover:underline"
        >
          Buscar turno con veterinario en mi zona →
        </Link>
      </div>
    </div>
  );
}
