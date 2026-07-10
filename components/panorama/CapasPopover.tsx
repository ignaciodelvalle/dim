"use client";

// CapasPopover — the ARCHETYPE situation-room "Capas" control. The preset strip
// is the primary control; layers are SECONDARY, so the full CapasBox (Simple /
// Detalle catalog, compatibility model, opacity sliders, "solo firmado") is
// tucked behind a compact "Capas" button and floats in a popover panel instead
// of always occupying vertical space above the map. Zero behavior change: the
// panel simply hosts the unchanged CapasBox — every toggle still delegates to
// the parent's onToggle → checkCompatibility.

import { useEffect, useId, useRef, useState } from "react";

import { CapasBox } from "@/components/panorama/CapasBox";
import type { LayerPanelState } from "@/components/panorama/LayerPanel";
import { type LayerRole, roleOf } from "@/src/modules/panorama/domain/compatibility";
import { PANORAMA_LAYERS } from "@/src/modules/panorama/domain/layers";
import type { LayerId } from "@/src/modules/panorama/domain/types";

type Props = {
  states: Record<LayerId, LayerPanelState>;
  onToggle: (id: LayerId) => void;
  scrubbing?: boolean;
  opacities?: Partial<Record<LayerId, number>>;
  onOpacity?: (id: LayerId, value: number) => void;
  verifiedOnly?: boolean;
  onToggleVerified?: (id: LayerId) => void;
  capasDetail: boolean;
  onCapasDetailChange: (value: boolean) => void;
};

/** Count of active OVERLAY layers (signal + reference) — the base is implicit. */
function activeOverlayCount(states: Props["states"]): number {
  const overlay = (r: LayerRole) => r === "signal" || r === "reference";
  return PANORAMA_LAYERS.filter((l) => overlay(roleOf(l)) && states[l.id]?.active).length;
}

export function CapasPopover(props: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();
  const overlays = activeOverlayCount(props.states);

  // Close on Escape or a click/focus outside the popover root.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onPointer(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node | null)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border px-3 py-1.5 text-sm font-medium transition-colors ${
          open
            ? "border-ln-op-azul bg-ln-op-azul/10 text-ln-op-azul"
            : "border-ln-op-line bg-ln-op-card text-ln-op-ink-2 hover:border-ln-op-azul/40"
        }`}
      >
        <span aria-hidden="true">▤</span>
        <span>Capas</span>
        {overlays > 0 && (
          <span className="inline-flex min-w-4 items-center justify-center rounded-full bg-ln-op-azul/20 px-1 text-[10px] font-semibold tabular-nums text-ln-op-azul">
            {overlays}
          </span>
        )}
      </button>
      {open && (
        <div
          id={panelId}
          className="absolute right-0 z-20 mt-1.5 w-[min(22rem,calc(100vw-2rem))] rounded-[var(--radius-lg)] border border-ln-op-line bg-ln-op-card p-3 shadow-lg"
        >
          <CapasBox {...props} />
        </div>
      )}
    </div>
  );
}
