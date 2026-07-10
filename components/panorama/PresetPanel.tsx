"use client";

// PresetPanel — renders the F3 curated preset buttons.
//
// The presets are MUTUALLY EXCLUSIVE (exactly one active at a time), so the
// list is a `role="radiogroup"` of `role="radio"` buttons — not a set of
// independently-toggleable `aria-pressed` buttons (PO copy review: a screen
// reader announcing "toggle button, pressed" on each of 6 buttons never
// conveys the single-choice semantics; "radio button 2 of 6, selected" does).
// Roving tabindex per the WAI-ARIA radiogroup pattern: only the active (or
// first, when none is active) radio is tab-stoppable; arrow keys move focus
// AND selection between siblings.
//
// Each preset shows ONLY its label (PO screenshot fix, 2026-07-08, engram
// obs 1047 — the description/question line was dropped from the card; the
// field stays on PanoramaPreset for other consumers, e.g. PanoramaConsole's
// metricIds). Clicking/selecting a radio calls onPreset(id) and the parent
// (PanoramaConsole) activates the corresponding compatibility-valid layer set.

import { useRef } from "react";

import type { PanoramaPreset, PresetId } from "@/src/modules/panorama/domain/presets";

type Props = {
  presets: readonly PanoramaPreset[];
  /** The currently active preset id, or null/undefined when none is active
   * (e.g. the operator switched to manual "modo avanzado"). */
  activePresetId?: PresetId | null;
  /** Called when the operator clicks a preset button. */
  onPreset: (id: PresetId) => void;
  /**
   * panorama-redesign Fase 1: layout mode. "stack" (default) keeps the
   * original vertical list (side-column usage); "row" lays the presets out
   * horizontally on lg screens for the promoted full-width placement above
   * the map. Purely presentational — behavior is identical.
   */
  layout?: "stack" | "row";
};

export function PresetPanel({ presets, activePresetId, onPreset, layout = "stack" }: Props) {
  // Mobile fix (panorama v+1): in "row" layout the 6 full-height cards used to
  // stack vertically on phones (space-y), pushing the map far below the fold.
  // Below lg they now render as a single horizontally-scrollable strip of
  // COMPACT chips (one row of height), so the map stays visible without
  // scrolling; at lg the original full-width equal-width card row is unchanged.
  const listClass =
    layout === "row" ? "flex gap-2 overflow-x-auto pb-1 lg:overflow-visible lg:pb-0" : "space-y-1";
  const itemClass =
    layout === "row" ? "min-w-[8.5rem] shrink-0 lg:min-w-0 lg:flex-1 lg:shrink" : undefined;
  // Compact height on phones (touch-friendly ~44px), full card from lg up.
  const cardSize =
    layout === "row" ? "min-h-[2.75rem] px-3 py-2 lg:min-h-24 lg:py-4" : "min-h-24 px-3 py-4";

  // Roving tabindex (WAI-ARIA radiogroup pattern): the active preset is the
  // tab stop; when none is active (manual "modo avanzado"), the first one is.
  const activeIndex = presets.findIndex((p) => p.id === activePresetId);
  const rovingIndex = activeIndex >= 0 ? activeIndex : 0;
  const btnRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function selectAt(index: number) {
    const target = presets[index];
    if (!target) return;
    btnRefs.current[index]?.focus();
    onPreset(target.id);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        selectAt((index + 1) % presets.length);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        selectAt((index - 1 + presets.length) % presets.length);
        break;
      case "Home":
        e.preventDefault();
        selectAt(0);
        break;
      case "End":
        e.preventDefault();
        selectAt(presets.length - 1);
        break;
      default:
        break;
    }
  }

  return (
    <div className="space-y-1.5">
      <p
        id="panorama-vista-label"
        className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute"
      >
        Vista
      </p>
      <ul className={listClass} role="radiogroup" aria-labelledby="panorama-vista-label">
        {presets.map((preset, index) => {
          const isActive = activePresetId === preset.id;
          return (
            <li key={preset.id} className={itemClass}>
              <button
                ref={(el) => {
                  btnRefs.current[index] = el;
                }}
                type="button"
                // biome-ignore lint/a11y/useSemanticElements: a native <input type="radio"> can't carry this card's Tailwind visual (border/background/label stack) without a hidden-input + styled-label rework — the WAI-ARIA APG explicitly documents this div/button radiogroup pattern as an accepted alternative.
                role="radio"
                aria-checked={isActive}
                tabIndex={index === rovingIndex ? 0 : -1}
                onClick={() => onPreset(preset.id)}
                onKeyDown={(e) => handleKeyDown(e, index)}
                className={`flex ${cardSize} w-full flex-col items-start justify-center rounded-[var(--radius-md)] border text-left transition-colors ${
                  isActive
                    ? "border-ln-op-azul bg-ln-op-azul/10 text-ln-op-azul"
                    : "border-ln-op-line bg-ln-op-card text-ln-op-ink-2 hover:border-ln-op-azul/40 hover:bg-ln-op-card"
                }`}
              >
                <span className="block text-sm font-medium leading-tight">{preset.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
