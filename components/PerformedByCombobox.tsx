"use client";

// Performed_by autocomplete combobox (spec
// 2026-05-19-performed-by-autocomplete-design §5.1).
//
// Dual mode: while the user types, suggestions come from
// `searchVetsAndClinicsAction` (verified orgs + verified vets). If
// they pick one, hidden inputs persist the FK + the display-name
// snapshot. If they type something not in the list and submit, only
// the text snapshot is persisted (legacy free-text mode).
//
// The form contract is three hidden inputs whose names the caller
// supplies via `inputNames`:
//   - text          → display-name snapshot (always populated when
//                     either typed or selected)
//   - organizationId → set when the selected suggestion is an org
//   - userId         → set when the selected suggestion is a vet profile

import { useEffect, useRef, useState, useTransition } from "react";

import { searchVetsAndClinicsAction } from "@/app/actions/performed-by";
import type { PerformedBySuggestion, SearchJurisdiction } from "@/lib/performed-by-search";

const MIN_QUERY_LEN = 2;
const DEBOUNCE_MS = 250;

const ORG_TYPE_LABELS: Record<string, string> = {
  clinic: "Clínica",
  sanitary_authority: "Autoridad sanitaria",
  rescue_network: "Red de rescate",
  shelter: "Refugio",
};

interface Props {
  /** Pet jurisdiction passed through for relevance boost. */
  contextJurisdiction?: SearchJurisdiction;
  /** Field label shown above the input. */
  label: string;
  /** Hidden form-field names. */
  inputNames: {
    text: string;
    organizationId: string;
    userId: string;
  };
  /** Initial values when editing an existing event. */
  initial?: {
    text?: string | null;
    organizationId?: string | null;
    userId?: string | null;
    displayName?: string | null;
  };
  /** Optional kind filter (e.g. only profile, only organization). */
  allowedKinds?: ("organization" | "profile")[];
  /** Standard input attributes. */
  required?: boolean;
  placeholder?: string;
}

const INPUT_CLASS =
  "w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50";

export function PerformedByCombobox({
  contextJurisdiction,
  label,
  inputNames,
  initial,
  allowedKinds,
  required,
  placeholder,
}: Props) {
  // Pre-resolved selection rehydrated from initial.
  const [selected, setSelected] = useState<PerformedBySuggestion | null>(() => {
    if (initial?.organizationId && initial?.displayName) {
      return {
        kind: "organization",
        id: initial.organizationId,
        displayName: initial.displayName,
        orgType: "",
        jurisdictionProvince: null,
        jurisdictionLocality: null,
        verified: true,
      };
    }
    if (initial?.userId && initial?.displayName) {
      return {
        kind: "profile",
        id: initial.userId,
        displayName: initial.displayName,
        matriculaVerified: true,
        matriculaJurisdiccion: null,
      };
    }
    return null;
  });
  const [query, setQuery] = useState<string>(initial?.text ?? "");
  const [suggestions, setSuggestions] = useState<PerformedBySuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [errored, setErrored] = useState(false);
  const [pending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced fetch.
  useEffect(() => {
    if (selected) return;
    if (query.trim().length < MIN_QUERY_LEN) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        const res = await searchVetsAndClinicsAction({
          query,
          jurisdiction: contextJurisdiction,
        });
        if ("results" in res) {
          const filtered = allowedKinds
            ? res.results.filter((s) => allowedKinds.includes(s.kind))
            : res.results;
          setSuggestions(filtered);
          setOpen(filtered.length > 0);
          setErrored(false);
        } else {
          setErrored(true);
        }
      });
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, selected, contextJurisdiction, allowedKinds]);

  function selectSuggestion(s: PerformedBySuggestion) {
    setSelected(s);
    setQuery(s.displayName);
    setOpen(false);
  }

  function clearSelection() {
    setSelected(null);
    setQuery("");
    setSuggestions([]);
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      selectSuggestion(suggestions[activeIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const textValue = selected ? selected.displayName : query;
  const showNoResults =
    !selected && !pending && query.trim().length >= MIN_QUERY_LEN && suggestions.length === 0;

  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-neutral-900 dark:text-neutral-50">
        {label}
      </label>

      {/* Hidden form fields */}
      <input type="hidden" name={inputNames.text} value={textValue} />
      <input
        type="hidden"
        name={inputNames.organizationId}
        value={selected?.kind === "organization" ? selected.id : ""}
      />
      <input
        type="hidden"
        name={inputNames.userId}
        value={selected?.kind === "profile" ? selected.id : ""}
      />

      {selected ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 dark:border-emerald-700 dark:bg-emerald-950/40">
          <span className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
            {selected.displayName}
          </span>
          {selected.kind === "organization" ? (
            <span className="text-xs text-emerald-700 dark:text-emerald-300">
              ✓ {ORG_TYPE_LABELS[selected.orgType] ?? selected.orgType} verificada
            </span>
          ) : (
            <span className="text-xs text-emerald-700 dark:text-emerald-300">
              ✓ Vet matriculado
            </span>
          )}
          <button
            type="button"
            onClick={clearSelection}
            className="ml-auto text-xs text-emerald-700 hover:text-emerald-900 dark:text-emerald-300 dark:hover:text-emerald-100"
          >
            ✕ Limpiar
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setErrored(false);
            }}
            onKeyDown={handleKey}
            onFocus={() => {
              if (suggestions.length > 0) setOpen(true);
            }}
            onBlur={() => {
              setTimeout(() => setOpen(false), 150);
            }}
            placeholder={placeholder ?? "Buscar veterinario o clínica…"}
            required={required}
            className={INPUT_CLASS}
            aria-autocomplete="list"
            aria-expanded={open}
          />
          {pending && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-500">
              …
            </span>
          )}
          {open && suggestions.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-md border border-neutral-200 bg-white shadow-lg dark:border-neutral-800 dark:bg-neutral-950">
              {suggestions.map((s, i) => (
                <li key={`${s.kind}-${s.id}`}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectSuggestion(s);
                    }}
                    className={`block w-full px-3 py-2 text-left ${
                      i === activeIdx
                        ? "bg-neutral-100 dark:bg-neutral-800"
                        : "hover:bg-neutral-50 dark:hover:bg-neutral-900"
                    }`}
                  >
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                      {s.displayName}
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {s.kind === "organization"
                        ? `${ORG_TYPE_LABELS[s.orgType] ?? s.orgType}${s.jurisdictionLocality ? ` · ${s.jurisdictionLocality}` : ""}`
                        : `Vet matriculado${s.matriculaJurisdiccion ? ` · ${s.matriculaJurisdiccion}` : ""}`}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {showNoResults && (
            <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
              Sin coincidencias. Tu texto se guardará tal cual como referencia libre.
            </p>
          )}
          {errored && (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
              No pudimos buscar ahora. Podés seguir tipeando — se guarda como texto libre.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
