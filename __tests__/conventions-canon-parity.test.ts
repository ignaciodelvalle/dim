// Parity fence for the conventions canon.
//
// `docs/architecture/conventions-canon.json` is the source of truth: 512 rules
// harvested from the repo's own prose, each classified against the enforcer that
// can actually FAIL when the rule is broken. `pnpm canon:render` turns it into
// `docs/architecture/conventions-canon.md` (index) plus one page per scope under
// `docs/architecture/conventions-canon/`.
//
// This file pins the four things that make that canon worth reading:
//
//   (a) The markdown is a faithful RENDER, not a parallel document. Exactly one
//       table row per JSON row, with the same status and the same enforcer set.
//       Hand-editing a verdict into the markdown turns this red — which is the
//       whole point of having a generated view.
//   (b) Every enforcer path the canon cites EXISTS. A canon that cites a file
//       deleted three refactors ago is worse than no canon: it reads as evidence
//       and is not. Three citations were already stale when this fence was first
//       run (two `lib/domain/opened-reason-*.ts` paths that moved to
//       `src/modules/cases/domain/`, one citation that packed a symbol name into
//       its `:line` suffix) — that is the failure mode, and it is not theoretical.
//   (c) No enforcement machinery escapes the census. Every `lint:*` key, every
//       `scripts/check-*.{ts,mjs}`, and every fence/parity/coverage test is
//       either cited by a row or listed in the JSON's `unmapped` array. That
//       array's length is pinned as a CEILING: lowering it is a real improvement
//       and must be done by hand; raising it silently is how a canon rots.
//   (d) Row ids are unique and sorted, so a diff of the JSON reads as a diff of
//       the canon rather than as a reshuffle.
//
// DB-less by construction: it reads the repo, nothing else.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CANON_INDEX,
  CANON_SCOPE_DIR,
  type Canon,
  type CanonRow,
  REPO_ROOT,
  enforcerPath,
  loadCanon,
  statusLabel,
} from "@/scripts/conventions-canon-render";

const canon: Canon = loadCanon(REPO_ROOT);

// The `unmapped` ceiling. Measured at d7dbf25f7 against the whole census below.
// LOWER it when a canon row learns to cite one of these; never raise it.
const UNMAPPED_CEILING = 2;

// ---------------------------------------------------------------------------
// Markdown parsing
// ---------------------------------------------------------------------------

/** Cells of one markdown table row, splitting on UNESCAPED pipes only. */
function cells(line: string): string[] {
  const parts = line.split(/(?<!\\)\|/);
  // A well-formed row is `| a | b | ... |`, so the first and last are empty.
  return parts.slice(1, -1).map((c) => c.trim());
}

type ParsedRow = { id: string; status: string; enforcers: Set<string>; file: string };

/** Every `| CANON-… |` data row across the rendered scope pages. */
function parseRenderedRows(): ParsedRow[] {
  const dir = join(REPO_ROOT, CANON_SCOPE_DIR);
  const out: ParsedRow[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith(".md")) continue;
    const rel = `${CANON_SCOPE_DIR}/${name}`;
    for (const line of readFileSync(join(dir, name), "utf8").split("\n")) {
      if (!/^\|\s*CANON-\d+\s*\|/.test(line)) continue;
      const c = cells(line);
      expect(
        c,
        `${rel}: row does not have the six canon columns: ${line.slice(0, 120)}`,
      ).toHaveLength(6);
      out.push({ id: c[0], status: c[3], enforcers: renderedEnforcers(c[4]), file: rel });
    }
  }
  return out;
}

/** The repo paths named in a rendered Enforcer cell. */
function renderedEnforcers(cell: string): Set<string> {
  if (cell === "—") return new Set();
  const paths = new Set<string>();
  for (const segment of cell.split("<br>")) {
    const m = /^`([^`]+)`/.exec(segment.trim());
    if (m) paths.add(enforcerPath(m[1]));
  }
  return paths;
}

const expectedEnforcers = (row: CanonRow): Set<string> =>
  new Set((row.enforcer ?? []).map((e) => enforcerPath(e)));

// ---------------------------------------------------------------------------
// Census inputs
// ---------------------------------------------------------------------------

const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};

const lintKeys = Object.keys(pkg.scripts)
  .filter((k) => k.startsWith("lint:"))
  .sort();

const checkScripts = readdirSync(join(REPO_ROOT, "scripts"))
  .filter((n) => /^check-.*\.(ts|mjs)$/.test(n))
  .map((n) => `scripts/${n}`)
  .sort();

/** `__tests__/**` files whose name carries fence / parity / coverage. */
function fenceTests(): string[] {
  const acc: string[] = [];
  const walk = (rel: string): void => {
    for (const ent of readdirSync(join(REPO_ROOT, rel), { withFileTypes: true })) {
      const child = `${rel}/${ent.name}`;
      if (ent.isDirectory()) walk(child);
      else if (/\.test\.tsx?$/.test(ent.name) && /(fence|parity|coverage)/i.test(ent.name))
        acc.push(child);
    }
  };
  walk("__tests__");
  return acc.sort();
}

/** Every repo path cited by any row's `enforcer`. */
const citedPaths = new Set(
  canon.rows.flatMap((r) => (r.enforcer ?? []).map((e) => enforcerPath(e))),
);
/** Raw enforcer text, so a `lint:*` key cited by name counts as mapped. */
const citedText = canon.rows.flatMap((r) => r.enforcer ?? []).join("\n");
const unmappedIds = new Set(canon.unmapped.map((u) => u.id));

/** The `scripts/*.ts|mjs` a `lint:*` key runs, when it runs one. */
function lintScriptPath(key: string): string | null {
  return /(scripts\/[\w.-]+\.(?:ts|mjs))/.exec(pkg.scripts[key])?.[1] ?? null;
}

// ---------------------------------------------------------------------------

describe("conventions canon — JSON is the source of truth", () => {
  it("(d) row ids are unique and sorted", () => {
    const ids = canon.rows.map((r) => r.id);
    expect(new Set(ids).size, "duplicate row id in conventions-canon.json").toBe(ids.length);
    expect(ids).toEqual([...ids].sort());
  });

  it("row count matches the stats block and the totals rendered in the index", () => {
    expect(canon.stats.rows).toBe(canon.rows.length);
    const byStatus: Record<string, number> = {};
    for (const r of canon.rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    expect(canon.stats.byStatus).toEqual(byStatus);

    const index = readFileSync(join(REPO_ROOT, CANON_INDEX), "utf8");
    const fact = (key: string): number => {
      const m = new RegExp(`<!-- fact:${key} -->(\\d+)<!-- /fact -->`).exec(index);
      expect(m, `${CANON_INDEX} is missing the fact:${key} marker`).not.toBeNull();
      return Number((m as RegExpExecArray)[1]);
    };
    expect(fact("canon_rows")).toBe(canon.rows.length);
    expect(fact("canon_enforced")).toBe(byStatus.ENFORCED ?? 0);
    expect(fact("canon_partial")).toBe(byStatus.PARTIAL ?? 0);
    expect(fact("canon_unenforced")).toBe(byStatus.UNENFORCED ?? 0);
  });
});

describe("conventions canon — the markdown is a faithful render", () => {
  const rendered = parseRenderedRows();
  const byId = new Map(rendered.map((r) => [r.id, r]));

  it("(a) the index links to every scope page", () => {
    const index = readFileSync(join(REPO_ROOT, CANON_INDEX), "utf8");
    for (const scope of new Set(canon.rows.map((r) => r.scope))) {
      expect(index, `${CANON_INDEX} does not link to the ${scope} page`).toContain(
        `./conventions-canon/${scope}.md`,
      );
    }
  });

  it("(a) every scope page carries the header block and the canon columns", () => {
    for (const scope of new Set(canon.rows.map((r) => r.scope))) {
      const rel = `${CANON_SCOPE_DIR}/${scope}.md`;
      const text = readFileSync(join(REPO_ROOT, rel), "utf8");
      expect(text, `${rel} lost the snapshot header`).toContain(`> Snapshot: \`${canon.sha}\``);
      expect(text, `${rel} lost the canon table columns`).toContain(
        "| Id | Rule | Source | Status | Enforcer | Basis |",
      );
    }
  });

  it("(a) contains exactly one table row per JSON row", () => {
    expect(
      rendered.length,
      "rendered rows and JSON rows differ in count — run `pnpm canon:render`",
    ).toBe(canon.rows.length);
    expect(byId.size, "the rendered pages repeat a canon id").toBe(rendered.length);
    const missing = canon.rows.filter((r) => !byId.has(r.id)).map((r) => r.id);
    expect(missing, "JSON rows with no rendered table row — run `pnpm canon:render`").toEqual([]);
  });

  it("(a) renders every row on the page for its scope", () => {
    const wrongPage = canon.rows
      .filter((r) => byId.get(r.id) && byId.get(r.id)?.file !== `${CANON_SCOPE_DIR}/${r.scope}.md`)
      .map((r) => `${r.id} -> ${byId.get(r.id)?.file} (scope ${r.scope})`);
    expect(wrongPage).toEqual([]);
  });

  it("(a) renders the same status as the JSON", () => {
    const drifted = canon.rows
      .filter((r) => byId.has(r.id) && byId.get(r.id)?.status !== statusLabel(r))
      .map((r) => `${r.id}: json=${statusLabel(r)} markdown=${byId.get(r.id)?.status}`);
    expect(drifted, "status drifted between the JSON and its render").toEqual([]);
  });

  it("(a) renders the same enforcer set as the JSON", () => {
    const drifted: string[] = [];
    for (const r of canon.rows) {
      const got = byId.get(r.id);
      if (!got) continue;
      const want = expectedEnforcers(r);
      const missing = [...want].filter((p) => !got.enforcers.has(p));
      const extra = [...got.enforcers].filter((p) => !want.has(p));
      if (missing.length || extra.length) {
        drifted.push(`${r.id}: missing=[${missing.join(", ")}] extra=[${extra.join(", ")}]`);
      }
    }
    expect(drifted, "enforcer set drifted between the JSON and its render").toEqual([]);
  });
});

describe("conventions canon — the evidence resolves", () => {
  it("(b) every cited enforcer path exists on disk", () => {
    const dangling: string[] = [];
    for (const row of canon.rows) {
      for (const entry of row.enforcer ?? []) {
        const path = enforcerPath(entry);
        if (!path) continue;
        if (!existsSync(join(REPO_ROOT, path))) dangling.push(`${row.id}: ${entry}`);
      }
    }
    expect(dangling, "canon rows cite enforcer paths that do not exist").toEqual([]);
  });

  it("(b) every `source` path that looks like a repo path exists on disk", () => {
    const REPO_PATH =
      /^(app|lib|src|db|scripts|packages|apps|components|__tests__|\.github|docs|e2e)\//;
    const dangling: string[] = [];
    for (const row of canon.rows) {
      for (const entry of row.sources ?? []) {
        const path = enforcerPath(entry);
        if (!REPO_PATH.test(path)) continue;
        if (!existsSync(join(REPO_ROOT, path))) dangling.push(`${row.id}: ${entry}`);
      }
    }
    expect(dangling, "canon rows cite source paths that do not exist").toEqual([]);
  });
});

describe("conventions canon — nothing enforcing escapes the census", () => {
  it("(c) every lint:* key is cited by a row or listed as unmapped", () => {
    const escaped = lintKeys.filter((key) => {
      if (citedText.includes(key)) return false;
      const path = lintScriptPath(key);
      if (path && citedPaths.has(path)) return false;
      return !unmappedIds.has(key);
    });
    expect(escaped, "lint:* keys neither cited by a canon row nor listed in `unmapped`").toEqual(
      [],
    );
  });

  it("(c) every scripts/check-*.{ts,mjs} is cited by a row or listed as unmapped", () => {
    const escaped = checkScripts.filter((p) => !citedPaths.has(p) && !unmappedIds.has(p));
    expect(escaped, "check scripts neither cited by a canon row nor listed in `unmapped`").toEqual(
      [],
    );
  });

  it("(c) every fence/parity/coverage test is cited by a row or listed as unmapped", () => {
    const escaped = fenceTests().filter((p) => !citedPaths.has(p) && !unmappedIds.has(p));
    expect(escaped, "fence tests neither cited by a canon row nor listed in `unmapped`").toEqual(
      [],
    );
  });

  it("(c) the unmapped list is at or below its pinned ceiling", () => {
    expect(
      canon.unmapped.length,
      `unmapped grew past its ceiling of ${UNMAPPED_CEILING}. Cite the new machinery from a canon row, or lower nothing and raise this deliberately.`,
    ).toBeLessThanOrEqual(UNMAPPED_CEILING);
  });

  it("(c) every unmapped entry still exists in the tree", () => {
    const stale = canon.unmapped.filter((u) => u.path && !existsSync(join(REPO_ROOT, u.path)));
    expect(
      stale.map((u) => u.id),
      "`unmapped` lists machinery that no longer exists",
    ).toEqual([]);
  });
});
