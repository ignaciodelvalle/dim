import Link from "next/link";

import { Badge, Photo } from "@/components/poncho";
import type { Pet } from "@/db";
import { speciesLabel } from "@/lib/format";
import { petStatusToPhotoStatus } from "@/lib/poncho-status";
import type { ReminderVariant } from "@/lib/vaccine-reminder-state";
import { type PriorityBadge, getPriorityBadge } from "./PetCard.helpers";

// Shared pet card. Used by /mis-mascotas (full grid), /inicio (top 6
// snippet), and future surfaces. Self-contained — only depends on the
// Pet row + the photo URL (caller resolves it via petPhotoUrl).
//
// "En tránsito" badge fires when the owner's ownership is a
// shelter_custody row (vecino-en-tránsito helping a stray, not a real
// owner). Keeps the visual contract identical to the inline original.
//
// Priority badge (right side): lost > deceased > vaccine > none. See
// PetCard.helpers.ts for the rule.

type VaccineReminderState = {
  variant: ReminderVariant;
};

function PriorityBadgeView({ badge }: { badge: PriorityBadge }) {
  if (badge.kind === "lost") {
    return (
      <span className="animate-pulse motion-reduce:animate-none">
        <Badge variant="danger" aria-label="Mascota perdida">
          URGENTE · perdido
        </Badge>
      </span>
    );
  }
  if (badge.kind === "deceased") {
    return (
      <Badge variant="neutral" aria-label="Mascota fallecida">
        En memoria
      </Badge>
    );
  }
  if (badge.kind === "vaccine") {
    switch (badge.variant) {
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
        return null;
    }
  }
  return null;
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
  const isTransit = ownershipRole === "shelter_custody";

  return (
    <li>
      <Link
        href={`/mis-mascotas/${pet.publicToken}`}
        className="block border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 flex items-center gap-4 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
      >
        <Photo
          status={petStatusToPhotoStatus(pet.status)}
          alt={pet.name}
          src={photoUrl ?? undefined}
          size="md"
        />
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
        {(() => {
          const badge = getPriorityBadge(pet.status, vaccineReminderState);
          if (badge.kind === "none") return null;
          return (
            <div className="shrink-0">
              <PriorityBadgeView badge={badge} />
            </div>
          );
        })()}
        <span className="text-neutral-400 dark:text-neutral-600 shrink-0" aria-hidden>
          ›
        </span>
      </Link>
    </li>
  );
}
