// Encoding fitness — no mojibake ever reaches a source file again.
//
// 2026-07-04: OpenInvestigationForm.tsx shipped a double-encoded em-dash
// (bytes 0xC3A2E282AC) that rendered as a replacement character in the ENO
// disease selector — caught by the PO watching a demo video. An agent or
// editor had saved the file through the wrong codepage. This scan is the
// machine-enforced version of the "UTF-8 or nothing" contract rule
// (docs/agents/): it fails CI the moment any tracked source contains the
// classic UTF-8-read-as-CP1252 artifacts or a literal replacement character.
//
// 2026-07-18 (cowork demo validation): a U+00AD SOFT HYPHEN rode into the
// localidades seed ("Agustín Roca") — an invisible format char that splits a
// word for the naked eye but corrupts equality/search on the name. The second
// test below fails on any soft hyphen in CODE / DATA dirs. It intentionally
// EXCLUDES docs: prose reviews (the demo-validation note itself) legitimately
// QUOTE the offending string to document the bug, and a couple of design docs
// carry accidental soft hyphens whose cleanup is a docs-owner follow-up, not a
// source-fitness failure. The ingest path is separately guarded at the boundary
// (scripts/import-indec-localities.ts strips U+00AD + mojibake before persist).

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const SCAN_DIRS = ["app", "components", "lib", "src", "db", "scripts", "e2e", "docs"];
// Soft-hyphen scan omits docs (prose that quotes the character — see header).
const CODE_SCAN_DIRS = ["app", "components", "lib", "src", "db", "scripts", "e2e"];
const EXTENSIONS = new Set([".ts", ".tsx", ".sql", ".md", ".json", ".mjs", ".css"]);
// U+FFFD replacement char + the common double-encoding artifacts. "Ã" alone
// is too broad (legit in some transliterations) — pair it with the vowels
// that only appear via mojibake in this codebase's languages.
const MOJIBAKE = /�|â€|Ã©|Ã­|Ã³|Ãº|Ã±|Ã¡|Â¿|Â°/;
// U+00AD SOFT HYPHEN — an invisible format character that must never sit inside
// source or seed data (it silently corrupts word equality / search). Written as
// an escape so no editor can strip the invisible glyph out of this regex.
const SOFT_HYPHEN = /\u00AD/;

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      yield* walk(full);
    } else if (EXTENSIONS.has(full.slice(full.lastIndexOf(".")))) {
      yield full;
    }
  }
}

function scan(dirs: string[], pattern: RegExp): string[] {
  const offenders: string[] = [];
  for (const dir of dirs) {
    const abs = join(ROOT, dir);
    let stat: ReturnType<typeof statSync>;
    try {
      stat = statSync(abs);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    for (const file of walk(abs)) {
      const text = readFileSync(file, "utf8");
      const m = text.match(pattern);
      if (m) {
        const line = text.slice(0, m.index).split("\n").length;
        offenders.push(`${file.slice(ROOT.length + 1)}:${line} (${JSON.stringify(m[0])})`);
      }
    }
  }
  return offenders;
}

describe("encoding fitness", () => {
  it("no source file contains mojibake or replacement characters", () => {
    const offenders = scan(SCAN_DIRS, MOJIBAKE);
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("no code/data file contains a U+00AD soft hyphen", () => {
    const offenders = scan(CODE_SCAN_DIRS, SOFT_HYPHEN);
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
