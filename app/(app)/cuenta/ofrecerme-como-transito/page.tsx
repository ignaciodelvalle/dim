import Link from "next/link";

import { db, fosterVolunteers, profiles } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import { eq } from "drizzle-orm";

import { FosterVolunteerWizard } from "./FosterVolunteerWizard";

export default async function OfrecermeComoTransitoPage() {
  const { user } = await requireUserOrRedirect();

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);
  if (!profile) {
    return (
      <main className="min-h-screen p-6 bg-white ">
        <div className="max-w-2xl mx-auto pt-10">
          <p className="text-sm text-gob-danger">No se encontró tu perfil.</p>
        </div>
      </main>
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
    <main className="min-h-screen p-6 bg-white ">
      <div className="max-w-2xl mx-auto pt-10 space-y-8">
        <Link
          href="/cuenta"
          className="inline-block text-sm text-gob-text-gray underline underline-offset-4 hover:text-gob-text mb-4"
        >
          ← Volver a mi cuenta
        </Link>
        <header>
          <h1 className="text-2xl font-semibold text-gob-text ">
            Ofrecerme como hogar de tránsito
          </h1>
          <p className="mt-2 text-sm text-gob-text-gray ">
            Inscribite en el pool de voluntarios. Los refugios cerca tuyo te van a poder proponer
            tránsitos según tus preferencias.
          </p>
        </header>

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
    </main>
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
        : { href: "/cuenta", text: "Las cuentas institucionales no pueden ser voluntarios." },
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
    <div className="rounded-lg border border-gob-warning bg-gob-warning/10   p-4 space-y-3">
      <p className="text-sm font-medium text-gob-warning-text ">
        Antes de inscribirte como voluntario necesitamos lo siguiente:
      </p>
      <ul className="space-y-2 text-sm">
        {items.map((item) => (
          <li key={item.label} className="flex items-start gap-2">
            <span className={item.ok ? "text-gob-success " : "text-gob-warning-text "}>
              {item.ok ? "✓" : "○"}
            </span>
            <span className="flex-1 text-gob-text ">{item.label}</span>
            {item.cta && (
              <Link href={item.cta.href} className="text-gob-warning-text  underline text-xs">
                {item.cta.text}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
