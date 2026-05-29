"use client";

// PetDetailTabsPanel — client component that drives the in-page tab system.
//
// - Reads the active tab from ?tab= searchParam (default: resumen).
// - Syncs hash fragments: if the URL has #libreta, #vacunas, or #historial
//   on mount, the corresponding tab is activated and the page scrolls into
//   view (deep-link via anchor).
// - Deferred loading: libreta and vacunas panels are fetched via server
//   actions on first activation and memoised (fetched once per mount).
//   Historial is always deferred (heaviest query: O(N) events + signing).
// - Resumen panel receives its pre-rendered content as a React node from
//   the server page (eager, zero client cost).
// - Print: libreta-print.css is imported here so it's only applied when
//   this component (and thus the Libreta tab) is rendered. The tab nav
//   carries print:hidden so it's absent from printed output.

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import "@/app/(app)/mis-mascotas/[publicToken]/libreta/libreta-print.css";
import { EventTimeline } from "@/app/(app)/mis-mascotas/[publicToken]/EventTimeline";
import { LibretaIdentityHeader } from "@/app/(app)/mis-mascotas/[publicToken]/libreta/LibretaIdentityHeader";
import { LibretaSanitariaView } from "@/app/(app)/mis-mascotas/[publicToken]/libreta/LibretaSanitariaView";
import { SharesManager } from "@/app/(app)/mis-mascotas/[publicToken]/libreta/SharesManager";
import { VacunasTimeline } from "@/app/(app)/mis-mascotas/[publicToken]/vacunas/VacunasTimeline";
import {
  type HistorialTabData,
  type LibretaTabData,
  type VacunasTabData,
  getHistorialTabData,
  getLibretaTabData,
  getVacunasTabData,
} from "@/app/actions/pet-tab-data";
import { useRouter, useSearchParams } from "next/navigation";
import { PetDetailTabs, type TabKey } from "./PetDetailTabs";

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function TabLoadingSkeleton() {
  return (
    <div className="space-y-4 py-6 animate-pulse" aria-busy="true" aria-label="Cargando...">
      <div className="h-5 w-1/3 rounded bg-gob-surface-alt" />
      <div className="h-4 w-full rounded bg-gob-surface-alt" />
      <div className="h-4 w-5/6 rounded bg-gob-surface-alt" />
      <div className="h-4 w-4/5 rounded bg-gob-surface-alt" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

function TabErrorState({ message }: { message: string }) {
  return (
    <div className="py-8 text-center text-sm text-gob-danger" role="alert">
      {message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Libreta panel (rendered from fetched data)
// ---------------------------------------------------------------------------

function LibretaPanel({
  data,
  petPublicToken,
  vista,
  onVistaChange,
}: {
  data: LibretaTabData;
  petPublicToken: string;
  vista: "agrupada" | "cronologica";
  onVistaChange: (v: "agrupada" | "cronologica") => void;
}) {
  return (
    <div className="space-y-6 pt-6">
      {/* View toggle — Por sección / Cronológica */}
      <div className="flex items-center justify-end gap-1 text-xs print:hidden">
        <button
          type="button"
          onClick={() => onVistaChange("agrupada")}
          className={[
            "px-2.5 py-1 rounded-md transition-colors",
            vista === "agrupada"
              ? "bg-gob-primary text-white"
              : "text-gob-text-gray hover:bg-gob-surface-alt",
          ].join(" ")}
        >
          Por sección
        </button>
        <button
          type="button"
          onClick={() => onVistaChange("cronologica")}
          className={[
            "px-2.5 py-1 rounded-md transition-colors",
            vista === "cronologica"
              ? "bg-gob-primary text-white"
              : "text-gob-text-gray hover:bg-gob-surface-alt",
          ].join(" ")}
        >
          Cronológica
        </button>
      </div>

      <LibretaIdentityHeader
        pet={data.pet}
        photoUrl={data.photoUrl}
        ownerFirstName={data.ownerFirstName}
      />

      <LibretaSanitariaView
        groupedEvents={data.groupedEvents}
        publicToken={petPublicToken}
        vista={vista}
      />

      {data.accessPath === "owner" && (
        <SharesManager petPublicToken={petPublicToken} shares={data.activeShares} />
      )}

      {/* Print footer — hidden on screen, shown when printing the Libreta tab */}
      <footer className="hidden print:block text-xs text-gob-text-muted pt-8 border-t border-gob-border">
        Generada por MiMAR · {new Date().toLocaleString("es-AR")}
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vacunas panel
// ---------------------------------------------------------------------------

function VacunasPanel({ data }: { data: VacunasTabData }) {
  return (
    <div className="pt-6 space-y-4">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight text-gob-text ">
          Libreta de vacunas — {data.petName}
        </h2>
        <p className="text-sm text-gob-text-gray  mt-1">
          Historial completo de vacunaciones y próximos vencimientos.
        </p>
      </header>

      {data.accessPath === "org" && data.organizationDisplayName && (
        <div className="rounded border border-gob-info bg-gob-info/10 px-3 py-2 text-sm text-gob-azul-link   ">
          Estás viendo la libreta de {data.petName} como miembro de{" "}
          <strong>{data.organizationDisplayName}</strong>. Vista de solo lectura.
        </div>
      )}

      <VacunasTimeline
        petName={data.petName}
        petToken={data.petToken}
        upcomingReminders={data.upcomingReminders}
        history={data.history}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Historial panel
// ---------------------------------------------------------------------------

function HistorialPanel({ data }: { data: HistorialTabData }) {
  return (
    <div className="space-y-4 pt-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-gob-text ">{data.petName}</h2>
        <p className="text-sm text-gob-text-muted ">Historial completo de {data.petName}</p>
      </div>
      <EventTimeline events={data.events} publicToken={data.petToken} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hash → tab mapping (for deep-link via anchor)
// ---------------------------------------------------------------------------

const HASH_TO_TAB: Record<string, TabKey> = {
  libreta: "libreta",
  vacunas: "vacunas",
  historial: "historial",
  resumen: "resumen",
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  petPublicToken: string;
  historialCount: number;
  /** Resumen panel content — rendered server-side and passed as a node. */
  resumenContent: ReactNode;
  /** Active tab resolved from searchParams on the server. */
  initialTab: TabKey;
  /**
   * Whether the current viewer is the pet owner. When false (org-path),
   * Libreta and Historial tabs are hidden and deep-links to them fall back
   * to Resumen — matching old route gating (requireOwnedPetByToken).
   */
  isOwner: boolean;
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PetDetailTabsPanel({
  petPublicToken,
  historialCount,
  resumenContent,
  initialTab,
  isOwner,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Clamp the initial tab: org-path users cannot access libreta/historial.
  const clampTab = useCallback(
    (tab: TabKey): TabKey => {
      if (!isOwner && (tab === "libreta" || tab === "historial")) return "resumen";
      return tab;
    },
    [isOwner],
  );

  const [activeTab, setActiveTab] = useState<TabKey>(() => clampTab(initialTab));

  // Vista toggle for the Libreta panel: synced to ?vista= searchParam.
  const vistaParam = searchParams.get("vista");
  const [vista, setVista] = useState<"agrupada" | "cronologica">(
    vistaParam === "cronologica" ? "cronologica" : "agrupada",
  );

  // Deferred data stores — null = not yet fetched, "loading" = in-flight.
  const [libretaData, setLibretaData] = useState<LibretaTabData | null>(null);
  const [libretaError, setLibretaError] = useState<string | null>(null);
  const [vacunasData, setVacunasData] = useState<VacunasTabData | null>(null);
  const [vacunasError, setVacunasError] = useState<string | null>(null);
  const [historialData, setHistorialData] = useState<HistorialTabData | null>(null);
  const [historialError, setHistorialError] = useState<string | null>(null);

  const [loadingTab, setLoadingTab] = useState<TabKey | null>(null);

  // Refs to prevent duplicate fetches.
  const fetchedRef = useRef<Set<TabKey>>(new Set());

  // Sync tab from searchParam changes (back/forward nav).
  // Also sync ?vista= for the libreta toggle.
  useEffect(() => {
    const tabParam = searchParams.get("tab") as TabKey | null;
    const resolved: TabKey =
      tabParam && ["resumen", "libreta", "vacunas", "historial"].includes(tabParam)
        ? tabParam
        : "resumen";
    setActiveTab(clampTab(resolved));
    const vp = searchParams.get("vista");
    setVista(vp === "cronologica" ? "cronologica" : "agrupada");
  }, [searchParams, clampTab]);

  // Handle ?vista= toggle from the LibretaPanel buttons.
  // Updates URL searchParam and local state.
  const handleVistaChange = useCallback(
    (v: "agrupada" | "cronologica") => {
      setVista(v);
      const params = new URLSearchParams(searchParams.toString());
      if (v === "agrupada") {
        params.delete("vista");
      } else {
        params.set("vista", v);
      }
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  // On mount: check for hash fragment and activate that tab.
  // Runs once — router and searchParams are stable across the mount lifecycle.
  const hashHandledRef = useRef(false);
  useEffect(() => {
    if (hashHandledRef.current) return;
    hashHandledRef.current = true;
    const hash = window.location.hash.slice(1);
    const tabFromHash = HASH_TO_TAB[hash];
    if (tabFromHash && tabFromHash !== "resumen") {
      const clamped = clampTab(tabFromHash);
      if (clamped === tabFromHash) {
        // Update URL to use ?tab= and scroll the tab bar into view.
        const params = new URLSearchParams(searchParams.toString());
        params.set("tab", clamped);
        router.replace(`?${params.toString()}`, { scroll: false });
        // Scroll the tab-bar section into view after a short tick.
        requestAnimationFrame(() => {
          document
            .querySelector("[data-section='pet-detail-tabs']")
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
    }
  }, [router, searchParams, clampTab]);

  // Fetch deferred data on tab activation.
  const fetchTabData = useCallback(
    async (tab: TabKey) => {
      if (fetchedRef.current.has(tab)) return;
      fetchedRef.current.add(tab);
      setLoadingTab(tab);

      if (tab === "libreta") {
        const result = await getLibretaTabData(petPublicToken);
        setLoadingTab(null);
        if (result.ok) {
          setLibretaData(result.data);
        } else {
          setLibretaError(result.error);
        }
      } else if (tab === "vacunas") {
        const result = await getVacunasTabData(petPublicToken);
        setLoadingTab(null);
        if (result.ok) {
          setVacunasData(result.data);
        } else {
          setVacunasError(result.error);
        }
      } else if (tab === "historial") {
        const result = await getHistorialTabData(petPublicToken);
        setLoadingTab(null);
        if (result.ok) {
          setHistorialData(result.data);
        } else {
          setHistorialError(result.error);
        }
      }
    },
    [petPublicToken],
  );

  // Trigger fetch when active tab changes (skip resumen — it's eager).
  useEffect(() => {
    if (activeTab !== "resumen") {
      fetchTabData(activeTab);
    }
  }, [activeTab, fetchTabData]);

  // Also fetch the initial tab on first mount if it's non-default.
  // initialTab is a stable server-resolved value; fetchTabData is memoized.
  useEffect(() => {
    if (initialTab !== "resumen") {
      fetchTabData(initialTab);
    }
  }, [initialTab, fetchTabData]);

  function renderPanel() {
    switch (activeTab) {
      case "resumen":
        return resumenContent;

      case "libreta": {
        if (loadingTab === "libreta") return <TabLoadingSkeleton />;
        if (libretaError) return <TabErrorState message={libretaError} />;
        if (!libretaData) return <TabLoadingSkeleton />;
        return (
          <LibretaPanel
            data={libretaData}
            petPublicToken={petPublicToken}
            vista={vista}
            onVistaChange={handleVistaChange}
          />
        );
      }

      case "vacunas": {
        if (loadingTab === "vacunas") return <TabLoadingSkeleton />;
        if (vacunasError) return <TabErrorState message={vacunasError} />;
        if (!vacunasData) return <TabLoadingSkeleton />;
        return <VacunasPanel data={vacunasData} />;
      }

      case "historial": {
        if (loadingTab === "historial") return <TabLoadingSkeleton />;
        if (historialError) return <TabErrorState message={historialError} />;
        if (!historialData) return <TabLoadingSkeleton />;
        return <HistorialPanel data={historialData} />;
      }

      default:
        return resumenContent;
    }
  }

  return (
    <div>
      <div className="print:hidden">
        <PetDetailTabs
          petPublicToken={petPublicToken}
          historialCount={historialCount}
          activeTab={activeTab}
          isOwner={isOwner}
        />
      </div>
      <div id="tab-panel" role="tabpanel">
        {renderPanel()}
      </div>
    </div>
  );
}
