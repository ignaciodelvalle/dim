// PetActionsMenu — Acciones section for the pet profile v2 page.
//
// Server component. Vertical list of action rows (icon + label + chevron).
// Conditional rendering rules inherited from the current page.tsx actions
// section (Ley 26.858 only for dog + owner, mark-lost only when active, etc.).

import Link from "next/link";
import { type PetActionsMenuInput, deriveActionItems } from "./PetActionsMenu.helpers";

export type { PetActionsMenuInput };

const VARIANT_CLASSES: Record<"primary" | "default" | "danger", string> = {
  primary: "bg-gob-success text-white hover:bg-gob-success  ",
  default: "border border-gob-border bg-white text-gob-text-gray hover:bg-gob-surface-alt    ",
  danger: "border border-gob-danger bg-white text-gob-danger hover:bg-gob-danger/10",
};

export function PetActionsMenu(props: PetActionsMenuInput) {
  const items = deriveActionItems(props);

  if (items.length === 0) return null;

  return (
    <section
      aria-labelledby="pp-actions-h"
      className="rounded-2xl border border-gob-border bg-white p-4  "
    >
      <h2 id="pp-actions-h" className="mb-3 text-base font-semibold text-gob-text ">
        Acciones
      </h2>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-medium transition-colors ${VARIANT_CLASSES[item.variant]}`}
            >
              <span>{item.label}</span>
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
