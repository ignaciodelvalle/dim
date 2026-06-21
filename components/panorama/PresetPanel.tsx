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
};

export function PresetPanel({ presets, activePresetId, onPreset }: Props) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ln-op-mute">Vista</p>
      <ul className="space-y-1">
        {presets.map((preset) => {
          const isActive = activePresetId === preset.id;
          return (
            <li key={preset.id}>
              <button
                type="button"
                aria-pressed={isActive}
                onClick={() => onPreset(preset.id)}
                className={`w-full rounded-[6px] border px-2.5 py-2 text-left transition-colors ${
                  isActive
                    ? "border-ln-op-azul bg-ln-op-azul/10 text-ln-op-azul"
                    : "border-ln-op-line bg-ln-op-card text-ln-op-ink-2 hover:border-ln-op-azul/40 hover:bg-ln-op-card"
                }`}
              >
                <span className="block text-[12px] font-medium leading-tight">{preset.label}</span>
                <span className="mt-0.5 block text-[10px] leading-snug text-ln-op-mute">
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
