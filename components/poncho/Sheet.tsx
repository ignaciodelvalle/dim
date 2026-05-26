"use client";

import type { ReactNode } from "react";
import { Drawer } from "vaul";
import { getDrawerWidth } from "./Sheet.helpers";

export type { SheetSize } from "./Sheet.helpers";

export type SheetSide = "bottom" | "right";

/**
 * Bottom-sheet / right-drawer wrapper around Vaul.
 *
 * Deep-link aware: the caller passes `open` computed from `searchParams.sheet === id`,
 * and `onClose` typically calls `router.push(buildCloseSheetUrl(...))`.
 *
 * On mobile (< md breakpoint) Vaul defaults to a bottom sheet.
 * On desktop (md+) the drawer slides from the right and is width-constrained.
 *
 * SSR-friendly: no `typeof window` checks — `open` is a controlled prop.
 *
 * Accessibility:
 *  - `title` renders as a visually styled heading + Drawer.Title (screen reader).
 *  - Close button has aria-label="Cerrar".
 */

export type SheetProps = {
  id: string;
  title: string;
  open: boolean;
  onClose: () => void;
  side?: SheetSide;
  size?: import("./Sheet.helpers").SheetSize;
  children: ReactNode;
};

export function Sheet({ id, title, open, onClose, size = "md", children }: SheetProps) {
  const widthClass = getDrawerWidth(size);

  return (
    <Drawer.Root
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      // On mobile Vaul defaults to bottom; on md+ we use right via CSS
      direction="right"
    >
      <Drawer.Portal>
        {/* Overlay */}
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40" />

        {/* Content */}
        <Drawer.Content
          aria-labelledby={`sheet-title-${id}`}
          className={[
            "fixed bottom-0 right-0 z-50 flex flex-col",
            "h-[85dvh] w-full",
            // Desktop: right-drawer constrained width, full height
            `md:top-0 md:h-full ${widthClass}`,
            "bg-gob-surface shadow-xl outline-none",
            "rounded-t-2xl md:rounded-none md:rounded-l-2xl",
          ].join(" ")}
        >
          {/* Drag handle — mobile only */}
          <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-gob-border md:hidden" />

          {/* Header */}
          <div className="flex items-center justify-between border-b border-gob-border px-5 py-4">
            <Drawer.Title
              id={`sheet-title-${id}`}
              className="text-base font-semibold text-gob-text"
            >
              {title}
            </Drawer.Title>
            <Drawer.Close
              aria-label="Cerrar"
              className="flex h-8 w-8 items-center justify-center rounded-full text-gob-text-gray transition-colors hover:bg-gob-surface-alt hover:text-gob-text"
            >
              {/* Simple × glyph — no Icon dep to keep the component self-contained */}
              <span aria-hidden="true" className="text-lg leading-none">
                ×
              </span>
            </Drawer.Close>
          </div>

          {/* Body — scrollable */}
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
