// Tier 2 medical view — owner-opt-in widened public projection.
//
// Rendered on /p/[publicToken] while the Tier 2 window is active — either a
// bounded window (tier2PublicEnabledUntil in the future) or the permanent
// "siempre" option (tier2PublicPermanent = true). Surfaces a curated medical
// summary on top of the Tier 0 identity rollups the credential normally shows.
//
// Privacy boundary: name + photo + species + breed are already public
// (Tier 0). This view adds vaccines vigentes, esterilización, medicación
// activa, condiciones permanentes — NEVER owner contact, address, DNI,
// or free-text notes.
//
// AGGREGATE ONLY: active vaccine count + sterilized yes/no. Per-vaccine
// rows are NOT shown here — the projection doesn't expose them at this tier.

import {
  PERMANENT_CONDITIONS,
  type PermanentCondition,
  permanentConditionLabel,
} from "@/lib/permanent-conditions";

interface Props {
  /** When the bounded window closes. Null when permanent ("siempre" option). */
  enabledUntil: Date | null;
  /** Per-vaccine snapshot — aggregate counts only (active, expired, dueSoon, missing). */
  vaccineSummary: {
    active: number;
    expired: number;
    dueSoon: number;
    missing: number;
  };
  /** Pet has at least one sterilization_performed event. */
  isSterilized: boolean;
  /** Names of currently-active medications (started without a stop). */
  activeMedications: string[];
  /** From pet.permanent_conditions — already on the row, no extra query. */
  permanentConditions: readonly string[];
  /** Free-text "otra" condition supplied by the owner, if any. */
  permanentConditionsOther: string | null;
}

export function Tier2MedicalView({
  enabledUntil,
  vaccineSummary,
  isSterilized,
  activeMedications,
  permanentConditions,
  permanentConditionsOther,
}: Props) {
  const knownConditions = new Set<string>(PERMANENT_CONDITIONS);
  const conditionLabels = permanentConditions.map((c) => {
    if (c === "otra" && permanentConditionsOther) return permanentConditionsOther;
    if (knownConditions.has(c)) return permanentConditionLabel(c as PermanentCondition);
    return c;
  });

  const untilLabel = enabledUntil
    ? enabledUntil.toLocaleString("es-AR", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  // Determine vaccine tone based on summary
  const vaccineTone: "ok" | "warn" | "danger" =
    vaccineSummary.expired > 0 ? "danger" : vaccineSummary.missing > 0 ? "warn" : "ok";

  const vaccineSubLabel =
    vaccineSummary.expired > 0
      ? `${vaccineSummary.expired} vencida${vaccineSummary.expired === 1 ? "" : "s"}`
      : vaccineSummary.missing > 0
        ? `${vaccineSummary.missing} faltante${vaccineSummary.missing === 1 ? "" : "s"}`
        : `${vaccineSummary.active} al día`;

  return (
    <section aria-labelledby="tier2-h" className="px-[16px] py-[13px]">
      {/* Section eyebrow */}
      <p className="mb-[4px] font-[var(--font-ln-mono)] text-[9.5px] font-semibold uppercase tracking-[.1em] text-ln-ok">
        Información médica · habilitada por el dueño
      </p>
      <h2
        id="tier2-h"
        className="m-0 mb-[2px] font-[var(--font-ln-serif)] text-[16px] font-semibold text-ln-ink"
      >
        Resumen médico vigente
      </h2>
      <p className="m-0 mb-[12px] text-[11.5px] text-ln-mute">
        {untilLabel ? (
          <>
            Visible hasta el <strong className="text-ln-ink-2">{untilLabel}</strong>.
          </>
        ) : (
          <strong className="text-ln-ink-2">Siempre visible</strong>
        )}
      </p>

      {/* Aggregate stats grid */}
      <dl
        className={`grid grid-cols-2 gap-x-[12px] gap-y-[10px] ${conditionLabels.length > 0 || activeMedications.length > 0 ? "mb-[12px]" : ""}`}
      >
        <MedStat
          label="Vacunación"
          value={String(vaccineSummary.active || vaccineSummary.expired || vaccineSummary.missing)}
          sub={vaccineSubLabel}
          tone={vaccineTone}
        />
        <MedStat
          label="Esterilización"
          value={isSterilized ? "Sí" : "No"}
          sub={isSterilized ? "Castrado/a" : "No registrada"}
          tone={isSterilized ? "ok" : "neutral"}
        />
      </dl>

      {/* Active medications */}
      {activeMedications.length > 0 && (
        <MedBlock label="Medicación activa">
          <ul className="m-0 list-none p-0">
            {activeMedications.map((drug) => (
              <li
                key={drug}
                className="flex items-center gap-[7px] border-b border-ln-line-2 py-[4px] text-[13px] text-ln-ink"
              >
                <span aria-hidden="true" className="text-[10px] text-ln-azul">
                  ●
                </span>
                {drug}
              </li>
            ))}
          </ul>
        </MedBlock>
      )}

      {/* Permanent conditions */}
      {conditionLabels.length > 0 && (
        <MedBlock label="Condiciones permanentes">
          <p className="m-0 text-[13px] leading-[1.5] text-ln-ink">{conditionLabels.join(" · ")}</p>
        </MedBlock>
      )}

      {/* Privacy notice */}
      <p className="mt-[10px] font-[var(--font-ln-mono)] text-[9.5px] leading-[1.5] tracking-[.02em] text-ln-faint">
        Esta vista no expone contacto del dueño, dirección ni notas privadas.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// MedStat — aggregate stat cell (vaccine count / sterilized flag)
// ---------------------------------------------------------------------------

function MedStat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "ok" | "warn" | "danger" | "neutral";
}) {
  const valueClass =
    tone === "danger"
      ? "text-ln-err"
      : tone === "warn"
        ? "text-ln-warn"
        : tone === "ok"
          ? "text-ln-ok"
          : "text-ln-ink-2";

  return (
    <div className="rounded-[4px] border border-ln-line bg-ln-stripe px-[12px] py-[10px]">
      <dt className="mb-[4px] font-[var(--font-ln-mono)] text-[9px] font-semibold uppercase tracking-[.08em] text-ln-mute">
        {label}
      </dt>
      <dd
        className={`m-0 font-[var(--font-ln-serif)] text-[22px] font-semibold leading-none ${valueClass}`}
      >
        {value}
      </dd>
      <p className="mt-[3px] text-[11.5px] text-ln-mute">{sub}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MedBlock — labeled content block inside Tier2MedicalView
// ---------------------------------------------------------------------------

function MedBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-[10px] rounded-[4px] border border-ln-line bg-ln-stripe px-[12px] py-[10px]">
      <p className="mb-[6px] font-[var(--font-ln-mono)] text-[9px] font-semibold uppercase tracking-[.08em] text-ln-mute">
        {label}
      </p>
      {children}
    </div>
  );
}
