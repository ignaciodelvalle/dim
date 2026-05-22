// ConfidenceBadge — compact chip showing a pet event's confidence tier.
//
// Decision A7 (plan 2026-05-22): labels are descriptive ("Verificado por
// veterinario matriculado"), NOT judgmental ("high confidence"). The owner
// must not feel degraded when their self-reported event shows a lower tier.
//
// Styling follows poncho/Badge patterns (inline-flex pill, semantic colors).

import { confidenceLabel, type ConfidenceTier } from "@/lib/event-confidence";

interface Props {
  tier: ConfidenceTier;
  className?: string;
}

const TIER_STYLES: Record<ConfidenceTier, string> = {
  institutional_verified:
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100",
  professional_verified: "bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-100",
  corroborated: "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  self_reported:
    "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  unverified:
    "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-500",
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
