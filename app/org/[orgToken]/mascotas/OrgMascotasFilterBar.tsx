"use client";

// OrgMascotasFilterBar — the custody-list filter row, auto-applying.
//
// WHY (PO decision 5, UI review 2026-08-06): this bar used to be a plain
// `<form method="GET">` with a "Filtrar" submit button, while every gob/admin
// filter bar in the product applies on change (OpFilterBar's axes, and the
// single-purpose controls like AlertEstadoFilter, all commit straight from
// onChange). One operator surface asking for an extra click to do what the
// identical-looking bar two screens over does for free is a learned-helplessness
// tax, so the button is gone and the controls commit themselves.
//
// TWO COMMIT MECHANISMS, on purpose:
//   - Selects and the checkbox commit IMMEDIATELY through `serverNavCommit`,
//     the sanctioned full-document navigation every gob/admin filter control
//     already uses (immune to Next 15.5.18's App Router router-drop defect,
//     engram #621/#622). A discrete control has no focus to lose.
//   - The free-text query commits DEBOUNCED (300 ms) through `router.replace`,
//     copying app/(app)/mis-mascotas/_components/PetSearchInput — the only
//     debounced text→URL filter in the repo, and for a hard reason:
//     `serverNavCommit` is `window.location.assign`, so debouncing IT would
//     reload the document mid-typing and rip focus (and the caret) out of the
//     field after every 300 ms pause. A same-route soft `replace` keeps the
//     input mounted and focused; that is exactly the trade PetSearchInput
//     already ships on the owner side. Enter flushes the pending commit for
//     anyone who does not want to wait for the debounce.
//
// The GET form used to DROP every unrelated param on submit (that is what a GET
// submit does), which is how the post-action callout params disappeared once
// you filtered. Both commit paths here merge onto the live searchParams
// instead, so NOTICE_PARAMS are dropped explicitly to preserve that behaviour —
// a stale "Ingreso registrado" banner must not outlive the filter change that
// scrolled it away.

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { serverNavCommit } from "@/lib/ui/filter-commit";

const DEBOUNCE_MS = 300;

/** One-shot post-action callout params (?nueva, ?foster…) — cleared on any filter change. */
const NOTICE_PARAMS = ["nueva", "foster", "fostend", "adopcion", "transferido"] as const;

const labelClass =
  "mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ln-op-mute";
const controlClass =
  "rounded-[var(--radius-sm)] border border-ln-op-line bg-ln-op-card px-3 py-[7px] text-sm text-ln-op-ink focus:outline-none focus:ring-2 focus:ring-ln-op-azul";

/** `current` + `updates`, minus the one-shot notice params. Pure — no hooks. */
function nextParams(current: string, updates: Record<string, string | null>): string {
  const params = new URLSearchParams(current);
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === "") params.delete(key);
    else params.set(key, value);
  }
  for (const key of NOTICE_PARAMS) params.delete(key);
  return params.toString();
}

export type OrgMascotasFilterBarProps = {
  /** Route the filters live on — also the "Limpiar filtros" reset target. */
  basePath: string;
  /** Current ?q= (already trimmed by the page). */
  query: string;
  /** Current raw ?species= ("", "dog", "cat", "other"). */
  species: string;
  /** Whether ?adoptionEligible=true is active. */
  adoptionEligible: boolean;
};

export function OrgMascotasFilterBar({
  basePath,
  query,
  species,
  adoptionEligible,
}: OrgMascotasFilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [text, setText] = useState(query);
  // The last ?q= THIS component committed. Lets the sync effect below tell our
  // own round-trip apart from an outside change (see its comment).
  const lastCommitted = useRef(query);

  /** Soft same-route commit — keeps the text input mounted and focused. */
  const commitQuery = useCallback(
    (trimmed: string) => {
      lastCommitted.current = trimmed;
      const qs = nextParams(searchParams.toString(), { q: trimmed || null });
      router.replace(qs ? `${basePath}?${qs}` : basePath, { scroll: false });
    },
    [router, searchParams, basePath],
  );

  /**
   * Hard commit for the discrete controls — the same primitive every gob/admin
   * filter control uses. `text` rides along so a still-debouncing query is
   * never lost by a select change that lands first.
   */
  function commitNow(updates: Record<string, string | null>) {
    serverNavCommit(searchParams.toString())({ q: text.trim() || null, ...updates }, NOTICE_PARAMS);
  }

  // Debounced query commit. The "already says this" guard is what keeps it from
  // looping: after a commit lands, searchParams changes, the effect re-runs, and
  // the typed text now MATCHES the URL, so nothing is scheduled. It also covers
  // the mount case (arriving on ?q=Rocky must not re-navigate to itself).
  useEffect(() => {
    const trimmed = text.trim();
    if (trimmed === (searchParams.get("q") ?? "")) return;
    const timer = setTimeout(() => commitQuery(trimmed), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, searchParams, commitQuery]);

  // Adopt a query that changed from OUTSIDE this component — "Limpiar filtros",
  // or a Back/Forward hop. Comparing against our own last commit (not against
  // `text`) is deliberate: a slow round-trip must never clobber characters typed
  // while it was in flight, which a naive `setText(query)` on every prop change
  // would do.
  useEffect(() => {
    if (query === lastCommitted.current) return;
    lastCommitted.current = query;
    setText(query);
  }, [query]);

  const hasActiveFilter = Boolean(species || query || adoptionEligible);

  return (
    <section aria-label="Filtros" className="flex flex-wrap gap-3 items-end">
      <div>
        <label htmlFor="filter-q" className={labelClass}>
          Buscar por nombre
        </label>
        <input
          id="filter-q"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter flushes the pending debounce instead of doing nothing —
            // there is no submit button left to press.
            if (e.key === "Enter") {
              e.preventDefault();
              commitQuery(text.trim());
            }
          }}
          placeholder="Ej. Rocky"
          className={controlClass}
        />
      </div>
      <div>
        <label htmlFor="filter-species" className={labelClass}>
          Especie
        </label>
        <select
          id="filter-species"
          value={species}
          onChange={(e) => commitNow({ species: e.target.value || null })}
          className={controlClass}
        >
          <option value="">Todas</option>
          <option value="dog">Perros</option>
          <option value="cat">Gatos</option>
          <option value="other">Otras</option>
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm text-ln-op-ink">
        <input
          type="checkbox"
          checked={adoptionEligible}
          onChange={(e) => commitNow({ adoptionEligible: e.target.checked ? "true" : null })}
          className="h-4 w-4 rounded border-ln-op-line text-ln-op-azul focus:ring-2 focus:ring-ln-op-azul"
        />
        Solo disponibles para adopción
      </label>
      {hasActiveFilter && (
        <Link href={basePath} className="text-sm text-ln-op-mute underline hover:text-ln-op-ink">
          Limpiar filtros
        </Link>
      )}
    </section>
  );
}
