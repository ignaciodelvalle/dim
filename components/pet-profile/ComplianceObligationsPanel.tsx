// ---------------------------------------------------------------------------
// ComplianceObligationsPanel — owner "comply-first" slice (WS-1, 2026-07-01)
// Spec: docs/superpowers/specs/2026-07-01-owner-compliance-first-slice-handoff.md §2
//
// Leads the pet profile's Resumen tab: the owner's legal obligations (rabies,
// sterilization, microchip, and — where the jurisdiction requires it — PPP
// attestation) as credential-style cards derived from the pet's events.
//
// Server component (no client JS). The antirrábica card grows a "Programar
// turno" action (por vencer / vencida) — a plain Link into the URL-driven
// intent-fork sheet — so the panel stays server-only. H1: a "Declarada · sin
// verificar" card carries a verify hint. H4: rendered as a responsive grid of
// bordered cards with a leading icon. No new color tokens (token ratchet).
// ---------------------------------------------------------------------------

import Link from "next/link";

import { Icon } from "@/components/Icon";
import { LnBadge, type LnBadgeProps } from "@/components/ui/Badge";
import { LnVstamp } from "@/components/ui/StatusFlag";
import type {
  ComplianceState,
  ComplianceTone,
  ObligationCard,
  ObligationKey,
} from "@/lib/projections/pet-compliance";

// Map the semantic compliance tone onto an LnBadge variant. `reserved` (a booked
// turno) reads as informational; `neutral` is "sin registro / declarada".
const TONE_TO_BADGE: Record<ComplianceTone, NonNullable<LnBadgeProps["variant"]>> = {
  ok: "success",
  due: "warning",
  over: "danger",
  reserved: "info",
  neutral: "neutral",
};

// Leading credential icon per obligation (existing Icon.tsx names).
const ICON_FOR: Record<ObligationKey, string> = {
  rabies: "vacuna",
  sterilization: "esterilizacion",
  microchip: "microchip",
  ppp: "shield",
};

// Rabies uses the credential-style vaccine stamp where the tone maps cleanly;
// reserved / neutral fall back to LnBadge (the stamp has no such variants).
const VSTAMP_TONES = new Set<ComplianceTone>(["ok", "due", "over"]);

function StatusBadge({ card }: { card: ObligationCard }) {
  if (card.key === "rabies" && VSTAMP_TONES.has(card.tone)) {
    return <LnVstamp variant={card.tone as "ok" | "due" | "over"} className="flex-shrink-0" />;
  }
  return (
    <LnBadge variant={TONE_TO_BADGE[card.tone]} className="flex-shrink-0">
      {card.state}
    </LnBadge>
  );
}

function ObligationCardView({
  card,
  petPublicToken,
}: {
  card: ObligationCard;
  petPublicToken: string;
}) {
  const showTurnoAction = card.key === "rabies" && (card.tone === "due" || card.tone === "over");
  const isReserved = card.key === "rabies" && card.tone === "reserved";

  return (
    <div
      data-section="compliance-card"
      data-obligation={card.key}
      className="flex flex-col gap-1 rounded-[var(--radius-card)] border border-[var(--color-ln-line)] p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon
            name={ICON_FOR[card.key]}
            size="md"
            decorative
            className="flex-shrink-0 text-[var(--color-ln-azul)]"
          />
          <p className="font-[var(--font-ln-sans)] text-md font-semibold text-[var(--color-ln-ink)]">
            {card.label}
          </p>
        </div>
        <StatusBadge card={card} />
      </div>

      {card.detail && (
        <p className="font-[var(--font-ln-mono)] text-xs text-[var(--color-ln-mute)]">
          {card.detail}
        </p>
      )}

      <p className="font-[var(--font-ln-sans)] text-xs text-[var(--color-ln-faint)]">
        {card.legalFootnote}
      </p>

      {showTurnoAction && (
        <Link
          href={`/mis-mascotas/${petPublicToken}?sheet=turno-antirrabica`}
          className="mt-1 inline-flex min-h-11 w-fit items-center justify-center rounded-full bg-[var(--color-ln-azul)] px-4 font-[var(--font-ln-sans)] text-sm font-semibold text-white no-underline transition-colors hover:bg-[var(--color-ln-azul-700)]"
        >
          Programar turno
        </Link>
      )}

      {isReserved && (
        <p className="mt-1 font-[var(--font-ln-sans)] text-xs text-[var(--color-ln-ink-2)]">
          Cuando el veterinario la aplique, se registra como evento y el estado pasa a Al día solo.
        </p>
      )}

      {card.hint && (
        <p className="mt-1 font-[var(--font-ln-sans)] text-xs text-[var(--color-ln-mute)]">
          {card.hint}
        </p>
      )}
    </div>
  );
}

export function ComplianceObligationsPanel({
  state,
  petPublicToken,
}: {
  state: ComplianceState;
  petPublicToken: string;
}) {
  if (state.cards.length === 0) return null;

  return (
    <section
      data-section="compliance"
      className="rounded-[var(--radius-card)] border border-[var(--color-ln-line)] bg-[var(--color-ln-card)] p-4"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="font-[var(--font-ln-mono)] text-xs uppercase tracking-wide text-[var(--color-ln-mute)]">
            Cumplimiento
          </p>
          <h2 className="mt-0.5 font-[var(--font-ln-serif)] text-base font-semibold text-[var(--color-ln-ink)]">
            Estado de cumplimiento
          </h2>
        </div>
        <LnBadge variant={TONE_TO_BADGE[state.worstTone]} className="flex-shrink-0">
          {state.summary.label}
        </LnBadge>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {state.cards.map((card) => (
          <ObligationCardView key={card.key} card={card} petPublicToken={petPublicToken} />
        ))}
      </div>
    </section>
  );
}
