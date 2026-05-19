// Pregnancy registration entry — spec 2026-05-19-pregnancy-tracking-design §5.2.
//
// Two phases:
//   - ?phase=started → open the pregnancy (default)
//   - ?phase=ended   → close with outcome (only when pet.pregnancyStatus='in_progress')
//
// Server-side gates:
//   - pet.sex must be 'female' and species in {dog, cat, other} (PR2)
//   - phase=started requires pet.pregnancyStatus != 'in_progress'
//   - phase=ended requires pet.pregnancyStatus == 'in_progress'

import Link from "next/link";

import { recordPregnancyEndedAction, recordPregnancyStartedAction } from "@/app/actions/pregnancy";
import { requireOwnedPetByToken } from "@/lib/pets";

import { PregnancyEndedForm } from "./PregnancyEndedForm";
import { PregnancyStartedForm } from "./PregnancyStartedForm";

const ALLOWED_SPECIES = new Set(["dog", "cat", "other"]);

export default async function NewPregnancyPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicToken: string }>;
  searchParams: Promise<{ phase?: string }>;
}) {
  const { publicToken } = await params;
  const sp = await searchParams;
  const phase = sp.phase === "ended" ? "ended" : "started";

  const session = await requireOwnedPetByToken(publicToken);
  const { pet } = session;

  if (pet.sex !== "female") {
    return (
      <BlockedShell
        publicToken={publicToken}
        message="Solo se pueden registrar embarazos en hembras."
      />
    );
  }
  if (!ALLOWED_SPECIES.has(pet.species)) {
    return (
      <BlockedShell
        publicToken={publicToken}
        message="Esta especie no soporta el registro de embarazo."
      />
    );
  }
  if (phase === "started" && pet.pregnancyStatus === "in_progress") {
    return (
      <BlockedShell
        publicToken={publicToken}
        message="Esta mascota ya tiene un embarazo en seguimiento. Cerralo primero antes de registrar uno nuevo."
        showEndedLink
      />
    );
  }
  if (phase === "ended" && pet.pregnancyStatus !== "in_progress") {
    return (
      <BlockedShell
        publicToken={publicToken}
        message="No hay un embarazo activo para cerrar. Registrá primero el inicio."
      />
    );
  }

  const startedAction = recordPregnancyStartedAction.bind(null, pet.publicToken);
  const endedAction = recordPregnancyEndedAction.bind(null, pet.publicToken);

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
            {phase === "started" ? "Registrar embarazo" : "Cerrar embarazo"}
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {phase === "started"
              ? `Vamos a abrir un seguimiento de embarazo para ${pet.name}.`
              : `Registrar el cierre del embarazo activo de ${pet.name}.`}
          </p>
        </div>
        {phase === "started" ? (
          <PregnancyStartedForm action={startedAction} />
        ) : (
          <PregnancyEndedForm action={endedAction} />
        )}
      </div>
    </main>
  );
}

function BlockedShell({
  publicToken,
  message,
  showEndedLink,
}: {
  publicToken: string;
  message: string;
  showEndedLink?: boolean;
}) {
  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-md mx-auto pt-8 space-y-6">
        <Link
          href={`/mis-mascotas/${publicToken}/eventos/nuevo`}
          className="inline-block text-sm text-neutral-600 dark:text-neutral-400 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50"
        >
          ← Otro tipo de evento
        </Link>
        <p className="text-sm rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          {message}
        </p>
        {showEndedLink && (
          <Link
            href={`/mis-mascotas/${publicToken}/eventos/nuevo/embarazo?phase=ended`}
            className="inline-block px-4 py-2 rounded-lg bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
          >
            Registrar cierre del embarazo
          </Link>
        )}
      </div>
    </main>
  );
}
