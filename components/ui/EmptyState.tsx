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
 * Accessibility:
 *  - Static state; no aria-live (does not change dynamically).
 *  - Icon is decorative (aria-hidden).
 */

export type LnEmptyStateProps = {
  icon?: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

export function LnEmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: LnEmptyStateProps) {
  return (
    <div
      className={[
        "flex flex-col items-center justify-center text-center py-12 px-4 gap-3",
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
