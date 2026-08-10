// Walk-in owner-alert fence — every Atender clinical writer must tell the owner.
//
// THE DEFECT THIS EXISTS FOR
// ---------------------------------------------------------------------------
// The Atender walk-in resolves a pet from its DIM code with NO custody check.
// resolveAtenderPet's own header says why that is acceptable (holding
// event.write on an org + knowing the code ≈ physical possession of the
// credential) and admits the weakness: the DIM code is PUBLIC. So any org with
// event.write can write permanent, append-only events on any animal in the
// country from a photo of the tag.
//
// The PO decided NOT to close that by authorization — a vet or refugio meeting
// a found animal has to be able to treat it, and requiring prior custody breaks
// real clinical care. The mitigation is DETECTION: the owner is notified every
// time a third party writes on their animal, so abuse stops being invisible.
//
// That makes the alert part of the walk-in's contract. And a contract kept by
// seven hand-copied `notify(...)` blocks is an ENUMERATION — enumerations FAIL
// OPEN. Writer #8 that forgets the block compiles, commits, redirects, and
// writes silently on a stranger's animal. Nothing would have caught it.
//
// WHAT THIS ENFORCES
// ---------------------------------------------------------------------------
// The writer set is DERIVED, never listed. For each walk-in action module:
//   1. Read the identifiers it imports from `@/src/modules/events/application/`
//      — those ARE the clinical writers, straight from the module's own imports.
//   2. Any exported async function whose body calls one of them is a walk-in
//      writer, whatever it is named.
//   3. Every such writer MUST close through completeAtenderSignature(), the one
//      function that fires the owner alert.
//   4. The receipt literal `?firmado=1` may appear in code ONLY inside
//      atender-signature-completion.ts — otherwise a writer could hand-roll its
//      own success return and skip (3).
//
// A NEW writer therefore enters this fence's scope the moment it is written; no
// list anywhere has to be edited to keep up with it.
//
// SELF-CHECK: this fence must never pass vacuously. If the glob finds no action
// module, or no writer use-case imports, or zero derived writers, it FAILS —
// a rename or a move must break loudly rather than turn the guard into a no-op.
//
// All matching runs on COMMENT-STRIPPED source, so a commented-out call can
// never satisfy the requirement.
//
// Run: pnpm tsx scripts/check-atender-owner-alerts.ts  (or: pnpm lint:atender-alerts)
// Exits 0 when clean; exits 1 naming each writer that does not alert the owner.

import { globSync, readFileSync } from "node:fs";

import { stripComments } from "./check-scope-discipline";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Walk-in server-action modules. Glob, not a path, so a move is still covered. */
const ACTION_GLOBS = ["app/org/**/atender/**/actions.ts"];

/** Every file of the walk-in surface — scanned for the receipt-literal bypass. */
const SURFACE_GLOBS = ["app/org/**/atender/**/*.ts", "app/org/**/atender/**/*.tsx"];

/** Import prefix whose named imports ARE the clinical writers. */
const WRITER_MODULE_PREFIX = "@/src/modules/events/application/";

/** The single function that fires the owner alert and mints the receipt. */
const COMPLETION_FN = "completeAtenderSignature";

/** The one file allowed to build the `?firmado=1` success redirect. */
const COMPLETION_FILE_SUFFIX = "atender-signature-completion.ts";

/** The receipt query string. Building it = claiming a signed walk-in event. */
const RECEIPT_LITERAL = "?firmado=1";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AlertViolation = { where: string; reason: string };

export type ExportedFunction = { name: string; body: string };

// ---------------------------------------------------------------------------
// Core logic (exported for unit tests)
// ---------------------------------------------------------------------------

export function normalizePath(filePath: string): string {
  return filePath.replaceAll("\\", "/");
}

/**
 * Named identifiers imported from the events application layer. These are the
 * clinical use-cases; a function that calls one of them writes an event.
 */
export function deriveWriterUseCases(strippedSource: string): string[] {
  const found = new Set<string>();
  const importRe = /import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;
  for (const match of strippedSource.matchAll(importRe)) {
    const specifier = match[2];
    if (!specifier.startsWith(WRITER_MODULE_PREFIX)) continue;
    for (const raw of match[1].split(",")) {
      // Handles `createNote`, `createNote as x`, and leading `type `.
      const cleaned = raw
        .trim()
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/)[0]
        .trim();
      if (cleaned) found.add(cleaned);
    }
  }
  return [...found].sort();
}

/**
 * Split comment-stripped source into top-level exported async functions by
 * brace matching. Brace-counting is enough here because comments are already
 * gone and the walk-in modules contain no braces inside string literals at the
 * top level of a function signature.
 */
/**
 * Index of the `{` that opens the function body, given the index of the `(`
 * that opens its parameter list. Returns -1 when either is unbalanced.
 */
function bodyStartAfterParams(src: string, openParen: number): number {
  let depth = 0;
  for (let i = openParen; i < src.length; i++) {
    if (src[i] === "(") depth += 1;
    else if (src[i] === ")") {
      depth -= 1;
      if (depth === 0) return src.indexOf("{", i);
    }
  }
  return -1;
}

export function extractExportedFunctions(strippedSource: string): ExportedFunction[] {
  const out: ExportedFunction[] = [];
  // WIDENED 2026-08-09. This matched only the `export async function NAME(`
  // declaration form, while the docstring promises the fence catches a walk-in
  // writer "whatever it is named" and that a NEW writer "enters this fence's
  // scope the moment it is written". An arrow assignment —
  // `export const atenderFooAction = async (…) => {…}` — was outside the ONLY
  // barrier standing behind the mitigation the PO accepted for non-custody
  // walk-ins. No live instance; the seven current writers all use the
  // declaration form. Closed before someone writes the eighth.
  const headerRe =
    /export\s+(?:async\s+function\s+([A-Za-z0-9_$]+)\s*\(|const\s+([A-Za-z0-9_$]+)\s*(?::[^=]+)?=\s*async\s*(?:function\s*)?\()/g;
  for (const match of strippedSource.matchAll(headerRe)) {
    // The match ends ON the opening paren of the parameter list. Balance that
    // paren first, then take the next `{` — searching for `{` directly would
    // find a DESTRUCTURED PARAMETER (`async ({ orgToken }) => …`) and treat the
    // destructuring object as the function body.
    const start = bodyStartAfterParams(strippedSource, match.index + match[0].length - 1);
    if (start === -1) continue;
    let depth = 0;
    let end = -1;
    for (let i = start; i < strippedSource.length; i++) {
      const ch = strippedSource[i];
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) continue;
    out.push({ name: match[1] ?? match[2], body: strippedSource.slice(start, end + 1) });
  }
  return out;
}

/** True when the body calls any of the derived clinical use-cases. */
export function callsAny(body: string, identifiers: string[]): boolean {
  return identifiers.some((id) => new RegExp(`\\b${id.replaceAll("$", "\\$")}\\s*\\(`).test(body));
}

/**
 * The whole check over already-read, already-stripped sources.
 *
 * @param actionSources    normalized path -> comment-stripped action module source
 * @param surfaceSources   normalized path -> comment-stripped source of every walk-in file
 */
export function checkAtenderOwnerAlerts(
  actionSources: Record<string, string>,
  surfaceSources: Record<string, string>,
): { violations: AlertViolation[]; writerCount: number } {
  const violations: AlertViolation[] = [];

  const actionPaths = Object.keys(actionSources);
  if (actionPaths.length === 0) {
    violations.push({
      where: ACTION_GLOBS.join(", "),
      reason:
        "no walk-in action module found. This fence cannot pass vacuously — if the Atender surface moved, update ACTION_GLOBS in this script.",
    });
    return { violations, writerCount: 0 };
  }

  let writerCount = 0;
  for (const path of actionPaths) {
    const source = actionSources[path];
    const useCases = deriveWriterUseCases(source);
    if (useCases.length === 0) continue;

    for (const fn of extractExportedFunctions(source)) {
      if (!callsAny(fn.body, useCases)) continue;
      writerCount += 1;
      if (!fn.body.includes(`${COMPLETION_FN}(`)) {
        violations.push({
          where: `${path} › ${fn.name}()`,
          reason: `writes a clinical event on a walk-in pet but never calls ${COMPLETION_FN}(). The owner would never be told a third party wrote on their animal — the ONLY mitigation the PO accepted for the non-custody walk-in. Close the action with \`return ${COMPLETION_FN}({...})\` (app/org/[orgToken]/atender/atender-signature-completion.ts).`,
        });
      }
    }
  }

  if (writerCount === 0) {
    violations.push({
      where: actionPaths.join(", "),
      reason: `derived ZERO clinical writers. Either every writer was removed, or the derivation broke (imports from "${WRITER_MODULE_PREFIX}" or the \`export async function\` shape changed). A guard that derives nothing guards nothing — fix the derivation.`,
    });
  }

  for (const [path, source] of Object.entries(surfaceSources)) {
    if (path.endsWith(COMPLETION_FILE_SUFFIX)) continue;
    if (!source.includes(RECEIPT_LITERAL)) continue;
    violations.push({
      where: path,
      reason: `builds the "${RECEIPT_LITERAL}" signed-event receipt outside ${COMPLETION_FILE_SUFFIX}. That is the bypass around ${COMPLETION_FN}() — a writer can claim a signed event without alerting the owner. Return ${COMPLETION_FN}({...}) instead.`,
    });
  }

  return { violations, writerCount };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function readStripped(globs: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pattern of globs) {
    for (const p of globSync(pattern)) {
      const normalized = normalizePath(p);
      if (normalized.includes(".test.")) continue;
      if (out[normalized] !== undefined) continue;
      try {
        out[normalized] = stripComments(readFileSync(p, "utf8"));
      } catch {
        // Unreadable file — skip; the vacuity self-check below still applies.
      }
    }
  }
  return out;
}

function runScan(): void {
  const { violations, writerCount } = checkAtenderOwnerAlerts(
    readStripped(ACTION_GLOBS),
    readStripped(SURFACE_GLOBS),
  );

  if (violations.length > 0) {
    for (const v of violations) {
      console.error(`${v.where}: ${v.reason}`);
    }
    console.error(`\n✗ ${violations.length} walk-in write(s) that never reach the pet's owner.`);
    process.exit(1);
  }

  console.log(
    `✓ atender owner alerts clean — ${writerCount} derived walk-in writer(s), all closing through ${COMPLETION_FN}(); no hand-rolled receipt.`,
  );
}

const isMain =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("check-atender-owner-alerts.ts") ||
    process.argv[1].endsWith("check-atender-owner-alerts.js") ||
    import.meta.url === `file:///${process.argv[1].replaceAll("\\", "/")}`);

if (isMain) {
  runScan();
}
