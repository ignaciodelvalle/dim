// Types for the raw-<button> ratchet, which is authored as .mjs so `node` can
// run it directly in CI without a TypeScript loader. `allowJs` is false in
// tsconfig, so a test importing it needs this declaration.

/** Count literal `<button` tag opens in `src`, ignoring comments. */
export function countRawButtons(src: string): number;

/** Every untokenized radius utility (e.g. `rounded-[6px]`) sitting on a raw
 *  `<button` / `<a` opening tag in `src`, ignoring comments. */
export function findUntokenizedButtonRadii(src: string): string[];
