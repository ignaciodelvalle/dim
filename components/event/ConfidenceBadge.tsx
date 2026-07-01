// ConfidenceBadge — compact chip showing a pet event's confidence tier.
//
// Decision A7 (plan 2026-05-22): labels are descriptive ("Verificado por
// veterinario matriculado"), NOT judgmental ("high confidence"). The owner
// must not feel degraded when their self-reported event shows a lower tier.
//
// Styling follows Libreta Nacional token set (ln-* CSS custom properties).

import { type ConfidenceTier, confidenceLabel } from "@/lib/events/event-confidence";

interface Props {
  tier: ConfidenceTier;
  className?: string;
}

const TIER_STYLES: Record<ConfidenceTier, string> = {
  institutional_verified: "bg-[var(--color-ln-ok-050)] text-[var(--color-ln-ok)]",
  professional_verified: "bg-[var(--color-ln-celeste-050)] text-[var(--color-ln-azul)]",
  corroborated: "bg-[var(--color-ln-warn-050)] text-[var(--color-ln-warn)]",
  self_reported: "bg-[var(--color-ln-stripe)] text-[var(--color-ln-mute)]",
  unverified: "bg-[var(--color-ln-stripe)] text-[var(--color-ln-faint)]",
};

export function ConfidenceBadge({ tier, className = "" }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${TIER_STYLES[tier]} ${className}`.trim()}
    >
      {confidenceLabel(tier)}
    </span>
  );
}
