// OwnerRollupStrip — the cross-pet "is anything on fire?" glance on the
// /mis-mascotas index (owner-ia-redesign P5, decision 3; inventory §9.1).
//
// A credential is per-pet by definition, so the swipe can never answer "is any
// of my pets overdue?" — the question /inicio's greeting + health strip used to
// answer in one line. That rollup lands HERE, above the per-pet cards: próximos
// vencimientos, pets al día over the total, and open cases. Presentational —
// the server page passes the already-computed counts (same projections the
// cards below and the profile read, so the numbers can never disagree).

import { Icon, type IconName } from "@/components/Icon";
import { capCount } from "@/lib/utils/format";

function RollupCell({
  icon,
  value,
  label,
  tone,
}: {
  icon: IconName;
  value: string;
  label: string;
  /** Calm (nothing pending) reads muted; a non-zero count reads with emphasis. */
  tone: "calm" | "attention";
}) {
  const emphasis =
    tone === "attention" ? "text-[var(--color-ln-ink)]" : "text-[var(--color-ln-ink-2)]";
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span
        aria-hidden="true"
        className={`grid h-9 w-9 flex-shrink-0 place-items-center rounded-full ${
          tone === "attention"
            ? "bg-[var(--color-ln-warn-050)] text-[var(--color-ln-warn)]"
            : "bg-[var(--color-ln-stripe)] text-[var(--color-ln-mute)]"
        }`}
      >
        <Icon name={icon} size={16} decorative />
      </span>
      <div className="min-w-0">
        <p className={`font-ln-serif text-lg font-semibold leading-none ${emphasis}`}>{value}</p>
        <p className="mt-1 font-ln-mono text-xs uppercase tracking-[.06em] text-[var(--color-ln-mute)]">
          {label}
        </p>
      </div>
    </div>
  );
}

export function OwnerRollupStrip({
  proximosVencimientos,
  alDia,
  totalPets,
  casosAbiertos,
}: {
  proximosVencimientos: number;
  alDia: number;
  totalPets: number;
  casosAbiertos: number;
}) {
  return (
    <section
      aria-label="Resumen de tus mascotas"
      data-section="owner-rollup"
      className="mb-6 grid grid-cols-1 divide-y divide-[var(--color-ln-line-2)] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-ln-line)] bg-[var(--color-ln-card)] sm:grid-cols-3 sm:divide-x sm:divide-y-0"
    >
      <RollupCell
        icon="reloj"
        value={capCount(proximosVencimientos)}
        label={proximosVencimientos === 1 ? "vencimiento próximo" : "vencimientos próximos"}
        tone={proximosVencimientos > 0 ? "attention" : "calm"}
      />
      <RollupCell
        icon="check-circle"
        value={`${capCount(alDia)} / ${capCount(totalPets)}`}
        label="al día"
        tone={alDia < totalPets ? "attention" : "calm"}
      />
      <RollupCell
        icon="alerta"
        value={capCount(casosAbiertos)}
        label={casosAbiertos === 1 ? "caso abierto" : "casos abiertos"}
        tone={casosAbiertos > 0 ? "attention" : "calm"}
      />
    </section>
  );
}
