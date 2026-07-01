"use client";

// PetDetailTabsPanel — client component driving the two-face tab system
// (two-face redesign, 2026-07-01, design ADR-1/ADR-6).
//
// - Reads the active face from ?tab= (default: credencial).
// - Syncs hash fragments: legacy anchors (#libreta, #vacunas, #historial,
//   #resumen) still activate the right face on mount.
// - Deferred loading: the Libreta face's data is fetched once via a server
//   action on first activation and memoised.
// - Credencial content is pre-rendered server-side and passed as a node
//   (eager, zero client cost) — Face 1 stays the only SSR-eager content.
// - Print: libreta-print.css is imported here so it's only applied when this
//   component (and thus the Libreta face) is rendered.

import { useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import "@/app/(app)/mis-mascotas/[publicToken]/libreta/libreta-print.css";
import { type LibretaFaceData, getLibretaFaceData } from "@/app/actions/pet-tab-data";
import { LibretaFace } from "@/components/pet-profile/LibretaFace";
import type { PetLens } from "@/lib/domain/pet-face-nav";
import { PetDetailTabs, type TabKey } from "./PetDetailTabs";

// ---------------------------------------------------------------------------
// Loading skeleton / error state
// ---------------------------------------------------------------------------

function TabLoadingSkeleton() {
  return (
    <div
      className="space-y-[14px] py-[24px] animate-pulse"
      aria-busy="true"
      aria-label="Cargando..."
    >
      <div className="h-[18px] w-1/3 rounded-[4px] bg-[var(--color-ln-stripe)]" />
      <div className="h-[14px] w-full rounded-[4px] bg-[var(--color-ln-stripe)]" />
      <div className="h-[14px] w-5/6 rounded-[4px] bg-[var(--color-ln-stripe)]" />
      <div className="h-[14px] w-4/5 rounded-[4px] bg-[var(--color-ln-stripe)]" />
    </div>
  );
}

function TabErrorState({ message }: { message: string }) {
  return (
    <div
      className="py-[32px] text-center font-[var(--font-ln-mono)] text-sm uppercase tracking-[.06em]"
      style={{ color: "var(--color-ln-err)" }}
      role="alert"
    >
      {message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hash → face mapping (legacy anchor deep-links)
// ---------------------------------------------------------------------------

const HASH_TO_TAB: Record<string, TabKey> = {
  libreta: "libreta",
  vacunas: "libreta",
  historial: "libreta",
  resumen: "credencial",
  credencial: "credencial",
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  petPublicToken: string;
  /** Face 1 content — rendered server-side and passed as a node. */
  credencialContent: ReactNode;
  /** Active face resolved from searchParams on the server (resolvePetFace). */
  initialFace: TabKey;
  /** Lens resolved from searchParams on the server (resolvePetFace). */
  initialLens: PetLens;
  /**
   * Whether the current viewer is the pet owner. Org-path viewers still see
   * the Libreta face, lens-clamped to vacunas/oficial (design ADR-6) — no
   * face is hidden anymore, unlike the old owner-only Libreta/Historial gate.
   */
  isOwner: boolean;
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PetDetailTabsPanel({
  petPublicToken,
  credencialContent,
  initialFace,
  initialLens,
  isOwner,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [activeFace, setActiveFace] = useState<TabKey>(initialFace);

  const [libretaData, setLibretaData] = useState<LibretaFaceData | null>(null);
  const [libretaError, setLibretaError] = useState<string | null>(null);
  const [loadingLibreta, setLoadingLibreta] = useState(false);
  const fetchedRef = useRef(false);

  // Sync face from searchParam changes (back/forward nav).
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    setActiveFace(tabParam === "libreta" ? "libreta" : "credencial");
  }, [searchParams]);

  const fetchLibreta = useCallback(async () => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setLoadingLibreta(true);
    const result = await getLibretaFaceData(petPublicToken);
    setLoadingLibreta(false);
    if (result.ok) {
      setLibretaData(result.data);
    } else {
      setLibretaError(result.error);
    }
  }, [petPublicToken]);

  // Trigger fetch when the Libreta face activates (skip credencial — eager).
  useEffect(() => {
    if (activeFace === "libreta") fetchLibreta();
  }, [activeFace, fetchLibreta]);

  // Also fetch on first mount if Libreta is already the initial face.
  useEffect(() => {
    if (initialFace === "libreta") fetchLibreta();
  }, [initialFace, fetchLibreta]);

  // On mount: check for a legacy hash fragment and activate that face.
  const hashHandledRef = useRef(false);
  useEffect(() => {
    if (hashHandledRef.current) return;
    hashHandledRef.current = true;
    const hash = window.location.hash.slice(1);
    const faceFromHash = HASH_TO_TAB[hash];
    if (faceFromHash && faceFromHash !== initialFace) {
      const params = new URLSearchParams(searchParams.toString());
      if (faceFromHash === "libreta") {
        params.set("tab", "libreta");
        if (!params.get("lente")) params.set("lente", isOwner ? "todo" : "vacunas");
      } else {
        params.delete("tab");
        params.delete("lente");
      }
      router.replace(`?${params.toString()}`, { scroll: false });
      requestAnimationFrame(() => {
        document
          .querySelector("[data-section='pet-detail-tabs']")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [router, searchParams, initialFace, isOwner]);

  function renderPanel() {
    if (activeFace === "credencial") return credencialContent;

    if (loadingLibreta) return <TabLoadingSkeleton />;
    if (libretaError) return <TabErrorState message={libretaError} />;
    if (!libretaData) return <TabLoadingSkeleton />;
    return (
      <LibretaFace
        data={libretaData}
        petPublicToken={petPublicToken}
        initialLens={initialLens}
        isOwner={isOwner}
      />
    );
  }

  return (
    <div>
      <div className="print:hidden">
        <PetDetailTabs petPublicToken={petPublicToken} activeTab={activeFace} isOwner={isOwner} />
      </div>
      <div id="tab-panel" role="tabpanel">
        {renderPanel()}
      </div>
    </div>
  );
}
