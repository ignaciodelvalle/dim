/**
 * The ONE place this app loads maplibre-gl, so the worker URL is set once.
 *
 * WHY A LOADER AND NOT FOUR IMPORTS. maplibre-gl 6 resolves its worker at
 * runtime through `import.meta.url`, a form no bundler detects statically, so
 * webpack emits no asset for it — verified on this tree with a clean build.
 * The fetch that follows does not 404: Next answers the app's own HTML with a
 * 200, the worker starts, tries to run HTML as JavaScript, and dies silently.
 * The map then draws nothing while reporting every layer and source registered
 * and zero features in all of them. `setWorkerUrl` has to run BEFORE the first
 * `new Map()`, and "before" is only enforceable from a single door.
 *
 * WHY MEMOISED, and this repo has paid for it once already: a per-call
 * `await import()` of a module under test drops one of two concurrent callers
 * (see the vitest dynamic-import race). `LocationPicker` alone calls this twice
 * — once for the map, once for the marker — so concurrent callers are the
 * normal case here, not the edge one. One promise, shared.
 *
 * WHY THE URL IS A CONSTANT rather than computed: it is served from `public/`
 * by `scripts/copy-maplibre-worker.mjs`, which the build regenerates and
 * `scripts/check-maplibre-worker.ts` verifies byte-for-byte against the
 * installed package. Same origin, so the app's `worker-src 'self'` covers it
 * without the blob: laundering v5 needed.
 */
import type * as MapLibre from "maplibre-gl";

/**
 * Same-origin, and the path is shared with the copy script and its fence — if
 * these three ever disagree the map goes quiet again, so they are checked
 * against each other rather than kept in step by hand.
 */
export const MAPLIBRE_WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";

let loading: Promise<typeof MapLibre> | null = null;

/**
 * maplibre-gl, with its worker pointed somewhere that exists.
 *
 * v6 is ESM-only and has no default export: the module namespace itself carries
 * `Map`, `Marker` and the rest, which is why this returns the namespace.
 */
export function loadMapLibre(): Promise<typeof MapLibre> {
  loading ??= import("maplibre-gl").then((maplibregl) => {
    maplibregl.setWorkerUrl(MAPLIBRE_WORKER_URL);
    return maplibregl;
  });
  return loading;
}

/** Test seam: forget the memoised module so a suite can re-exercise the load. */
export function resetMapLibreLoaderForTests(): void {
  loading = null;
}
