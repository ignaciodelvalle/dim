// A test that needs demo furniture must SAY SO. (Plan H.2 — seed contract.)
//
// WHY THIS EXISTS
// ---------------------------------------------------------------------------
// `pnpm db:bootstrap` seeds exactly three things: INDEC localities, CABA
// barrios, and the eight @dim.test accounts (scripts/db-bootstrap.ts step 4).
// That is what a fresh CI database contains, and it is the only state a test
// may assume without declaring it.
//
// Everything else a seed script writes — DIM-DEMO- pets and their event series,
// the DIM-PAMP- flagship, the storyline pets, panorama aggregates, govt
// assignments, alert subscriptions — is DEMO FURNITURE. It exists on one
// long-lived local stack because somebody ran the seed by hand.
//
// seed-demo-scenario.test.ts silently depended on exactly that. The documented
// CI recipe produced 8 red tests, and `pnpm test` green — the Definition of
// Done — quietly rested on undeclared state: a green that proves nothing. The
// fix (PO decision D2) was a declared precondition, NOT a demo step in
// bootstrap: CI has no business building demo furniture to satisfy a test.
//
// This fence stops the next one from being written. Measured when it was added:
// of the 15 test files that mention a demo token, 13 use it as a render fixture
// (no database at all) and 1 creates its own pets — only seed-demo-scenario.ts
// actually depends on the seed, and it declares it. The suite is clean today.
// The fence is here so it stays clean, because the failure mode is invisible:
// nothing goes red, the tests just stop being run without anybody noticing.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// Public-token prefixes that ONLY a demo/storyline seed ever writes. Bootstrap
// creates no pets at all, so any of these in a database-touching test is a
// dependency on furniture CI does not build. Kept as an EXPLICIT list rather
// than a `DIM-` pattern: tests legitimately mint their own tokens at runtime
// via generatePublicToken(), and those must not trip this.
const DEMO_TOKEN_PREFIXES = [
  "DIM-DEMO-",
  "DIM-PAMP-",
  "DIM-ARGO-",
  "DIM-BRUNO-",
  "DIM-LAIK-",
  "DIM-HACH-",
  "DIM-KABO-",
  "DIM-TRRY-",
  "DIM-CUJO-",
  "DIM-ROCO-",
  "DIM-BOBB-",
  "DIM-FRID-",
  "DIM-SNPY-",
  "DIM-ODIE-",
];

/**
 * Strip comments so a token NAMED in prose is not read as a dependency.
 *
 * subject-rights-rpcs.test.ts explains a fixture by referring to
 * "DIM-BRUNO-DEMO" in a line comment while creating its own pets via
 * generatePublicToken(). Without this it would be a permanent false positive,
 * and a fence that cries wolf gets an allowlist entry and then gets ignored.
 *
 * Deliberately simple: block comments, plus lines whose first non-space
 * characters are `//` or `*`. It does not parse, so a token in a trailing
 * comment after code on the same line still counts — that errs toward flagging,
 * which is the safe direction for a fence.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => {
      const t = line.trimStart();
      return !t.startsWith("//") && !t.startsWith("*");
    })
    .join("\n");
}

interface TestFileFacts {
  file: string;
  /** Demo-seed token prefixes referenced in real code (not in comments). */
  demoTokens: string[];
  /** Imports the Drizzle client, i.e. actually reads the database. */
  touchesDb: boolean;
  /** Declares a precondition via describe.skipIf / it.skipIf. */
  declaresPrecondition: boolean;
}

function readFacts(file: string): TestFileFacts {
  const raw = readFileSync(file, "utf8");
  const code = stripComments(raw);
  return {
    file: file.replace(/\\/g, "/"),
    demoTokens: DEMO_TOKEN_PREFIXES.filter((p) => code.includes(p)),
    touchesDb: /from ["']@\/db["']/.test(code),
    declaresPrecondition: /\.skipIf\s*\(/.test(code),
  };
}

/** Every `*.test.ts(x)` under the roots that hold this project's tests. */
function collectTestFiles(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile() || !/\.test\.tsx?$/.test(entry.name)) continue;
    const dir = entry.parentPath ?? entry.path ?? root;
    if (dir.includes("node_modules")) continue;
    out.push(join(dir, entry.name));
  }
  return out;
}

const TEST_FILES = ["__tests__", "app", "components", "lib"].flatMap(collectTestFiles);

const FACTS = TEST_FILES.map(readFacts);

describe("seed precondition contract (H.2)", () => {
  it("scans a real suite — the fence must not go inert", () => {
    // A fence whose glob silently matches nothing passes forever. Same guard as
    // the vaccine-name fence: prove it is looking at something first.
    expect(TEST_FILES.length).toBeGreaterThan(100);
  });

  it("detects both halves on the known case (seed-demo-scenario.test.ts)", () => {
    // The one file that genuinely depends on the demo seed. If the detector
    // stops seeing EITHER its dependency or its declaration, the fence below is
    // meaningless — it would pass by seeing nothing at all.
    const known = FACTS.find((f) => f.file.endsWith("__tests__/seed-demo-scenario.test.ts"));
    expect(known, "seed-demo-scenario.test.ts not found — did it move?").toBeDefined();
    expect(known?.touchesDb).toBe(true);
    expect(known?.declaresPrecondition).toBe(true);
  });

  it("does not read a token named in a comment as a dependency", () => {
    // subject-rights-rpcs.test.ts mentions DIM-BRUNO-DEMO in prose and mints its
    // own tokens. Pinning it keeps stripComments from being quietly removed.
    const commentOnly = FACTS.find((f) => f.file.endsWith("__tests__/subject-rights-rpcs.test.ts"));
    expect(commentOnly, "subject-rights-rpcs.test.ts not found — did it move?").toBeDefined();
    expect(commentOnly?.touchesDb).toBe(true);
    expect(commentOnly?.demoTokens).toEqual([]);
  });

  it("every database-touching test that needs demo furniture declares it", () => {
    const violations = FACTS.filter(
      (f) => f.touchesDb && f.demoTokens.length > 0 && !f.declaresPrecondition,
    );
    expect(
      violations.map((v) => `${v.file} (uses ${v.demoTokens.join(", ")})`),
      [
        "These tests read the database AND expect pets that only a demo seed creates,",
        "but assume that state instead of declaring it. On a fresh CI database they go",
        "red for the wrong reason; on a stale local one they pass for the wrong reason.",
        "",
        "Fix by declaring the precondition, the way __tests__/seed-demo-scenario.test.ts",
        "does: probe for the artefact, then describe.skipIf(!HAS_...) with the reason in",
        "the SUITE NAME (a console.warn does not print for a fully-skipped file — vitest",
        "buffers and discards it). Do NOT add a demo seed step to db:bootstrap: demo",
        "furniture is not CI's job (PO decision D2).",
        "",
        "Or create the fixture yourself, which is what most tests here already do.",
      ].join("\n"),
    ).toEqual([]);
  });
});
