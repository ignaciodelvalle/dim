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
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import "@/app/(app)/mis-mascotas/[publicToken]/libreta/libreta-print.css";
import { type LibretaFaceData, getLibretaFaceData } from "@/app/actions/pet-tab-data";
import { Icon } from "@/components/Icon";
import type { ChromeSituation } from "@/components/pet-profile/DocumentChrome";
import { FlipCard, PET_FACE_PANEL_ID, PET_FACE_TAB_ID } from "@/components/pet-profile/FlipCard";
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
    <div className="space-y-[14px] py-6 animate-pulse" aria-busy="true" aria-label="Cargando...">
      <div className="h-[18px] w-1/3 rounded-[var(--radius-sm)] bg-[var(--color-ln-stripe)]" />
      <div className="h-[14px] w-full rounded-[var(--radius-sm)] bg-[var(--color-ln-stripe)]" />
      <div className="h-[14px] w-5/6 rounded-[var(--radius-sm)] bg-[var(--color-ln-stripe)]" />
      <div className="h-[14px] w-4/5 rounded-[var(--radius-sm)] bg-[var(--color-ln-stripe)]" />
    </div>
  );
}

function TabErrorState({ message }: { message: string }) {
  return (
    <div
      className="py-8 text-center font-[var(--font-ln-mono)] text-sm uppercase tracking-[.06em]"
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
  /**
   * Pet situation for the document chrome band (pet-state-header) — server-
   * derived, pre-gendered label. Threaded to FlipCard so BOTH faces carry the
   * band tint + state chip. Null = default blue band.
   */
  situation?: ChromeSituation | null;
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
  situation,
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
      // `?lente=` is a dead param (ADR-10 removed the lens system;
      // resolvePetFace ignores it) — stop writing it. Any legacy `?lente=`
      // already in the URL is preserved untouched (harmless, still resolves).
      if (faceFromHash === "libreta") {
        params.set("tab", "libreta");
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
  }, [searchParams, initialFace]);

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

  // Face navigation (ADR-11) — writes the active face into ?tab=.
  //
  // Router-hot-path fix: writes the URL via pushTabUrl (native History API)
  // instead of router.replace — reproduced 3/3 in production with the same
  // silent-drop symptom as the sheets (see lib/ui/sheet-nav.ts). pushState
  // (not replaceState) is required here so the browser back button can undo
  // a flip and restore the previous face via popstate → useSearchParams()
  // reactivity above. `?lente=` is no longer written (dead param, ADR-10).
  //
  // `focusAfter` records where focus should land once the flip lands (the
  // active-face effect below performs the move once `activeFace` catches up):
  // "panel" for a deliberate flip (click / band turn button) so the reader is
  // taken to the newly-shown content; "tab" for arrow-key roving so focus stays
  // on the tablist. The move is only performed for user-initiated flips — never
  // on mount / deep-link / browser-back (which leave `focusAfter` null).
  const focusAfterRef = useRef<"panel" | "tab" | null>(null);

  function goToFace(target: TabKey, focusAfter: "panel" | "tab" = "panel") {
    if (target === activeFace) return;
    focusAfterRef.current = focusAfter;
    const params = new URLSearchParams(searchParams.toString());
    if (target === "credencial") {
      params.delete("tab");
      params.delete("lente");
    } else {
      params.set("tab", "libreta");
    }
    const qs = params.toString();
    pushTabUrl(qs ? `${pathname}?${qs}` : pathname);
  }

  // Move focus after a user-initiated flip settles (see focusAfterRef).
  useEffect(() => {
    const mode = focusAfterRef.current;
    if (!mode) return;
    focusAfterRef.current = null;
    const id = mode === "panel" ? PET_FACE_PANEL_ID[activeFace] : PET_FACE_TAB_ID[activeFace];
    document.getElementById(id)?.focus();
  }, [activeFace]);

  // Two flip triggers, kept in sync (both write ?tab= through goToFace): the
  // segmented Credencial/Libreta control below, and the band turn button that
  // DocumentChrome renders inside each face (FlipCard.onFlip → switchFace).
  function switchFace() {
    goToFace(activeFace === "credencial" ? "libreta" : "credencial");
  }

  // Roving tablist keyboard nav (WAI-ARIA tabs pattern): Arrow/Home/End move
  // focus between the two tabs and auto-activate; focus stays on the tabs.
  function onTablistKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    let target: TabKey | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "End") target = "libreta";
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "Home")
      target = "credencial";
    if (!target) return;
    e.preventDefault();
    if (target !== activeFace) goToFace(target, "tab");
    else document.getElementById(PET_FACE_TAB_ID[target])?.focus();
  }

  function faceTab(face: TabKey, label: string, eyebrow: string, icon: string) {
    const isActive = activeFace === face;
    return (
      <button
        type="button"
        id={PET_FACE_TAB_ID[face]}
        role="tab"
        aria-selected={isActive}
        aria-controls={PET_FACE_PANEL_ID[face]}
        tabIndex={isActive ? 0 : -1}
        className={`ln-facetab${isActive ? " is-active" : ""}`}
        onClick={() => goToFace(face, "panel")}
      >
        <span className="ln-facetab-ic">
          <Icon name={icon} size="sm" decorative />
        </span>
        <span className="ln-facetab-t">
          <b>{label}</b>
          <span>{eyebrow}</span>
        </span>
      </button>
    );
  }

  return (
    <div id="tab-panel" className="ln-doc-root">
      {/* Recto/verso — explicit two-sided control (the "Una sola libreta"
          redesign restored a visible segmented switcher alongside the band
          turn button; aria-selected + the tabpanel wiring stay synced across
          both triggers). */}
      <div className="ln-facetabs">
        <div
          className="ln-facetabs-inner"
          role="tablist"
          aria-label="Cara del documento"
          onKeyDown={onTablistKeyDown}
        >
          {faceTab("credencial", "Credencial", "Frente", "credential")}
          {faceTab("libreta", "Libreta", "Dorso", "libreta")}
        </div>
      </div>

      <FlipCard
        front={credencialContent}
        back={renderBackContent()}
        activeFace={activeFace}
        onFlip={switchFace}
        situation={situation}
      />
    </div>
  );
}
