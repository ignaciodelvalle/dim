import type { ReactNode } from "react";

type Props = {
  /** Short bold label. */
  title: string;
  /** Body text or content. */
  body?: ReactNode;
  /**
   * Icon slot rendered inside the tinted box (left side).
   * Pass any React node — emoji, SVG, or text glyph.
   */
  icon?: ReactNode;
};

/**
 * Info callout with a left icon box.
 *
 * Visually derived from .gob-callout (redesign-a-gob.css L381-386).
 * Uses ln-op-card + ln-op-line for the card surface and ln-op-navy for the icon box.
 */
export function OpCallout({ title, body, icon }: Props) {
  return (
    <div
      className={[
        "mb-3 flex items-center gap-3.5 rounded-[var(--radius-md)]",
        "border border-ln-op-line bg-ln-op-card px-[18px] py-[15px]",
      ].join(" ")}
    >
      {icon && (
        <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-[var(--radius-md)] bg-ln-op-navy text-[15px] text-white">
          {icon}
        </div>
      )}

      <div className="flex-1">
        <b className="mb-0.5 block text-[13.5px] font-bold text-ln-op-ink">{title}</b>
        {body && <span className="text-sm leading-[1.5] text-ln-op-ink-2">{body}</span>}
      </div>
    </div>
  );
}
