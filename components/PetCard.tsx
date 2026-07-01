import Link from "next/link";

import { LnBadge } from "@/components/ui/Badge";
import { LnPhoto } from "@/components/ui/Photo";
import type { Pet } from "@/db";
import type { ReminderVariant } from "@/lib/domain/vaccine-reminder-state";
import { petStatusToPhotoStatus } from "@/lib/poncho-status";
import { speciesLabel } from "@/lib/utils/format";
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
        <LnBadge variant="danger" aria-label="Mascota perdida">
          URGENTE · perdido
        </LnBadge>
      </span>
    );
  }
  if (badge.kind === "deceased") {
    return (
      <LnBadge variant="neutral" aria-label="Mascota fallecida">
        En memoria
      </LnBadge>
    );
  }
  if (badge.kind === "vaccine") {
    switch (badge.variant) {
      case "upcoming":
        return (
          <LnBadge variant="info" aria-label="Tiene vacunas a programar en próximos 14 días">
            Vacunas próximas
          </LnBadge>
        );
      case "due_soon":
        return (
          <LnBadge variant="warning" aria-label="Tiene una vacuna que vence pronto">
            Vacuna pronto
          </LnBadge>
        );
      case "overdue":
        return (
          <LnBadge variant="danger" aria-label="Tiene una vacuna vencida">
            Vacuna vencida
          </LnBadge>
        );
      case "overdue_critical":
        return (
          <span className="animate-pulse motion-reduce:animate-none">
            <LnBadge variant="danger" aria-label="Tiene una vacuna obligatoria vencida">
              URGENTE
            </LnBadge>
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
        className="block border border-ln-line  rounded-xl p-4 flex items-center gap-4 hover:bg-ln-stripe  transition-colors"
      >
        <LnPhoto
          status={petStatusToPhotoStatus(pet.status)}
          alt={pet.name}
          src={photoUrl ?? undefined}
          size="md"
        />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-ln-ink  truncate">
            {pet.name}
            {isTransit && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--color-ln-warn-050)]  text-ln-warn  border border-ln-warn  align-middle">
                En tránsito
              </span>
            )}
          </p>
          <p className="text-sm text-ln-mute  truncate">
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
        <span className="text-ln-mute  shrink-0" aria-hidden>
          ›
        </span>
      </Link>
    </li>
  );
}
