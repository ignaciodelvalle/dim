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

import {
  LostScanFeed,
  type ScanFeedItem,
  relativeShort,
} from "@/components/pet-profile/LostScanFeed";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSightingItem(
  overrides: Partial<Extract<ScanFeedItem, { kind: "sighting" }>> = {},
): ScanFeedItem {
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
    expect(html).not.toContain("foto adjunta");
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
    // The phone glyph is now a lucide icon routed through <Icon name="telefono">.
    expect(html).toContain('data-icon-name="telefono"');
  });

  it("renders nothing for photo/contact when neither is set", () => {
    const items = [
      makeSightingItem({ finderContact: null, photoStoragePath: null, photoUrl: null }),
    ];
    const html = renderFeed(items);

    expect(html).not.toContain('data-icon-name="telefono"');
    expect(html).not.toContain('data-icon-name="camara"');
    expect(html).not.toContain("<img");
  });
});

describe("relativeShort — pure given a fixed now", () => {
  const NOW = new Date("2026-07-04T12:00:00Z").getTime();

  it("is deterministic: same (date, now) yields the same label across calls", () => {
    const d = new Date("2026-07-04T09:30:00Z");
    expect(relativeShort(d, NOW)).toBe(relativeShort(d, NOW));
  });

  it("buckets elapsed time correctly against a frozen now", () => {
    expect(relativeShort(new Date("2026-07-04T11:59:40Z"), NOW)).toBe("ahora");
    expect(relativeShort(new Date("2026-07-04T11:30:00Z"), NOW)).toBe("hace 30 min");
    expect(relativeShort(new Date("2026-07-04T09:00:00Z"), NOW)).toBe("hace 3 h");
    expect(relativeShort(new Date("2026-07-01T12:00:00Z"), NOW)).toBe("hace 3 d.");
  });
});
