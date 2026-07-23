import Link from "next/link";

import { OpPill } from "@/components/ui/dashboard";
import type { LostPetRow as LostPetRowData } from "@/lib/analytics/govt-dashboards";
import { lostTimeLabel } from "@/lib/infra/lost-listing";
import { speciesLabel } from "@/lib/utils/format";

type LostPetRowProps = {
  pet: LostPetRowData;
  /** CAS-XXXX-XXXX code of the pet's lost_pet_episode case, when one exists.
   *  Rendered as a link to the case detail inside the operator shell. */
  caseCode?: string;
  /**
   * PO decision 4 ("Pérdidas: ubicación legible + scope operativo",
   * 2026-07-23): true when the CURRENT view is narrowed to a single
   * operative jurisdiction (a province/locality filter active — where
   * dispatch actually happens) — see isNarrowedToOperativeJurisdiction
   * (lib/ui/view-scope-caption.ts), resolved ONCE by the page from the
   * SAME ctx/filter its queries already use. False at a national/
   * multi-province view: the row then renders WITHOUT owner-identifying
   * fields (pet + locality + days only) — presentation minimization on top
   * of the fetcher's existing scope security, not a scope change.
   */
  showOwnerDetail: boolean;
};

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

/** OpenStreetMap URL for a last-seen point — never rendered as visible text
 *  (that would re-expose the exact coords the legible-locality copy replaces;
 *  see the map-affordance link below). */
function osmUrl(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
}

/**
 * Legible location line (PO decision 4a, 2026-07-23): the row's PRIMARY
 * location signal is always the human-readable locality/barrio, never the
 * raw decimal coordinates — those move to a map-affordance link with no
 * coordinate numbers in its visible text. When there is no locality on file
 * but a last-seen point exists, the link itself IS the location ("ubicación
 * aproximada en el mapa"); when neither exists, say so honestly instead of
 * a bare "—, —".
 */
function LocationLine({ pet }: { pet: LostPetRowData }) {
  const hasCoords = pet.lastSeenLat != null && pet.lastSeenLng != null;

  if (pet.locality || pet.province) {
    return (
      <p className="text-sm text-ln-op-mute">
        {pet.locality ?? "—"}, {pet.province ?? "—"}
        {hasCoords && (
          <>
            {" · "}
            <a
              href={osmUrl(pet.lastSeenLat as number, pet.lastSeenLng as number)}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-ln-op-ink"
            >
              Ver en el mapa →
            </a>
          </>
        )}
      </p>
    );
  }

  if (hasCoords) {
    return (
      <p className="text-sm text-ln-op-mute">
        <a
          href={osmUrl(pet.lastSeenLat as number, pet.lastSeenLng as number)}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-ln-op-ink"
        >
          Ubicación aproximada en el mapa →
        </a>
      </p>
    );
  }

  return <p className="text-sm text-ln-op-mute">Ubicación no registrada</p>;
}

/**
 * Compact row for a single pet in the /gob/perdidas list panel.
 * Shows a status pill when the row is not in 'lost' status.
 *
 * `showOwnerDetail` (PO decision 4b): at a national/multi-province view the
 * row renders WITHOUT owner-identifying fields — pet + locality + days only
 * (case code, owner name, exact last-seen point, and the credential link all
 * stay hidden); the full detail row (this function's else-branch) appears
 * once the view is narrowed to a single operative jurisdiction.
 */
export function LostPetRow({ pet, caseCode, showOwnerDetail }: LostPetRowProps) {
  const statusLabel = STATUS_LABEL[pet.petStatus] ?? pet.petStatus;
  const statusTone: PillTone = STATUS_TONE[pet.petStatus] ?? "neutral";

  if (!showOwnerDetail) {
    return (
      <li className="rounded-[var(--radius-md)] border border-ln-op-line px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[var(--text-md)] font-medium text-ln-op-ink">{pet.petName}</p>
              <OpPill tone="neutral">{speciesLabel(pet.species)}</OpPill>
              <OpPill tone={statusTone}>{statusLabel}</OpPill>
            </div>
            <p className="text-sm text-ln-op-mute">
              {pet.locality ?? "—"}, {pet.province ?? "—"}
            </p>
          </div>
          <div className="text-right whitespace-nowrap">
            <p className="text-sm text-ln-op-mute tabular-nums">
              {lostTimeLabel(pet.markedLostAt)}
            </p>
          </div>
        </div>
      </li>
    );
  }

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
          <LocationLine pet={pet} />
          {pet.ownerDisplayName && (
            <p className="text-sm text-ln-op-mute">
              {"Dueño/a:"} {pet.ownerDisplayName}
            </p>
          )}
        </div>
        <div className="text-right space-y-1 whitespace-nowrap">
          <p className="text-sm text-ln-op-mute tabular-nums">{lostTimeLabel(pet.markedLostAt)}</p>
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
