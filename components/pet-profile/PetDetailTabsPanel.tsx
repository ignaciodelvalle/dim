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

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

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
}: {
  data: LibretaTabData;
  petPublicToken: string;
}) {
  return (
    <div className="space-y-6 pt-6">
      {data.accessPath === "org" && data.organizationDisplayName && (
        <div className="rounded border border-gob-info/30 bg-gob-info/10 px-3 py-2 text-sm text-gob-text">
          Estás viendo la libreta de {data.pet.name} como miembro de{" "}
          <strong>{data.organizationDisplayName}</strong>. Vista de solo lectura.
        </div>
      )}

      <LibretaIdentityHeader
        pet={data.pet}
        photoUrl={data.photoUrl}
        ownerFirstName={data.ownerFirstName}
      />

      {/* View toggle is removed in-page: defaults to grouped view */}
      <LibretaSanitariaView
        groupedEvents={data.groupedEvents}
        publicToken={petPublicToken}
        vista="agrupada"
      />

      {data.accessPath === "owner" && (
        <SharesManager petPublicToken={petPublicToken} shares={data.activeShares} />
      )}
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
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PetDetailTabsPanel({
  petPublicToken,
  historialCount,
  resumenContent,
  initialTab,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

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
  useEffect(() => {
    const tabParam = searchParams.get("tab") as TabKey | null;
    const resolved: TabKey =
      tabParam && ["resumen", "libreta", "vacunas", "historial"].includes(tabParam)
        ? tabParam
        : "resumen";
    setActiveTab(resolved);
  }, [searchParams]);

  // On mount: check for hash fragment and activate that tab.
  // Runs once — router and searchParams are stable across the mount lifecycle.
  const hashHandledRef = useRef(false);
  useEffect(() => {
    if (hashHandledRef.current) return;
    hashHandledRef.current = true;
    const hash = window.location.hash.slice(1);
    const tabFromHash = HASH_TO_TAB[hash];
    if (tabFromHash && tabFromHash !== "resumen") {
      // Update URL to use ?tab= and scroll the tab bar into view.
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", tabFromHash);
      router.replace(`?${params.toString()}`, { scroll: false });
      // Scroll the tab-bar section into view after a short tick.
      requestAnimationFrame(() => {
        document
          .querySelector("[data-section='pet-detail-tabs']")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [router, searchParams]);

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
        return <LibretaPanel data={libretaData} petPublicToken={petPublicToken} />;
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
      <PetDetailTabs
        petPublicToken={petPublicToken}
        historialCount={historialCount}
        activeTab={activeTab}
      />
      <div id="tab-panel" role="tabpanel">
        {renderPanel()}
      </div>
    </div>
  );
}
