// Jest, via `jest-expo` — the runner the Expo toolchain ships and validates.
//
// It is NOT the web app's Vitest, and that separation is deliberate on both
// sides: the root `vitest.config.ts` builds its file list by walking the repo
// for `*.test.ts`, and `apps` is excluded from that walk (`__tests__/db-
// reachability.ts`). Without that exclusion this file's tests would be swept
// into the web suite, collected in jsdom with the web app's aliases, and fail
// as "broken files" in the `pnpm test:verified` verdict — a mobile test taking
// the web gate down.
//
// `pnpm --filter mimar test` runs this. It is deliberately NOT wired into the
// root `verify` chain in M1: it is a second runner with a second install to
// warm, and putting it in the web gate before there is anything to protect
// slows every web change down for no benefit.

module.exports = {
  preset: "jest-expo",
  // The mapping module is pure TypeScript; the platform-specific projects the
  // preset defines all run it identically. `node` is the cheapest and does not
  // stand up a React Native environment nothing in this test needs.
  testEnvironment: "node",

  // `roots` is a PATH; `testMatch` is a GLOB. Keeping `<rootDir>` out of the
  // glob is load-bearing on Windows, and it cost a debugging round to find out.
  //
  // `testMatch: ["<rootDir>/src/**/*.test.ts"]` expands to an absolute Windows
  // path, and micromatch reads `\` as an ESCAPE character, not a separator. In
  // this checkout the path contains `\.claude\`, so the pattern became
  // `…/dim\.claude/…` — an escaped literal dot — and matched nothing. Jest
  // reported "16 files checked, 0 matches" with no hint that the pattern itself
  // was the problem. Anchoring with `roots` and leaving the glob relative sides
  // steps the whole class: no separator ever reaches micromatch.
  roots: ["<rootDir>/src"],
  testMatch: ["**/*.test.ts", "**/*.test.tsx"],
};
