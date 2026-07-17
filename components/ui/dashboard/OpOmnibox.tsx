"use client";

// OpOmnibox — operator global search (Wave 2 Item 10.1).
//
// Lives in the OpTopbar `actions` slot. Searches pets / persons / cases via
// searchOmniboxAction (jurisdiction-scoped + PII-logged on the server). The
// dropdown groups results by type and is fully keyboard-navigable:
//
//   - role="combobox" on the input with aria-expanded + aria-controls.
//   - role="listbox" on the dropdown; role="option" per result.
//   - aria-activedescendant points at the highlighted option id.
//   - ↑/↓ move the active option, Enter navigates, Escape closes.
//
// Keyboard shortcut: "/" or ⌘K / Ctrl+K focuses the input from anywhere.
// Query is debounced 250ms before hitting the server.
//
// a11y note: the listbox/option roles live on <div> carriers (the APG combobox
// pattern requires these roles and there is no semantic HTML equivalent). The
// related biome a11y rules (useSemanticElements / useFocusableInteractive /
// noNoninteractiveElementToInteractiveRole) are disabled for THIS FILE ONLY in
// biome.json — keyboard handling is centralized on the combobox input and the
// active option is surfaced via aria-activedescendant, not roving tabindex.
//
// States:
//   empty      → placeholder + shortcut hint, no dropdown.
//   typing     → debounced; spinner while the request is in flight.
//   loading    → inline spinner inside the dropdown.
//   no results → "Sin coincidencias en tu jurisdicción".

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { searchOmniboxAction, searchOmniboxOrgAction } from "@/app/actions/omnibox-search";
import { caseStatusDisplay } from "@/components/ui/dashboard/CaseStatusBadge";
import type { CaseStatus } from "@/db/schema";
import { DIM_TOKEN_PATTERN } from "@/lib/domain/dim-token";
import type { OmniboxResult, OmniboxResults } from "@/lib/infra/omnibox-search";
import { NO_BROWSER_AUTOFILL } from "@/lib/ui/no-browser-autofill";
import { speciesLabel } from "@/lib/utils/format";
import { caseKindLabel } from "@/src/modules/cases/domain/case-kinds";

const DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;

// Person-result role labels (same values as profiles.role across the app).
const ROLE_LABELS: Record<string, string> = {
  owner: "Dueño/a",
  vet: "Veterinario/a",
  govt: "Gobierno",
  admin: "Administrador",
};

const EMPTY_RESULTS: OmniboxResults = { pets: [], persons: [], cases: [], total: 0 };

type Group = {
  key: "pets" | "persons" | "cases";
  label: string;
  items: OmniboxResult[];
};

// Flatten the grouped results into a single ordered list so arrow-key
// navigation crosses group boundaries seamlessly.
function buildGroups(results: OmniboxResults): Group[] {
  const groups: Group[] = [];
  if (results.pets.length > 0) groups.push({ key: "pets", label: "Mascotas", items: results.pets });
  if (results.persons.length > 0)
    groups.push({ key: "persons", label: "Personas", items: results.persons });
  if (results.cases.length > 0) groups.push({ key: "cases", label: "Casos", items: results.cases });
  return groups;
}

function resultLabel(r: OmniboxResult): string {
  if (r.type === "pet") return r.name;
  if (r.type === "person") return r.displayName;
  return r.publicCode;
}

function resultMeta(r: OmniboxResult): string {
  if (r.type === "pet") return `${speciesLabel(r.species)} · ${r.publicToken}`;
  if (r.type === "person") return ROLE_LABELS[r.role] ?? r.role;
  return `${caseKindLabel(r.caseKind)} · ${caseStatusDisplay(r.status as CaseStatus).label}`;
}

export function OpOmnibox({
  orgToken,
  universalScope = false,
}: {
  orgToken?: string;
  /**
   * True when the viewer searches with UNIVERSAL scope (admin) — no jurisdiction
   * limit. The empty-state copy then drops "en tu jurisdicción", which otherwise
   * implies a territorial limit the admin does not have (Cowork B3).
   */
  universalScope?: boolean;
} = {}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const optionBaseId = useId();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OmniboxResults>(EMPTY_RESULTS);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  // Tracks whether a search has actually run for the current query, so we only
  // show "no results" after a real round-trip (not while typing the 1st char).
  const [searched, setSearched] = useState(false);

  const groups = useMemo(() => buildGroups(results), [results]);
  const flatItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  // Debounced search. Each keystroke schedules a search; the previous timer is
  // cleared so only the last keystroke after 250ms of quiet actually fires.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults(EMPTY_RESULTS);
      setLoading(false);
      setSearched(false);
      setActiveIndex(-1);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const r = orgToken
          ? await searchOmniboxOrgAction(orgToken, trimmed)
          : await searchOmniboxAction(trimmed);
        if (cancelled) return;
        setResults(r);
        setSearched(true);
        setActiveIndex(-1);
      } catch {
        if (cancelled) return;
        setResults(EMPTY_RESULTS);
        setSearched(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, orgToken]);

  // Global shortcut: "/" or ⌘K / Ctrl+K focuses the omnibox. "/" is ignored
  // while typing in another field so it doesn't hijack normal input.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typingElsewhere =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      const isCmdK = (e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K");
      const isSlash = e.key === "/" && !typingElsewhere && !e.metaKey && !e.ctrlKey;

      if (isCmdK || isSlash) {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const navigateTo = useCallback(
    (href: string) => {
      setOpen(false);
      setQuery("");
      setResults(EMPTY_RESULTS);
      inputRef.current?.blur();
      router.push(href);
    },
    [router],
  );

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (flatItems.length === 0 ? -1 : (i + 1) % flatItems.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) =>
        flatItems.length === 0 ? -1 : (i - 1 + flatItems.length) % flatItems.length,
      );
    } else if (e.key === "Enter") {
      if (activeIndex >= 0 && flatItems[activeIndex]) {
        e.preventDefault();
        navigateTo(flatItems[activeIndex].href);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  const showDropdown = open && query.trim().length >= MIN_QUERY_LENGTH;
  const noResults = searched && !loading && results.total === 0;
  const queriedDimToken = DIM_TOKEN_PATTERN.test(query.trim());
  const activeDescendant =
    activeIndex >= 0 && flatItems[activeIndex] ? `${optionBaseId}-${activeIndex}` : undefined;

  // Running index across groups so each option gets a stable, unique id that
  // matches the flatItems order used for keyboard navigation.
  let runningIndex = -1;

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={activeDescendant}
        aria-label="Búsqueda global"
        // System search only — no browser autofill/history overlay.
        {...NO_BROWSER_AUTOFILL}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Delay close so a click on an option registers before the dropdown
          // unmounts. 150ms is below perceptible lag.
          setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={onInputKeyDown}
        placeholder={orgToken ? "Buscar mascota…" : "Buscar persona o caso…"}
        className="w-48 rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card px-3 py-1.5 text-[13px] text-ln-op-ink placeholder:text-ln-op-mute focus:w-64 focus:outline-none focus:ring-2 focus:ring-ln-op-azul md:w-56 md:focus:w-72 transition-[width]"
      />

      {/* Keyboard shortcut hint — only when empty + unfocused-ish (always shown
          when the field is empty so the affordance is discoverable). */}
      {query.length === 0 && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-ln-op-line bg-ln-op-stripe px-1.5 py-0.5 text-xs font-ln-mono text-ln-op-mute"
        >
          /
        </span>
      )}

      {showDropdown && (
        // WAI-ARIA combobox listbox popup. The a11y roles (listbox/option) are
        // required by the APG pattern and intentionally allowed on <div> via the
        // biome override for this file. tabIndex={-1} keeps the popup focusable.
        <div
          id={listboxId}
          role="listbox"
          tabIndex={-1}
          aria-label="Resultados de búsqueda"
          className="absolute right-0 z-[var(--z-header)] mt-1 max-h-[60vh] w-80 overflow-y-auto rounded-[var(--radius-lg)] border border-ln-op-line bg-ln-op-card shadow-[0_18px_50px_rgba(20,40,60,.22)]"
        >
          {loading && (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-ln-op-mute">
              <span
                aria-hidden="true"
                className="h-3 w-3 animate-spin rounded-full border-2 border-ln-op-line border-t-ln-op-azul"
              />
              Buscando…
            </div>
          )}

          {!loading && noResults && (
            // Empty state (operator-trust T4): state the miss, then SUGGEST the
            // formats that work so the operator knows what to type. The
            // "en tu jurisdicción" qualifier is dropped for universal scope
            // (admin) — it has no territorial limit and the copy must not imply
            // one.
            //
            // The suggestion is scope-specific because the searchable entities
            // are: searchOmnibox returns pets ONLY for the org variant. For
            // admin/govt it returns `pets: []` by fence invariant (operators
            // have no pet directory — see lib/infra/gob-pet-subview.ts), so
            // offering "DIM-…" here advertises the one format that can never
            // resolve. QA 2026-07-16: two independent testers pasted a valid
            // DIM token, got this hint, retried, and both concluded the search
            // was broken. When the query IS a DIM token, name the fence rather
            // than let "Sin coincidencias" imply the pet does not exist.
            <div className="px-4 py-3 text-sm text-ln-op-mute">
              <p>{universalScope ? "Sin coincidencias" : "Sin coincidencias en tu jurisdicción"}</p>
              <p className="mt-1 text-[var(--text-xs)] text-ln-op-mute">
                {orgToken
                  ? "Probá con el nombre de la mascota o su código (DIM-…)."
                  : queriedDimToken
                    ? "El buscador de operadores no accede al padrón de mascotas. Una mascota aparece acá solo si tiene un caso (CAS-…) o una denuncia (DEN-…) asociada: buscá por ese código."
                    : "Probá con un código de caso (CAS-…), de denuncia (DEN-…), o nombre y apellido."}
              </p>
            </div>
          )}

          {!loading &&
            groups.map((group) => (
              <div key={group.key} className="border-b border-ln-op-line-2 last:border-b-0">
                <p className="px-4 pt-2 pb-1 text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
                  {group.label}
                </p>
                {group.items.map((item) => {
                  runningIndex += 1;
                  const idx = runningIndex;
                  const optionId = `${optionBaseId}-${idx}`;
                  const isActive = idx === activeIndex;
                  return (
                    <div
                      key={`${item.type}-${item.id}`}
                      id={optionId}
                      role="option"
                      tabIndex={-1}
                      aria-selected={isActive}
                      onMouseDown={(e) => {
                        // mousedown (not click) so it fires before input blur
                        // closes the dropdown.
                        e.preventDefault();
                        navigateTo(item.href);
                      }}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={[
                        "cursor-pointer px-4 py-2",
                        isActive ? "bg-ln-op-stripe" : "",
                      ].join(" ")}
                    >
                      <p className="truncate text-[13px] text-ln-op-ink">{resultLabel(item)}</p>
                      <p className="truncate text-[11px] text-ln-op-mute">{resultMeta(item)}</p>
                    </div>
                  );
                })}
              </div>
            ))}

          {/* PII audit notice — always visible at the bottom when the dropdown is open. */}
          <p className="border-t border-ln-op-line px-4 py-2 text-xs text-ln-op-mute">
            Las búsquedas quedan registradas.
          </p>
        </div>
      )}
    </div>
  );
}
