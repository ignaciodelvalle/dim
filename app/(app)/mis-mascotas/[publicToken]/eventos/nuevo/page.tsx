// Picker for the "new event" flow. Lists every v1 event type. Vaccination is
// active; the rest are placeholders that will light up one round at a time.

import { db, ownerships, pets } from "@/db";
import { createClient } from "@/lib/supabase/server";
import { and, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

type EventOption = {
  slug: string;
  label: string;
  description: string;
  enabled: boolean;
};

const EVENT_OPTIONS: EventOption[] = [
  {
    slug: "vacuna",
    label: "Vacuna",
    description: "Antirrábica, séxtuple, leucemia, etc.",
    enabled: true,
  },
  {
    slug: "peso",
    label: "Peso",
    description: "Control de peso",
    enabled: false,
  },
  {
    slug: "vet",
    label: "Visita al veterinario",
    description: "Consulta general, diagnóstico",
    enabled: false,
  },
  {
    slug: "antiparasitario",
    label: "Antiparasitario",
    description: "Interno o externo, próxima dosis",
    enabled: false,
  },
  {
    slug: "esterilizacion",
    label: "Esterilización",
    description: "Castración / ovariectomía",
    enabled: false,
  },
  {
    slug: "medicacion-inicio",
    label: "Inicio de medicación",
    description: "Comienzo de tratamiento",
    enabled: false,
  },
  {
    slug: "medicacion-fin",
    label: "Fin de medicación",
    description: "Cierre de tratamiento",
    enabled: false,
  },
  {
    slug: "microchip",
    label: "Microchip implantado",
    description: "Registro tardío de chip",
    enabled: false,
  },
  {
    slug: "estado",
    label: "Cambio de estado",
    description: "Perdida / encontrada",
    enabled: false,
  },
  {
    slug: "fallecimiento",
    label: "Fallecimiento",
    description: "Registro y método de disposición",
    enabled: false,
  },
  {
    slug: "nota",
    label: "Nota",
    description: "Observación general",
    enabled: false,
  },
];

export default async function PickEventPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Ownership gate so non-owners can't browse the picker for someone else's pet.
  const [row] = await db
    .select({ pet: pets })
    .from(pets)
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .where(
      and(
        eq(pets.publicToken, publicToken),
        eq(ownerships.userId, user.id),
        isNull(ownerships.endedAt),
      ),
    )
    .limit(1);
  if (!row) notFound();
  const pet = row.pet;

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-md mx-auto pt-8 space-y-8">
        <Link
          href={`/mis-mascotas/${pet.publicToken}`}
          className="inline-block text-sm text-neutral-600 dark:text-neutral-400 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50"
        >
          ← Volver al perfil
        </Link>

        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Nuevo evento
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            ¿Qué pasó con {pet.name}?
          </p>
        </div>

        <ul className="grid grid-cols-1 gap-2">
          {EVENT_OPTIONS.map((option) => (
            <li key={option.slug}>
              {option.enabled ? (
                <Link
                  href={`/mis-mascotas/${pet.publicToken}/eventos/nuevo/${option.slug}`}
                  className="block border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-neutral-900 dark:text-neutral-50">
                        {option.label}
                      </p>
                      <p className="text-sm text-neutral-500 dark:text-neutral-500">
                        {option.description}
                      </p>
                    </div>
                    <span className="text-neutral-400 dark:text-neutral-600" aria-hidden>
                      ›
                    </span>
                  </div>
                </Link>
              ) : (
                <div
                  aria-disabled
                  className="block border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 opacity-50 cursor-not-allowed"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-neutral-900 dark:text-neutral-50">
                        {option.label}
                      </p>
                      <p className="text-sm text-neutral-500 dark:text-neutral-500">
                        {option.description}
                      </p>
                    </div>
                    <span className="text-xs text-neutral-500 dark:text-neutral-500">
                      próximamente
                    </span>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
