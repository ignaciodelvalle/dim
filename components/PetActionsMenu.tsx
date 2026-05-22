// PetActionsMenu — Acciones section for the pet profile v2 page.
//
// Server component. Vertical list of action rows (icon + label + chevron).
// Conditional rendering rules inherited from the current page.tsx actions
// section (Ley 26.858 only for dog + owner, mark-lost only when active, etc.).

import Link from "next/link";
import { type PetActionsMenuInput, deriveActionItems } from "./PetActionsMenu.helpers";

export type { PetActionsMenuInput };

const VARIANT_CLASSES: Record<"primary" | "default" | "danger", string> = {
  primary:
    "bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600",
  default:
    "border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-300 dark:hover:bg-neutral-900",
  danger: "bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600",
};

export function PetActionsMenu(props: PetActionsMenuInput) {
  const items = deriveActionItems(props);

  if (items.length === 0) return null;

  return (
    <section
      aria-labelledby="pp-actions-h"
      className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950"
    >
      <h2
        id="pp-actions-h"
        className="mb-3 text-base font-semibold text-neutral-900 dark:text-neutral-50"
      >
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
