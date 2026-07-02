"use client";

// PetDetailTabsPanel — client component driving the two-face flip system
// (two-face redesign, 2026-07-01, design ADR-1/ADR-6; wave-3 P2, PO decision
// #645, removed the Credencial|Libreta tab title bar — the "Girar" button
// rendered by FlipCard is now the ONLY face switcher).
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

import { usePathname, useSearchParams } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import "@/app/(app)/mis-mascotas/[publicToken]/libreta/libreta-print.css";
import { type LibretaFaceData, getLibretaFaceData } from "@/app/actions/pet-tab-data";
import { FlipCard } from "@/components/pet-profile/FlipCard";
import {
  LibretaFace,
  type LibretaFaceEmergencyContacts,
} from "@/components/pet-profile/LibretaFace";
import { type PetFace, resolvePetFace } from "@/lib/domain/pet-face-nav";
import { pushTabUrl, replaceTabUrl } from "@/lib/ui/sheet-nav";

/** Which face is active. Same shape as `PetFace` — kept as a local alias so
 * every prior call site (props, HASH_TO_TAB, state) can keep the name it
 * already used before the tab bar (PetDetailTabs.tsx) was removed. */
export type TabKey = PetFace;

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
  /**
   * Owner-only vet/emergency contact rows, forwarded to LibretaFace's
   * Emergencia block (wave-3 P3, PO decision #645 point 3). `null`/
   * `undefined` renders no Emergencia block. Passed synchronously (same
   * viewer-profile query page.tsx already ran for the credential face) — it
   * does not go through the deferred `getLibretaFaceData` fetch.
   */
  emergencyContacts?: LibretaFaceEmergencyContacts | null;
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PetDetailTabsPanel({
  petPublicToken,
  credencialContent,
  initialFace,
  isOwner,
  emergencyContacts,
}: Props) {
  const pathname = usePathname();
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
  //
  // Router-hot-path fix: this is a SILENT one-time normalization (the user
  // didn't take a new action — we're just migrating a stale/legacy URL on
  // load), so it uses replaceTabUrl (native History API replaceState), not
  // router.replace and not pushTabUrl. router.replace reproduced the same
  // silent-drop symptom as every other router.push/replace call this module
  // exists to route around (see lib/ui/sheet-nav.ts); pushTabUrl would be
  // wrong here too even if it worked, since it pushes a history entry — the
  // back button shouldn't have to skip through a migration the user never
  // asked for.
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
      replaceTabUrl(`?${params.toString()}`);
      requestAnimationFrame(() => {
        document.querySelector("[data-section='flip-card']")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    }
  }, [searchParams, initialFace, isOwner]);

  // Back face content — skeleton/error scoped here only (never the front,
  // which is the eager SSR credencialContent).
  function renderBackContent() {
    if (libretaError) return <TabErrorState message={libretaError} />;
    if (!libretaData) return <TabLoadingSkeleton />;
    return (
      <LibretaFace
        data={libretaData}
        petPublicToken={petPublicToken}
        isOwner={isOwner}
        emergencyContacts={emergencyContacts}
      />
    );
  }

  // "Girar" affordance (ADR-11) — the only face switcher since wave-3 P2.
  //
  // Router-hot-path fix: writes the URL via pushTabUrl (native History API)
  // instead of router.replace — reproduced 3/3 in production with the same
  // silent-drop symptom as the sheets (see lib/ui/sheet-nav.ts). pushState
  // (not replaceState) is required here so the browser back button can undo
  // a flip and restore the previous face via popstate → useSearchParams()
  // reactivity below.
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
    pushTabUrl(qs ? `${pathname}?${qs}` : pathname);
  }

  // Wave-3 P2 (PO decision #645): the Credencial|Libreta tab title bar is
  // gone — FlipCard's "Girar" button is the only switcher, so this wrapper
  // no longer hosts a tablist and doesn't claim `role="tabpanel"`.
  return (
    <div id="tab-panel">
      <FlipCard
        front={credencialContent}
        back={renderBackContent()}
        activeFace={activeFace}
        onFlip={switchFace}
      />
    </div>
  );
}
