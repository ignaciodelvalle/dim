// Encoding fitness — no mojibake ever reaches a source file again.
//
// 2026-07-04: OpenInvestigationForm.tsx shipped a double-encoded em-dash
// (bytes 0xC3A2E282AC) that rendered as a replacement character in the ENO
// disease selector — caught by the PO watching a demo video. An agent or
// editor had saved the file through the wrong codepage. This scan is the
// machine-enforced version of the "UTF-8 or nothing" contract rule
// (docs/agents/): it fails CI the moment any tracked source contains the
// classic UTF-8-read-as-CP1252 artifacts or a literal replacement character.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const SCAN_DIRS = ["app", "components", "lib", "src", "db", "scripts", "e2e", "docs"];
const EXTENSIONS = new Set([".ts", ".tsx", ".sql", ".md", ".json", ".mjs", ".css"]);
// U+FFFD replacement char + the common double-encoding artifacts. "Ã" alone
// is too broad (legit in some transliterations) — pair it with the vowels
// that only appear via mojibake in this codebase's languages.
const MOJIBAKE = /�|â€|Ã©|Ã­|Ã³|Ãº|Ã±|Ã¡|Â¿|Â°/;

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

describe("encoding fitness", () => {
  it("no source file contains mojibake or replacement characters", () => {
    const offenders: string[] = [];
    for (const dir of SCAN_DIRS) {
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
        const m = text.match(MOJIBAKE);
        if (m) {
          const line = text.slice(0, m.index).split("\n").length;
          offenders.push(`${file.slice(ROOT.length + 1)}:${line} (${JSON.stringify(m[0])})`);
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
