import Link from "next/link";

import { Badge } from "@/components/poncho/Badge";
import type { Pet } from "@/db";
import { speciesLabel } from "@/lib/format";
import type { ReminderVariant } from "@/lib/vaccine-reminder-state";

// Shared pet card. Used by /mis-mascotas (full grid), /inicio (top 6
// snippet), and future surfaces. Self-contained — only depends on the
// Pet row + the photo URL (caller resolves it via petPhotoUrl).
//
// "En tránsito" badge fires when the owner's ownership is a
// shelter_custody row (vecino-en-tránsito helping a stray, not a real
// owner). Keeps the visual contract identical to the inline original.
//
// vaccineReminderState: optional — when set, renders a small badge showing
// the highest-priority vaccine reminder state for this pet. Pulse animation
// is applied by this component for overdue_critical (per design spec E-D4:
// the consumer applies pulse, not Badge itself).

type VaccineReminderState = {
  variant: ReminderVariant;
};

function VaccineBadge({ variant }: { variant: ReminderVariant }) {
  switch (variant) {
    case "upcoming":
      return (
        <Badge variant="info" aria-label="Tiene vacunas a programar en próximos 14 días">
          Vacunas próximas
        </Badge>
      );
    case "due_soon":
      return (
        <Badge variant="warning" aria-label="Tiene una vacuna que vence pronto">
          Vacuna pronto
        </Badge>
      );
    case "overdue":
      return (
        <Badge variant="danger" aria-label="Tiene una vacuna vencida">
          Vacuna vencida
        </Badge>
      );
    case "overdue_critical":
      return (
        <span className="animate-pulse motion-reduce:animate-none">
          <Badge variant="danger" aria-label="Tiene una vacuna obligatoria vencida">
            URGENTE
          </Badge>
        </span>
      );
    default:
      // success or any unrecognized variant: no badge
      return null;
  }
}

export function PetCard({
  pet,
  photoUrl,
  ownershipRole,
  vaccineReminderState,
}: {
  pet: Pet;
  photoUrl: string | null;
  ownershipRole: string;
  vaccineReminderState?: VaccineReminderState;
}) {
  const initial = pet.name.charAt(0).toUpperCase();
  const isTransit = ownershipRole === "shelter_custody";

  return (
    <li>
      <Link
        href={`/mis-mascotas/${pet.publicToken}`}
        className="block border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 flex items-center gap-4 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
      >
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={pet.name}
            className="w-14 h-14 rounded-full object-cover shrink-0"
          />
        ) : (
          <div className="w-14 h-14 rounded-full bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center text-xl font-semibold text-neutral-600 dark:text-neutral-400 shrink-0">
            {initial}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-neutral-900 dark:text-neutral-50 truncate">
            {pet.name}
            {isTransit && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-900 align-middle">
                En tránsito
              </span>
            )}
          </p>
          <p className="text-sm text-neutral-500 dark:text-neutral-500 truncate">
            {speciesLabel(pet.species)}
            {pet.color && ` · ${pet.color}`}
          </p>
        </div>
        {vaccineReminderState && (
          <div className="shrink-0">
            <VaccineBadge variant={vaccineReminderState.variant} />
          </div>
        )}
        <span className="text-neutral-400 dark:text-neutral-600 shrink-0" aria-hidden>
          ›
        </span>
      </Link>
    </li>
  );
}
