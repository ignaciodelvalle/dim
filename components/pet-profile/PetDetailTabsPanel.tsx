"use client";

// PetDetailTabsPanel — client component driving the two-face tab system
// (two-face redesign, 2026-07-01, design ADR-1/ADR-6).
//
// - Reads the active face from ?tab= (default: credencial).
// - Syncs hash fragments: legacy anchors (#libreta, #vacunas, #historial,
//   #resumen) still activate the right face on mount.
// - FlipCard (ADR-11) mounts BOTH faces always: the Libreta face's data is
//   fetched once via a server action on MOUNT (not gated behind first
//   activation) so the back face has real content to flip into from the
//   start; a loading skeleton scoped to the back face covers the gap.
// - Credencial content is pre-rendered server-side and passed as a node
//   (eager, zero client cost) — Face 1 stays the only SSR-eager content.
// - Print: libreta-print.css is imported here so it's only applied when this
//   component (and thus the Libreta face) is rendered.

import { useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import "@/app/(app)/mis-mascotas/[publicToken]/libreta/libreta-print.css";
import { type LibretaFaceData, getLibretaFaceData } from "@/app/actions/pet-tab-data";
import { FlipCard } from "@/components/pet-profile/FlipCard";
import { LibretaFace } from "@/components/pet-profile/LibretaFace";
import { resolvePetFace } from "@/lib/domain/pet-face-nav";
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
  /**
   * Whether the current viewer is the pet owner. Org-path viewers still see
   * the Libreta face — ADR-10 collapsed it to ONE consolidated timeline
   * (owner sees everything, org sees the oficial-only subset), no lens
   * toggle and no face hidden anymore.
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
  isOwner,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [activeFace, setActiveFace] = useState<TabKey>(initialFace);

  const [libretaData, setLibretaData] = useState<LibretaFaceData | null>(null);
  const [libretaError, setLibretaError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  // Sync face from searchParam changes (back/forward nav). Must reuse the
  // SAME legacy-mapping table the server used to resolve `initialFace`
  // (resolvePetFace) — a naive `tab === "libreta"` check here would silently
  // override the correctly SSR-resolved face for every OTHER legacy value
  // (`?tab=vacunas`, `?tab=historial`, the `/historial`+`/vacunas` redirect
  // stubs) back to "credencial" on mount, since this effect always runs once
  // after the initial render (bug found in batch-2 e2e verification).
  useEffect(() => {
    const tabParam = searchParams.get("tab") ?? undefined;
    const lenteParam = searchParams.get("lente") ?? undefined;
    const { face } = resolvePetFace({ tab: tabParam, lente: lenteParam, isOwner });
    setActiveFace(face);
  }, [searchParams, isOwner]);

  const fetchLibreta = useCallback(async () => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    const result = await getLibretaFaceData(petPublicToken);
    if (result.ok) {
      setLibretaData(result.data);
    } else {
      setLibretaError(result.error);
    }
  }, [petPublicToken]);

  // pet-document-redesign ADR-11: FlipCard mounts BOTH faces always, so the
  // back face needs real content (or at least a scoped skeleton) from the
  // very first render — the fetch fires unconditionally on mount instead of
  // being gated behind first Libreta activation. This trades one extra
  // round-trip on every page load for eliminating the height-jump the old
  // "fetch on first activation" gate caused on the first flip. The skeleton
  // this produces is scoped to the back face only (see `backContent` below)
  // — the eager, SSR'd front face is never affected.
  useEffect(() => {
    fetchLibreta();
  }, [fetchLibreta]);

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
        if (!params.get("lente")) params.set("lente", isOwner ? "todo" : "oficial");
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

  // Back face content — skeleton/error scoped here only (never the front,
  // which is the eager SSR credencialContent).
  function renderBackContent() {
    if (libretaError) return <TabErrorState message={libretaError} />;
    if (!libretaData) return <TabLoadingSkeleton />;
    return <LibretaFace data={libretaData} petPublicToken={petPublicToken} isOwner={isOwner} />;
  }

  // "Girar" affordance (ADR-11): mirrors PetDetailTabs.switchTab's exact URL
  // write so the flip button and the tab nav always drive the same ?tab=
  // state — PetDetailTabs.tsx itself stays untouched (task 1.6).
  function switchFace() {
    const target: TabKey = activeFace === "credencial" ? "libreta" : "credencial";
    const params = new URLSearchParams(searchParams.toString());
    if (target === "credencial") {
      params.delete("tab");
      params.delete("lente");
    } else {
      params.set("tab", "libreta");
      params.set("lente", isOwner ? "todo" : "oficial");
    }
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }

  return (
    <div>
      <div className="print:hidden">
        <PetDetailTabs petPublicToken={petPublicToken} activeTab={activeFace} isOwner={isOwner} />
      </div>
      <div id="tab-panel" role="tabpanel">
        <FlipCard
          front={credencialContent}
          back={renderBackContent()}
          activeFace={activeFace}
          onFlip={switchFace}
        />
      </div>
    </div>
  );
}
