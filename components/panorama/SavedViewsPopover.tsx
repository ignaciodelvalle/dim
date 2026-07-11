"use client";

// SavedViewsPopover — named bookmarks for the panorama console (task #66b).
//
// Sits in the map's briefing chrome next to "Copiar vista". The copy button
// already yields the full, reproducible view URL; this lets the operator NAME and
// keep those views: save the current URL under a name, then list / apply / delete.
// localStorage only (client preference, no backend). Applying a view navigates to
// its stored URL via window.location.assign — a full reload faithfully reproduces
// every part of the view (scope/period re-seed server-side; layers/preset/camera/
// asOf are read from the URL on mount), the reciprocal of "Copiar vista".
//
// English identifiers, es-AR user copy (project invariant #4).

import { useCallback, useEffect, useId, useRef, useState } from "react";

import {
  type SavedView,
  loadSavedViews,
  persistSavedViews,
  removeView,
  upsertView,
} from "@/components/panorama/saved-views";

// v2C light chrome (dark skin retired) — matches the sibling briefing actions.
const CHROME_BTN =
  "rounded-[var(--radius-sm)] border border-ln-op-line bg-ln-op-card px-2.5 py-1 text-xs font-medium text-ln-op-ink-2 hover:bg-ln-op-stripe";

export function SavedViewsPopover() {
  const [open, setOpen] = useState(false);
  const [views, setViews] = useState<SavedView[]>([]);
  const [name, setName] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();

  // Load the saved views on mount (client-only; localStorage) and whenever the
  // popover opens (it may have changed in another tab/session).
  useEffect(() => {
    if (open) setViews(loadSavedViews());
  }, [open]);

  // Close on Escape or an outside click while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const saveCurrent = useCallback(() => {
    if (typeof window === "undefined") return;
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    const next = upsertView(loadSavedViews(), trimmed, window.location.href, Date.now());
    persistSavedViews(next);
    setViews(next);
    setName("");
  }, [name]);

  const applyView = useCallback((url: string) => {
    if (typeof window === "undefined") return;
    window.location.assign(url);
  }, []);

  const deleteView = useCallback((viewName: string) => {
    const next = removeView(loadSavedViews(), viewName);
    persistSavedViews(next);
    setViews(next);
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={CHROME_BTN}
      >
        Vistas guardadas
      </button>
      {open && (
        // The trigger's aria-controls + aria-expanded establish this region; its
        // controls are individually labelled, so the container needs no role.
        <div
          id={panelId}
          className="absolute right-0 top-full mt-2 z-30 w-64 space-y-2 rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card p-2 text-ln-op-ink-2 shadow-lg"
        >
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveCurrent();
              }}
              placeholder="Nombre de la vista"
              aria-label="Nombre de la vista a guardar"
              className="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-ln-op-line bg-ln-op-card px-2 py-1 text-xs text-ln-op-ink placeholder:text-ln-op-faint focus:border-ln-op-azul focus:outline-none"
            />
            <button
              type="button"
              onClick={saveCurrent}
              disabled={name.trim().length === 0}
              className="shrink-0 rounded-[var(--radius-sm)] border border-ln-op-line bg-ln-op-stripe px-2 py-1 text-xs font-medium text-ln-op-ink-2 hover:bg-ln-op-line/60 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Guardar
            </button>
          </div>
          {views.length === 0 ? (
            <p className="px-1 py-1 text-xs text-ln-op-mute">
              Guardá la vista actual (capas, período, alcance, cámara) con un nombre para volver más
              tarde.
            </p>
          ) : (
            <ul className="max-h-56 space-y-0.5 overflow-y-auto">
              {views.map((v) => (
                <li key={v.name} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => applyView(v.url)}
                    className="min-w-0 flex-1 truncate rounded-[var(--radius-sm)] px-2 py-1 text-left text-xs text-ln-op-ink hover:bg-ln-op-stripe"
                    title={`Aplicar "${v.name}"`}
                  >
                    {v.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteView(v.name)}
                    aria-label={`Eliminar la vista ${v.name}`}
                    className="shrink-0 rounded-[var(--radius-sm)] px-1.5 py-1 text-xs text-ln-op-mute hover:bg-ln-op-stripe hover:text-ln-op-ink"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
