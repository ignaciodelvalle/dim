"use client";

// PresetPanel — renders the F3 curated preset buttons.
//
// Each preset is a <button> with aria-pressed to indicate the active preset.
// The preset's description (the QUESTION it answers) is shown as helper text
// below the button label. Clicking a button calls onPreset(id) and the parent
// (PanoramaConsole) activates the corresponding compatibility-valid layer set.

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
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">Vista</p>
      <ul className={layout === "row" ? "space-y-1 lg:flex lg:gap-2 lg:space-y-0" : "space-y-1"}>
        {presets.map((preset) => {
          const isActive = activePresetId === preset.id;
          return (
            <li key={preset.id} className={layout === "row" ? "lg:min-w-0 lg:flex-1" : undefined}>
              <button
                type="button"
                aria-pressed={isActive}
                onClick={() => onPreset(preset.id)}
                className={`w-full rounded-[var(--radius-md)] border px-2.5 py-2 text-left transition-colors ${
                  isActive
                    ? "border-ln-op-azul bg-ln-op-azul/10 text-ln-op-azul"
                    : "border-ln-op-line bg-ln-op-card text-ln-op-ink-2 hover:border-ln-op-azul/40 hover:bg-ln-op-card"
                }`}
              >
                <span className="block text-sm font-medium leading-tight">{preset.label}</span>
                <span className="mt-0.5 block text-xs leading-snug text-ln-op-mute">
                  {preset.description}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
