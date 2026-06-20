// PetActionsMenu — Acciones section for the pet profile v2 page.
//
// Server component. Vertical list of action rows (icon + label + chevron).
// Conditional rendering rules inherited from the current page.tsx actions
// section (Ley 26.858 only for dog + owner, mark-lost only when active, etc.).

import Link from "next/link";
import { type PetActionsMenuInput, deriveActionItems } from "./PetActionsMenu.helpers";

export type { PetActionsMenuInput };

const VARIANT_CLASSES: Record<"primary" | "default" | "danger", string> = {
  primary: "bg-ln-ok text-white hover:bg-ln-ok/90  ",
  default: "border border-ln-line bg-ln-card text-ln-ink-2 hover:bg-ln-stripe    ",
  danger: "border border-ln-err bg-ln-card text-ln-err hover:bg-[var(--color-ln-err-050)]",
};

export function PetActionsMenu(props: PetActionsMenuInput) {
  const items = deriveActionItems(props);

  if (items.length === 0) return null;

  return (
    <section
      aria-labelledby="pp-actions-h"
      className="rounded-2xl border border-ln-line bg-ln-card p-4  "
    >
      <h2 id="pp-actions-h" className="mb-3 text-base font-semibold text-ln-ink ">
        Acciones
      </h2>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-medium transition-colors ${VARIANT_CLASSES[item.variant]}`}
            >
              <span className="flex items-center gap-2">
                {item.variant === "danger" && (
                  <span aria-hidden="true" className="text-[13px] leading-none">
                    ⚠
                  </span>
                )}
                {item.label}
              </span>
              <span aria-hidden className="shrink-0 text-xs opacity-60">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
