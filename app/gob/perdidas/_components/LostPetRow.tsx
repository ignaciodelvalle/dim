import Link from "next/link";

import { OpPill } from "@/components/ui/dashboard";
import type { LostPetRow as LostPetRowData } from "@/lib/analytics/govt-dashboards";
import { speciesLabel } from "@/lib/utils/format";

type LostPetRowProps = {
  pet: LostPetRowData;
  /** CAS-XXXX-XXXX code of the pet's lost_pet_episode case, when one exists.
   *  Rendered as a link to the case detail inside the operator shell. */
  caseCode?: string;
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

type PillTone = "danger" | "ok" | "neutral";

const STATUS_TONE: Record<string, PillTone> = {
  // pet-state-header R7.1 tone alignment: perdida is the ALERTA (err/red)
  // family on every surface (credential band, owner row). `open` (amber) is
  // case-workflow semantics — wrong axis for a pet's situation.
  lost: "danger",
  active: "ok",
  deceased: "neutral",
};

/**
 * Compact row for a single pet in the /gob/perdidas list panel.
 * Shows a status pill when the row is not in 'lost' status.
 */
export function LostPetRow({ pet, caseCode }: LostPetRowProps) {
  const statusLabel = STATUS_LABEL[pet.petStatus] ?? pet.petStatus;
  const statusTone: PillTone = STATUS_TONE[pet.petStatus] ?? "neutral";

  return (
    <li className="rounded-[var(--radius-md)] border border-ln-op-line px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            {caseCode && (
              <Link
                href={`/gob/casos/${caseCode}`}
                className="font-[var(--font-ln-mono)] text-[var(--text-sm)] uppercase tracking-[0.04em] text-ln-op-azul underline underline-offset-2 hover:text-ln-op-ink"
              >
                {caseCode}
              </Link>
            )}
            <p className="text-[var(--text-md)] font-medium text-ln-op-ink">{pet.petName}</p>
            <OpPill tone="neutral">{speciesLabel(pet.species)}</OpPill>
            <OpPill tone={statusTone}>{statusLabel}</OpPill>
          </div>
          <p className="text-sm text-ln-op-mute">
            {pet.locality ?? "—"}, {pet.province ?? "—"}
          </p>
          {pet.ownerDisplayName && (
            <p className="text-sm text-ln-op-mute">
              {"Dueño/a:"} {pet.ownerDisplayName}
            </p>
          )}
          {pet.lastSeenLat != null && pet.lastSeenLng != null && (
            <p className="text-sm text-ln-op-mute">
              {"Última ubicación:"}{" "}
              <a
                href={`https://www.openstreetmap.org/?mlat=${pet.lastSeenLat}&mlon=${pet.lastSeenLng}#map=16/${pet.lastSeenLat}/${pet.lastSeenLng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-ln-op-ink"
              >
                {pet.lastSeenLat.toFixed(4)}, {pet.lastSeenLng.toFixed(4)}
              </a>
            </p>
          )}
        </div>
        <div className="text-right space-y-1 whitespace-nowrap">
          <p className="text-sm text-ln-op-mute tabular-nums">{formatRelative(pet.markedLostAt)}</p>
          <Link
            href={`/p/${pet.petPublicToken}`}
            className="inline-block text-sm underline underline-offset-2 text-ln-op-mute hover:text-ln-op-ink"
          >
            Ver credencial
          </Link>
        </div>
      </div>
    </li>
  );
}
