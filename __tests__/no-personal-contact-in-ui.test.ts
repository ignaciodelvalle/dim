// No consumer mailbox may appear in a user-facing surface.
//
// WHY THIS EXISTS (cold-start review RA-6, finding 3)
// ---------------------------------------------------------------------------
// components/LocalityPickerAcross.tsx's zero-result state shipped
// `mailto:<maintainer>@gmail.com` under the words "Sugerí esta localidad". That
// state is not an internal debug affordance: it renders on the PUBLIC /adoptar
// and /perdidas locality filters, on citizen registration, and on
// /admin/govts/new — the screen a funcionario uses to onboard a jurisdiction.
// A government product asked a public official to email a personal Gmail.
//
// The institutional inboxes already used elsewhere in the app are the answer:
// hola@mimar.ar (/terminos, /gob/perdidas, /gob/analytics) and
// privacidad@mimar.ar (/privacidad).
//
// SCOPE — app/ and components/ only, on purpose
// ---------------------------------------------------------------------------
// These are the surfaces a citizen or funcionario can actually read. `lib/` is
// NOT scanned yet because lib/infra/geocoding.ts still carries a personal
// address in its Nominatim USER_AGENT: OSM's usage policy requires a contact
// that is genuinely monitored, so swapping it is a PO call about which
// mailboxes exist, not a mechanical rename. Widen ROOTS to include "lib" the
// moment that lands. (`scripts/` and `docs/` are operator surfaces and stay
// out of scope; SECURITY.md's maintainer contact is deliberate and is not code.)

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// Free consumer mail providers. A product address lives on a domain the project
// controls; anything here is a person's private mailbox, whoever they are.
const CONSUMER_MAIL_DOMAINS = [
  "@gmail.com",
  "@googlemail.com",
  "@hotmail.com",
  "@hotmail.com.ar",
  "@outlook.com",
  "@yahoo.com",
  "@yahoo.com.ar",
  "@live.com",
  "@icloud.com",
  "@me.com",
  "@proton.me",
  "@protonmail.com",
];

/**
 * Strip comments so an address named in prose is not read as shipped copy.
 * Same detector as __tests__/seed-precondition-contract.test.ts — a docstring
 * illustrating masking ("juan.perez@gmail.com" in lib/utils/mask-contact.ts) is
 * documentation, not a link a user can click.
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

const ROOTS = ["app", "components"];

function collectUiFiles(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue;
    const dir = entry.parentPath ?? entry.path ?? root;
    if (dir.includes("node_modules")) continue;
    out.push(join(dir, entry.name));
  }
  return out;
}

const UI_FILES = ROOTS.flatMap(collectUiFiles);

const HITS = UI_FILES.map((file) => {
  const code = stripComments(readFileSync(file, "utf8"));
  return {
    file: file.replace(/\\/g, "/"),
    domains: CONSUMER_MAIL_DOMAINS.filter((d) => code.toLowerCase().includes(d)),
  };
}).filter((h) => h.domains.length > 0);

describe("no personal contact address in a user-facing surface (RA-6 finding 3)", () => {
  it("scans a real surface — the fence must not go inert", () => {
    expect(UI_FILES.length).toBeGreaterThan(300);
  });

  it("detects a consumer address on an executable line", () => {
    // Proves the detector works at all, and that comment stripping has not
    // swallowed the whole file: a fence that finds nothing because it looks at
    // nothing passes forever.
    const fixture = stripComments(
      ["// contacto: alguien@gmail.com", 'const href = "mailto:alguien@gmail.com";'].join("\n"),
    );
    expect(CONSUMER_MAIL_DOMAINS.filter((d) => fixture.includes(d))).toEqual(["@gmail.com"]);
    expect(fixture).not.toContain("contacto:");
  });

  it("no shipped page or component links to a personal mailbox", () => {
    expect(
      HITS.map((h) => `${h.file} (${h.domains.join(", ")})`),
      [
        "These files SHIP to citizens and funcionarios and name a free consumer mailbox.",
        "A government product must escalate to an address the institution owns, not to",
        "whoever happened to write the component.",
        "",
        "Use one of the institutional inboxes the app already uses:",
        "  hola@mimar.ar        general / catalog / access requests",
        "  privacidad@mimar.ar  data-protection requests (/privacidad)",
        "",
        "If no inbox fits, drop the mailto rather than inventing one — a dead end that",
        "looks official beats a live link to somebody's personal Gmail.",
      ].join("\n"),
    ).toEqual([]);
  });
});
