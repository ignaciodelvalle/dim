import Link from "next/link";

import { Badge } from "@/components/poncho";
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

/**
 * Compact row for a single lost pet in the /gob/perdidas list panel.
 * Mirrors the inline <li> from the original page.tsx but as an extractable component.
 */
export function LostPetRow({ pet }: LostPetRowProps) {
  return (
    <li className="rounded-lg border border-neutral-200 dark:border-neutral-800 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
              {pet.petName}
            </p>
            <Badge variant="neutral">{pet.species}</Badge>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {pet.locality ?? "—"}, {pet.province ?? "—"}
          </p>
          {pet.ownerDisplayName && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Dueño/a: {pet.ownerDisplayName}
            </p>
          )}
          {pet.lastSeenLat != null && pet.lastSeenLng != null && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Última ubicación:{" "}
              <a
                href={`https://www.openstreetmap.org/?mlat=${pet.lastSeenLat}&mlon=${pet.lastSeenLng}#map=16/${pet.lastSeenLat}/${pet.lastSeenLng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-neutral-900 dark:hover:text-neutral-50"
              >
                {pet.lastSeenLat.toFixed(4)}, {pet.lastSeenLng.toFixed(4)}
              </a>
            </p>
          )}
        </div>
        <div className="text-right space-y-1 whitespace-nowrap">
          <p className="text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
            {formatRelative(pet.markedLostAt)}
          </p>
          <Link
            href={`/p/${pet.petPublicToken}`}
            className="inline-block text-xs underline underline-offset-2 text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-50"
          >
            Ver credencial
          </Link>
        </div>
      </div>
    </li>
  );
}
