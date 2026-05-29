import Link from "next/link";

import { Badge, type BadgeProps } from "@/components/poncho";
import type { LostPetRow as LostPetRowData } from "@/lib/govt-dashboards";

type LostPetRowProps = {
  pet: LostPetRowData;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function formatRelative(date: Date | null): string {
  if (!date) return "—";
  const diffMs = Date.now() - date.getTime();
  const days = Math.floor(diffMs / DAY_MS);
  if (days <= 0) {
    const hours = Math.floor(diffMs / (60 * 60 * 1000));
    return hours <= 0 ? "hace minutos" : `hace ${hours} h`;
  }
  if (days < 30) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  return months === 1 ? "hace 1 mes" : `hace ${months} meses`;
}

const STATUS_LABEL: Record<string, string> = {
  lost: "Perdida",
  active: "Activa",
  deceased: "Fallecida",
};

const STATUS_VARIANT: Record<string, BadgeProps["variant"]> = {
  lost: "warning",
  active: "success",
  deceased: "neutral",
};

/**
 * Compact row for a single pet in the /gob/perdidas list panel.
 * Shows a status badge when the row is not in 'lost' status.
 */
export function LostPetRow({ pet }: LostPetRowProps) {
  const statusLabel = STATUS_LABEL[pet.petStatus] ?? pet.petStatus;
  const statusVariant = STATUS_VARIANT[pet.petStatus] ?? "neutral";

  return (
    <li className="rounded-lg border border-gob-border  px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-gob-text ">{pet.petName}</p>
            <Badge variant="neutral">{pet.species}</Badge>
            <Badge variant={statusVariant}>{statusLabel}</Badge>
          </div>
          <p className="text-xs text-gob-text-muted ">
            {pet.locality ?? "—"}, {pet.province ?? "—"}
          </p>
          {pet.ownerDisplayName && (
            <p className="text-xs text-gob-text-muted ">Dueño/a: {pet.ownerDisplayName}</p>
          )}
          {pet.lastSeenLat != null && pet.lastSeenLng != null && (
            <p className="text-xs text-gob-text-muted ">
              Última ubicación:{" "}
              <a
                href={`https://www.openstreetmap.org/?mlat=${pet.lastSeenLat}&mlon=${pet.lastSeenLng}#map=16/${pet.lastSeenLat}/${pet.lastSeenLng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-gob-text "
              >
                {pet.lastSeenLat.toFixed(4)}, {pet.lastSeenLng.toFixed(4)}
              </a>
            </p>
          )}
        </div>
        <div className="text-right space-y-1 whitespace-nowrap">
          <p className="text-xs text-gob-text-muted  tabular-nums">
            {formatRelative(pet.markedLostAt)}
          </p>
          <Link
            href={`/p/${pet.petPublicToken}`}
            className="inline-block text-xs underline underline-offset-2 text-gob-text-gray  hover:text-gob-text "
          >
            Ver credencial
          </Link>
        </div>
      </div>
    </li>
  );
}
