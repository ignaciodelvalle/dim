// Picker for the "new event" flow. Lists every v1 event type. Vaccination is
// active; the rest are placeholders that will light up one round at a time.

import { requirePetAccess } from "@/lib/pet-access";
import Link from "next/link";
import { notFound } from "next/navigation";

type EventOption = {
  slug: string;
  label: string;
  description: string;
  enabled: boolean;
  href?: string;
};

// Libreta sanitaria entries — preventive medicine, clinical encounters,
// metrics, identification, end-of-life. Surfaced as the primary grouping in
// the selector and used as the canonical medical record per AGENTS.md.
const LIBRETA_OPTIONS: EventOption[] = [
  {
    slug: "vacuna",
    label: "Vacuna",
    description: "Antirrábica, séxtuple, leucemia, etc.",
    enabled: true,
  },
  {
    slug: "sintoma",
    label: "Síntoma observado",
    description: "Algo raro que estás viendo y querés registrar.",
    enabled: true,
  },
  {
    slug: "antiparasitario",
    label: "Antiparasitario",
    description: "Interno o externo, próxima dosis",
    enabled: true,
  },
  {
    slug: "esterilizacion",
    label: "Esterilización",
    description: "Castración / ovariectomía",
    enabled: true,
  },
  {
    slug: "peso",
    label: "Peso",
    description: "Control de peso",
    enabled: true,
  },
  {
    slug: "vet",
    label: "Visita al veterinario",
    description: "Consulta general, diagnóstico",
    enabled: true,
  },
  {
    slug: "microchip",
    label: "Microchip implantado",
    description: "Registro tardío de chip",
    enabled: true,
  },
  {
    slug: "microchip-reemplazo",
    label: "Reemplazar microchip",
    description: "Chip dañado, ilegible o duplicado",
    enabled: true,
  },
  {
    slug: "tatuaje",
    label: "Tatuaje registrado",
    description: "Código del tatuaje y foto. Identificador secundario al microchip.",
    enabled: true,
  },
  {
    slug: "clinico",
    label: "Información clínica",
    description: "Análisis, imágenes, cirugías, alergias",
    enabled: true,
  },
  {
    slug: "medicacion-inicio",
    label: "Inicio de medicación",
    description: "Comienzo de tratamiento",
    enabled: true,
  },
  {
    slug: "medicacion-fin",
    label: "Fin de medicación",
    description: "Cierre de tratamiento",
    enabled: true,
  },
  {
    slug: "mordedura",
    label: "Mordedura",
    description: "Reportar un incidente — inicia observación de 10 días",
    enabled: true,
  },
  {
    slug: "fallecimiento",
    label: "Fallecimiento",
    description: "Registro y método de disposición",
    enabled: true,
  },
];

// Surfaced only for female pets of supported species (spec pregnancy-tracking PR2).
const PREGNANCY_OPTION: EventOption = {
  slug: "embarazo",
  label: "Embarazo",
  description: "Registro de gestación / cierre del embarazo",
  enabled: true,
};
const PREGNANCY_SPECIES = new Set(["dog", "cat", "other"]);

// Non-libreta entries — owner annotations, identity / status changes. Live
// in /historial alongside the libreta but rendered as a secondary group here.
const OTHER_OPTIONS: EventOption[] = [
  {
    slug: "estado",
    label: "Cambio de estado",
    description: "Perdida / encontrada",
    enabled: true,
  },
  {
    slug: "nota",
    label: "Nota",
    description: "Observación general",
    enabled: true,
  },
];

export default async function PickEventPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;
  const access = await requirePetAccess(publicToken);
  if (!access.ok) notFound();
  const { pet } = access;

  // Defense in depth: deceased pets can only add notes.
  if (pet.status === "deceased") {
    return (
      <main className="min-h-screen p-6 bg-white ">
        <div className="max-w-md mx-auto pt-8 space-y-8">
          <Link
            href={`/mis-mascotas/${pet.publicToken}`}
            className="inline-block text-sm text-gob-text-gray  underline underline-offset-4 hover:text-gob-text "
          >
            ← Volver al perfil
          </Link>
          <div className="space-y-4">
            <p className="text-sm text-gob-text-gray ">
              Esta mascota está registrada como fallecida. Solo podés agregar notas.
            </p>
            <Link
              href={`/mis-mascotas/${pet.publicToken}?sheet=nota`}
              className="inline-block px-4 py-2 rounded-lg bg-gob-primary  text-white  text-sm font-medium hover:bg-gob-primary  transition-colors"
            >
              + Agregar nota
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 bg-white ">
      <div className="max-w-md mx-auto pt-8 space-y-8">
        <Link
          href={`/mis-mascotas/${pet.publicToken}`}
          className="inline-block text-sm text-gob-text-gray  underline underline-offset-4 hover:text-gob-text "
        >
          ← Volver al perfil
        </Link>

        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-gob-text ">Registrar</h1>
          <p className="text-sm text-gob-text-gray ">¿Qué pasó con {pet.name}?</p>
        </div>

        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-[0.18em] text-gob-text-muted ">
            Registrar en la libreta sanitaria
          </h2>
          <ul className="grid grid-cols-1 gap-2">
            {LIBRETA_OPTIONS.map((option) => (
              <EventOptionRow key={option.slug} option={option} pet={pet} />
            ))}
            {pet.sex === "female" && PREGNANCY_SPECIES.has(pet.species) && (
              <EventOptionRow option={PREGNANCY_OPTION} pet={pet} />
            )}
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-[0.18em] text-gob-text-muted ">
            Otros registros
          </h2>
          <ul className="grid grid-cols-1 gap-2">
            {OTHER_OPTIONS.map((option) => (
              <EventOptionRow key={option.slug} option={option} pet={pet} />
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}

function EventOptionRow({
  option,
  pet,
}: {
  option: EventOption;
  pet: { publicToken: string };
}) {
  // Kinds that are now handled by URL-driven sheets on the pet profile page.
  const SHEET_SLUGS: Record<string, string> = {
    nota: "nota",
    "medicacion-inicio": "medicacion",
    peso: "peso",
    sintoma: "sintoma",
  };
  const href =
    option.slug === "estado"
      ? `/mis-mascotas/${pet.publicToken}/perdida`
      : option.slug in SHEET_SLUGS
        ? `/mis-mascotas/${pet.publicToken}?sheet=${SHEET_SLUGS[option.slug]}`
        : (option.href ?? `/mis-mascotas/${pet.publicToken}/eventos/nuevo/${option.slug}`);
  if (!option.enabled) {
    return (
      <li>
        <div
          aria-disabled
          className="block border border-gob-border  rounded-xl p-4 opacity-50 cursor-not-allowed"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium text-gob-text ">{option.label}</p>
              <p className="text-sm text-gob-text-muted ">{option.description}</p>
            </div>
            <span className="text-xs text-gob-text-muted ">próximamente</span>
          </div>
        </div>
      </li>
    );
  }
  return (
    <li>
      <Link
        href={href}
        className="block border border-gob-border  rounded-xl p-4 hover:bg-gob-surface-alt  transition-colors"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-medium text-gob-text ">{option.label}</p>
            <p className="text-sm text-gob-text-muted ">{option.description}</p>
          </div>
          <span className="text-gob-text-muted " aria-hidden>
            ›
          </span>
        </div>
      </Link>
    </li>
  );
}
