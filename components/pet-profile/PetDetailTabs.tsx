"use client";

import { useRouter, useSearchParams } from "next/navigation";

export type TabKey = "resumen" | "libreta" | "vacunas" | "historial";

type Props = {
  petPublicToken: string;
  /** Pass the total event count to show a badge on the Historial tab. Omit to hide count. */
  historialCount?: number;
  /** The currently active tab. */
  activeTab: TabKey;
  /**
   * Whether the current viewer is the pet owner. When false (org-path),
   * Libreta and Historial tabs are not rendered — matching old route gating.
   */
  isOwner?: boolean;
};

export function PetDetailTabs({
  petPublicToken: _petPublicToken,
  historialCount,
  activeTab,
  isOwner = true,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function switchTab(tab: TabKey) {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "resumen") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: "resumen", label: "Resumen" },
    // Libreta and Historial are owner-only — org-path viewers see only Resumen + Vacunas.
    ...(isOwner ? [{ key: "libreta" as TabKey, label: "Libreta" }] : []),
    { key: "vacunas", label: "Vacunas" },
    ...(isOwner
      ? [
          {
            key: "historial" as TabKey,
            label: historialCount !== undefined ? `Historial ${historialCount}` : "Historial",
          },
        ]
      : []),
  ];

  return (
    <nav
      aria-label="Secciones del perfil"
      className="sticky top-0 z-10 bg-white  border-b border-gob-border"
      data-section="pet-detail-tabs"
    >
      <div className="flex gap-0">
        {tabs.map((tab) => {
          const isActive = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => switchTab(tab.key)}
              aria-current={isActive ? "page" : undefined}
              className={[
                "inline-flex items-center min-h-11 px-4 text-sm font-medium transition-colors border-b-2 -mb-px",
                isActive
                  ? "border-gob-primary text-gob-primary"
                  : "border-transparent text-gob-text-muted  hover:text-gob-text  hover:border-gob-border-strong ",
              ]
                .join(" ")
                .trim()}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
