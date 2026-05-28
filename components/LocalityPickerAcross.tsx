"use client";

// LocalityPickerAcross — single input that searches the `ar_localities`
// catalog across every Argentine province at once. Returns rich results so
// the consumer can derive both province and locality from a single user
// gesture.
//
// Differs from LocalityCombobox:
//   - No `provinceCode` prop / no province scoping.
//   - Result rows show "Locality, Province" for disambiguation.
//   - Emits four hidden inputs (vs LocalityCombobox's two): provinceCode,
//     provinceName, localityName, localityNameIndecId.
//
// Used by LocationFields when mode="l1" after the unified-location refactor
// (critique-direcciones-2026-05-27 §"Opción B").
//
// Auth: the underlying searchLocalitiesAction requires auth. L1 flows are
// all authed, so no public variant is needed.

import { useEffect, useRef, useState, useTransition } from "react";

import { searchLocalitiesAction } from "@/app/actions/localities";
import type { LocalitySearchResult } from "@/lib/ar-localidades";
import { inputClass } from "@/lib/form-classes";

const DEBOUNCE_MS = 200;
const MIN_QUERY_LENGTH = 2;

type DefaultValue = {
  provinceCode?: string | null;
  provinceName?: string | null;
  localityName?: string | null;
  indecId?: string | null;
};

type Props = {
  /** Pre-fill values for edit mode. When provinceCode + localityName are
   * supplied, the input renders the locality name and the hidden inputs
   * carry the values directly until the user types something new. */
  defaultValue?: DefaultValue;
  /** Optional ID, mostly for label association. */
  id?: string;
  /** Hidden-input base name. Defaults to "localityName" to match the wire
   * contract the actions already expect; the companion hiddens use suffixes
   * so the action can keep reading `provinceCode`, `localityName`,
   * `localityNameIndecId`, `provinceName`. */
  name?: string;
  required?: boolean;
  /** Called on every successful pick — useful for parent state. */
  onSelect?: (selected: LocalitySearchResult | null) => void;
  /** Placeholder copy override. */
  placeholder?: string;
};

export function LocalityPickerAcross({
  defaultValue,
  id,
  name = "localityName",
  required,
  onSelect,
  placeholder = "Ej: Palermo, La Plata, Mendoza…",
}: Props) {
  const [query, setQuery] = useState(defaultValue?.localityName ?? "");
  // Hold the picked result so we can surface its provinceCode + indecId in
  // hidden inputs. When the user types without picking, this is null and
  // the hidden inputs fall back to the raw query (locality) + defaultValue
  // (province) — same tolerant contract as LocalityCombobox.
  const [selected, setSelected] = useState<LocalitySearchResult | null>(null);
  const [results, setResults] = useState<LocalitySearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [pending, startTransition] = useTransition();
  const [errored, setErrored] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (query.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setOpen(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        // No provinceCode — searchLocalitiesAction returns matches across
        // every province (the action already supports this; it filters
        // only when provinceCode is supplied).
        const res = await searchLocalitiesAction({ query });
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
  }, [query]);

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

  const showNoResults =
    !pending && query.length >= MIN_QUERY_LENGTH && results.length === 0 && !errored;

  // Hidden-input values. When the user picked a result, all four are
  // canonical; when they typed free text, we fall through to the raw query
  // and the defaultValue's province — same tolerant contract as the legacy
  // LocalityCombobox so server actions keep working.
  const provinceCodeValue = selected?.provinceCode ?? defaultValue?.provinceCode ?? "";
  const provinceNameValue = selected?.provinceName ?? defaultValue?.provinceName ?? "";
  const localityNameValue = selected?.localityName ?? query;
  const indecIdValue = selected?.indecId ?? defaultValue?.indecId ?? "";

  return (
    <div className="relative">
      <input
        id={id}
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
          setTimeout(() => setOpen(false), 150);
        }}
        placeholder={placeholder}
        required={required}
        className={inputClass}
        aria-autocomplete="list"
        aria-expanded={open}
      />
      {/* Wire contract:
            provinceCode        — ISO 3166-2:AR. Empty when user typed free text and there's no defaultValue.
            provinceName        — display, for forms that prefer the name in DB.
            localityName        — canonical when picked, raw query otherwise.
            localityNameIndecId — INDEC id; empty when free text. */}
      <input type="hidden" name="provinceCode" value={provinceCodeValue} />
      <input type="hidden" name="provinceName" value={provinceNameValue} />
      <input type="hidden" name={name} value={localityNameValue} />
      <input type="hidden" name={`${name}IndecId`} value={indecIdValue} />
      {open && results.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-md border border-gob-border  bg-white  shadow-lg">
          {results.map((r, i) => (
            <li key={r.indecId ?? `${r.provinceCode}-${r.localitySlug}-${r.departmentName ?? "x"}`}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(r);
                }}
                className={`block w-full text-left px-3 py-2 ${
                  i === activeIdx ? "bg-gob-surface-alt " : "hover:bg-gob-surface-alt "
                }`}
              >
                <p className="text-sm text-gob-text ">{r.localityName}</p>
                <p className="text-xs text-gob-text-muted ">
                  {r.departmentName ? `${r.departmentName}, ` : ""}
                  {r.provinceName}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
      {pending && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gob-text-muted">
          …
        </span>
      )}
      {showNoResults && (
        <p className="text-xs text-gob-text-muted  mt-1">
          Sin resultados.{" "}
          <a
            href={`mailto:ignaciodelvalle2014@gmail.com?subject=MiMAR%20%E2%80%94%20Agregar%20localidad&body=Localidad:%20${encodeURIComponent(query)}`}
            className="underline"
          >
            Sugerí esta localidad
          </a>
        </p>
      )}
      {errored && (
        <p className="text-xs text-gob-warning-text  mt-1">
          No pudimos buscar localidades ahora. Probá de nuevo en un momento.
        </p>
      )}
    </div>
  );
}
