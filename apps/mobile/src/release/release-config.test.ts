// The release plumbing, held to the decisions that produced it.
//
// WHY THESE ARE TESTS AND NOT A PARAGRAPH IN A DOCUMENT
// ---------------------------------------------------------------------------
// `eas.json`, the `updates` block in `app.config.ts` and the three asset files
// are configuration nobody in this repo can execute: `npx eas-cli whoami`
// answers `Not logged in`, so no build, no update and no store upload has ever
// read any of it. The first time these files are exercised for real, they will
// be exercised by a machine that produces an artifact for twelve testers or for
// Play — which is the worst possible place to discover that a value drifted.
//
// So each assertion below stands in for a consequence that has no other alarm:
//
//   · a projectId that disagrees with itself → an app that polls an update
//     server for a project that does not exist, silently, forever;
//   · `appVersionSource` flipped back to `local` → two builds sharing a
//     versionCode and one of them permanently unpublishable;
//   · a channel renamed → a preview hotfix reaching production installs, or
//     reaching nobody;
//   · an `.aab` in the `preview` profile → a file twelve testers cannot open;
//   · an alpha channel in the app icon → an App Store Connect rejection at the
//     end of the release, not the start of it.
//
// None of these is caught by tsc (JSON and hex strings are not types), by
// `expo config` (it proves the file LOADS, not that the values are right), or
// by Metro (it never opens eas.json). This file is the only thing that looks.
//
// TWO READING STRATEGIES, AND THE SPLIT IS DELIBERATE. `eas.json`, `app.json`
// and the three PNGs are read as BYTES FROM DISK, because bytes on disk are
// exactly what EAS and the stores consume — a test that imported them as
// modules could pass against a shape TypeScript invented. `app.config.ts` is
// the opposite case: it is a FUNCTION, its output is what Expo actually uses,
// and reading it as text would assert against source rather than against the
// config. So it is imported and called, with app.json's block as its input,
// which is also how `expo config` reaches it.

import { readFileSync } from "node:fs";
import path from "node:path";
import { inflateSync } from "node:zlib";

import { describe, expect, it } from "@jest/globals";
import type { ConfigContext, ExpoConfig } from "expo/config";

import appConfigFactory from "../../app.config";

const MOBILE_ROOT = path.resolve(__dirname, "..", "..");

function readJson(relative: string): unknown {
  return JSON.parse(readFileSync(path.join(MOBILE_ROOT, relative), "utf8"));
}

const easJson = readJson("eas.json") as {
  cli: { appVersionSource: string; version: string };
  build: Record<
    string,
    {
      channel?: string;
      distribution?: string;
      developmentClient?: boolean;
      autoIncrement?: boolean;
      android?: { buildType?: string };
    }
  >;
};

const packageJson = readJson("package.json") as {
  scripts: Record<string, string | undefined>;
  dependencies: Record<string, string | undefined>;
};

const appJson = readJson("app.json") as { expo: ExpoConfig };

/**
 * The config `expo` would resolve, produced by calling the real factory.
 *
 * Not the plugin-resolved config — `expo-router` and `expo-splash-screen` never
 * run here — which is fine, because everything asserted below is written by the
 * factory itself or restated from app.json.
 */
const resolved: ExpoConfig = appConfigFactory({
  projectRoot: MOBILE_ROOT,
  config: appJson.expo,
} as ConfigContext);

describe("EAS build profiles", () => {
  it("owns the version counter remotely", () => {
    // The whole argument is in docs/mobile/eas-build-profiles.md. The short
    // version: `local` puts a monotonic counter in a file, this repo runs
    // parallel writers in git worktrees, and two worktrees at the same base
    // commit hold the same number. Play burns a versionCode on first upload and
    // never gives it back.
    expect(easJson.cli.appVersionSource).toBe("remote");
  });

  it("declares the three profiles the release path needs", () => {
    expect(Object.keys(easJson.build).sort()).toEqual(["development", "preview", "production"]);
  });

  it.each(["development", "preview", "production"])(
    "names %s's channel after the profile itself",
    (profile) => {
      // docs/mobile/ota-policy.md's channel table assumes this 1:1 mapping, and
      // it is what keeps `eas update --channel preview` away from a production
      // install. A rename on one side and not the other is invisible until a
      // hotfix lands on the wrong fleet.
      expect(easJson.build[profile]?.channel).toBe(profile);
    },
  );

  it("gives the testers a file their phones can install", () => {
    // An .aab is a publishing container Google's servers split into per-device
    // APKs at download time. Handing one to a tester hands them a file their
    // phone cannot open — which is a failure discovered by twelve people at
    // once, not by CI.
    expect(easJson.build.development?.android?.buildType).toBe("apk");
    expect(easJson.build.preview?.android?.buildType).toBe("apk");
    expect(easJson.build.development?.distribution).toBe("internal");
    expect(easJson.build.preview?.distribution).toBe("internal");
  });

  it("ships Play the only format Play accepts", () => {
    expect(easJson.build.production?.android?.buildType).toBe("app-bundle");
    expect(easJson.build.production?.distribution).toBe("store");
    expect(easJson.build.production?.autoIncrement).toBe(true);
  });
});

describe("development client", () => {
  it("is a real dependency and not just a flag on a script", () => {
    // `expo start --dev-client` was in package.json BEFORE expo-dev-client was
    // installed — a script that told the PO to scan a QR with an app nothing in
    // this repo could build. The two halves are asserted together because
    // either one alone is the aspirational state.
    expect(packageJson.dependencies["expo-dev-client"]).toBeDefined();
    expect(packageJson.scripts.start).toContain("--dev-client");
    expect(easJson.build.development?.developmentClient).toBe(true);
  });
});

describe("expo-updates", () => {
  it("points the update server at the same project the build belongs to", () => {
    // The project id is written twice in app.config.ts — once as
    // `extra.eas.projectId`, which is what `eas build` reads to identify the
    // project, and once inside `updates.url`, which is what the INSTALLED APP
    // polls. A copy-paste drift between them produces an app that checks a
    // project that does not exist and reports nothing: no crash, no log, no
    // hotfix, ever.
    const projectId = (resolved.extra as { eas?: { projectId?: string } } | undefined)?.eas
      ?.projectId;

    expect(projectId).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolved.updates?.url).toBe(`https://u.expo.dev/${projectId}`);
  });

  it("fences native changes out of the air with the fingerprint policy", () => {
    // This is the one part of the hotfix-only policy that is a MECHANISM.
    // `fingerprint` hashes what determines the native runtime, so an update
    // carrying a native change is published under a runtime version no
    // installed build has and reaches zero devices. Flip this to `appVersion`
    // and reason 1 of docs/mobile/ota-policy.md silently stops being enforced —
    // the document stays true and the system stops implementing it.
    expect(resolved.runtimeVersion).toEqual({ policy: "fingerprint" });
  });

  it("never blocks a cold start on the update server", () => {
    // Anything above 0 taxes 100% of launches — including every launch on the
    // waiting-room 4G this app is used on — to make a rare hotfix arrive one
    // launch sooner.
    expect(resolved.updates?.fallbackToCacheTimeout).toBe(0);
    expect(resolved.updates?.enabled).toBe(true);
  });

  it("declares exactly four keys, and no channel among them", () => {
    // A channel pinned in the app config would apply to EVERY build and
    // collapse the separation eas.json's per-profile channels exist to create —
    // a preview hotfix would reach production installs.
    //
    // Asserted as an exact key set rather than as four absences: the failure
    // this guards against is a key ARRIVING (a well-meaning
    // `requestHeaders: { "expo-channel-name": … }`, a `codeSigningCertificate`
    // nobody generated), and a list of things that must not be there can only
    // ever catch the ones somebody thought of.
    expect(Object.keys(resolved.updates ?? {}).sort()).toEqual([
      "checkAutomatically",
      "enabled",
      "fallbackToCacheTimeout",
      "url",
    ]);
  });
});

/**
 * Minimal PNG header reader — 8-byte signature, then the IHDR chunk.
 *
 * Hand-rolled rather than pulled from a dependency because it is nine bytes at
 * fixed offsets and the alternative is adding an image library to a React
 * Native app's test-time graph to read them.
 *
 * Colour type lives at offset 25. Bit 2 (value 4) is the alpha bit: 6 is RGBA,
 * 4 is grey+alpha, 2 is RGB, 0 is grey, 3 is palette.
 */
function readPng(relative: string): { width: number; height: number; hasAlpha: boolean } {
  const bytes = readFileSync(path.join(MOBILE_ROOT, relative));
  const signature = bytes.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") {
    throw new Error(`${relative} is not a PNG (signature ${signature})`);
  }
  const colourType = bytes.readUInt8(25);
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    hasAlpha: (colourType & 4) !== 0 || colourType === 3,
  };
}

/** PNG's Paeth predictor (filter type 4), verbatim from the spec. */
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * One filtered byte, reconstructed from its three neighbours.
 *
 * `a` is the byte one pixel to the left, `b` the one directly above, `c` the
 * one above-left — zero when off the edge of the image, per the spec.
 */
function unfilterByte(filter: number, value: number, a: number, b: number, c: number): number {
  switch (filter) {
    case 0:
      return value;
    case 1:
      return value + a;
    case 2:
      return value + b;
    case 3:
      return value + ((a + b) >> 1);
    case 4:
      return value + paeth(a, b, c);
    default:
      throw new Error(`unknown PNG filter type ${filter}`);
  }
}

/**
 * Walk the chunk list for the header and the concatenated pixel data.
 *
 * Refuses anything that is not what this repo's generator writes rather than
 * growing a decoder for cases no file here will ever be in: palettes, 16-bit
 * samples and Adam7 interlacing would each need their own reconstruction path,
 * and a wrong answer from a half-implemented one is worse than a throw.
 */
function readPngChunks(
  bytes: Buffer,
  label: string,
): { width: number; height: number; pixels: Buffer } {
  let cursor = 8; // past the signature
  let header: { width: number; height: number } | null = null;
  const pixelChunks: Buffer[] = [];

  while (cursor + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(cursor);
    const kind = bytes.subarray(cursor + 4, cursor + 8).toString("ascii");
    const data = bytes.subarray(cursor + 8, cursor + 8 + length);

    if (kind === "IHDR") {
      const bitDepth = data.readUInt8(8);
      const colourType = data.readUInt8(9);
      const interlace = data.readUInt8(12);
      if (bitDepth !== 8 || colourType !== 6 || interlace !== 0) {
        throw new Error(
          `${label}: expected 8-bit non-interlaced RGBA, got bitDepth=${bitDepth} ` +
            `colourType=${colourType} interlace=${interlace}`,
        );
      }
      header = { width: data.readUInt32BE(0), height: data.readUInt32BE(4) };
    } else if (kind === "IDAT") {
      pixelChunks.push(Buffer.from(data));
    } else if (kind === "IEND") {
      break;
    }

    cursor += 12 + length; // length + type + data + crc
  }

  if (!header) throw new Error(`${label}: no IHDR chunk`);
  return { ...header, pixels: Buffer.concat(pixelChunks) };
}

/**
 * Inflate and un-filter into a flat RGBA buffer.
 *
 * Each scanline is prefixed with its filter type and predicted from the bytes
 * to its left, above, and above-left — so the reconstruction has to run in
 * order and read its own output as it goes.
 */
function decodeRgba(pixels: Buffer, width: number, height: number, bpp: number): Buffer {
  const stride = width * bpp;
  const filtered = inflateSync(pixels);
  const raw = Buffer.alloc(height * stride);

  let read = 0;
  for (let y = 0; y < height; y++) {
    const filter = filtered[read] ?? 0;
    read += 1;
    const row = y * stride;
    const previous = (y - 1) * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? (raw[row + x - bpp] ?? 0) : 0;
      const b = y > 0 ? (raw[previous + x] ?? 0) : 0;
      const c = x >= bpp && y > 0 ? (raw[previous + x - bpp] ?? 0) : 0;
      raw[row + x] = unfilterByte(filter, filtered[read + x] ?? 0, a, b, c) & 0xff;
    }
    read += stride;
  }
  return raw;
}

/**
 * The bounding box of everything actually PAINTED in an RGBA PNG.
 *
 * WHY THIS EXISTS RATHER THAN A CONSTANT
 * -------------------------------------------------------------------------
 * The two assertions it serves — "the adaptive foreground survives Android's
 * mask" and "the splash is a tight crop" — are about the ARTWORK, and the
 * artwork's extent is not the file's dimensions. The mark is a fingerprint oval
 * with transparent corners composited onto a larger transparent canvas, so the
 * canvas size says nothing about how much of it is ink. Asserting the number
 * the generator was told to use would be two constants agreeing with each other
 * while the picture drifted anywhere it liked.
 *
 * WHY IT IS HAND-ROLLED
 * -------------------------------------------------------------------------
 * `sharp` would answer this in one call and is already a dependency — of the
 * WEB app, at the repo root. Pulling a native image library into a React Native
 * package's test graph to read an alpha channel is a bad trade; the whole
 * decoder is fifty lines because the files it reads are 8-bit, non-interlaced
 * RGBA written by one known generator, and it refuses loudly on anything else
 * rather than guessing.
 */
function inkBounds(relative: string): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  const BPP = 4;
  const bytes = readFileSync(path.join(MOBILE_ROOT, relative));
  const { width, height, pixels } = readPngChunks(bytes, relative);
  const raw = decodeRgba(pixels, width, height, BPP);
  const stride = width * BPP;

  // The box. Threshold at 8/255 rather than 0 so the resampler's faintest
  // anti-aliased fringe does not count as ink and inflate every measurement.
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((raw[y * stride + x * BPP + 3] ?? 0) > 8) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }

  if (right < 0) throw new Error(`${relative}: fully transparent — nothing is painted`);
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

describe("app identity assets", () => {
  it("declares the icon app.json points at, at store size", () => {
    expect(appJson.expo.icon).toBe("./assets/icon.png");
    const icon = readPng("assets/icon.png");
    expect(icon).toMatchObject({ width: 1024, height: 1024 });
  });

  it("ships an app icon with NO alpha channel", () => {
    // App Store Connect rejects an icon that HAS an alpha channel. It does not
    // check whether every pixel in it happens to be opaque, which is exactly
    // what compositing the mark over a solid ground produces — so
    // scripts/build-mobile-app-icons.ts calls removeAlpha() and this asserts it
    // stayed called. The rejection would otherwise land at the end of a release.
    expect(readPng("assets/icon.png").hasAlpha).toBe(false);
  });

  it("keeps the INKED adaptive foreground inside Android's safe zone", () => {
    const adaptive = appJson.expo.android?.adaptiveIcon;
    expect(adaptive?.foregroundImage).toBe("./assets/adaptive-icon-foreground.png");
    // The background is a flat paper fill rather than a second PNG — see the
    // header of scripts/build-mobile-app-icons.ts.
    expect(adaptive?.backgroundColor).toBe("#fbfaf5");

    const layer = readPng("assets/adaptive-icon-foreground.png");
    expect(layer).toMatchObject({ width: 1024, height: 1024, hasAlpha: true });

    // THE ASSERTION IS ON THE PIXELS, not on a constant restated from the
    // generator. Only the centre 66.6% of an adaptive layer is guaranteed to
    // survive every OEM mask — circle, squircle, teardrop — and what has to fit
    // inside it is the INK, which is not the same as the canvas the generator
    // composited onto. Comparing 588/1024 here would have been two constants
    // agreeing with each other while the actual artwork drifted anywhere it
    // liked.
    const ink = inkBounds("assets/adaptive-icon-foreground.png");
    expect(ink.width / layer.width).toBeLessThan(0.666);
    expect(ink.height / layer.height).toBeLessThan(0.666);

    // The non-vacuity floor. Without it, a 1×1 dot in the middle of a
    // transparent canvas — or a fully transparent file — satisfies every
    // assertion above and this test goes green on an invisible launcher icon.
    expect(ink.width / layer.width).toBeGreaterThan(0.4);

    // And it must be CENTRED, or "inside the safe zone" is being bought by
    // symmetry the mask does not provide. Both margins within a few pixels of
    // each other; 8 is generous for a rounding difference and far too tight for
    // a mark that slid.
    const leftMargin = ink.left;
    const rightMargin = layer.width - (ink.left + ink.width);
    expect(Math.abs(leftMargin - rightMargin)).toBeLessThanOrEqual(8);
  });

  it("splashes with the same mark, not a second one", () => {
    const splash = readPng("assets/splash-icon.png");
    expect(splash.hasAlpha).toBe(true);

    // The source mark is 637×463 with 610×443 of ink in it. Anything wider than
    // that ink would be interpolation; this one is a downscale, on purpose.
    expect(splash.width).toBeLessThan(610);

    // TIGHT CROP, asserted against the ink rather than declared. expo-splash-
    // screen renders this file at `imageWidth` dp, so transparent padding baked
    // into it would silently shrink the mark inside its own declared width and
    // force a compensating number in app.json. Allow a few pixels of slack for
    // the resampler's soft edge; anything more is padding.
    const ink = inkBounds("assets/splash-icon.png");
    expect(splash.width - ink.width).toBeLessThanOrEqual(4);

    // Same mark, same shape: the source's ink is 610×443, so whatever the
    // splash was scaled to must still carry that aspect ratio. This is what
    // would catch a second, differently-drawn mark dropped in under the same
    // filename — the one failure the dimension checks above cannot see.
    expect(splash.width / splash.height).toBeCloseTo(610 / 443, 1);
  });

  it("configures the splash plugin against the file it ships", () => {
    const plugins = appJson.expo.plugins ?? [];
    const splashPlugin = plugins.find(
      (entry): entry is [string, Record<string, unknown>] =>
        Array.isArray(entry) && entry[0] === "expo-splash-screen",
    );
    expect(splashPlugin).toBeDefined();
    expect(splashPlugin?.[1]).toMatchObject({
      image: "./assets/splash-icon.png",
      backgroundColor: "#fbfaf5",
    });
  });
});
