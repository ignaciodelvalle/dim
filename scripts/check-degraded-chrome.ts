// ---------------------------------------------------------------------------
// check-degraded-chrome — a degraded page must keep the chrome that did not fail
// ---------------------------------------------------------------------------
//
// THE INVARIANT
//
// A server component that wraps a DB load in a budget wrapper gets a degraded
// branch:
//
//     const load = await withDbBudget(...);
//     if (!load.ok) return <div>{header}<AnalyticsLoadFallback … /></div>;
//
// Whatever that branch drops, the operator loses. The bug shape is dropping
// chrome that does NOT depend on the failed load — the ScreenHeader, the filter
// bar, the primary CTA, the breadcrumbs. The result is a page with no title, no
// way to narrow the very query that just timed out, and no way to do the one
// thing that still works.
//
// WHY THIS FENCE EXISTS
//
// Ten screens had the shape wrong on 2026-08-09. All were fixed BY HAND, and
// `docs/reviews/2026-08-09-pendientes-resiliencia.md` (S5) says plainly: "Nada
// prueba hoy que una página nueva conserve su barra de filtros al degradar —
// está verificado leyendo, no por un test."
//
// A hand sweep is not a fence, and this one proved it: prototyping this
// detector against the tree found SIX more live violations the sweep missed
// (app/gob/page.tsx, app/gob/analytics, app/gob/vigilancia, app/admin/censo,
// app/admin/poblacion, app/admin/programa — every one of them an OpFilterBar
// that depends on nothing). That is "el gemelo se escapa", the most-repeated
// finding category in this repo.
//
// FOUR DESIGN DECISIONS, AND WHY
//
// 1. THE ANCHOR IS THE BUDGET-WRAPPER BINDING, not <AnalyticsLoadFallback>.
//    Anchoring on the fallback finds 30 branches; anchoring on the binding
//    finds 32, and the two extra are pages that degrade with a panel of their
//    own. It also excludes auth/capability early returns (`if (!access.ok)`,
//    `if (!hasAnalyticsRead)`) BY CONSTRUCTION rather than by allowlist —
//    `access` is not bound to a budget wrapper, so it never enters scope.
//
//    BUDGET_WRAPPERS and stripNonCode are IMPORTED from check-db-budget.ts, not
//    copied. A duplicated list is how two fences start disagreeing in silence.
//
// 2. TAINT ANALYSIS IS THE FENCE. Missing chrome is legitimate exactly when it
//    depends on the value that failed: `<CsvExportLink rows={sortedSummary…}>`
//    where `sortedSummary` came from `load.value` SHOULD be absent — offering a
//    download of nothing lies. `<OpFilterBar period={…} jurisdiction={…}>`,
//    resolved before the await, must survive. Without taint, 3 of 9 findings are
//    born into the baseline and the baseline becomes where the next bug hides.
//
// 3. THE BASELINE IS A SET OF (file, component, chrome) TRIPLES, NOT A COUNT.
//    This is what a count cannot do: if `perdidas` also stops hoisting its
//    OpFilterBar tomorrow, that key is not in its list and the check goes red —
//    even though the repo-wide total never moved. No line numbers (line drift
//    broke the scope-discipline baseline three times). Fails in BOTH
//    directions: a baselined entry that no longer offends is an error, and a
//    baselined file that no longer exists on disk is a hard failure.
//
// 4. HARD FLOOR ON BRANCHES INSPECTED. Rename a wrapper and the anchor stops
//    matching; without a floor this prints "clean" having judged nothing. Three
//    fences did exactly that this week. MIN_DEGRADED_BRANCHES is the same
//    correction check-view-scope.ts got, applied before the fact.
//
// USAGE
//   pnpm lint:degraded-chrome
//   pnpm exec tsx scripts/check-degraded-chrome.ts --write-baseline

import { existsSync, globSync, readFileSync, writeFileSync } from "node:fs";

import { BUDGET_WRAPPERS, stripNonCode } from "./check-db-budget";

export const SCANNED_GLOBS = ["app/**/*.tsx"] as const;

const BASELINE_FILE = "scripts/degraded-chrome-baseline.json";

/**
 * Measured 2026-08-10: 32 degraded branches across app/**. The floor sits below
 * that with room for a refactor, but far enough above zero that a broken anchor
 * cannot masquerade as a clean tree.
 */
export const MIN_DEGRADED_BRANCHES = 25;

// ---------------------------------------------------------------------------
// Chrome vocabulary — computed, never hardcoded
// ---------------------------------------------------------------------------
//
// Hardcoding the list is the mistake this repo already made with
// DASHBOARD_PAGES: a literal list silently stops covering what it names. Two
// layers, both derived at scan time:
//
//   (a) the design system, read from components/ui/dashboard/index.ts
//   (b) chrome local to the scanned file, read from ITS imports, by suffix
//
// A new OpXFilterBar enters scope on its own.

const DESIGN_SYSTEM_INDEX = "components/ui/dashboard/index.ts";

/**
 * Design-system exports that are page chrome.
 *
 * OpSortHeader is deliberately NOT here. It is a `<thead>` cell, not page
 * chrome: it cannot outlive the table whose rows failed to load, so demanding
 * it survive a degrade is asking for a column header over nothing. The rule of
 * thumb this encodes — chrome is what frames the data; furniture is what is
 * made of it.
 */
const DS_CHROME_RE =
  /(?:ScreenHeader|ViewScopeCaption|SavedViewsControl|OpOmnibox)$|(?:Crumbs|Breadcrumbs|FilterBar|FilterFields)$/;

/** Local components that are page chrome, by naming convention. */
const LOCAL_CHROME_RE =
  /(?:FilterBar|FilterFields|FilterChips|SearchInput|SearchField|Breadcrumbs|Crumbs|PageHeader)$/;

/**
 * Components that emit an <h1> themselves. A degraded branch rendering one of
 * these satisfies the heading requirement — demanding a literal <h1> alongside
 * would turn the canonical screen red.
 */
const HEADING_COMPONENTS = new Set(["ScreenHeader", "PageHeader"]);

export function designSystemChrome(): Set<string> {
  const out = new Set<string>();
  if (!existsSync(DESIGN_SYSTEM_INDEX)) return out;
  const src = stripNonCode(readFileSync(DESIGN_SYSTEM_INDEX, "utf8"));
  for (const m of src.matchAll(/\b([A-Z][A-Za-z0-9_]*)\b/g)) {
    if (DS_CHROME_RE.test(m[1])) out.add(m[1]);
  }
  return out;
}

/** Chrome identifiers imported by one file, by naming convention. */
export function localChrome(src: string): Set<string> {
  const out = new Set<string>();
  for (const m of src.matchAll(/^\s*import\s+(?:type\s+)?\{([^}]*)\}\s+from/gm)) {
    for (const raw of m[1].split(",")) {
      const name = raw
        .trim()
        .split(/\s+as\s+/)
        .pop()
        ?.trim();
      if (name && LOCAL_CHROME_RE.test(name)) out.add(name);
    }
  }
  for (const m of src.matchAll(/^\s*import\s+([A-Z][A-Za-z0-9_]*)\s+from/gm)) {
    if (LOCAL_CHROME_RE.test(m[1])) out.add(m[1]);
  }
  return out;
}

export function chromeVocabulary(src: string, dsChrome: Set<string>): Set<string> {
  const out = new Set(dsChrome);
  for (const name of localChrome(src)) out.add(name);
  return out;
}

// ---------------------------------------------------------------------------
// Source shredding
// ---------------------------------------------------------------------------

/** Index just past the balanced closer for the opener at `start`. */
export function balancedEnd(src: string, start: number, open: string, close: string): number {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === open) depth += 1;
    else if (src[i] === close) {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

const BINDING_RE = new RegExp(
  `\\b(?:const|let)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*(?:await\\s+)?(?:${BUDGET_WRAPPERS.join("|")})\\w*\\s*(?:<[^()]*?>)?\\s*\\(`,
  "g",
);

/** Names bound to the result of a budget wrapper. */
export function budgetBindings(code: string): string[] {
  return [...code.matchAll(BINDING_RE)].map((m) => m[1]);
}

export type DegradedBranch = {
  binding: string;
  /** Source of the `if (!X.ok) { … }` body, including any single-statement return. */
  body: string;
  /** Source of everything after the branch — the success path. */
  after: string;
  at: number;
};

/** Every `if (!X.ok) …` where X is bound to a budget wrapper. */
export function degradedBranches(code: string): DegradedBranch[] {
  const out: DegradedBranch[] = [];
  for (const binding of budgetBindings(code)) {
    // No `re.exec` guard here: exec advances lastIndex on a /g regex, and
    // matchAll resumes from it — the guard would consume the only match and
    // then find none. Cost me the first run of this fence; the floor caught it.
    const re = new RegExp(`if\\s*\\(\\s*!\\s*${binding}\\.ok\\s*\\)\\s*`, "g");
    for (const m of code.matchAll(re)) {
      const bodyStart = m.index + m[0].length;
      const opener = code[bodyStart];
      let bodyEnd: number;
      if (opener === "{") {
        bodyEnd = balancedEnd(code, bodyStart, "{", "}");
      } else {
        // Single-statement body — `return (<jsx/>);` but also, and this is the
        // one that bit me, `return degradedPanel(load.reason);`. Taking only the
        // balanced parens would capture `(load.reason)` and lose the callee,
        // so the expansion below had nothing to resolve and three real pages
        // read as violations. Take the whole statement, up to its semicolon.
        const semi = code.indexOf(";", bodyStart);
        bodyEnd = semi === -1 ? -1 : semi + 1;
      }
      if (bodyEnd === -1) continue;
      out.push({
        binding,
        body: code.slice(bodyStart, bodyEnd),
        after: code.slice(bodyEnd),
        at: m.index,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Hoisted-variable expansion
// ---------------------------------------------------------------------------
//
// The canonical shape renders `{header}` / `{filtersRow}` in BOTH branches, so
// the literal <ScreenHeader> appears once, above the load. Comparing raw text
// would call the canonical screen a violation. Expanding `{name}` to its
// initializer is what takes the naive detector from ~13 false positives to 0.

/** JSX-valued `const NAME = ( … )` / `const NAME = (args) => ( … )` initializers. */
export function hoistedJsx(code: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\([^)]*\)\s*=>\s*)?\(/g;
  for (const m of code.matchAll(re)) {
    const open = m.index + m[0].length - 1;
    const end = balancedEnd(code, open, "(", ")");
    if (end === -1) continue;
    const body = code.slice(open, end);
    if (/<[A-Za-z]/.test(body)) out.set(m[1], body);
  }
  return out;
}

/** Text with `{name}` / `{name(...)}` replaced by the hoisted JSX they render. */
export function expandHoisted(text: string, hoisted: Map<string, string>, depth = 0): string {
  if (depth > 4) return text;
  let out = text;
  for (const [name, body] of hoisted) {
    // Two shapes, both real in this tree:
    //   {header} / {filtersRow()}   — a JSX expression container
    //   degradedPanel(load.reason)  — a bare call in `return fn(x);`
    // Matching only the first missed every page that factors its degraded
    // render into a helper, which is three of them.
    const re = new RegExp(
      `\\{\\s*${name}\\s*(?:\\([^)]*\\))?\\s*\\}|\\b${name}\\s*\\([^)]*\\)`,
      "g",
    );
    if (re.test(out)) {
      out = out.replace(re, () => expandHoisted(body, hoisted, depth + 1));
    }
  }
  return out;
}

/** Chrome component names rendered by a chunk of JSX. */
export function renderedChrome(jsx: string, vocabulary: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const m of jsx.matchAll(/<([A-Za-z][\w.]*)/g)) {
    const tag = m[1].split(".").pop() ?? m[1];
    if (vocabulary.has(tag)) out.add(tag);
  }
  if (/<h1[\s>]/.test(jsx)) out.add("h1");
  return out;
}

// ---------------------------------------------------------------------------
// Taint — the part that decides whether an absence is a bug
// ---------------------------------------------------------------------------

/** Identifiers derived, transitively, from `binding.value`. */
export function taintedNames(code: string, binding: string): Set<string> {
  const tainted = new Set<string>([binding]);
  // The `(?::[^=]+)?` is not decoration: AuditoriaScreen writes
  // `const { entries, …, actorOptions }: AuditData = load.value;` and without
  // room for that annotation the seed missed every destructured name, so a
  // filter bar built from load.value read as independent of it. A taint that
  // under-detects manufactures false positives; one that over-detects makes the
  // fence a silent no-op. Both are worth a test.
  const seedRe = new RegExp(
    `(?:const|let)\\s+(\\[[^\\]]*\\]|\\{[^}]*\\}|[A-Za-z_$][\\w$]*)\\s*(?::[^=]+)?=\\s*${binding}\\b`,
    "g",
  );
  for (const m of code.matchAll(seedRe)) {
    for (const id of m[1].match(/[A-Za-z_$][\w$]*/g) ?? []) tainted.add(id);
  }
  // Fixed point over one-line `const N = <expr>`.
  const assignRe = /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]+)/g;
  for (let pass = 0; pass < 5; pass++) {
    let grew = false;
    for (const m of code.matchAll(assignRe)) {
      if (tainted.has(m[1])) continue;
      const refs = m[2].match(/[A-Za-z_$][\w$]*/g) ?? [];
      if (refs.some((r) => tainted.has(r))) {
        tainted.add(m[1]);
        grew = true;
      }
    }
    if (!grew) break;
  }
  return tainted;
}

/** The JSX element named `tag`, from its opening angle to its balanced close. */
export function elementSource(jsx: string, tag: string): string {
  const open = jsx.search(new RegExp(`<${tag}[\\s/>]`));
  if (open === -1) return "";
  // Self-closing or with children — either way, stop at the matching `>` of the
  // opening tag plus, when present, the children up to the closing tag.
  const closeTag = `</${tag}>`;
  const closeAt = jsx.indexOf(closeTag, open);
  if (closeAt !== -1) return jsx.slice(open, closeAt + closeTag.length);
  let depth = 0;
  for (let i = open; i < jsx.length; i++) {
    if (jsx[i] === "{") depth += 1;
    else if (jsx[i] === "}") depth -= 1;
    else if (jsx[i] === ">" && depth === 0) return jsx.slice(open, i + 1);
  }
  return jsx.slice(open);
}

export function dependsOnLoad(jsx: string, tag: string, tainted: Set<string>): boolean {
  const el = elementSource(jsx, tag);
  if (!el) return false;
  return (el.match(/[A-Za-z_$][\w$]*/g) ?? []).some((id) => tainted.has(id));
}

// ---------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------

export type Missing = { file: string; binding: string; name: string };

export function findMissingChrome(file: string, rawSrc: string, dsChrome: Set<string>): Missing[] {
  const code = stripNonCode(rawSrc);
  const vocabulary = chromeVocabulary(rawSrc, dsChrome);
  if (vocabulary.size === 0) return [];
  const hoisted = hoistedJsx(code);
  const out: Missing[] = [];

  for (const branch of degradedBranches(code)) {
    const degraded = expandHoisted(branch.body, hoisted);
    const success = expandHoisted(branch.after, hoisted);
    const inDegraded = renderedChrome(degraded, vocabulary);
    const inSuccess = renderedChrome(success, vocabulary);
    const tainted = taintedNames(code, branch.binding);

    // A component that emits its own <h1> satisfies the heading requirement.
    // Checked against the RAW degraded JSX, not against the vocabulary: several
    // screens define their PageHeader in the same file instead of importing it,
    // so it never enters the import-derived vocabulary — and the check would
    // report a missing <h1> on a branch that renders one.
    const degradedHasHeading = [...HEADING_COMPONENTS].some((n) =>
      new RegExp(`<${n}[\\s/>]`).test(degraded),
    );

    for (const name of inSuccess) {
      if (inDegraded.has(name)) continue;
      if (name === "h1" && degradedHasHeading) continue;
      if (HEADING_COMPONENTS.has(name) && inDegraded.has("h1")) continue;
      if (dependsOnLoad(success, name, tainted)) continue;
      out.push({ file, binding: branch.binding, name });
    }
  }
  return out;
}

export function scannedFiles(): string[] {
  return SCANNED_GLOBS.flatMap((g) => globSync(g)).filter((f) => !f.includes("node_modules"));
}

export type Baseline = Record<string, { reason: string; chrome: string[] }>;

export function readBaseline(): Baseline {
  if (!existsSync(BASELINE_FILE)) return {};
  return JSON.parse(readFileSync(BASELINE_FILE, "utf8")) as Baseline;
}

function relPath(file: string): string {
  return file.split("\\").join("/");
}

export function scanAll(): { missing: Missing[]; branches: number; files: number } {
  const dsChrome = designSystemChrome();
  const files = scannedFiles();
  const missing: Missing[] = [];
  let branches = 0;
  for (const file of files) {
    const raw = readFileSync(file, "utf8");
    if (!/\.ok\b/.test(raw)) continue;
    branches += degradedBranches(stripNonCode(raw)).length;
    missing.push(...findMissingChrome(relPath(file), raw, dsChrome));
  }
  return { missing, branches, files: files.length };
}

function writeBaseline(missing: Missing[]): void {
  const existing = readBaseline();
  const next: Baseline = {};
  for (const m of missing) {
    next[m.file] ??= {
      reason: existing[m.file]?.reason ?? "TODO: por qué esta ausencia es correcta",
      chrome: [],
    };
    if (!next[m.file].chrome.includes(m.name)) next[m.file].chrome.push(m.name);
  }
  for (const key of Object.keys(next)) next[key].chrome.sort();
  writeFileSync(BASELINE_FILE, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`✓ baseline written — ${Object.keys(next).length} file(s)`);
}

function runScan(): void {
  const { missing, branches, files } = scanAll();

  if (process.argv.includes("--write-baseline")) {
    writeBaseline(missing);
    return;
  }

  // Anti-vacuity: a broken anchor must shout, not print "clean".
  if (branches < MIN_DEGRADED_BRANCHES) {
    console.error(
      `✗ degraded-chrome: only ${branches} degraded branch(es) found, expected at least ${MIN_DEGRADED_BRANCHES}. The anchor stopped matching — a budget wrapper was probably renamed, or the \`if (!x.ok)\` convention changed. This check cannot pass having judged nothing.`,
    );
    process.exit(1);
  }

  const baseline = readBaseline();
  let hits = 0;

  // Ratchet, direction 1 — a baselined file that vanished.
  for (const file of Object.keys(baseline)) {
    if (!existsSync(file)) {
      console.error(
        `✗ ${file} is in ${BASELINE_FILE} but does not exist. It was renamed or deleted — re-check the exemption against the new path instead of leaving a dead entry.`,
      );
      hits += 1;
    }
  }

  // Ratchet, direction 2 — new violations.
  for (const m of missing) {
    if (baseline[m.file]?.chrome.includes(m.name)) continue;
    console.error(
      `${m.file}: the \`if (!${m.binding}.ok)\` branch drops <${m.name}>, which does not depend on ${m.binding}.value. Hoist it above the await and render it in BOTH branches (see app/gob/censo/CensoScreen.tsx). If the absence is deliberate, add it to ${BASELINE_FILE} WITH a reason.`,
    );
    hits += 1;
  }

  // Ratchet, direction 3 — a stale exemption.
  for (const [file, entry] of Object.entries(baseline)) {
    if (!existsSync(file)) continue;
    for (const name of entry.chrome) {
      if (missing.some((m) => m.file === file && m.name === name)) continue;
      console.error(
        `✗ ${file} no longer drops <${name}> — remove it from ${BASELINE_FILE}. An exemption left standing is free room for the next regression.`,
      );
      hits += 1;
    }
  }

  if (hits > 0) {
    console.error(`\n✗ ${hits} degraded-chrome violation(s).`);
    process.exit(1);
  }

  const baselined = Object.values(baseline).reduce((n, e) => n + e.chrome.length, 0);
  console.log(
    `✓ degraded-chrome clean — ${files} files, ${branches} degraded branches inspected, ${baselined} documented exemption(s).`,
  );
}

const isMain = process.argv[1]?.replace(/\\/g, "/").endsWith("check-degraded-chrome.ts");
if (isMain) runScan();
