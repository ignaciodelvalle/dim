// DB-budget linter — CI guardrail (task #74 death-spiral regression armor).
//
// THE BUG CLASS THIS CATCHES ("unbudgeted heavy analytics call site"):
//   The Panorama console + executive dashboards fan out ~11 aggregate queries on
//   a shared micro DB. When the transaction pooler degrades, an UNBOUNDED DB call
//   HANGS indefinitely: the RSC stream truncates (skeletons forever) and abandoned
//   backends accumulate until the instance starves — the task #74 spiral. The fix
//   is that every heavy entry point bounds its DB work with a TIME budget so it
//   degrades honestly instead of hanging (src/modules/panorama/application/
//   db-budget.ts `withDbBudget`, or lib/analytics/analytics-load.ts
//   `loadWithTimeout`, or a cached/seed loader that itself wraps one of those).
//
// THE FIX (what makes a site pass this linter):
//   The heavy entry point must CALL a known budget wrapper (BUDGET_WRAPPERS).
//
// ---------------------------------------------------------------------------
// WHAT THE 2026-08-09 REVIEW FOUND WRONG WITH THE PREVIOUS VERSION (S8)
// ---------------------------------------------------------------------------
// This file used to certify a property it did not check. Three holes, all live:
//
//   1. `referencesBudgetWrapper` was `src.includes(w)` — a SUBSTRING, matching
//      anywhere: inside a comment, inside a dead import, inside prose. The file
//      that prompted the review, app/gob/perdidas/page.tsx, was GREEN while it
//      still had an unbounded `await` outside its budgeted block, because the
//      word "loadWithTimeout" appeared elsewhere in it. The check now requires
//      an actual CALL, in code, after comments and string literals are removed.
//
//   2. `listBudgetTargets()` did `DASHBOARD_PAGES.filter(p => globSync(p).length)`
//      — a registered path that got renamed or deleted fell OUT of the scan in
//      SILENCE. This file's own history records four relocations, so renaming is
//      the expected event and the fence's answer was to stop enforcing. A
//      missing registered path is now a hard failure.
//
//   3. The page list is hand-maintained, so the fence could never catch a NEW
//      heavy page — every finding it was meant to prevent had to be found by a
//      human first. There is now a DISCOVERY scan (see discoverFanOuts) that
//      flags any server component with a wide `Promise.all` fan-out and no
//      budget wrapper, ratcheted against scripts/db-budget-baseline.json.
//
// A fourth blind spot, found in the same review, is structural rather than a
// bug in this file: check-db-budget reads the PAGE, so an unbounded await living
// in a shared child component is invisible to it. That is exactly how the
// DashboardFreshnessFooter hung six pages this fence had just certified. The
// discovery scan covers components/ too, which closes the wide-fan-out half of
// it; a single unbounded await in a shared component is still not detectable by
// a regex linter and remains a job for review.
//
// SCOPE (registered heavy call sites — deliberately narrow, not the whole app):
//   - app/api/panorama/**/route.ts        — the console's per-layer / KPI / unit
//                                            fan-out route handlers
//   - DASHBOARD_PAGES below               — the enumerated dashboards
//   - plus whatever the discovery scan finds
//
// WHY A HARD FAIL (no baseline for the registered set): every registered site
// references a wrapper, so any new hit there is a real regression.
//
// Regex/string scan (not an AST analyzer) — matches the sibling linters
// (check-jurisdiction-subsumption.ts, check-authz-guards.ts).
//
// Run: pnpm tsx scripts/check-db-budget.ts   (or: pnpm lint:db-budget)

import { existsSync, globSync, readFileSync } from "node:fs";

// Budget-wrapper tokens. A heavy entry point is budgeted when its source CALLS
// one of these. Matching is prefix-based on the identifier, so
// `loadLayerFeaturesCached` also accepts its `…WithMeta` variant.
// `loadCachedPanoramaKpis` and `loadWithTimeout` are cached/deadline loaders
// that wrap withDbBudget / a timeout internally.
export const BUDGET_WRAPPERS = [
  "withDbBudget",
  "loadWithTimeout",
  "loadCachedPanoramaKpis",
  "loadLayerFeaturesCached",
  // Local wrapper over withDbBudget that also folds the rejection axis into a
  // Degraded marker — defined in app/admin/sistema/_components/sistema-sections
  // .tsx, which is itself registered and must call withDbBudget directly.
  "budgetedOrDegraded",
] as const;

// The dashboard pages scanned (specific paths, not a tree).
export const DASHBOARD_PAGES = [
  // WP3 decrowding (2026-08-15): the two panorama pages' seed/KPI fan-outs
  // (and their withDbBudget/loadCachedPanoramaKpis wrappers) relocated
  // byte-equivalent into the shared board builder, so the scan target moves
  // with it — the same relocation shape as the F8/F9 pairs below. The pages
  // themselves are now thin: guard + scope resolution + <PanoramaShell>.
  "lib/panorama/build-panorama-board.ts",
  "app/admin/programa/page.tsx",
  // D2 analytics pages (same shape as admin/programa — already wrapped with
  // loadWithTimeout today; enforced here so a future silent drop is caught).
  // F8 fusion (2026-07-22): app/admin/censo, app/admin/poblacion, app/gob/censo
  // and app/gob/poblacion's page.tsx are now thin redirect shims into the
  // Padrón hub — the heavy fan-out (and its loadWithTimeout wrapper) relocated
  // byte-identical into these Screen components, so the scan target moves
  // with it.
  "app/admin/censo/AdminCensoScreen.tsx",
  "app/admin/poblacion/AdminPoblacionScreen.tsx",
  "app/admin/inteligencia/page.tsx",
  // T3 platform budgets (2026-08-01): sistema got the streamed-shell treatment;
  // page.tsx calls the local budgetedOrDegraded wrapper, which sistema-sections
  // implements over withDbBudget, so both are real call sites.
  "app/admin/sistema/page.tsx",
  "app/admin/sistema/_components/sistema-sections.tsx",
  // Auditoría-hub merge (2026-08): /admin/historial folded in as the Actividad
  // vista, so page.tsx is now a thin hub that delegates; the bounded 8s fetch
  // group relocated into AuditoriaScreen.tsx — the scan target moves with it
  // (same relocation shape as the F8/F9 pairs above).
  //
  // DELIBERATELY NOT REGISTERED (2026-08-09): _lib/load-audit-data.ts and
  // inteligencia/inteligencia-panels.tsx. Both were on this list and both
  // passed only because the word "loadWithTimeout" appeared in their header
  // comments — neither ever called a wrapper, because neither is where the
  // budget belongs. load-audit-data is the inner loader that AuditoriaScreen
  // (registered, above) races; inteligencia-panels only awaits promises
  // page.tsx (registered) already wrapped. Listing a delegating file was the
  // substring illusion in its purest form: the fence reported enforcement on a
  // file that structurally cannot satisfy the rule.
  "app/admin/auditoria/AuditoriaScreen.tsx",
  "app/gob/programa/ProgramaResumenScreen.tsx",
  "app/gob/censo/CensoScreen.tsx",
  "app/gob/poblacion/PoblacionScreen.tsx",
  // DB2 resilience finding: heavy multi-query fan-outs with no time budget —
  // wrapped with loadWithTimeout in the same pass that added this line.
  // F9 (2026-08-01): same relocation as the F8 pair above — app/gob/analytics/
  // page.tsx and app/gob/programa/page.tsx are now thin shims (a redirect and a
  // hub), so the scan targets moved to the Screen components that kept the
  // fan-out.
  "app/gob/analytics/AnalyticsScreen.tsx",
  "app/gob/page.tsx",
  "app/gob/vigilancia/page.tsx",
  // G5 (obligations-worklist, 2026-08): /gob/acciones' 3-domain parallel
  // fan-out (observaciones + denuncias + casos). The withDbBudget wrapping
  // lives in the loader module, not the page, so that is the scan target.
  "app/gob/acciones/_lib/worklist-io.ts",
  // Staging outage 2026-08-09. A Postgres upgrade killed pooler connections
  // (57P01) and four unbounded fan-outs turned a degraded DB into dead pages.
  // Registered in the SAME pass that wrapped them, per this file's own rule —
  // the previous pass wrote that sentence and this one nearly repeated the
  // omission instead: the wraps were committed without the ratchet, so a
  // future refactor could have dropped them with CI still green.
  //
  // CampanasScreen + AlcanceScreen are the two halves of /gob/operativos; with
  // neither bounded that hub had no fallback at all, and because they hang
  // inside Suspense rather than throwing, nothing reached the error logs.
  "app/gob/denuncias/page.tsx",
  "app/gob/reglas/page.tsx",
  "app/gob/campanas/CampanasScreen.tsx",
  "app/gob/outreach/AlcanceScreen.tsx",
  // Second review pass, same outage. admin/layout.tsx awaits its nav-badge
  // counts in the LAYOUT of every /admin/* route: its .catch guards a
  // rejection, and a degraded pooler hangs instead — with no error boundary,
  // because Next does not wrap a segment's own layout in its sibling error.tsx.
  // MaltratoQueueScreen is the Triage tab body inside /gob/denuncias: the pass
  // above bounded that hub's badges and left the surface an operator actually
  // works in unbounded, which is worse than fixing neither.
  "app/admin/layout.tsx",
  "app/gob/maltrato/MaltratoQueueScreen.tsx",
  // The remaining eight the second review named. Same outage, same rule:
  // registered in the pass that wrapped them. gob/perdidas was the worst of the
  // set — four SEQUENTIAL awaits, so its latencies added; that serialization was
  // itself corrected in the pass below. gob/sistema and vigilancia/brotes are
  // the twins of pages already in this list: /admin/sistema was enforced and its
  // gob counterpart was not, and /gob/vigilancia bounds the same fetcher its own
  // sub-route left bare.
  "app/gob/perdidas/page.tsx",
  "app/gob/adopciones/page.tsx",
  "app/gob/mortalidad/page.tsx",
  "app/gob/casos/CasosScreen.tsx",
  "app/gob/decomisos/page.tsx",
  "app/gob/sistema/page.tsx",
  "app/gob/vigilancia/brotes/page.tsx",
  "app/admin/page.tsx",
  // Third pass (2026-08-09), from the handoff the second one wrote. The theme
  // is that the portal was fixed and everything AROUND it was not: the admin
  // twin of an already-wrapped gob page, the citizen's own home screen, the
  // public listing, and the whole org portal.
  //
  // admin/adopciones is the third consecutive time the TWIN is what escaped —
  // which is the reason the discovery scan below now exists.
  "app/admin/adopciones/page.tsx",
  "app/(app)/mis-mascotas/page.tsx",
  "app/(public)/perdidas/page.tsx",
  "app/org/[orgToken]/page.tsx",
  "app/org/[orgToken]/mascotas/page.tsx",
  "app/org/[orgToken]/checkins/page.tsx",
  // Found by the DISCOVERY scan below, not by a human — the first four sites
  // this fence located on its own. The two /gob export routes are the sharpest
  // illustration of what the hand-maintained list could never see: both run the
  // SAME aggregates as a page that had been bounded since the outage pass, and
  // both are reached from that page's own "Exportar CSV" button.
  //
  // Registered as well as discovered so the requirement survives a refactor
  // that drops the fan-out below the discovery threshold.
  "app/(app)/mis-mascotas/[publicToken]/page.tsx",
  "app/(public)/p/[publicToken]/CredentialStreamedSections.tsx",
  "app/gob/adopciones/export/route.ts",
  "app/gob/poblacion/export/route.ts",
  // Shared child components whose own await hangs the pages that mount them.
  // DashboardFreshnessFooter is the case that proved the blind spot: it is the
  // last child of ~21 dashboards, and while it was unbounded it hung six pages
  // whose own fan-outs this fence had already certified as budgeted.
  "components/ui/dashboard/DashboardFreshnessFooter.tsx",
] as const;

// The route-handler globs scanned.
//
// `app/api/v1/**` joined on 2026-08-21 with the first `/api/v1` endpoint, and
// it is registered for the SCOPE, not because the endpoint fans out today.
// `GET /api/v1/pets/{token}/credential` delegates its reads to
// `lookupPublicCredential`, which bounds both of them itself — but the handler
// also does its OWN bounded DB write (the per-lookup rate limiter), and the
// next `/api/v1` read will be tempted to add a query beside the use-case call
// rather than inside it. Registering the glob at ONE route costs one line;
// registering it after five routes costs an audit of all five, which is the
// same argument D4 used to widen check-authz-guards before the first endpoint
// landed rather than after.
export const ROUTE_GLOBS = ["app/api/panorama/**/route.ts", "app/api/v1/**/route.ts"] as const;

// ---------------------------------------------------------------------------
// Source scanning
// ---------------------------------------------------------------------------

/**
 * Remove comments and string/template literal CONTENTS from `src`, preserving
 * offsets is not required — only that identifiers left behind are real code.
 *
 * This is what makes the wrapper check honest: before it, a budget wrapper
 * named in a doc comment (or in an import that nothing calls) was enough to
 * pass. Written as a small state machine rather than a regex because a regex
 * that strips `//` comments also eats the tail of any line containing a URL,
 * which would delete real call sites and fail the build for no reason.
 */
/** Index just past a line comment beginning at `i`. */
function skipLineComment(src: string, i: number): number {
  let j = i;
  while (j < src.length && src[j] !== "\n") j++;
  return j;
}

/** Index just past a block comment beginning at `i`. */
function skipBlockComment(src: string, i: number): number {
  let j = i + 2;
  while (j < src.length && !(src[j] === "*" && src[j + 1] === "/")) j++;
  return j + 2;
}

/** Copy a template literal's `${…}` verbatim — it holds real code. */
function readTemplateExpression(src: string, i: number): { i: number; text: string } {
  let depth = 1;
  let text = "${";
  let j = i + 2;
  while (j < src.length && depth > 0) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") depth--;
    if (depth > 0) text += src[j];
    j++;
  }
  return { i: j, text: `${text}}` };
}

/**
 * Read a string / template literal, keeping the delimiters and any `${…}`
 * interpolation but dropping the inert contents, so an identifier merely named
 * inside a string can never satisfy the wrapper check.
 *
 * KNOWN LIMIT: regex literals are not tokenized, so a quote character inside
 * one (`/[^"]/`) is read as the start of a string and swallows source until the
 * next matching quote. This is a scanner, not a parser. The failure mode is
 * loud rather than silent — a swallowed wrapper call turns a compliant file
 * RED, which someone then investigates — and no file in the tree trips it
 * today. If one ever does, quote the pattern (`new RegExp("[^\\"]")`) or teach
 * this function about regex literals; do NOT relax the check to make it green.
 */
function readStringLiteral(src: string, i: number): { i: number; text: string } {
  const quote = src[i];
  let text = quote;
  let j = i + 1;
  while (j < src.length && src[j] !== quote) {
    if (src[j] === "\\") {
      j += 2;
    } else if (quote === "`" && src[j] === "$" && src[j + 1] === "{") {
      const expr = readTemplateExpression(src, j);
      text += expr.text;
      j = expr.i;
    } else {
      j++;
    }
  }
  return { i: j + 1, text: text + quote };
}

/**
 * True when a `/` at `i` opens a REGEX literal rather than being division.
 *
 * Decided by the previous significant character: a regex may only start where
 * an expression may start. After an identifier, a number, or a closing
 * bracket, `/` is division.
 */
function startsRegexLiteral(src: string, i: number): boolean {
  // Allow-list, not deny-list. A deny-list has to enumerate every JSX shape —
  // `</Foo>`, `<div />`, `<Foo {...p} />`, and the common Prettier output
  // `<div\n  className="x"\n/>` where the slash follows a QUOTE. Missing any one
  // of them makes the stripper swallow the rest of the file. Listing where an
  // expression may legally begin is a closed set and cannot drift that way.
  let j = i - 1;
  while (j >= 0 && /\s/.test(src[j])) j--;
  if (j < 0) return true;
  const prev = src[j];
  if (/[(,=:[!&|?;{+\-*%^~]/.test(prev)) return true;
  // `return /re/`, `typeof /re/` — a keyword ends in a word character but is
  // still an expression position.
  const word = /([A-Za-z$_][\w$]*)$/.exec(src.slice(0, j + 1))?.[1];
  return word !== undefined && REGEX_PRECEDING_KEYWORDS.has(word);
}

const REGEX_PRECEDING_KEYWORDS = new Set([
  "return",
  "typeof",
  "instanceof",
  "in",
  "of",
  "new",
  "delete",
  "void",
  "case",
  "do",
  "else",
  "yield",
  "await",
]);

/** Consumes a regex literal including its flags. */
function readRegexLiteral(src: string, i: number): number {
  let j = i + 1;
  let inClass = false;
  while (j < src.length) {
    const c = src[j];
    if (c === "\\") {
      j += 2;
      continue;
    }
    if (c === "[") inClass = true;
    else if (c === "]") inClass = false;
    else if (c === "/" && !inClass) {
      j++;
      break;
    } else if (c === "\n") break;
    j++;
  }
  while (j < src.length && /[dgimsuvy]/.test(src[j])) j++;
  return j;
}

export function stripNonCode(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (c === "/" && next === "/") {
      i = skipLineComment(src, i);
    } else if (c === "/" && next === "*") {
      i = skipBlockComment(src, i);
    } else if (c === "/" && startsRegexLiteral(src, i)) {
      // FIXED 2026-08-09. Regex literals were not tokenized, so the quote in
      // `.replace(/"/g, "&quot;")` was read as the START of a string and the
      // scanner swallowed real code up to the next quote. Ten files in the tree
      // hit this, four of them inside the discovery globs. In the wrapper check
      // the failure is loud (a compliant file turns red); in the DISCOVERY scan
      // it is SILENT — a swallowed `Promise.all([` makes an unbounded fan-out
      // invisible, which is the exact opposite of what the scan exists for.
      // The old docstring asserted no such file existed. It did.
      const end = readRegexLiteral(src, i);
      out += " ".repeat(end - i);
      i = end;
    } else if (c === '"' || c === "'" || c === "`") {
      const literal = readStringLiteral(src, i);
      out += literal.text;
      i = literal.i;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/**
 * True when `src` CALLS at least one known budget wrapper.
 *
 * Prefix match on the identifier (`loadLayerFeaturesCached` accepts
 * `loadLayerFeaturesCachedWithMeta`) followed by an opening paren. An import
 * of a wrapper that is never called does NOT pass — that was hole #1.
 */
export function referencesBudgetWrapper(src: string): boolean {
  const code = stripNonCode(src);
  // `(?:<…>)?` allows an explicit type argument list between the identifier and
  // the call — `withDbBudget<WorklistItem[] | null>(…)` is a real call site and
  // two registered modules write it that way.
  return BUDGET_WRAPPERS.some((w) => new RegExp(`\\b${w}\\w*\\s*(?:<[^()]*?>)?\\s*\\(`).test(code));
}

/** Registered dashboard paths that no longer exist on disk. */
export function missingRegisteredPages(): string[] {
  return DASHBOARD_PAGES.filter((p) => !existsSync(p));
}

// The full set of heavy call sites this linter covers.
export function listBudgetTargets(): string[] {
  const routes = ROUTE_GLOBS.flatMap((p) => globSync(p)).map((f) => f.replaceAll("\\", "/"));
  const pages = DASHBOARD_PAGES.filter((p) => existsSync(p));
  return [...new Set([...routes, ...pages])].filter((f) => !f.includes(".test.")).sort();
}

/** Returns one offender path per heavy call site missing a budget wrapper. */
export function scanAll(): string[] {
  const offenders: string[] = [];
  for (const file of listBudgetTargets()) {
    if (!referencesBudgetWrapper(readFileSync(file, "utf8"))) offenders.push(file);
  }
  return offenders;
}

// ---------------------------------------------------------------------------
// Discovery scan — catch heavy pages nobody registered (hole #3)
// ---------------------------------------------------------------------------

/** A `Promise.all([...])` with at least this many elements counts as a fan-out. */
export const FANOUT_THRESHOLD = 4;

const DISCOVERY_GLOBS = ["app/**/*.tsx", "app/**/*.ts", "components/**/*.tsx"] as const;

/**
 * Widest `Promise.all([ … ])` array literal in `src`, measured in top-level
 * elements. Returns 0 when the file has none.
 *
 * Counts commas at array depth 1, so nested calls/arrays/objects inside an
 * element do not inflate the count, and `Promise.all(xs.map(f))` — a single
 * expression, not an array literal — scores 0 rather than being guessed at.
 */
/** Top-level element count of the array literal whose contents start at `start`. */
function countArrayElements(code: string, start: number): number {
  let i = start;
  let depth = 1;
  let commas = 0;
  let sawContent = false;
  while (i < code.length && depth > 0) {
    const c = code[i];
    if (c === "[" || c === "(" || c === "{") depth++;
    else if (c === "]" || c === ")" || c === "}") depth--;
    else if (c === "," && depth === 1) commas++;
    else if (depth === 1 && !/\s/.test(c)) sawContent = true;
    i++;
  }
  if (!sawContent) return 0;
  // A trailing comma would otherwise inflate the count by one.
  const hasTrailingComma = /,\s*\]\s*$/.test(code.slice(start, i));
  return commas + (hasTrailingComma ? 0 : 1);
}

export function widestFanOut(src: string): number {
  const code = stripNonCode(src);
  let widest = 0;
  // `allSettled` is not an afterthought here — it is what this repo's own
  // convention PRESCRIBES for dashboard fan-outs ("NEVER-CRASH FAN-OUT: use
  // Promise.allSettled — NOT Promise.all", get-panorama-kpis.ts). Matching only
  // `Promise.all(` meant a new dashboard that followed the house rule was
  // invisible to the one lane that exists to catch heavy pages nobody
  // registered. Added 2026-08-09; no live instance inside the discovery globs.
  const re = /Promise\.(?:all|allSettled)\s*\(\s*\[/g;
  let m = re.exec(code);
  while (m !== null) {
    widest = Math.max(widest, countArrayElements(code, m.index + m[0].length));
    m = re.exec(code);
  }
  return widest;
}

/**
 * Server components with a wide fan-out and no budget wrapper.
 *
 * Client components are skipped: their work runs in the browser, so a slow
 * query there cannot starve the server the way an RSC await does.
 */
export function discoverFanOuts(): { file: string; elements: number }[] {
  const registered = new Set<string>(listBudgetTargets());
  const found: { file: string; elements: number }[] = [];
  const seen = new Set<string>();
  for (const glob of DISCOVERY_GLOBS) {
    for (const raw of globSync(glob)) {
      const file = raw.replaceAll("\\", "/");
      if (seen.has(file)) continue;
      seen.add(file);
      if (registered.has(file)) continue;
      if (file.includes(".test.") || file.includes("__tests__/")) continue;
      const src = readFileSync(file, "utf8");
      if (/^\s*["']use client["']/m.test(src)) continue;
      const elements = widestFanOut(src);
      if (elements < FANOUT_THRESHOLD) continue;
      if (referencesBudgetWrapper(src)) continue;
      found.push({ file, elements });
    }
  }
  return found.sort((a, b) => a.file.localeCompare(b.file));
}

const BASELINE_PATH = "scripts/db-budget-baseline.json";

/** Fan-outs accepted as pre-existing. Ratchet only — the list may shrink. */
export function readBaseline(): string[] {
  if (!existsSync(BASELINE_PATH)) return [];
  return JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as string[];
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function runScan(): void {
  let failed = false;

  // (2) A registered path that vanished used to be dropped in silence.
  const missing = missingRegisteredPages();
  if (missing.length > 0) {
    console.error(
      `✗ ${missing.length} registered heavy call site(s) no longer exist. A rename must MOVE the entry in DASHBOARD_PAGES, not drop enforcement:`,
    );
    for (const m of missing) console.error(`    ${m}`);
    failed = true;
  }

  const targets = listBudgetTargets();
  if (targets.length === 0) {
    console.error("✗ check-db-budget: found no heavy analytics call sites to scan.");
    process.exit(1);
  }

  // (1) Registered sites must CALL a wrapper.
  const offenders = scanAll();
  if (offenders.length > 0) {
    console.error(
      `✗ ${offenders.length} registered heavy call site(s) call the DB with NO budget wrapper (${BUDGET_WRAPPERS.join("/")}). An unbounded fan-out HANGS when the transaction pooler degrades (task #74 death spiral):`,
    );
    for (const o of offenders) console.error(`    ${o}`);
    failed = true;
  }

  // (3) Anything heavy that nobody registered.
  const baseline = new Set(readBaseline());
  const discovered = discoverFanOuts();
  const fresh = discovered.filter((d) => !baseline.has(d.file));
  if (fresh.length > 0) {
    console.error(
      `✗ ${fresh.length} UNREGISTERED server component(s) fan out ${FANOUT_THRESHOLD}+ concurrent calls with no budget wrapper:`,
    );
    for (const d of fresh) console.error(`    ${d.file}  (${d.elements} concurrent)`);
    console.error(
      `\nEither bound the fan-out, or — if it genuinely touches no DB — add the path to ${BASELINE_PATH}.`,
    );
    failed = true;
  }
  // The baseline may only shrink. A stale entry means someone fixed a file and
  // left the exemption behind, which is how a ratchet quietly stops ratcheting.
  const stillOffending = new Set(discovered.map((d) => d.file));
  const staleBaseline = [...baseline].filter((f) => !stillOffending.has(f));
  if (staleBaseline.length > 0) {
    console.error(
      `✗ ${staleBaseline.length} stale entr(y/ies) in ${BASELINE_PATH} — these no longer offend and must be removed so the ratchet keeps its grip:`,
    );
    for (const s of staleBaseline) console.error(`    ${s}`);
    failed = true;
  }

  if (failed) {
    console.error(
      "\nBound the DB work with withDbBudget (src/modules/panorama/application/db-budget.ts) or loadWithTimeout (lib/analytics/analytics-load.ts), or route through a cached/seed loader that wraps one of those.",
    );
    process.exit(1);
  }

  console.log(
    `✓ db-budget clean — ${targets.length} registered heavy call site(s) CALL a budget wrapper (${BUDGET_WRAPPERS.join("/")}); discovery scan found no new unbounded fan-out (${baseline.size} baselined).`,
  );
}

const isMain =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("check-db-budget.ts") ||
    process.argv[1].endsWith("check-db-budget.js") ||
    import.meta.url === `file:///${process.argv[1].replaceAll("\\", "/")}`);

if (isMain) {
  runScan();
}
