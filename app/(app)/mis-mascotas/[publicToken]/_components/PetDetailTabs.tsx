// Tab bar shared between the three surfaces of a pet:
//   /mis-mascotas/[publicToken]            → Resumen
//   /mis-mascotas/[publicToken]/libreta    → Libreta
//   /mis-mascotas/[publicToken]/historial  → Historial
//
// Server component — each page renders <PetDetailTabs activeTab="…">
// once near the top. The mockup proposes a single page with ?tab=…
// state; this conservative version preserves the existing routes (so SSR
// data fetching stays clean) while delivering the same persistent-tab
// UX. A future refactor can collapse to a single route + searchParams
// without changing this component's shape.

import Link from "next/link";

export type PetDetailTab = "resumen" | "libreta" | "historial";

interface Props {
  publicToken: string;
  activeTab: PetDetailTab;
}

const TABS: Array<{ key: PetDetailTab; label: string; href: (token: string) => string }> = [
  { key: "resumen", label: "Resumen", href: (t) => `/mis-mascotas/${t}` },
  { key: "libreta", label: "Libreta", href: (t) => `/mis-mascotas/${t}/libreta` },
  { key: "historial", label: "Historial", href: (t) => `/mis-mascotas/${t}/historial` },
];

export function PetDetailTabs({ publicToken, activeTab }: Props) {
  return (
    <nav
      aria-label="Vistas del perfil"
      className="flex items-center gap-1 border-b border-neutral-200 dark:border-neutral-800"
    >
      {TABS.map((tab) => {
        const isActive = tab.key === activeTab;
        const className = isActive
          ? "relative px-3 py-2 text-sm font-semibold text-neutral-900 dark:text-neutral-50 after:absolute after:left-0 after:right-0 after:-bottom-px after:h-0.5 after:bg-neutral-900 dark:after:bg-neutral-50"
          : "px-3 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100";
        return (
          <Link
            key={tab.key}
            href={tab.href(publicToken)}
            aria-current={isActive ? "page" : undefined}
            className={className}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
