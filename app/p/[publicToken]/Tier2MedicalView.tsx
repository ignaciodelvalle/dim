// Tier 2 medical view — owner-opt-in widened public projection.
//
// Rendered on /p/[publicToken] only while pet.tier2PublicEnabledUntil
// is in the future. Surfaces a curated medical summary on top of the
// Tier 0 identity rollups the credential normally shows.
//
// Privacy boundary: name + photo + species + breed are already public
// (Tier 0). This view adds vaccines vigentes, esterilización, medicación
// activa, condiciones permanentes — NEVER owner contact, address, DNI,
// or free-text notes.

import {
  PERMANENT_CONDITIONS,
  type PermanentCondition,
  permanentConditionLabel,
} from "@/lib/permanent-conditions";

interface Props {
  /** ISO when the window closes; surfaced as a soft countdown. */
  enabledUntil: Date;
  /** Per-vaccine snapshot (catalog name + last dose + status). */
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

  const untilLabel = enabledUntil.toLocaleString("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <section
      aria-labelledby="tier2-h"
      className="rounded-2xl border-2 border-gob-success  bg-gob-success/10/70  p-4 space-y-4"
    >
      <header className="space-y-0.5">
        <p className="text-[10px] uppercase tracking-[0.2em] font-semibold text-gob-success ">
          Información médica · habilitada por el dueño
        </p>
        <h2 id="tier2-h" className="text-base font-semibold text-gob-text ">
          Resumen médico vigente
        </h2>
        <p className="text-xs text-gob-text-gray ">
          Visible hasta el <strong>{untilLabel}</strong>.
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-3">
        <Stat
          label="Vacunación"
          value={vaccineSummary.expired || vaccineSummary.missing || vaccineSummary.active}
          sub={
            vaccineSummary.expired
              ? `${vaccineSummary.expired} vencida${vaccineSummary.expired === 1 ? "" : "s"}`
              : vaccineSummary.missing
                ? `${vaccineSummary.missing} faltante${vaccineSummary.missing === 1 ? "" : "s"}`
                : `${vaccineSummary.active} al día`
          }
          tone={vaccineSummary.expired ? "danger" : vaccineSummary.missing ? "warning" : "ok"}
        />
        <Stat
          label="Esterilización"
          value={isSterilized ? 1 : 0}
          sub={isSterilized ? "Castrado/a" : "No registrada"}
          tone={isSterilized ? "ok" : "neutral"}
        />
      </dl>

      {activeMedications.length > 0 && (
        <Block label="Medicación activa">
          <ul className="text-sm text-gob-text  space-y-0.5">
            {activeMedications.map((drug) => (
              <li key={drug}>· {drug}</li>
            ))}
          </ul>
        </Block>
      )}

      {conditionLabels.length > 0 && (
        <Block label="Condiciones permanentes">
          <p className="text-sm text-gob-text ">{conditionLabels.join(" · ")}</p>
        </Block>
      )}

      <p className="text-[11px] text-gob-text-muted ">
        Esta vista no expone contacto del dueño, dirección, ni notas privadas.
      </p>
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number;
  sub: string;
  tone: "ok" | "warning" | "danger" | "neutral";
}) {
  const toneClass =
    tone === "danger"
      ? "text-gob-danger "
      : tone === "warning"
        ? "text-gob-warning-text "
        : tone === "ok"
          ? "text-gob-success "
          : "text-gob-text-gray ";
  return (
    <div className="rounded-lg bg-white  border border-gob-border  px-3 py-2">
      <dt className="text-[10px] uppercase tracking-wider font-semibold text-gob-text-muted ">
        {label}
      </dt>
      <dd className={`text-2xl font-semibold leading-tight ${toneClass}`}>{value}</dd>
      <p className="text-xs text-gob-text-gray ">{sub}</p>
    </div>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-white  border border-gob-border  px-3 py-2 space-y-1">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-gob-text-muted ">
        {label}
      </p>
      {children}
    </div>
  );
}
