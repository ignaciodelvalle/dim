"use client";

// OverlayDisclosure — the v2C overlay-popover primitive: a native <details>
// whose panel floats absolutely over the map (spec: menus/popovers radio 8px,
// shadow, close on Esc / outside click; Esc returns focus to the trigger).
//
// WHY <details> and not conditional rendering: the panel content stays in the
// DOM while closed (native disclosure semantics — the same pattern the
// masthead's "Acerca de esta vista" and the old "Alcance y período" rail
// disclosure used), so the content is always reachable/testable and the
// browser owns the summary-toggle interaction. Esc + outside-click close are
// layered on top; `closeSignal` lets the owner close it when a selection
// commits (e.g. a preset pick).

import { type ReactNode, useEffect, useRef, useState } from "react";

type Props = {
  /** The always-visible trigger (pill) content. */
  summary: ReactNode;
  /** Classes for the summary pill (the trigger's whole visual). */
  summaryClassName: string;
  /** Extra classes for the floating panel (positioning side, width). */
  panelClassName?: string;
  /** Open direction: panel hangs below (down) or above (up) the trigger. */
  side?: "down" | "up";
  /**
   * Close the panel whenever this value CHANGES (not on mount) — e.g. the
   * active preset id, so picking an option dismisses the menu.
   */
  closeSignal?: unknown;
  /** Optional test id on the summary trigger. */
  summaryTestId?: string;
  children: ReactNode;
};

export function OverlayDisclosure({
  summary,
  summaryClassName,
  panelClassName = "",
  side = "down",
  closeSignal,
  summaryTestId,
  children,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDetailsElement | null>(null);
  const summaryRef = useRef<HTMLElement | null>(null);

  // Close when the owner's selection commits. Skip the mount pass.
  const firstSignalRef = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: closeSignal is the intentional sole trigger.
  useEffect(() => {
    if (firstSignalRef.current) {
      firstSignalRef.current = false;
      return;
    }
    setOpen(false);
  }, [closeSignal]);

  // Esc closes (returning focus to the trigger); a click/press outside closes.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        summaryRef.current?.focus();
      }
    }
    function onPointer(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node | null)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <details
      ref={rootRef}
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="relative"
    >
      <summary
        ref={summaryRef}
        data-testid={summaryTestId}
        className={`cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden ${summaryClassName}`}
      >
        {summary}
      </summary>
      <div
        className={`absolute z-30 rounded-[var(--radius-lg)] border border-ln-op-line bg-ln-op-card p-3 shadow-lg ${
          side === "down" ? "top-full mt-1.5" : "bottom-full mb-1.5"
        } ${panelClassName}`}
      >
        {children}
      </div>
    </details>
  );
}
