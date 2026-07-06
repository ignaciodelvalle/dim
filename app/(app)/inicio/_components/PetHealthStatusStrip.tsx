// Per-pet health-status strip for /inicio (Item 5).
//
// Spec: docs/superpowers/specs/2026-06-18-owner-health-status-nudges-design.md
//
// Presentational / dumb: receives already-derived PetHealthStatus[] from the
// server component (lib/owner-nudges.ts) and renders one row per pet — a status
// badge ("Sin pendientes" / "N pendientes") plus its supportive nudges, each a direct
// owner action link. Encouraging, never alarming (spec D4). It surfaces ONLY
// the owner's own derived signals — no surveillance/authority data ever reaches
// this component (umbrella §6).

import Link from "next/link";

import { LnCard, LnCardBody, LnCardHead } from "@/components/ui/Card";
import type { LnPetStatus } from "@/components/ui/Chip";
import { LnStatusFlag } from "@/components/ui/StatusFlag";
import type { Nudge, PetHealthStatus } from "@/lib/infra/owner-nudges";
import { capCount, speciesLabel } from "@/lib/utils/format";

/** Per-pet compliance summary, derived by the SAME projection the pet profile
 *  and /mis-mascotas read (deriveComplianceState). */
export type PetComplianceSummary = { status: LnPetStatus; ok: number; total: number };

function NudgeRow({ nudge }: { nudge: Nudge }) {
  const dotClass =
    nudge.tone === "attention" ? "bg-[var(--color-ln-warn)]" : "bg-[var(--color-ln-celeste)]";
  return (
    <Link
      href={nudge.actionHref}
      className="-mx-1.5 flex items-center gap-2.5 rounded-[var(--radius-sm)] px-1.5 py-1 no-underline transition-colors hover:bg-[var(--color-ln-stripe)]"
    >
      <span
        className={`h-[7px] w-[7px] flex-shrink-0 rounded-full ${dotClass}`}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 text-[12.5px] text-[var(--color-ln-ink)]">{nudge.label}</span>
      <span
        aria-hidden="true"
        className="flex-shrink-0 font-[var(--font-ln-mono)] text-[11px] text-[var(--color-ln-azul)]"
      >
        →
      </span>
    </Link>
  );
}

function PetStatusRow({
  pet,
  compliance,
}: {
  pet: PetHealthStatus;
  compliance?: PetComplianceSummary;
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-[var(--color-ln-line-2)] py-2.5 last:border-b-0 last:pb-0">
      <div className="flex items-center justify-between gap-2.5">
        <Link
          href={`/mis-mascotas/${pet.publicToken}`}
          className="min-w-0 truncate text-[13.5px] font-semibold text-[var(--color-ln-ink)] no-underline hover:underline"
        >
          {pet.name}
          <span className="ml-1.5 font-normal text-[var(--color-ln-mute)]">
            {speciesLabel(pet.species)}
          </span>
        </Link>
        {/* Authoritative status = the compliance chip, the SAME AL DÍA / REGISTRADA
            the pet profile and /mis-mascotas show. The old per-row badge said
            "Sin pendientes" (a nudge rollup) which read as compliance-OK and
            directly contradicted a profile showing "0 de 4 al día" (UX gate M5b:
            one pet, two status truths). The nudges below stay as owner actions. */}
        {compliance && (
          <span className="flex flex-shrink-0 items-center gap-2">
            {compliance.status === "registered" && compliance.total > 0 && (
              <span className="font-[var(--font-ln-mono)] text-[10.5px] uppercase tracking-[.05em] text-[var(--color-ln-mute)]">
                {compliance.ok} de {compliance.total} al día
              </span>
            )}
            <LnStatusFlag status={compliance.status} />
          </span>
        )}
      </div>
      {pet.nudges.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {pet.nudges.map((n) => (
            <NudgeRow key={n.kind} nudge={n} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Owner health-status strip. Renders nothing when the owner has no pets — the
 * /inicio empty state already prompts to register a pet.
 */
export function PetHealthStatusStrip({
  pets,
  complianceByPet,
}: {
  pets: PetHealthStatus[];
  /** petId → compliance summary from deriveComplianceState. When absent, the
   *  row shows no status chip (graceful degradation). */
  complianceByPet?: Map<string, PetComplianceSummary>;
}) {
  if (pets.length === 0) return null;

  // Header now reflects the compliance projection (the same source the per-row
  // chip and the pet profile read), not the nudge rollup — "N de M al día"
  // instead of "sin pendientes" (UX gate M5b). Capped so a high-volume owner
  // never sees an alarming raw total.
  const alDia = pets.filter((p) => complianceByPet?.get(p.petId)?.status === "ok").length;

  return (
    <LnCard aria-labelledby="estado-sanitario-heading">
      <LnCardHead
        title={<span id="estado-sanitario-heading">Estado sanitario</span>}
        label={
          complianceByPet ? `${capCount(alDia)} de ${capCount(pets.length)} al día` : undefined
        }
      />
      <LnCardBody>
        <div className="flex flex-col">
          {pets.map((pet) => (
            <PetStatusRow key={pet.petId} pet={pet} compliance={complianceByPet?.get(pet.petId)} />
          ))}
        </div>
      </LnCardBody>
    </LnCard>
  );
}
