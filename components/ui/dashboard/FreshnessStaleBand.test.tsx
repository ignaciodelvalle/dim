// @vitest-environment jsdom
//
// FreshnessStaleBand — stale data banding (degraded-states 2026-08-06).
//
// Fake-timer suite for the four spec scenarios:
//   1. data within threshold (5 min)  → no band;
//   2. data past threshold (12 min)   → amber band, exact copy
//      "Mostrando datos de hace 12 min · Actualizar";
//   3. live refresh before threshold  → clock resets, band suppressed;
//   4. clock-skew immunity            → the component only ever diffs
//      Date.now() against Date.now(); the refresh signal is an opaque token.

import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STALE_BAND_AFTER_MS } from "@/lib/ui/degraded-states";
import { FreshnessStaleBand } from "./FreshnessStaleBand";

const MINUTE = 60_000;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("<FreshnessStaleBand>", () => {
  it("renders nothing while the data is within the threshold (5 min old)", () => {
    render(<FreshnessStaleBand refreshSignal="t0" />);
    advance(5 * MINUTE);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("turns amber past the threshold with the exact es-AR copy (12 min old)", () => {
    render(<FreshnessStaleBand refreshSignal="t0" />);
    advance(12 * MINUTE);

    const band = screen.getByRole("status");
    expect(band).toHaveTextContent("Mostrando datos de hace 12 min · Actualizar");
    // Amber = semantic st-warn / sk-warn tokens (skin-aware), never a raw hue.
    expect(band.className).toContain("st-warn");
    expect(band.className).toContain("sk-warn-wash");
  });

  it("uses STALE_BAND_AFTER_MS as the single threshold constant (10 min default)", () => {
    expect(STALE_BAND_AFTER_MS).toBe(10 * MINUTE);
    render(<FreshnessStaleBand refreshSignal="t0" />);
    // One tick past the threshold → visible; the tick BEFORE it → not.
    advance(10 * MINUTE);
    expect(screen.queryByRole("status")).toBeNull();
    advance(MINUTE);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("suppresses the band when a live refresh lands before the threshold (clock resets)", () => {
    const { rerender } = render(<FreshnessStaleBand refreshSignal="t0" />);
    advance(8 * MINUTE);

    // Live data refresh: the parent RSC re-renders with a new opaque signal.
    rerender(<FreshnessStaleBand refreshSignal="t1" />);
    advance(8 * MINUTE);

    // 16 real minutes elapsed, but only 8 since the refresh — no band.
    expect(screen.queryByRole("status")).toBeNull();

    advance(3 * MINUTE);
    expect(screen.getByRole("status")).toHaveTextContent("hace 11 min");
  });

  it('offers "Actualizar" as a plain full-document anchor', () => {
    render(<FreshnessStaleBand refreshSignal="t0" />);
    advance(11 * MINUTE);
    const link = screen.getByText("Actualizar");
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", "");
  });

  it("is clock-skew immune: never reads a server timestamp as a time value", () => {
    // A wildly 'skewed' signal value (a server clock 3 hours ahead) changes
    // nothing: the signal is identity-only, elapsed time is client-local.
    const skewed = String(Date.now() + 3 * 60 * MINUTE);
    render(<FreshnessStaleBand refreshSignal={skewed} />);
    advance(5 * MINUTE);
    expect(screen.queryByRole("status")).toBeNull();
    advance(6 * MINUTE);
    expect(screen.getByRole("status")).toHaveTextContent("hace 11 min");
  });
});
