// "Estado médico actual" — dashboard strip at the top of the libreta tab.
//
// Four cards summarise the live state of the libreta so the owner (or a
// vet glancing at the libreta) can see what matters without scrolling:
//   • Vacunación   — count of vigentes / por vencer / vencidas / faltantes
//   • Pendientes    — count of active reminders (vacuna due, dose due, etc.)
//   • Condiciones permanentes — list from pet.permanent_conditions
//   • Medicación activa       — open treatments (started without stop)
//
// Presentational component — receives the precomputed snapshot as props.
// Uses LN tokens exclusively; no raw palette values, no dark: variants.

import type { LibretaHealthStatus } from "@/lib/libreta-health-status";
import {
  PERMANENT_CONDITIONS,
  type PermanentCondition,
  permanentConditionLabel,
} from "@/lib/permanent-conditions";

interface Props {
  status: LibretaHealthStatus;
  activeRemindersCount: number;
}

export function LibretaHealthStatusSection({ status, activeRemindersCount }: Props) {
  const { vaccinations, permanentConditions, permanentConditionsOther, medicationsActive } = status;

  // Vacunación headline: prefer the most-urgent number. Order: expired,
  // due_soon, missing, active. If everything is healthy ("active" only),
  // we still show the count so the empty state isn't a dead "0".
  const vaccinationHeadline = vaccinations.expired
    ? { tone: "danger" as const, value: vaccinations.expired, label: "vencidas" }
    : vaccinations.dueSoon
      ? { tone: "warning" as const, value: vaccinations.dueSoon, label: "por vencer" }
      : vaccinations.missing
        ? { tone: "warning" as const, value: vaccinations.missing, label: "faltantes" }
        : { tone: "ok" as const, value: vaccinations.active, label: "al día" };

  const knownConditions = new Set<string>(PERMANENT_CONDITIONS);
  const conditionLabels = permanentConditions.map((c) => {
    if (c === "otra" && permanentConditionsOther) return permanentConditionsOther;
    if (knownConditions.has(c)) return permanentConditionLabel(c as PermanentCondition);
    return c; // unknown code from an older row — surface as-is
  });

  return (
    <section
      aria-labelledby="estado-medico-h"
      className="rounded-[8px] border border-[var(--color-ln-line)] bg-[var(--color-ln-stripe)] p-[16px] space-y-[12px]"
    >
      <h2
        id="estado-medico-h"
        className="font-[var(--font-ln-mono)] text-[10px] uppercase tracking-[.06em] font-semibold"
        style={{ color: "var(--color-ln-mute)" }}
      >
        Estado médico actual
      </h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-[10px]">
        <Card
          label="Vacunación"
          value={vaccinationHeadline.value}
          sub={vaccinationHeadline.label}
          tone={vaccinationHeadline.tone}
        />
        <Card
          label="Pendientes"
          value={activeRemindersCount}
          sub={activeRemindersCount === 1 ? "recordatorio" : "recordatorios"}
          tone={activeRemindersCount > 0 ? "warning" : "ok"}
        />
        <ConditionsCard labels={conditionLabels} />
        <MedicationCard items={medicationsActive} />
      </div>
    </section>
  );
}

function Card({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number;
  sub: string;
  tone: "ok" | "warning" | "danger";
}) {
  const valueColor =
    tone === "danger"
      ? "var(--color-ln-err)"
      : tone === "warning"
        ? "var(--color-ln-warn)"
        : "var(--color-ln-ok)";

  return (
    <div className="rounded-[6px] border border-[var(--color-ln-line)] bg-[var(--color-ln-card)] px-[12px] py-[10px]">
      <p
        className="font-[var(--font-ln-mono)] text-[9px] uppercase tracking-[.06em] font-semibold"
        style={{ color: "var(--color-ln-faint)" }}
      >
        {label}
      </p>
      <p className="text-[24px] font-semibold leading-tight" style={{ color: valueColor }}>
        {value}
      </p>
      <p className="text-[11px]" style={{ color: "var(--color-ln-mute)" }}>
        {sub}
      </p>
    </div>
  );
}

function ConditionsCard({ labels }: { labels: string[] }) {
  return (
    <div className="rounded-[6px] border border-[var(--color-ln-line)] bg-[var(--color-ln-card)] px-[12px] py-[10px]">
      <p
        className="font-[var(--font-ln-mono)] text-[9px] uppercase tracking-[.06em] font-semibold"
        style={{ color: "var(--color-ln-faint)" }}
      >
        Condiciones
      </p>
      {labels.length === 0 ? (
        <p className="text-[12px] mt-[4px]" style={{ color: "var(--color-ln-faint)" }}>
          Sin condiciones
        </p>
      ) : (
        <>
          <p
            className="text-[24px] font-semibold leading-tight"
            style={{ color: "var(--color-ln-ink)" }}
          >
            {labels.length}
          </p>
          <p className="text-[11px] line-clamp-2" style={{ color: "var(--color-ln-mute)" }}>
            {labels.join(" · ")}
          </p>
        </>
      )}
    </div>
  );
}

function MedicationCard({
  items,
}: {
  items: ReadonlyArray<{ drug: string; startedAt: Date }>;
}) {
  return (
    <div className="rounded-[6px] border border-[var(--color-ln-line)] bg-[var(--color-ln-card)] px-[12px] py-[10px]">
      <p
        className="font-[var(--font-ln-mono)] text-[9px] uppercase tracking-[.06em] font-semibold"
        style={{ color: "var(--color-ln-faint)" }}
      >
        Medicación activa
      </p>
      {items.length === 0 ? (
        <p className="text-[12px] mt-[4px]" style={{ color: "var(--color-ln-faint)" }}>
          Ninguna
        </p>
      ) : (
        <>
          <p
            className="text-[24px] font-semibold leading-tight"
            style={{ color: "var(--color-ln-ink)" }}
          >
            {items.length}
          </p>
          <p className="text-[11px] line-clamp-2" style={{ color: "var(--color-ln-mute)" }}>
            {items.map((m) => m.drug).join(" · ")}
          </p>
        </>
      )}
    </div>
  );
}
