"use client";

import { useSearchParams } from "next/navigation";
import { type ReactNode, useId } from "react";

import { Icon } from "@/components/Icon";
import { JurisdictionSwitcher } from "@/components/gob/JurisdictionSwitcher";
import { PeriodPicker } from "@/components/gob/PeriodPicker";
import { OpSelect } from "@/components/ui/dashboard/OpField";
import {
  PRESET_3Y,
  PRESET_5Y,
  PRESET_30D,
  PRESET_90D,
  PRESET_YTD,
  type PeriodPresetId,
} from "@/lib/metrics/period-presets";
import { serverNavCommit } from "@/lib/ui/filter-commit";

/**
 * OpFilterBar — the unified filter-bar region for operator (gob/admin) list
 * dashboards. One bar, one visual idiom, one keyboard model: every list screen
 * declares its axes and drops them into the SAME bar instead of hand-rolling a
 * bespoke row of controls.
 *
 * Three regions, top to bottom:
 *   1. Period (<PeriodPicker>) + optional Jurisdiction (<JurisdictionSwitcher>)
 *      — the two already-consistent shared controls, reused as-is (not
 *      restyled: they are shared across many surfaces).
 *   2. Domain axes — screen-specific filters (species / status / kind /
 *      severity …) declared via the `axes` descriptor and rendered as ONE
 *      consistent labeled <select> idiom, plus a free-form `children` slot for
 *      anything that doesn't fit the descriptor (a search form, status tabs…).
 *   3. Active-filter chips + "Limpiar todo" — a removable chip per active
 *      non-default filter, derived from the live searchParams and the axis
 *      registry, plus a one-click reset to defaults. No screen had this before.
 *
 * Commit model: EVERY mutation (axis change, chip removal, clear-all) commits
 * through `serverNavCommit` — the sanctioned full-document navigation that is
 * immune to Next 15.5.18's App Router router-drop defect (engram #621/#622).
 * The embedded PeriodPicker / JurisdictionSwitcher already commit the same way.
 * No navigation is hand-rolled here.
 *
 * Accessibility: domain axes are native <select>s wrapped in their own <label>
 * (implicit association) with a matching aria-label — the same aria baseline
 * PeriodPicker/JurisdictionSwitcher already meet. Chips are <button>s with a
 * descriptive aria-label ("Quitar filtro: …"). Mobile-safe: every region wraps
 * (flex-wrap / responsive grid) so nothing overflows at 375px.
 */

/** A single selectable value on a domain axis. `value` is the searchParam value. */
export type OpFilterAxisOption = {
  value: string;
  /** es-AR label shown in the <option> and in the active-filter chip. */
  label: string;
};

/**
 * Declarative descriptor for one screen-specific domain axis (species, status,
 * kind, severity…). The bar renders it as a labeled <select> and, when active,
 * as a removable chip.
 */
export type OpFilterAxis = {
  /** Stable id — used for React keys and the chip id. */
  id: string;
  /** Visible es-AR label ("Especie", "Tipo", "Severidad"…). */
  label: string;
  /** searchParam key this axis reads/writes. */
  paramKey: string;
  /** Selectable options (the "all/any" default is rendered separately). */
  options: OpFilterAxisOption[];
  /**
   * Current value — the value the PAGE already parsed and validated (e.g.
   * maltrato validates `kind` against its enum). Null/"" = default ("all").
   * Preferred over reading the raw searchParam so an invalid URL value never
   * drives the control.
   */
  current: string | null;
  /** Label for the default/"all" option. Default "Todas". */
  allLabel?: string;
};

/** Period-axis config — mirrors the subset of <PeriodPicker> props the bar forwards. */
export type OpFilterBarPeriod = {
  /** Default preset (also decides when the period counts as "active"). Default "30d". */
  defaultPreset?: PeriodPresetId;
  multiYear?: boolean;
  /** searchParam key for the preset. Default "period". */
  paramKey?: string;
  /** searchParam keys for a custom range. Default { from: "from", to: "to" }. */
  customParamKeys?: { from: string; to: string };
};

/** Jurisdiction-axis config — forwarded to <JurisdictionSwitcher> and used to label chips. */
export type OpFilterBarJurisdiction = {
  allowedProvinces: Array<{ code: string; name: string }>;
  localities?: Array<{ slug: string; name: string }>;
  paramKeys?: { province: string; locality: string };
  dropParamsOnNavigate?: readonly string[];
};

export type OpFilterBarProps = {
  /** Period axis config. Always rendered; omit to use defaults. */
  period?: OpFilterBarPeriod;
  /** Jurisdiction axis config. Rendered only when provided (screen has scope). */
  jurisdiction?: OpFilterBarJurisdiction;
  /** Screen-specific domain axes, rendered as consistent labeled selects. */
  axes?: OpFilterAxis[];
  /**
   * Extra searchParam keys to DROP on any filter mutation (axis change, chip
   * removal, clear-all) — e.g. a keyset pagination `cursor` that a filter
   * change invalidates. Also dropped by "Limpiar todo".
   */
  resetParamsOnChange?: readonly string[];
  /**
   * Free-form slot for controls that don't fit the axis descriptor (a search
   * form, the existing status/queue tabs…). Rendered in the domain-axes region.
   */
  children?: ReactNode;
  className?: string;
};

// Chip labels for the period axis. The 5 fixed presets are single-sourced from
// lib/metrics/period-presets (no drift); "7d"/"trailing12m" keep a bar-local
// TERSE copy and "custom" its own — exactly the split PeriodPicker itself makes
// (see the period-presets.ts module doc: those two labels are deliberately
// surface-specific, so a new surface like this bar owns its own terse copy).
const PERIOD_CHIP_LABELS: Record<string, string> = {
  "7d": "7 días",
  [PRESET_30D.value]: PRESET_30D.label,
  [PRESET_90D.value]: PRESET_90D.label,
  trailing12m: "12 meses",
  [PRESET_YTD.value]: PRESET_YTD.label,
  [PRESET_3Y.value]: PRESET_3Y.label,
  [PRESET_5Y.value]: PRESET_5Y.label,
  custom: "personalizado",
};

type ActiveChip = {
  id: string;
  label: string;
  /** Param updates that REMOVE this filter (values are null → deleted). */
  clear: Record<string, string | null>;
};

const axisLabelClasses = "flex flex-col gap-1 text-xs font-medium text-ln-op-ink-2";

const chipClasses =
  "inline-flex items-center gap-1.5 rounded-full border border-ln-op-line bg-ln-op-stripe " +
  "px-3 py-1 text-xs font-medium text-ln-op-ink min-h-8 " +
  "hover:border-ln-op-mute focus:outline-none focus-visible:ring-2 focus-visible:ring-ln-op-azul";

const clearAllClasses =
  "inline-flex items-center min-h-8 rounded px-1 text-xs font-semibold text-ln-op-azul " +
  "underline underline-offset-2 hover:text-ln-op-azul-700 " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-ln-op-azul";

export function OpFilterBar({
  period,
  jurisdiction,
  axes = [],
  resetParamsOnChange = [],
  children,
  className = "",
}: OpFilterBarProps) {
  const searchParams = useSearchParams();
  const uid = useId();

  const periodKey = period?.paramKey ?? "period";
  const fromKey = period?.customParamKeys?.from ?? "from";
  const toKey = period?.customParamKeys?.to ?? "to";
  const defaultPreset: PeriodPresetId = period?.defaultPreset ?? "30d";

  const provinceKey = jurisdiction?.paramKeys?.province ?? "province";
  const localityKey = jurisdiction?.paramKeys?.locality ?? "locality";

  // Single commit path — every mutation flows through the sanctioned
  // full-document navigation, dropping any filter-invalidated params (cursor…).
  function commit(updates: Record<string, string | null>) {
    serverNavCommit(searchParams.toString())(updates, resetParamsOnChange);
  }

  function handleAxisChange(axis: OpFilterAxis, value: string) {
    // "" → null deletes the param, returning the axis to its "all" default.
    commit({ [axis.paramKey]: value || null });
  }

  // ---- Active-filter chips -------------------------------------------------
  // Derived from the LIVE searchParams (period/jurisdiction) and the page's
  // already-validated axis `current` — the source of truth for what's on screen.
  const chips: ActiveChip[] = [];

  const activePreset = searchParams.get(periodKey);
  if (activePreset && activePreset !== defaultPreset) {
    const label = PERIOD_CHIP_LABELS[activePreset] ?? activePreset;
    chips.push({
      id: "period",
      label: `Período: ${label}`,
      clear: { [periodKey]: null, [fromKey]: null, [toKey]: null },
    });
  }

  if (jurisdiction) {
    const province = searchParams.get(provinceKey);
    const locality = searchParams.get(localityKey);
    if (province) {
      const name = jurisdiction.allowedProvinces.find((p) => p.code === province)?.name ?? province;
      chips.push({
        id: "province",
        label: `Provincia: ${name}`,
        // Clearing the province also clears the locality (a locality without its
        // province is meaningless — same rule JurisdictionSwitcher enforces).
        clear: { [provinceKey]: null, [localityKey]: null },
      });
    }
    if (locality) {
      const name = jurisdiction.localities?.find((l) => l.slug === locality)?.name ?? locality;
      chips.push({
        id: "locality",
        label: `Localidad: ${name}`,
        clear: { [localityKey]: null },
      });
    }
  }

  for (const axis of axes) {
    if (axis.current) {
      const label = axis.options.find((o) => o.value === axis.current)?.label ?? axis.current;
      chips.push({
        id: axis.id,
        label: `${axis.label}: ${label}`,
        clear: { [axis.paramKey]: null },
      });
    }
  }

  function handleClearAll() {
    const updates: Record<string, string | null> = {
      [periodKey]: null,
      [fromKey]: null,
      [toKey]: null,
    };
    if (jurisdiction) {
      updates[provinceKey] = null;
      updates[localityKey] = null;
    }
    for (const axis of axes) updates[axis.paramKey] = null;
    commit(updates);
  }

  return (
    <section
      aria-label="Filtros"
      className={[
        "space-y-4 rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card p-4",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Region 1 — period + (optional) jurisdiction */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <span className="block text-xs font-medium text-ln-op-ink-2">Período</span>
          <PeriodPicker
            defaultPreset={defaultPreset}
            multiYear={period?.multiYear}
            presetParamKey={periodKey}
            customParamKeys={{ from: fromKey, to: toKey }}
          />
        </div>
        {jurisdiction && (
          <JurisdictionSwitcher
            allowedProvinces={jurisdiction.allowedProvinces}
            localities={jurisdiction.localities}
            paramKeys={{ province: provinceKey, locality: localityKey }}
            dropParamsOnNavigate={jurisdiction.dropParamsOnNavigate}
          />
        )}
      </div>

      {/* Region 2 — domain axes + free-form slot */}
      {(axes.length > 0 || children) && (
        <div className="flex flex-wrap items-end gap-3">
          {axes.map((axis) => {
            const selectId = `${uid}-${axis.id}`;
            return (
              <label key={axis.id} htmlFor={selectId} className={axisLabelClasses}>
                {axis.label}
                <OpSelect
                  id={selectId}
                  className="min-h-11 w-auto min-w-[9rem]"
                  value={axis.current ?? ""}
                  onChange={(e) => handleAxisChange(axis, e.target.value)}
                  aria-label={axis.label}
                >
                  <option value="">{axis.allLabel ?? "Todas"}</option>
                  {axis.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </OpSelect>
              </label>
            );
          })}
          {children}
        </div>
      )}

      {/* Region 3 — active-filter chips + clear-all */}
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-ln-op-line-2 pt-3">
          <span className="text-xs font-medium text-ln-op-mute">Filtros activos:</span>
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => commit(chip.clear)}
              className={chipClasses}
              aria-label={`Quitar filtro: ${chip.label}`}
            >
              <span>{chip.label}</span>
              <Icon name="close" size={14} decorative />
            </button>
          ))}
          <button type="button" onClick={handleClearAll} className={clearAllClasses}>
            Limpiar todo
          </button>
        </div>
      )}
    </section>
  );
}
