// @vitest-environment jsdom
//
// Deep-link wayfinding: the brotes `?signalId=` param must land on a concrete
// row, not vanish. This test locks the two SSR-observable halves of that
// behavior on OutbreakSignalRow:
//   1. Every row exposes a stable scroll anchor `id="signal-<eventId>"` so the
//      client ScrollToSignal helper can find it.
//   2. When `highlighted`, the row marks itself `aria-current` and paints the
//      highlight ring — the affordance change the review flagged as missing.

import "@testing-library/jest-dom/vitest";

import { cleanup, render } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SurveillanceSignal } from "@/lib/analytics/govt-dashboards";

import { OutbreakSignalRow } from "./OutbreakSignalRow";

// next/link → plain anchor for SSR-style render.
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

afterEach(cleanup);

const SIGNAL: SurveillanceSignal = {
  signalEventId: "11111111-2222-3333-4444-555555555555",
  petId: "pet-1",
  petPublicToken: "DIM-TEST-0001",
  petName: "Firulais",
  petSpecies: "dog",
  diseaseCode: "RAB",
  diseaseName: "Rabia",
  province: "Córdoba",
  locality: "Villa María",
  detectedAt: new Date("2026-07-01T12:00:00Z"),
  authorRole: "vet",
  authorVerified: true,
  authorOrganizationId: null,
  payload: {},
};

describe("OutbreakSignalRow — signalId deep-link affordance", () => {
  it("always renders a stable scroll anchor id for the signal", () => {
    const { container } = render(<OutbreakSignalRow signal={SIGNAL} />);
    const li = container.querySelector(`#signal-${SIGNAL.signalEventId}`);
    expect(li).not.toBeNull();
    expect(li?.tagName).toBe("LI");
  });

  it("marks the row as current and paints the highlight ring when highlighted", () => {
    const { container } = render(<OutbreakSignalRow signal={SIGNAL} highlighted />);
    const li = container.querySelector(`#signal-${SIGNAL.signalEventId}`);
    expect(li).toHaveAttribute("aria-current", "true");
    expect(li?.className).toContain("ring-2");
    expect(li?.className).toContain("ring-ln-op-azul");
  });

  it("does not highlight when not the deep-link target", () => {
    const { container } = render(<OutbreakSignalRow signal={SIGNAL} highlighted={false} />);
    const li = container.querySelector(`#signal-${SIGNAL.signalEventId}`);
    expect(li).not.toHaveAttribute("aria-current");
    expect(li?.className).not.toContain("ring-2");
  });
});
