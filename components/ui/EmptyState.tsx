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
 * Accessibility:
 *  - Static state; does not change dynamically.
 *  - Icon is decorative (aria-hidden).
 */

export type LnEmptyStateProps = {
  icon?: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
  /** @default "plain" */
  variant?: "plain" | "dashed";
  className?: string;
};

export function LnEmptyState({
  icon,
  title,
  description,
  action,
  variant = "plain",
  className = "",
}: LnEmptyStateProps) {
  return (
    <div
      className={[
        "flex flex-col items-center justify-center text-center py-12 px-4 gap-3",
        variant === "dashed"
          ? "rounded-[4px] border border-dashed border-[var(--color-ln-line-strong)]"
          : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {icon && <Icon name={icon} size="3rem" className="text-[var(--color-ln-faint)]" decorative />}
      <p className="text-lg font-semibold text-[var(--color-ln-ink)]">{title}</p>
      {description && <p className="text-sm text-[var(--color-ln-mute)]">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
