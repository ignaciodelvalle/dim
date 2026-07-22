import { Icon, type IconName } from "@/components/Icon";
import type { ReactNode } from "react";

/**
 * LnEmptyState — generic empty state for lists, panels, and sections.
 *
 * Styled with LN tokens (no gob-* classes).
 *
 * Vertical centred structure:
 *  [large muted icon]
 *  [title — font-semibold]
 *  [description — small muted, optional]
 *  [action — slot for a CTA, optional]
 *
 * Variants:
 *  - "plain" (default): no border; used for full-page or padded panel empty states.
 *  - "dashed": adds a dashed rounded border (ln-line-strong) for inline section
 *    empty states that need a visual boundary within a content area.
 *
 * Epistemic nature (C4, 2026-07-22 — plan-maestro-integridad §C4, kills the
 * rest of S4): Wave 2's state system guarantees a state EXISTS, not that it
 * tells the epistemic truth. An empty surveillance list reads as "todo
 * tranquilo" when the honest reading can be "MiMAR no recibió señales — el
 * silencio no implica ausencia de enfermedad" (red-team #10 zeros=green, #6
 * 690 bites + 0 observations read as "under control"). `nature` names the
 * two readings explicitly:
 *  - "measured-zero": MiMAR queried and the honest answer IS 0 (a real
 *    count). Renders the existing neutral/plain look — no visual change.
 *  - "no-signal": nothing was reported INTO the system — MiMAR is blind on
 *    this question, not calm. Renders a distinct muted-warn treatment
 *    (never the neutral/success look, never alarm-red either) so a silent
 *    surveillance surface can't be misread as "under control".
 * Omitting the prop keeps today's behavior (identical to "measured-zero") —
 * the ~90 existing callers are the ratchet; only new surveillance-safety
 * surfaces are required to declare it (see scripts/check-state-coverage.ts).
 *
 * Accessibility:
 *  - Static state; does not change dynamically. `nature="no-signal"` adds
 *    `role="status"` since it is information the operator should notice,
 *    not decorative chrome.
 *  - Icon is decorative (aria-hidden).
 */

export type LnEmptyStateProps = {
  icon?: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
  /** @default "plain" */
  variant?: "plain" | "dashed";
  /**
   * Epistemic nature of this empty state. Omit for today's behavior
   * (equivalent to "measured-zero"). See the block comment above.
   */
  nature?: "measured-zero" | "no-signal";
  className?: string;
};

export function LnEmptyState({
  icon,
  title,
  description,
  action,
  variant = "plain",
  nature,
  className = "",
}: LnEmptyStateProps) {
  const isNoSignal = nature === "no-signal";
  return (
    <div
      role={isNoSignal ? "status" : undefined}
      className={[
        "flex flex-col items-center justify-center text-center py-12 px-4 gap-3",
        variant === "dashed"
          ? "rounded-[var(--radius-sm)] border border-dashed border-[var(--color-ln-line-strong)]"
          : "",
        isNoSignal ? "rounded-[var(--radius-sm)] border border-ln-warn-100 bg-ln-warn-025" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {icon && (
        <Icon
          name={icon}
          size="3rem"
          className={isNoSignal ? "text-ln-warn" : "text-[var(--color-ln-faint)]"}
          decorative
        />
      )}
      <p
        className={[
          "text-lg font-semibold",
          isNoSignal ? "text-ln-warn" : "text-[var(--color-ln-ink)]",
        ].join(" ")}
      >
        {title}
      </p>
      {description && <p className="text-sm text-[var(--color-ln-mute)]">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
