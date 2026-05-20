"use client";

// Typeahead picker that scopes to a province and queries the canonical
// ar_localities catalog via searchLocalitiesAction. Submits two hidden inputs:
//
//   - `${name}`         — the locality display name (free text fallback if
//                         the user typed without picking)
//   - `${name}IndecId`  — the INDEC id of the picked entry, or empty
//
// Used by LocationFields (jurisdiction modes) and standalone in admin forms
// that already render their own province <select> outside this component.

import { useEffect, useRef, useState, useTransition } from "react";

import { searchLocalitiesAction } from "@/app/actions/localities";
import type { LocalitySearchResult } from "@/lib/ar-localidades";
import { inputClass } from "@/lib/form-classes";

const DEBOUNCE_MS = 200;
const MIN_QUERY_LENGTH = 2;

type Props = {
  /** Two-letter ISO province code (e.g. "AR-C") or null when no province is selected yet. */
  provinceCode: string | null;
  /** Pre-fill values for edit mode. */
  defaultValue?: {
    localityName?: string | null;
    indecId?: string | null;
  };
  /**
   * Base name for the hidden form fields. The component emits
   * `${name}` (display name) and `${name}IndecId` (canonical id).
   * Defaults to "localityName" to match the existing form contract.
   */
  name?: string;
  required?: boolean;
  /** Called whenever the user picks a result or clears the field. */
  onSelect?: (selected: LocalitySearchResult | null) => void;
};

export function LocalityCombobox({
  provinceCode,
  defaultValue,
  name = "localityName",
  required,
  onSelect,
}: Props) {
  const [query, setQuery] = useState(defaultValue?.localityName ?? "");
  const [selected, setSelected] = useState<LocalitySearchResult | null>(null);
  const [results, setResults] = useState<LocalitySearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [pending, startTransition] = useTransition();
  const [errored, setErrored] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset state when the user changes province — what they typed under the
  // old province no longer applies.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only province changes should clear
  useEffect(() => {
    setResults([]);
    setOpen(false);
    setSelected(null);
    setErrored(false);
  }, [provinceCode]);

  useEffect(() => {
    if (!provinceCode) return;
    if (query.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setOpen(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        const res = await searchLocalitiesAction({ provinceCode, query });
        if ("results" in res) {
          setResults(res.results);
          setOpen(res.results.length > 0);
          setActiveIdx(0);
          setErrored(false);
        } else {
          setErrored(true);
        }
      });
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, provinceCode]);

  function handleSelect(r: LocalitySearchResult) {
    setSelected(r);
    setQuery(r.localityName);
    setOpen(false);
    onSelect?.(r);
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      handleSelect(results[activeIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const disabled = provinceCode === null;
  const showNoResults =
    !disabled && !pending && query.length >= MIN_QUERY_LENGTH && results.length === 0 && !errored;

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelected(null);
        }}
        onKeyDown={handleKey}
        onFocus={() => {
          if (results.length > 0) setOpen(true);
        }}
        onBlur={() => {
          // setTimeout so a mouse click on a result fires before the dropdown closes.
          setTimeout(() => setOpen(false), 150);
        }}
        placeholder={disabled ? "Primero elegí provincia" : "Empezá a tipear..."}
        disabled={disabled}
        required={required}
        className={`${inputClass} disabled:opacity-50`}
        aria-autocomplete="list"
        aria-expanded={open}
      />
      {/* Submit form contract: the display name and the canonical INDEC id.
          When the user typed without picking, indec_id is empty — the server
          action validates against ar_localities and rejects if it isn't a
          canonical match. */}
      <input type="hidden" name={name} value={selected?.localityName ?? query} />
      <input type="hidden" name={`${name}IndecId`} value={selected?.indecId ?? ""} />
      {open && results.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-lg">
          {results.map((r, i) => (
            <li key={r.indecId ?? `${r.provinceCode}-${r.localitySlug}-${r.departmentName ?? "x"}`}>
              <button
                type="button"
                onMouseDown={(e) => {
                  // mouseDown (not click) — fires before the input's blur
                  // dismisses the dropdown.
                  e.preventDefault();
                  handleSelect(r);
                }}
                className={`block w-full text-left px-3 py-2 ${
                  i === activeIdx
                    ? "bg-neutral-100 dark:bg-neutral-800"
                    : "hover:bg-neutral-50 dark:hover:bg-neutral-900"
                }`}
              >
                <p className="text-sm text-neutral-900 dark:text-neutral-50">{r.localityName}</p>
                {r.departmentName && (
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {r.departmentName}, {r.provinceName}
                  </p>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {pending && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-500">
          …
        </span>
      )}
      {showNoResults && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
          Sin resultados.{" "}
          <a
            href={`mailto:ignaciodelvalle2014@gmail.com?subject=MiMAR%20%E2%80%94%20Agregar%20localidad&body=Provincia:%20${encodeURIComponent(provinceCode ?? "")}%0ALocalidad:%20${encodeURIComponent(query)}`}
            className="underline"
          >
            Sugerí esta localidad
          </a>
        </p>
      )}
      {errored && (
        <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
          No pudimos buscar localidades ahora. Probá de nuevo en un momento.
        </p>
      )}
    </div>
  );
}
