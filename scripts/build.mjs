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
 * Kept at the value package.json used to hardcode, so the ceiling on a 32 GB
 * workstation stays exactly what it is today and the fix that introduced it
 * cannot regress. It is deliberately far above need: measured 2026-08-20, this
 * repo's `next build` completes with a ceiling of 2867 MB, so anything above
 * ~3 GB is headroom. A ceiling costs nothing when unused.
 */
const CEILING_MB = 8192;

/**
 * V8's old space is not the whole process: native allocations, source maps,
 * the pnpm parent and the OS all live outside it. Leaving headroom is what
 * makes the ceiling protective rather than decorative.
 */
const HEAP_FRACTION = 0.7;

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

const override = Number(process.env.BUILD_HEAP_MB);
const detected = detectLimitMb();
const heapMb =
  Number.isFinite(override) && override > 0
    ? override
    : Math.min(CEILING_MB, Math.floor(detected.mb * HEAP_FRACTION));

// Printed unconditionally: when a build dies of memory, the log has to already
// contain what the build believed about its own limits. Reproducing an OOM to
// find that out costs a deploy cycle.
console.log(
  override > 0
    ? `[build] heap ceiling ${heapMb} MB (BUILD_HEAP_MB override)`
    : `[build] heap ceiling ${heapMb} MB — ${detected.mb} MB available via ${detected.source}`,
);

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");

// Appended, not assigned: an inherited NODE_OPTIONS may already carry flags
// this script has no business dropping.
const nodeOptions = [process.env.NODE_OPTIONS, `--max-old-space-size=${heapMb}`]
  .filter(Boolean)
  .join(" ");

const child = spawn(process.execPath, [nextBin, "build", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, NODE_OPTIONS: nodeOptions },
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
