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
//
// AGGREGATE ONLY: active vaccine count + sterilized yes/no. Per-vaccine
// rows are NOT shown here — the projection doesn't expose them at this tier.

import {
  PERMANENT_CONDITIONS,
  type PermanentCondition,
  permanentConditionLabel,
} from "@/lib/permanent-conditions";

interface Props {
  /** ISO when the window closes; surfaced as a soft countdown. */
  enabledUntil: Date;
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

  const untilLabel = enabledUntil.toLocaleString("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

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
    <section aria-labelledby="tier2-h" style={{ padding: "13px 16px" }}>
      {/* Section eyebrow */}
      <p
        style={{
          fontFamily: "var(--font-ln-mono)",
          fontSize: 9.5,
          letterSpacing: ".1em",
          textTransform: "uppercase",
          color: "var(--color-ln-ok)",
          fontWeight: 600,
          marginBottom: 4,
        }}
      >
        Información médica · habilitada por el dueño
      </p>
      <h2
        id="tier2-h"
        style={{
          fontFamily: "var(--font-ln-serif)",
          fontSize: 16,
          fontWeight: 600,
          color: "var(--color-ln-ink)",
          margin: "0 0 2px",
        }}
      >
        Resumen médico vigente
      </h2>
      <p
        style={{
          fontSize: 11.5,
          color: "var(--color-ln-mute)",
          margin: "0 0 12px",
        }}
      >
        Visible hasta el <strong style={{ color: "var(--color-ln-ink-2)" }}>{untilLabel}</strong>.
      </p>

      {/* Aggregate stats grid */}
      <dl
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "10px 12px",
          marginBottom: conditionLabels.length > 0 || activeMedications.length > 0 ? 12 : 0,
        }}
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
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {activeMedications.map((drug) => (
              <li
                key={drug}
                style={{
                  fontSize: 13,
                  color: "var(--color-ln-ink)",
                  padding: "4px 0",
                  borderBottom: "1px solid var(--color-ln-line-2)",
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                }}
              >
                <span aria-hidden="true" style={{ color: "var(--color-ln-azul)", fontSize: 10 }}>
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
          <p style={{ fontSize: 13, color: "var(--color-ln-ink)", margin: 0, lineHeight: 1.5 }}>
            {conditionLabels.join(" · ")}
          </p>
        </MedBlock>
      )}

      {/* Privacy notice */}
      <p
        style={{
          fontFamily: "var(--font-ln-mono)",
          fontSize: 9.5,
          color: "var(--color-ln-faint)",
          letterSpacing: ".02em",
          marginTop: 10,
          lineHeight: 1.5,
        }}
      >
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
  const valueColor =
    tone === "danger"
      ? "var(--color-ln-err)"
      : tone === "warn"
        ? "var(--color-ln-warn)"
        : tone === "ok"
          ? "var(--color-ln-ok)"
          : "var(--color-ln-ink-2)";

  return (
    <div
      style={{
        borderRadius: 4,
        background: "var(--color-ln-stripe)",
        border: "1px solid var(--color-ln-line)",
        padding: "10px 12px",
      }}
    >
      <dt
        style={{
          fontFamily: "var(--font-ln-mono)",
          fontSize: 9,
          letterSpacing: ".08em",
          textTransform: "uppercase",
          fontWeight: 600,
          color: "var(--color-ln-mute)",
          marginBottom: 4,
        }}
      >
        {label}
      </dt>
      <dd
        style={{
          fontFamily: "var(--font-ln-serif)",
          fontSize: 22,
          fontWeight: 600,
          lineHeight: 1,
          color: valueColor,
          margin: 0,
        }}
      >
        {value}
      </dd>
      <p
        style={{
          fontSize: 11.5,
          color: "var(--color-ln-mute)",
          marginTop: 3,
        }}
      >
        {sub}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MedBlock — labeled content block inside Tier2MedicalView
// ---------------------------------------------------------------------------

function MedBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        borderRadius: 4,
        background: "var(--color-ln-stripe)",
        border: "1px solid var(--color-ln-line)",
        padding: "10px 12px",
        marginBottom: 10,
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-ln-mono)",
          fontSize: 9,
          letterSpacing: ".08em",
          textTransform: "uppercase",
          fontWeight: 600,
          color: "var(--color-ln-mute)",
          marginBottom: 6,
        }}
      >
        {label}
      </p>
      {children}
    </div>
  );
}
