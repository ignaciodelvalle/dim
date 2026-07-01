// ---------------------------------------------------------------------------
// ComplianceObligationsPanel — owner "comply-first" slice (WS-1, 2026-07-01)
// Spec: docs/superpowers/specs/2026-07-01-owner-compliance-first-slice-handoff.md §2
//
// Leads the pet profile's Resumen tab: the owner's legal obligations (rabies,
// sterilization, microchip, and — where the jurisdiction requires it — PPP
// attestation) rendered as status badges derived from the pet's events.
//
// Server component (no client JS). WS-2 adds a "Programar turno" action on the
// antirrábica card when it is por vencer / vencida — a plain Link into the
// URL-driven intent-fork sheet (?sheet=turno-antirrabica), so the panel stays
// server-only. Reuses LnBadge; no new color tokens (token ratchet).
// ---------------------------------------------------------------------------

import { LnBadge, type LnBadgeProps } from "@/components/ui/Badge";
import type {
  ComplianceState,
  ComplianceTone,
  ObligationCard,
} from "@/lib/projections/pet-compliance";
import Link from "next/link";

// Map the semantic compliance tone onto an LnBadge variant. `reserved` (a booked
// turno, WS-2) reads as informational; `neutral` is "sin registro".
const TONE_TO_BADGE: Record<ComplianceTone, NonNullable<LnBadgeProps["variant"]>> = {
  ok: "success",
  due: "warning",
  over: "danger",
  reserved: "info",
  neutral: "neutral",
};

function ObligationRow({
  card,
  petPublicToken,
}: {
  card: ObligationCard;
  petPublicToken: string;
}) {
  // WS-2: the antirrábica card grows a primary action when the obligation is
  // por vencer / vencida, and a reassuring microcopy once a turno is reserved.
  const showTurnoAction = card.key === "rabies" && (card.tone === "due" || card.tone === "over");
  const isReserved = card.key === "rabies" && card.tone === "reserved";

  return (
    <li
      data-section="compliance-card"
      data-obligation={card.key}
      className="flex flex-col gap-1 border-t border-[var(--color-ln-line)] py-3 first:border-t-0 first:pt-0"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-[var(--font-ln-sans)] text-sm font-semibold text-[var(--color-ln-ink)]">
            {card.label}
          </p>
          {card.detail && (
            <p className="mt-0.5 font-[var(--font-ln-mono)] text-xs text-[var(--color-ln-mute)]">
              {card.detail}
            </p>
          )}
        </div>
        <LnBadge variant={TONE_TO_BADGE[card.tone]} className="flex-shrink-0">
          {card.state}
        </LnBadge>
      </div>
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
    </li>
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

      <ul className="flex flex-col">
        {state.cards.map((card) => (
          <ObligationRow key={card.key} card={card} petPublicToken={petPublicToken} />
        ))}
      </ul>
    </section>
  );
}
