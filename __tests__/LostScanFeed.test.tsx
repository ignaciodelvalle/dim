// Unit tests for <LostScanFeed> photo rendering (P0g).
//
// Tests verify:
//   1. Renders an <img> when a sighting item has a photoUrl.
//   2. Renders the "foto adjunta" text fallback when photoStoragePath is set
//      but photoUrl is absent (no signed URL resolved yet).
//   3. Renders neither photo nor "foto adjunta" when no photo fields are set.
//   4. Renders finder contact info when finderContact is set.

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LostScanFeed, type ScanFeedItem } from "@/components/pet-profile/LostScanFeed";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSightingItem(overrides: Partial<Extract<ScanFeedItem, { kind: "sighting" }>> = {}): ScanFeedItem {
  return {
    kind: "sighting",
    id: "test-sighting-id",
    at: new Date("2026-05-01T10:00:00Z"),
    description: "Vi un perro parecido.",
    localityLabel: null,
    lat: "-34.9",
    lng: "-57.9",
    ...overrides,
  };
}

function renderFeed(items: ScanFeedItem[]): string {
  return renderToStaticMarkup(
    React.createElement(LostScanFeed, {
      items,
      totalScans: 0,
      totalSightings: items.length,
      caseHref: "/casos/LOS-00001",
    }),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LostScanFeed — photo rendering (P0g)", () => {
  it("renders an <img> when the sighting item has a photoUrl", () => {
    const items = [makeSightingItem({ photoUrl: "https://cdn.example.com/signed/abc.jpg" })];
    const html = renderFeed(items);

    // An img element with the signed URL should be present.
    expect(html).toContain("<img");
    expect(html).toContain("https://cdn.example.com/signed/abc.jpg");
    // The alt text should be descriptive (in Spanish, per repo convention).
    expect(html).toContain("Foto adjunta al avistaje");
    // The "foto adjunta" text fallback should NOT appear when a real img is rendered.
    expect(html).not.toContain("📷 foto adjunta");
  });

  it("renders 'foto adjunta' text fallback when photoStoragePath is set but photoUrl is absent", () => {
    const items = [makeSightingItem({ photoStoragePath: "finder/abc123.jpg", photoUrl: null })];
    const html = renderFeed(items);

    expect(html).not.toContain("<img");
    expect(html).toContain("foto adjunta");
  });

  it("renders neither photo nor text fallback when no photo fields are set", () => {
    const items = [makeSightingItem({ photoStoragePath: null, photoUrl: null })];
    const html = renderFeed(items);

    expect(html).not.toContain("<img");
    expect(html).not.toContain("foto adjunta");
  });

  it("renders finder contact info when finderContact is set", () => {
    const items = [makeSightingItem({ finderContact: "11-5555-1234" })];
    const html = renderFeed(items);

    expect(html).toContain("11-5555-1234");
    expect(html).toContain("📞");
  });

  it("renders nothing for photo/contact when neither is set", () => {
    const items = [makeSightingItem({ finderContact: null, photoStoragePath: null, photoUrl: null })];
    const html = renderFeed(items);

    expect(html).not.toContain("📞");
    expect(html).not.toContain("📷");
    expect(html).not.toContain("<img");
  });
});
