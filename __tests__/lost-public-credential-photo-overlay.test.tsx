// Regression — QA round 2 finding #0 (North-Star-breaking).
//
// LostPublicCredential renders the pet photo as <Image fill>, which emits
// position:absolute. Its wrapper span had NO `relative`, so the absolutely
// positioned <img> escaped to the viewport as its containing block and painted
// full-bleed ON TOP of every finder CTA — a finder scanning the QR of a
// photographed lost pet could not tap "Llamar", "La tengo conmigo" or
// "La vi cerca de acá" (document.elementFromPoint returned the IMG at all
// three CTA centers; repro: /p/DIM-4SUZ-U2HT).
//
// This test locks the two invariants that make the photo non-blocking:
//   1. the <Image fill> wrapper is a positioned ancestor (`relative`), so the
//      photo is contained inside the 128px avatar circle;
//   2. the decorative photo carries `pointer-events-none`, so even if stacking
//      ever regresses it can never intercept a tap.
//
// Rendering strategy mirrors public-token-landing-structure.test.tsx:
// react-dom/server → static HTML string, next/dynamic + next/link mocked.

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// next/dynamic — the component lazy-loads the MapLibre mini-map. Render a
// no-op so the tree resolves synchronously to static markup.
vi.mock("next/dynamic", () => ({
  default: () => () => null,
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => React.createElement("a", { href, className }, children),
}));

import { LostPublicCredential } from "@/components/pet-profile/LostPublicCredential";

function renderCredentialWithPhoto(): string {
  return renderToStaticMarkup(
    <LostPublicCredential
      petName="Michi"
      petPhotoUrl="https://example.test/storage/pets/michi.jpg"
      petSex="female"
      identityLine="Felino · gris"
      ownerFirstName="Lucía"
      ownerPhoneE164="+5491155551234"
      lastSeenPlaceName="Plaza Irlanda"
      lastSeenLocality="Caballito, CABA"
      distinguishingFeatures="Collar rojo"
      finderFormHref="/p/DIM-TEST-0001/encontre"
      sightingFormHref="/p/DIM-TEST-0001/sighting"
      lostSince={new Date("2026-07-01T12:00:00Z")}
    />,
  );
}

/** The avatar <img> tag (first and only <img> — map is mocked, no tattoo photo passed). */
function extractAvatarImgTag(html: string): { tag: string; index: number } {
  const index = html.indexOf("<img");
  expect(index).toBeGreaterThan(-1);
  const end = html.indexOf(">", index);
  return { tag: html.slice(index, end + 1), index };
}

/** Class attribute of the innermost element that wraps the given offset. */
function enclosingSpanClass(html: string, offset: number): string {
  const before = html.slice(0, offset);
  const spanStart = before.lastIndexOf("<span");
  expect(spanStart).toBeGreaterThan(-1);
  const spanTag = before.slice(spanStart, before.indexOf(">", spanStart) + 1 || undefined);
  const match = /class="([^"]*)"/.exec(spanTag);
  return match?.[1] ?? "";
}

describe("LostPublicCredential — photographed lost pet (QA round 2 #0)", () => {
  it("contains the fill photo inside a positioned avatar wrapper", () => {
    const html = renderCredentialWithPhoto();
    const { index } = extractAvatarImgTag(html);
    // <Image fill> contract: the parent MUST be a positioned ancestor,
    // otherwise the img paints full-viewport over the CTAs.
    const wrapperClass = enclosingSpanClass(html, index);
    expect(wrapperClass.split(/\s+/)).toContain("relative");
  });

  it("marks the decorative photo pointer-events-none so it can never swallow a tap", () => {
    const html = renderCredentialWithPhoto();
    const { tag } = extractAvatarImgTag(html);
    expect(tag).toMatch(/pointer-events-none/);
  });

  it("still renders all three finder CTAs (call / encontre / sighting)", () => {
    const html = renderCredentialWithPhoto();
    expect(html).toContain('href="tel:+5491155551234"');
    expect(html).toContain('href="/p/DIM-TEST-0001/encontre"');
    expect(html).toContain('href="/p/DIM-TEST-0001/sighting"');
  });
});
