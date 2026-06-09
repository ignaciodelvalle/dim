// Ofrecerme como hogar de tránsito — Libreta Nacional redesign.
// FosterVolunteerWizard (client component) unchanged.

import Link from "next/link";

import { LnCallout } from "@/components/ui/DocElements";
import { db, fosterVolunteers, profiles } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import { eq } from "drizzle-orm";

import { FosterVolunteerWizard } from "./FosterVolunteerWizard";

export default async function OfrecermeComoTransitoPage() {
  const { user } = await requireUserOrRedirect();

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);
  if (!profile) {
    return (
      <div className="mx-auto max-w-2xl px-[32px] py-[28px]">
        <p className="text-[13px] text-[var(--color-ln-err)]">No se encontró tu perfil.</p>
      </div>
    );
  }

  const checks = {
    isPersonalOwner: profile.role === "owner" && profile.accountType === "personal",
    dniVerified: profile.dniVerified,
    hasDisplayName: !!profile.displayName?.trim(),
    hasPhone: !!profile.phone?.trim(),
  };
  const ready = Object.values(checks).every(Boolean);

  const [existing] = ready
    ? await db.select().from(fosterVolunteers).where(eq(fosterVolunteers.userId, user.id)).limit(1)
    : [];

  return (
    <div className="mx-auto max-w-2xl px-[32px] py-[28px] pb-[48px]">
      {/* Back */}
      <Link
        href="/cuenta"
        className="mb-[20px] inline-block font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline hover:underline"
      >
        ← Mi cuenta
      </Link>

      {/* Header */}
      <div className="mb-[28px]">
        <h1 className="m-0 font-[var(--font-ln-serif)] text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ln-ink)]">
          Ofrecerme como hogar de tránsito
        </h1>
        <p className="mt-[5px] text-[14px] text-[var(--color-ln-mute)]">
          Inscribite en el pool de voluntarios. Los refugios cerca tuyo te van a poder proponer
          tránsitos según tus preferencias.
        </p>
      </div>

      {!ready ? (
        <PreCheckChecklist checks={checks} />
      ) : (
        <FosterVolunteerWizard
          initial={
            existing
              ? {
                  status: existing.status as "active" | "paused" | "withdrawn",
                  availableSlots: existing.availableSlots,
                  jurisdictionProvince: existing.jurisdictionProvince,
                  jurisdictionLocality: existing.jurisdictionLocality,
                  acceptsDogs: existing.acceptsDogs,
                  acceptsCats: existing.acceptsCats,
                  acceptsOtherSpecies: existing.acceptsOtherSpecies,
                  acceptsSizeSmall: existing.acceptsSizeSmall,
                  acceptsSizeMedium: existing.acceptsSizeMedium,
                  acceptsSizeLarge: existing.acceptsSizeLarge,
                  acceptsPuppies: existing.acceptsPuppies,
                  acceptsSeniors: existing.acceptsSeniors,
                  acceptsChronicConditions: existing.acceptsChronicConditions,
                  acceptsDangerousBreeds: existing.acceptsDangerousBreeds,
                  maxDurationWeeks: existing.maxDurationWeeks,
                  householdOtherPets: existing.householdOtherPets,
                  householdKids: existing.householdKids,
                  notes: existing.notes,
                }
              : null
          }
        />
      )}
    </div>
  );
}

function PreCheckChecklist({
  checks,
}: {
  checks: {
    isPersonalOwner: boolean;
    dniVerified: boolean;
    hasDisplayName: boolean;
    hasPhone: boolean;
  };
}) {
  const items: { ok: boolean; label: string; cta: { href: string; text: string } | null }[] = [
    {
      ok: checks.isPersonalOwner,
      label: "Tu cuenta es personal con rol dueño",
      cta: checks.isPersonalOwner
        ? null
        : {
            href: "/cuenta",
            text: "Las cuentas institucionales no pueden ser voluntarios.",
          },
    },
    {
      ok: checks.dniVerified,
      label: "DNI verificado",
      cta: checks.dniVerified ? null : { href: "/cuenta/verificar-dni", text: "Verificar DNI" },
    },
    {
      ok: checks.hasDisplayName,
      label: "Nombre cargado",
      cta: checks.hasDisplayName ? null : { href: "/cuenta/editar", text: "Editar perfil" },
    },
    {
      ok: checks.hasPhone,
      label: "Teléfono cargado",
      cta: checks.hasPhone ? null : { href: "/cuenta/editar", text: "Editar perfil" },
    },
  ];

  return (
    <LnCallout tone="warn" title="Antes de inscribirte necesitamos lo siguiente:">
      <ul className="mt-[8px] flex flex-col gap-[8px]">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-[8px]">
            <span
              className={`flex-shrink-0 font-[var(--font-ln-mono)] text-[12px] ${item.ok ? "text-[var(--color-ln-ok)]" : "text-[var(--color-ln-warn)]"}`}
            >
              {item.ok ? "✓" : "○"}
            </span>
            <span className="flex-1 text-[12.5px] text-[var(--color-ln-ink-2)]">{item.label}</span>
            {item.cta && (
              <Link
                href={item.cta.href}
                className="flex-shrink-0 text-[11.5px] text-[var(--color-ln-azul)] no-underline hover:underline"
              >
                {item.cta.text}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </LnCallout>
  );
}
