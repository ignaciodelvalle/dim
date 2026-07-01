"use client";

import { useRouter, useSearchParams } from "next/navigation";

// Two-face redesign (2026-07-01, design ADR-6): the tab shell collapsed from
// 4 tabs (resumen/libreta/vacunas/historial) to 2 faces. `resolvePetFace`
// (lib/domain/pet-face-nav.ts) maps every legacy ?tab= value onto one of
// these two + a lens; the URL keeps writing "resumen"→"credencial" and
// vacunas/historial/libreta collapse into "libreta" + an explicit `lente`.
export type TabKey = "credencial" | "libreta";

type Props = {
  petPublicToken: string;
  /** The currently active face. */
  activeTab: TabKey;
  /**
   * Whether the current viewer is the pet owner. Org-path viewers still see
   * both faces — Libreta is lens-clamped (vacunas/oficial only), not hidden
   * (design ADR-6 widens the old owner-only Libreta gate).
   */
  isOwner?: boolean;
};

export function PetDetailTabs({
  petPublicToken: _petPublicToken,
  activeTab,
  isOwner = true,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function switchTab(tab: TabKey) {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "credencial") {
      params.delete("tab");
      params.delete("lente");
    } else {
      // In-app nav always writes an explicit `lente` (design ADR-5) — this
      // avoids the legacy `?tab=libreta` (no lente) collision, which resolves
      // to the "oficial" grouped view instead of the default "todo" lens.
      params.set("tab", "libreta");
      params.set("lente", isOwner ? "todo" : "vacunas");
    }
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: "credencial", label: "Credencial" },
    { key: "libreta", label: "Libreta" },
  ];

  return (
    <nav
      aria-label="Secciones del perfil"
      className="sticky top-0 z-10 border-b border-[var(--color-ln-line)] bg-[var(--color-ln-card)]"
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
                "inline-flex min-h-[44px] -mb-px cursor-pointer items-center gap-[7px] border-b-2 px-[18px] py-[10px] font-[var(--font-ln-sans)] text-[13px] font-semibold transition-colors",
                "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--color-ln-celeste-050)]",
                isActive
                  ? "border-b-[var(--color-ln-azul)] text-[var(--color-ln-azul)]"
                  : "border-b-transparent text-[var(--color-ln-mute)] hover:text-[var(--color-ln-ink-2)]",
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
