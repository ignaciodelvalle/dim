#!/usr/bin/env node
/**
 * Runs `next build` under a heap ceiling derived from the memory this machine
 * actually has, instead of a constant baked into package.json.
 *
 * Why this file exists: the ceiling used to be a literal
 * `--max-old-space-size=8192`, added to stop the compiler dying on a 32 GB
 * workstation. On Vercel's build container that same number is fatal — it
 * tells V8 it may grow to 8 GB of heap alone inside a container that has
 * roughly that much in total, so V8 never self-limits and the container's OOM
 * killer takes the worker down with SIGKILL. A ceiling is only meaningful
 * relative to the box it runs on, so it has to be computed on the box.
 *
 * The cap keeps 8192 as the maximum. On the workstation the computed value
 * lands far above it, so the ceiling stays exactly what it is today and the
 * original fix cannot regress; only memory-constrained environments change.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { totalmem } from "node:os";

/**
 * The ONLY thing this flag is for is RAISING the ceiling on a machine that has
 * room to spare. It is never lowered: when the box cannot afford this much,
 * heapMb is null and no flag is passed at all.
 *
 * That asymmetry is the whole lesson of this file. Node reads the cgroup limit
 * and sizes its own heap accordingly, and on a container that default is both
 * correct and battle-tested — this repo deployed on it for months. Overriding
 * it with 8192 (commit ca9956a5, to stop a 32 GB workstation dying on heap)
 * told V8 it could grow to the container's entire memory, so V8 stopped
 * collecting early and the OOM killer took the build. Every value tried after
 * that was a guess at a number Node already knows better than we do.
 *
 * 8192 is what package.json used to hardcode, so on the workstation the
 * ceiling is exactly what it is today and the fix that introduced it cannot
 * regress. Measured 2026-08-20: this repo's `next build` completes with a
 * ceiling of 2867 MB, so on a large box anything above ~3 GB is headroom.
 */
const CEILING_MB = 8192;

/**
 * V8's old space is not the whole process: native allocations, source maps,
 * the pnpm parent and the OS all live outside it. That overhead is roughly a
 * constant, not a proportion of the box, so it is reserved as an absolute
 * rather than as a percentage — a percentage starves a small container while
 * wasting headroom on a large one.
 *
 * Sized by measurement on the deploy target (2 cores, 8192 MB):
 *   ceiling 8192 -> the container OOM-kills the build. No headroom at all.
 *   ceiling 5734 -> no OOM, but the build never finishes. With only 2 cores
 *                   V8 cannot hide major GCs behind concurrent marking, so a
 *                   tight heap trades a crash for a stall. The cost of a low
 *                   ceiling is invisible on a many-core workstation.
 *   ceiling 7168 -> what this reserve produces there.
 */
const RESERVED_MB = 1024;

/**
 * `os.totalmem()` reports the HOST's memory from inside a container, which is
 * precisely the number that must not be trusted here. cgroup is the only
 * source that knows the limit the OOM killer will actually enforce.
 */
function detectLimitMb() {
  const cgroupFiles = [
    "/sys/fs/cgroup/memory.max", // cgroup v2
    "/sys/fs/cgroup/memory/memory.limit_in_bytes", // cgroup v1
  ];

  for (const file of cgroupFiles) {
    let raw;
    try {
      raw = readFileSync(file, "utf8").trim();
    } catch {
      continue; // absent on Windows and outside containers
    }
    if (raw === "max") continue; // v2 spelling for "no limit"
    const bytes = Number(raw);
    // v1 spells "no limit" as a sentinel near 2^63, which is not a limit.
    if (!Number.isFinite(bytes) || bytes <= 0 || bytes > Number.MAX_SAFE_INTEGER) continue;
    const mb = Math.floor(bytes / 1024 / 1024);
    if (mb >= 512 && mb < totalmem() / 1024 / 1024) {
      return { mb, source: file };
    }
  }

  return { mb: Math.floor(totalmem() / 1024 / 1024), source: "os.totalmem()" };
}

const rawOverride = process.env.BUILD_HEAP_MB ?? "";
const override = Number(rawOverride);

// One predicate, used by both the value and the message below. They used to be
// two — `Number.isFinite(override) && override > 0` for the value and a bare
// `override > 0` for the log — and they disagreed for anything positive but not
// finite ("Infinity", "1e999"): the value was discarded while the log still
// announced an override. A line whose entire job is to be believed when a build
// dies must not describe a state the script is not in.
//
// Integers only. V8 parses --max-old-space-size as size_t and rejects "6.5"
// outright, so a fractional value would turn this emergency lever into an
// instant `bad option` exit. Truncating instead would be worse: BUILD_HEAP_MB=6.5
// would silently become a 6 MB ceiling and die mid-build as a fake OOM.
const hasOverride = Number.isInteger(override) && override > 0;

// A value that was supplied and then dropped is the one case that must never be
// silent: "8G", "8192mb" and "8_192" all parse to NaN, and the operator would
// otherwise watch the build ignore their lever with no explanation.
if (rawOverride !== "" && !hasOverride) {
  console.warn(
    `[build] ignoring BUILD_HEAP_MB=${JSON.stringify(rawOverride)} — expected a positive integer number of megabytes (e.g. 6144), not a size suffix`,
  );
}

const detected = detectLimitMb();
const headroom = detected.mb - RESERVED_MB;

// null means "set no flag at all" — see the comment on CEILING_MB.
const heapMb = hasOverride ? override : headroom >= CEILING_MB ? CEILING_MB : null;

/**
 * True when this box cannot even afford the ceiling — the same measurement that
 * decides the heap flag also decides whether the build can afford to type-check.
 * Exported to the child as DIM_CONSTRAINED_BUILD and read by next.config.ts.
 *
 * Deliberately derived from the machine rather than from a vendor flag. The
 * first version of this keyed off `process.env.VERCEL`, which only exists when
 * a project has "Automatically expose System Environment Variables" enabled —
 * a setting that can be off, in which case the guard silently never fires and
 * the build fails exactly as it did before. The cgroup limit is not optional
 * and cannot be switched off in a dashboard.
 */
const constrained = heapMb === null;

// Printed unconditionally: when a build dies of memory, the log has to already
// contain what the build believed about its own limits. Reproducing an OOM to
// find that out costs a deploy cycle.
console.log(
  hasOverride
    ? `[build] heap ceiling ${heapMb} MB (BUILD_HEAP_MB override)`
    : constrained
      ? `[build] no heap ceiling set — ${detected.mb} MB available via ${detected.source}, too little to raise one; Node sizes its own heap and the build skips its type pass`
      : `[build] heap ceiling ${heapMb} MB — ${detected.mb} MB available via ${detected.source}`,
);

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");

// Appended, not assigned: an inherited NODE_OPTIONS may already carry flags
// this script has no business dropping.
const nodeOptions = [
  process.env.NODE_OPTIONS,
  heapMb === null ? null : `--max-old-space-size=${heapMb}`,
]
  .filter(Boolean)
  .join(" ");

const child = spawn(process.execPath, [nextBin, "build", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_OPTIONS: nodeOptions,
    DIM_CONSTRAINED_BUILD: constrained ? "1" : "",
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    // A signal is not an exit code. SIGKILL here is the OOM killer, and saying
    // so beats the bare "exited with 1" that sent us reading Vercel's docs.
    const hint = signal === "SIGKILL" ? " — this is almost always the out-of-memory killer." : "";
    console.error(`[build] next build was killed by ${signal}${hint}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
child.on("error", (error) => {
  console.error(`[build] could not start next build: ${error.message}`);
  process.exit(1);
});
