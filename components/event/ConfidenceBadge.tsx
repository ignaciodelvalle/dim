// ConfidenceBadge — compact chip showing a pet event's confidence tier.
//
// Decision A7 (plan 2026-05-22): labels are descriptive ("Verificado por
// veterinario matriculado"), NOT judgmental ("high confidence"). The owner
// must not feel degraded when their self-reported event shows a lower tier.
//
// Styling follows poncho/Badge patterns (inline-flex pill, semantic colors).

import { type ConfidenceTier, confidenceLabel } from "@/lib/event-confidence";

interface Props {
  tier: ConfidenceTier;
  className?: string;
}

const TIER_STYLES: Record<ConfidenceTier, string> = {
  institutional_verified: "bg-gob-success/10 text-gob-success  ",
  professional_verified: "bg-gob-info/10 text-gob-azul-link  ",
  corroborated: "bg-gob-warning/10 text-gob-warning-text  ",
  self_reported: "bg-gob-surface-alt text-gob-text-gray  ",
  unverified: "bg-gob-surface-alt text-gob-text-muted  ",
};

export function ConfidenceBadge({ tier, className = "" }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${TIER_STYLES[tier]} ${className}`.trim()}
    >
      {confidenceLabel(tier)}
    </span>
  );
}
