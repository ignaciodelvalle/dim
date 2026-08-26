// Fitness test for `@dim/contract/links` — the deep-link table (T3.3).
//
// WHAT THIS PROTECTS
// ---------------------------------------------------------------------------
// A destination table is only worth having if every row in it actually resolves.
// A row naming a route that was renamed or deleted is WORSE than a template
// literal at the call site: the template literal is at least visible next to the
// page it points at, while a stale row is a promise made in a package that
// compiles perfectly and produces a 404 for whoever scanned the QR.
//
// So the table is checked against the file system router itself — the app/
// tree, which cannot lie about which routes exist — rather than against a second
// hand-maintained list, which could rot the same way.
//
// NON-VACUITY. Both sides carry a floor. A glob that stops matching produces an
// empty route set, an empty route set makes every check trivially unsatisfiable
// (or, if inverted, trivially satisfied), and this repo has been bitten by a
// fence whose corpus quietly missed its subject often enough to write the floor
// first and the check second.

import { globSync } from "node:fs";

import {
  APP_SCHEME,
  DEEP_LINK_MAP,
  type DeepLinkName,
  deepLinkAppUrl,
  deepLinkPath,
  deepLinkUrl,
  pathParamNames,
} from "@dim/contract/links";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// The route set, derived from app/
// ---------------------------------------------------------------------------

/** Floors. Both are far below the measurement (18 rows, 300+ routes). */
const MIN_MAP_ENTRIES = 15;
const MIN_DISCOVERED_ROUTES = 150;

/**
 * A pattern with its dynamic segments erased, so `/p/[publicToken]` from the
 * file system and `/p/:publicToken` from the table compare equal.
 *
 * Erasing rather than comparing names is deliberate: Next names the parameter
 * in the DIRECTORY, and several of those names disagree with the table's on
 * purpose (`/r/invite/[token]` vs `:invitationToken`, `/denuncias/codigo/[code]`
 * vs `:referenceCode`). The directory name is an implementation detail of one
 * page; the table's name is what a caller writes. What must match is the SHAPE.
 */
function eraseParams(pattern: string): string {
  return pattern
    .split("/")
    .map((segment) => (segment.startsWith(":") || segment.startsWith("[") ? "*" : segment))
    .join("/");
}

/**
 * Every routable path in `app/`, as an erased pattern.
 *
 * Route groups `(app)` / `(public)` are removed — they organise layouts and
 * contribute nothing to the url. `_`-prefixed directories are Next's private
 * folders and are not routes at all. Catch-alls are skipped: nothing in the
 * table is a catch-all, and pretending `[...slug]` matches one erased segment
 * would let a stale row pass by accident.
 */
function discoverRoutes(): Set<string> {
  const files = [...globSync("app/**/page.tsx"), ...globSync("app/**/route.ts")].map((f) =>
    f.replaceAll("\\", "/"),
  );

  const routes = new Set<string>();
  for (const file of files) {
    if (file.includes("node_modules/")) continue;
    const withoutFile = file.replace(/^app/, "").replace(/\/(page\.tsx|route\.ts)$/, "");
    const segments = withoutFile.split("/").filter((s) => s !== "");
    if (segments.some((s) => s.startsWith("_") || s.startsWith("["))) {
      // `_private` folders are not routes; catch-alls are handled above.
      if (segments.some((s) => s.startsWith("_") || s.startsWith("[..."))) continue;
    }
    const visible = segments.filter((s) => !(s.startsWith("(") && s.endsWith(")")));
    routes.add(eraseParams(`/${visible.join("/")}`));
  }
  return routes;
}

// ---------------------------------------------------------------------------
// The SECOND corpus, derived from apps/mobile/app/
// ---------------------------------------------------------------------------

/** Floor for the native screen set. Far below the measurement (14 screens). */
const MIN_APP_SCREENS = 8;

/**
 * The one destination whose `mimar://` form names no screen, with its reason.
 *
 * `appointment` is a QR PAYLOAD for a front-desk reader that does not exist yet
 * — see the entry's own comment. It is an exception rather than a reason to
 * weaken the rule, because the rule is what stops the next `appPath` from being
 * a link that opens the app onto nothing.
 */
const APP_PATH_EXCEPTIONS = new Set<DeepLinkName>(["appointment"]);

/**
 * Every screen in `apps/mobile/app/`, as an erased pattern.
 *
 * expo-router's file conventions, which differ from Next's in the three ways
 * that matter here: `index.tsx` IS its directory, `_layout.tsx` is not a route,
 * and `+`-prefixed files (`+not-found`) are the framework's own fallbacks rather
 * than addressable destinations.
 */
function discoverAppScreens(): Set<string> {
  const files = globSync("apps/mobile/app/**/*.tsx").map((f) => f.replaceAll("\\", "/"));

  const screens = new Set<string>();
  for (const file of files) {
    if (file.includes("node_modules/")) continue;
    const withoutRoot = file.replace(/^apps\/mobile\/app/, "").replace(/\.tsx$/, "");
    const segments = withoutRoot.split("/").filter((s) => s !== "");
    const last = segments.at(-1) ?? "";
    if (last === "_layout" || last.startsWith("+")) continue;
    // `index` names its parent directory, and the root `index` names "/".
    const visible = last === "index" ? segments.slice(0, -1) : segments;
    screens.add(eraseParams(`/${visible.join("/")}`));
  }
  return screens;
}

const ROUTES = discoverRoutes();
const APP_SCREENS = discoverAppScreens();
const NAMES = Object.keys(DEEP_LINK_MAP) as DeepLinkName[];

// ---------------------------------------------------------------------------

describe("the corpus is real", () => {
  it("discovers a plausible number of routes from app/", () => {
    expect(ROUTES.size).toBeGreaterThanOrEqual(MIN_DISCOVERED_ROUTES);
  });

  it("has a table with entries in it", () => {
    expect(NAMES.length).toBeGreaterThanOrEqual(MIN_MAP_ENTRIES);
  });

  // The corpus check that proves eraseParams() is doing its job rather than
  // mapping everything to the same string.
  it("recognises the credential route specifically", () => {
    expect(ROUTES.has("/p/*")).toBe(true);
    expect(ROUTES.has("/p/*/encontre")).toBe(true);
  });
});

describe("every destination resolves to a real route", () => {
  it.each(NAMES)("%s", (name) => {
    const erased = eraseParams(DEEP_LINK_MAP[name].webPath);
    expect(
      ROUTES.has(erased),
      [
        `deepLinkMap.${name} points at "${DEEP_LINK_MAP[name].webPath}", which matches no`,
        "page.tsx or route.ts under app/. Either the route moved and the table was not",
        "updated, or the table names a route that was never built.",
      ].join(" "),
    ).toBe(true);
  });
});

describe("the table is unambiguous", () => {
  it("has no two names pointing at the same path shape", () => {
    const byShape = new Map<string, DeepLinkName[]>();
    for (const name of NAMES) {
      const shape = eraseParams(DEEP_LINK_MAP[name].webPath);
      byShape.set(shape, [...(byShape.get(shape) ?? []), name]);
    }
    const collisions = [...byShape.entries()].filter(([, names]) => names.length > 1);
    expect(collisions, `collisions: ${JSON.stringify(collisions)}`).toEqual([]);
  });

  it("gives every path an absolute form", () => {
    for (const name of NAMES) {
      expect(DEEP_LINK_MAP[name].webPath.startsWith("/"), name).toBe(true);
      expect(DEEP_LINK_MAP[name].webPath.endsWith("/"), name).toBe(false);
    }
  });

  // A custom-scheme form that needed a parameter the web form does not have
  // could not be built from `DeepLinkParams<N>`, so this is a type hole the
  // compiler cannot see (the two strings are unrelated to it).
  it("never asks a mimar:// form for a parameter the web form lacks", () => {
    for (const name of NAMES) {
      const { webPath, appPath } = DEEP_LINK_MAP[name];
      if (appPath === null) continue;
      const webParams = new Set(pathParamNames(webPath));
      for (const param of pathParamNames(appPath)) {
        expect(webParams.has(param), `${name}: mimar:// form needs ":${param}"`).toBe(true);
      }
    }
  });

  // A `mimar://` form is a CLAIM THAT A SCREEN EXISTS, and the failure mode of a
  // false one is not an error: the app opens on a blank stack. So the claim is
  // checked against the native file-system router, which cannot lie about which
  // screens are there — the same reasoning that checks `webPath` against `app/`.
  //
  // THIS REPLACED A COUNT. The rule used to be `expect(withAppPath).toEqual
  // (["appointment"])`, written when the app had no screens worth naming and the
  // honest position was "the custom scheme resolves for nobody". That is no
  // longer true, and a frozen list would have made the fence fight the app
  // instead of checking it. What the old rule was PROTECTING — that nobody
  // builds links resolving to nothing — is exactly what this one enforces, and
  // it enforces it against reality rather than against a number.
  it.each(NAMES.filter((n) => DEEP_LINK_MAP[n].appPath !== null))(
    "%s names a screen the app actually has",
    (name) => {
      const appPath = DEEP_LINK_MAP[name].appPath as string;
      if (APP_PATH_EXCEPTIONS.has(name)) return;
      expect(
        APP_SCREENS.has(eraseParams(`/${appPath}`)),
        [
          `deepLinkMap.${name}.appPath is "${appPath}", which matches no screen under`,
          "apps/mobile/app/. A mimar:// url for it opens the app on a blank stack —",
          "custom schemes fail silently. Either add the screen, or set appPath to null.",
        ].join(" "),
      ).toBe(true);
    },
  );

  // The exception list is a list of DECISIONS, not a place to park failures, so
  // it is pinned. Growing it is a visible edit next to the reason.
  it("has exactly one destination claiming a screen that does not exist", () => {
    expect([...APP_PATH_EXCEPTIONS]).toEqual(["appointment"]);
    // …and it is the QR payload for a reader that does not exist yet. Kept
    // byte-for-byte because changing the string would break whatever eventually
    // reads it. See the entry's own comment.
    expect(DEEP_LINK_MAP.appointment.appPath).toBe("appointment/:appointmentToken");
  });

  // Non-vacuity for the second corpus. A glob that stops matching would make
  // every claim above trivially unsatisfiable, and the `.each` would go red —
  // but the EXCEPTION test would still pass, so the floor is what proves the
  // screen set is real.
  it("discovers the app's screens", () => {
    expect(APP_SCREENS.size).toBeGreaterThanOrEqual(MIN_APP_SCREENS);
    expect(APP_SCREENS.has("/mascotas/*")).toBe(true);
    expect(APP_SCREENS.has("/transferencias/*")).toBe(true);
  });

  // Every PUBLIC destination stays null, forever. A stranger's phone camera does
  // not follow `mimar://`, and a public link that only resolves for people with
  // the app installed is a lost pet nobody can report.
  it("never claims a public destination", () => {
    for (const name of NAMES) {
      if (DEEP_LINK_MAP[name].access !== "public") continue;
      expect(DEEP_LINK_MAP[name].appPath, `${name} is public and must have no mimar:// form`).toBe(
        null,
      );
    }
  });
});

describe("deepLinkPath", () => {
  it("fills the placeholders", () => {
    expect(deepLinkPath("credential", { publicToken: "DIM-PAMP-0001" })).toBe("/p/DIM-PAMP-0001");
    expect(deepLinkPath("credentialFinder", { publicToken: "DIM-PAMP-0001" })).toBe(
      "/p/DIM-PAMP-0001/encontre",
    );
  });

  it("returns a parameterless path unchanged", () => {
    expect(deepLinkPath("myPets", {})).toBe("/mis-mascotas");
  });

  it("encodes a value that would otherwise change the path shape", () => {
    expect(deepLinkPath("welfareReport", { referenceCode: "a/b" })).toBe("/denuncias/codigo/a%2Fb");
  });

  // The failure this guards is a poster with "/p/undefined" printed on it.
  it("refuses a missing or empty value instead of printing it", () => {
    // @ts-expect-error — the compiler already refuses this; the throw is for
    // the caller who reached the builder with data from a database column.
    expect(() => deepLinkPath("credential", {})).toThrow(/missing value for ":publicToken"/);
    expect(() => deepLinkPath("credential", { publicToken: "" })).toThrow(/missing value/);
  });
});

describe("deepLinkUrl", () => {
  it("prefixes the origin", () => {
    expect(deepLinkUrl("https://mimar.ar", "credential", { publicToken: "DIM-PAMP-0001" })).toBe(
      "https://mimar.ar/p/DIM-PAMP-0001",
    );
  });

  it("tolerates a trailing slash on the origin", () => {
    expect(deepLinkUrl("https://mimar.ar/", "credential", { publicToken: "X" })).toBe(
      "https://mimar.ar/p/X",
    );
  });
});

describe("deepLinkAppUrl", () => {
  // BYTE-FOR-BYTE what app/(app)/mis-turnos/[appointmentToken]/page.tsx encoded
  // into its check-in QR before the migration. Keeping the custom scheme working
  // is explicit scope: replacing it with an https url would claim a verified App
  // Link that has no Play-signed fingerprint behind it.
  it("builds the check-in QR payload unchanged", () => {
    expect(deepLinkAppUrl("appointment", { appointmentToken: "APT-123" })).toBe(
      "mimar://appointment/APT-123",
    );
    expect(APP_SCHEME).toBe("mimar");
  });

  it("refuses a destination the app does not claim", () => {
    expect(() => deepLinkAppUrl("credential", { publicToken: "DIM-PAMP-0001" })).toThrow(
      /no mimar:\/\/ form/,
    );
  });
});
