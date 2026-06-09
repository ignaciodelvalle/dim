// Picker for the "new event" flow — Libreta Nacional redesign.
// Presentation only; routing logic unchanged.

import Link from "next/link";
import { notFound } from "next/navigation";

import { LnButton } from "@/components/ui/Button";
import { LnSectionHead } from "@/components/ui/DocElements";
import { requirePetAccess } from "@/lib/pet-access";

type EventOption = {
  slug: string;
  label: string;
  description: string;
  enabled: boolean;
  href?: string;
};

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
  { slug: "peso", label: "Peso", description: "Control de peso", enabled: true },
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
    description: "Código del tatuaje y foto.",
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

const PREGNANCY_OPTION: EventOption = {
  slug: "embarazo",
  label: "Embarazo",
  description: "Registro de gestación / cierre del embarazo",
  enabled: true,
};
const PREGNANCY_SPECIES = new Set(["dog", "cat", "other"]);

const OTHER_OPTIONS: EventOption[] = [
  { slug: "estado", label: "Cambio de estado", description: "Perdida / encontrada", enabled: true },
  { slug: "nota", label: "Nota", description: "Observación general", enabled: true },
];

// Slugs handled by URL-driven sheets on the pet profile page.
const SHEET_SLUGS: Record<string, string> = {
  nota: "nota",
  "medicacion-inicio": "medicacion",
  peso: "peso",
  sintoma: "sintoma",
};

export default async function PickEventPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;
  const access = await requirePetAccess(publicToken);
  if (!access.ok) notFound();
  const { pet } = access;

  if (pet.status === "deceased") {
    return (
      <div className="mx-auto max-w-md px-[32px] py-[28px] pb-[48px]">
        <Link
          href={`/mis-mascotas/${pet.publicToken}`}
          className="mb-[20px] inline-block font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline hover:underline"
        >
          ← Volver al perfil
        </Link>
        <p className="mb-[16px] text-[13px] text-[var(--color-ln-mute)]">
          Esta mascota está registrada como fallecida. Solo podés agregar notas.
        </p>
        <Link href={`/mis-mascotas/${pet.publicToken}?sheet=nota`}>
          <LnButton variant="primary" size="md">
            + Agregar nota
          </LnButton>
        </Link>
      </div>
    );
  }

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
          Registrar
        </h1>
        <p className="mt-[5px] text-[14px] text-[var(--color-ln-mute)]">
          ¿Qué pasó con {pet.name}?
        </p>
      </div>

      <div className="flex flex-col gap-[28px]">
        {/* Libreta sanitaria */}
        <section>
          <LnSectionHead title="Libreta sanitaria" className="mb-[12px]" />
          <div className="overflow-hidden rounded-[4px] border border-[var(--color-ln-line)]">
            {LIBRETA_OPTIONS.map((option) => (
              <EventOptionRow key={option.slug} option={option} pet={pet} />
            ))}
            {pet.sex === "female" && PREGNANCY_SPECIES.has(pet.species) && (
              <EventOptionRow option={PREGNANCY_OPTION} pet={pet} />
            )}
          </div>
        </section>

        {/* Other */}
        <section>
          <LnSectionHead title="Otros registros" className="mb-[12px]" />
          <div className="overflow-hidden rounded-[4px] border border-[var(--color-ln-line)]">
            {OTHER_OPTIONS.map((option) => (
              <EventOptionRow key={option.slug} option={option} pet={pet} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function EventOptionRow({
  option,
  pet,
}: {
  option: EventOption;
  pet: { publicToken: string };
}) {
  const href =
    option.slug === "estado"
      ? `/mis-mascotas/${pet.publicToken}/perdida`
      : option.slug in SHEET_SLUGS
        ? `/mis-mascotas/${pet.publicToken}?sheet=${SHEET_SLUGS[option.slug]}`
        : (option.href ?? `/mis-mascotas/${pet.publicToken}/eventos/nuevo/${option.slug}`);

  if (!option.enabled) {
    return (
      <div
        aria-disabled
        className="flex items-center justify-between gap-3 border-b border-[var(--color-ln-line-2)] px-[16px] py-[13px] last:border-b-0 opacity-50 cursor-not-allowed"
      >
        <div>
          <p className="text-[13.5px] font-medium text-[var(--color-ln-ink)]">{option.label}</p>
          <p className="mt-[1px] text-[12px] text-[var(--color-ln-mute)]">{option.description}</p>
        </div>
        <span className="flex-shrink-0 font-[var(--font-ln-mono)] text-[10px] text-[var(--color-ln-mute)]">
          próximamente
        </span>
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 border-b border-[var(--color-ln-line-2)] px-[16px] py-[13px] no-underline last:border-b-0 hover:bg-[var(--color-ln-stripe)] transition-colors"
    >
      <div>
        <p className="text-[13.5px] font-medium text-[var(--color-ln-ink)]">{option.label}</p>
        <p className="mt-[1px] text-[12px] text-[var(--color-ln-mute)]">{option.description}</p>
      </div>
      <span aria-hidden="true" className="flex-shrink-0 text-[16px] text-[var(--color-ln-mute)]">
        ›
      </span>
    </Link>
  );
}
