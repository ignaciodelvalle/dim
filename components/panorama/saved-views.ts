// Named saved views / bookmarks for the panorama console (task #66b).
//
// "Copiar vista" already copies the full URL (which now encodes the COMPLETE view:
// layers / preset / period / level / province / camera / asOf). This adds NAMED
// bookmarks of that URL — save the current view under a name, then list / apply /
// delete it later. localStorage only (a client preference, exactly like the
// `panorama:board:v1` last-board memory) — no backend.
//
// The pure array transforms (upsert / remove / parse) are separated from the
// localStorage IO so the round-trip is unit-testable without a DOM.

/** localStorage key for the saved-views list. Distinct from `panorama:board:v1`
 * (the single last-board memory) — this is a user-managed named collection. */
export const SAVED_VIEWS_KEY = "panorama:views:v1";

/** Cap the list so a runaway save loop can't blow the localStorage quota. The
 * newest views are kept (upsert prepends); older ones fall off the end. */
export const MAX_SAVED_VIEWS = 24;

/** One saved view: a user-given name, the full URL it reproduces, and when saved. */
export type SavedView = { name: string; url: string; savedAt: number };

function isSavedView(v: unknown): v is SavedView {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as SavedView).name === "string" &&
    typeof (v as SavedView).url === "string" &&
    typeof (v as SavedView).savedAt === "number"
  );
}

/** Parse the persisted JSON into a validated list. Tolerates absent/corrupt data
 * (returns []) and drops any malformed entry. */
export function parseSavedViews(raw: string | null): SavedView[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(isSavedView);
  } catch {
    return [];
  }
}

/**
 * Upsert a view by NAME: a save under an existing name REPLACES it (and moves it
 * to the front as the newest), keeping the list de-duplicated. An empty/whitespace
 * name is ignored (returns the list unchanged) — the UI also guards this. The list
 * is capped at {@link MAX_SAVED_VIEWS}, newest first.
 */
export function upsertView(
  views: readonly SavedView[],
  name: string,
  url: string,
  now: number,
): SavedView[] {
  const trimmed = name.trim();
  if (trimmed.length === 0) return [...views];
  const without = views.filter((v) => v.name !== trimmed);
  return [{ name: trimmed, url, savedAt: now }, ...without].slice(0, MAX_SAVED_VIEWS);
}

/** Remove the view with the given (exact) name. */
export function removeView(views: readonly SavedView[], name: string): SavedView[] {
  return views.filter((v) => v.name !== name);
}

// --- localStorage IO (thin, SSR- and quota-tolerant) ------------------------

/** Read + parse the saved views from localStorage ([] when unavailable/corrupt). */
export function loadSavedViews(): SavedView[] {
  if (typeof window === "undefined") return [];
  try {
    return parseSavedViews(window.localStorage.getItem(SAVED_VIEWS_KEY));
  } catch {
    return [];
  }
}

/** Persist the saved views to localStorage (no-op when unavailable/quota-full). */
export function persistSavedViews(views: readonly SavedView[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(views));
  } catch {
    // Storage unavailable (private mode, quota) — the bookmark just isn't saved.
  }
}
