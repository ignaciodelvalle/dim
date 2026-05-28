"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = {
  petPublicToken: string;
  /** Pass the total event count to show a badge on the Historial tab. Omit to hide count. */
  historialCount?: number;
};

export function PetDetailTabs({ petPublicToken, historialCount }: Props) {
  const pathname = usePathname();
  const base = `/mis-mascotas/${petPublicToken}`;

  const tabs = [
    {
      href: base,
      label: "Resumen",
      isActive: pathname === base,
    },
    {
      href: `${base}/libreta`,
      label: "Libreta",
      isActive: pathname.startsWith(`${base}/libreta`),
    },
    {
      // D9 — Vacunas as a 4th tab + the existing /vacunas sub-page kept
      // as a deep-link target. Double-entry by design (handoff P4-8).
      href: `${base}/vacunas`,
      label: "Vacunas",
      isActive: pathname.startsWith(`${base}/vacunas`),
    },
    {
      href: `${base}/historial`,
      label: historialCount !== undefined ? `Historial ${historialCount}` : "Historial",
      isActive: pathname.startsWith(`${base}/historial`),
    },
  ];

  return (
    <nav
      aria-label="Secciones del perfil"
      className="sticky top-0 z-10 bg-white dark:bg-neutral-950 border-b border-gob-border"
      data-section="pet-detail-tabs"
    >
      <div className="flex gap-0">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={tab.isActive ? "page" : undefined}
            className={[
              "inline-flex items-center min-h-11 px-4 text-sm font-medium transition-colors border-b-2 -mb-px",
              tab.isActive
                ? "border-gob-primary text-gob-primary"
                : "border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-50 hover:border-neutral-300 dark:hover:border-neutral-700",
            ]
              .join(" ")
              .trim()}
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
