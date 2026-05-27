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
      <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
        <div className="max-w-2xl mx-auto pt-10">
          <p className="text-sm text-red-600">No se encontró tu perfil.</p>
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
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-2xl mx-auto pt-10 space-y-8">
        <header>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
            Ofrecerme como hogar de tránsito
          </h1>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
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
    <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4 space-y-3">
      <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
        Antes de inscribirte como voluntario necesitamos lo siguiente:
      </p>
      <ul className="space-y-2 text-sm">
        {items.map((item) => (
          <li key={item.label} className="flex items-start gap-2">
            <span
              className={
                item.ok
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-amber-700 dark:text-amber-300"
              }
            >
              {item.ok ? "✓" : "○"}
            </span>
            <span className="flex-1 text-neutral-800 dark:text-neutral-200">{item.label}</span>
            {item.cta && (
              <Link
                href={item.cta.href}
                className="text-amber-900 dark:text-amber-100 underline text-xs"
              >
                {item.cta.text}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
