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

import { Icon } from "@/components/Icon";
import { LnBadge, type LnBadgeProps } from "@/components/ui/Badge";
import { LnLinkButton } from "@/components/ui/LinkButton";
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

// Currency-chip variant for the dual vaccine block (task #78 — the "0 de 4 ·
// DECLARADA" #4 fix). The chip shows the owner's REAL vaccine currency alongside
// the "registro needs a firma" nudge, so the card is dual + honest.
const CURRENCY_TO_BADGE: Record<"ok" | "due" | "over", NonNullable<LnBadgeProps["variant"]>> = {
  ok: "success",
  due: "warning",
  over: "danger",
};

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
  bare = false,
}: {
  card: ObligationCard;
  petPublicToken: string;
  /** Inside the credential sheet: render as a borderless divider-separated row
   *  (no nested box) so the whole compliance section reads as one document. */
  bare?: boolean;
}) {
  const showTurnoAction = card.key === "rabies" && (card.tone === "due" || card.tone === "over");
  const isReserved = card.key === "rabies" && card.tone === "reserved";
  // PPP attestation register affordance — surfaced HERE (the canonical
  // obligation card) instead of a duplicate LnAlert row on the credential face.
  // Only for the flagged-PPP "Atestación requerida" state; the "Faltan datos"
  // (indeterminado) variant nudges toward completing breed/weight via its hint.
  const showPppRegister = card.key === "ppp" && card.state === "Atestación requerida";

  return (
    <div
      data-section="compliance-card"
      data-obligation={card.key}
      className={
        bare
          ? "flex flex-col gap-2 py-3.5 first:pt-0 last:pb-0"
          : "flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--color-ln-line)] bg-[var(--color-ln-card)] p-4"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-8 flex-shrink-0 items-center justify-center rounded-[var(--radius-lg)] border border-[var(--color-ln-celeste-100)] bg-[var(--color-ln-celeste-050)] text-[var(--color-ln-azul)]">
            <Icon name={ICON_FOR[card.key]} size="sm" decorative />
          </span>
          <p className="font-[var(--font-ln-sans)] text-md font-semibold leading-tight text-[var(--color-ln-ink)]">
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

      {/* DUAL honest vaccine state (task #78 / #4): what the owner HAS (dose on
          record + its currency) above what the official REGISTRY still needs (a
          matriculated vet signature) — so a declared-but-vigente vaccine stops
          reading as a flat "you have nothing" contradiction. */}
      {card.dual && (
        <div className="mt-0.5 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--color-ln-ok-100)] bg-[var(--color-ln-ok-050)] px-3 py-2.5">
            <span aria-hidden className="font-semibold text-[var(--color-ln-ok)]">
              ✓
            </span>
            <span className="text-xs font-medium leading-relaxed text-[var(--color-ln-ink)]">
              {card.dual.ownerLabel}
            </span>
            {card.dual.currencyLabel && card.dual.currencyTone && (
              <LnBadge
                variant={CURRENCY_TO_BADGE[card.dual.currencyTone]}
                className="flex-shrink-0"
              >
                {card.dual.currencyLabel}
              </LnBadge>
            )}
          </div>
          <p className="flex items-start gap-2 rounded-[var(--radius-lg)] border border-[var(--color-ln-warn-100)] bg-[var(--color-ln-warn-025)] px-3 py-2.5 text-xs leading-relaxed text-[var(--color-ln-warn)]">
            <Icon name="info" size="sm" decorative className="mt-px flex-shrink-0" />
            <span>{card.dual.registryLine}</span>
          </p>
        </div>
      )}

      <p className="font-[var(--font-ln-sans)] text-xs leading-relaxed text-[var(--color-ln-faint)]">
        {card.legalFootnote}
      </p>

      {showTurnoAction && (
        <LnLinkButton
          href={`/mis-mascotas/${petPublicToken}?sheet=turno-antirrabica`}
          className="mt-1 w-fit"
        >
          Programar turno
        </LnLinkButton>
      )}

      {showPppRegister && (
        <LnLinkButton
          href={`/mis-mascotas/${petPublicToken}/eventos/atestar-raza-peligrosa`}
          className="mt-1 w-fit"
        >
          Registrar atestación
        </LnLinkButton>
      )}

      {isReserved && (
        <p className="mt-1 font-[var(--font-ln-sans)] text-xs text-[var(--color-ln-ink-2)]">
          Cuando el veterinario la aplique, se registra como evento y el estado pasa a Al día solo.
        </p>
      )}

      {card.hint && (
        <p className="mt-1 flex items-start gap-2 rounded-[var(--radius-lg)] border border-[var(--color-ln-warn-100)] bg-[var(--color-ln-warn-025)] px-3 py-2.5 text-xs leading-relaxed text-[var(--color-ln-warn)]">
          <Icon name="info" size="sm" decorative className="mt-px flex-shrink-0" />
          <span>{card.hint}</span>
        </p>
      )}
    </div>
  );
}

// Compliance grid + summary. `bare` (used inside the credential sheet) drops the
// own outer bordered box and the "Cumplimiento" eyebrow — the sheet's labeled
// hairline divider provides both, so the panel doesn't nest a card in a card.
export function ComplianceObligationsPanel({
  state,
  petPublicToken,
  bare = false,
}: {
  state: ComplianceState;
  petPublicToken: string;
  bare?: boolean;
}) {
  if (state.cards.length === 0) return null;

  const header = bare ? (
    <div className="ln-comply-head">
      <h3>
        <span className="ln-eyebrow">Estado</span>
        Estado de cumplimiento
      </h3>
      <LnBadge variant={TONE_TO_BADGE[state.worstTone]} className="flex-shrink-0">
        {state.summary.label}
      </LnBadge>
    </div>
  ) : (
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
  );

  // Bare (inside the sheet): borderless obligation ROWS separated by hairlines
  // — one continuous document, no card-in-card. Standalone: bordered cards.
  const grid = bare ? (
    <div className="divide-y divide-[var(--color-ln-line-2)]">
      {state.cards.map((card) => (
        <ObligationCardView key={card.key} card={card} petPublicToken={petPublicToken} bare />
      ))}
    </div>
  ) : (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {state.cards.map((card) => (
        <ObligationCardView key={card.key} card={card} petPublicToken={petPublicToken} />
      ))}
    </div>
  );

  if (bare) {
    return (
      <section data-section="compliance">
        {header}
        {grid}
      </section>
    );
  }

  return (
    <section
      data-section="compliance"
      className="rounded-[var(--radius-card)] border border-[var(--color-ln-line)] bg-[var(--color-ln-card)] p-4"
    >
      {header}
      {grid}
    </section>
  );
}
