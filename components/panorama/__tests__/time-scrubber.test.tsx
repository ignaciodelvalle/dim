// @vitest-environment jsdom
//
// TimeScrubber — panorama-vista-redesign Phase 4 (loops / ticks / temporal
// gating). Temporal availability is sourced EXCLUSIVELY from the parent's
// `isTemporalLayer()` derivation (design Decision 4) — these tests pin the
// `temporalAvailable` prop contract, not a scrubber-local temporal set.

import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TimeScrubber } from "@/components/panorama/TimeScrubber";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const SINCE = new Date("2026-06-01T00:00:00Z");
const UNTIL = new Date("2026-07-01T00:00:00Z");

describe("TimeScrubber — temporal gating (design Decision 4)", () => {
  it("non-temporal vista: temporalAvailable=false shows the empty state instead of the track", () => {
    render(
      <TimeScrubber
        since={SINCE}
        until={UNTIL}
        onChange={vi.fn()}
        basis="valid"
        onBasisChange={vi.fn()}
        temporalAvailable={false}
      />,
    );

    expect(screen.getByText("No disponible en esta vista")).toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });

  it("adding a temporal layer self-enables the scrubber (temporalAvailable flips true, no reload)", () => {
    const { rerender } = render(
      <TimeScrubber
        since={SINCE}
        until={UNTIL}
        onChange={vi.fn()}
        basis="valid"
        onBasisChange={vi.fn()}
        temporalAvailable={false}
      />,
    );
    expect(screen.getByText("No disponible en esta vista")).toBeInTheDocument();

    rerender(
      <TimeScrubber
        since={SINCE}
        until={UNTIL}
        onChange={vi.fn()}
        basis="valid"
        onBasisChange={vi.fn()}
        temporalAvailable={true}
      />,
    );

    expect(screen.queryByText("No disponible en esta vista")).not.toBeInTheDocument();
    expect(screen.getByRole("slider")).toBeInTheDocument();
  });

  it("defaults to available (temporalAvailable omitted) — backward compatible", () => {
    render(
      <TimeScrubber since={SINCE} until={UNTIL} onChange={vi.fn()} basis="valid" onBasisChange={vi.fn()} />,
    );
    expect(screen.getByRole("slider")).toBeInTheDocument();
  });
});

describe("TimeScrubber — loop windows", () => {
  it("starting a 30-day loop shades the window and moves the thumb off the live edge", () => {
    render(
      <TimeScrubber since={SINCE} until={UNTIL} onChange={vi.fn()} basis="valid" onBasisChange={vi.fn()} />,
    );

    const slider = screen.getByRole("slider") as HTMLInputElement;
    expect(slider.value).toBe(slider.max); // starts live

    fireEvent.click(screen.getByRole("button", { name: "↺ 30 días" }));

    expect(Number(slider.value)).toBeLessThan(Number(slider.max));
    expect(screen.getByRole("button", { name: "↺ 30 días" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("'Ahora' clears the loop and returns to live", () => {
    render(
      <TimeScrubber since={SINCE} until={UNTIL} onChange={vi.fn()} basis="valid" onBasisChange={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "↺ 7 días" }));
    expect(screen.getByRole("button", { name: "↺ 7 días" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Volver a ahora (en vivo)" }));

    const slider = screen.getByRole("slider") as HTMLInputElement;
    expect(slider.value).toBe(slider.max);
    expect(screen.getByRole("button", { name: "↺ 7 días" })).toHaveAttribute("aria-pressed", "false");
  });

  it("the loop keeps cycling within the window instead of stopping at 'ahora'", () => {
    vi.useFakeTimers();
    render(
      <TimeScrubber since={SINCE} until={UNTIL} onChange={vi.fn()} basis="valid" onBasisChange={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "↺ 7 días" }));
    const slider = screen.getByRole("slider") as HTMLInputElement;
    const startIndex = Number(slider.value);

    // Advance past the full 7-day window (well beyond 7 ticks at 1.1s each).
    act(() => {
      vi.advanceTimersByTime(1100 * 20);
    });

    // Still playing (aria-pressed on play button), never reached/parked at live.
    expect(screen.getByRole("button", { name: "Pausar reproducción" })).toBeInTheDocument();
    // The index wrapped back near the window start rather than climbing forever.
    expect(Number(slider.value)).toBeLessThanOrEqual(startIndex + 8);
  });
});

describe("TimeScrubber — Simple/Detalle", () => {
  it("Simple (default) hides date ticks and the bitemporal basis toggle", () => {
    render(
      <TimeScrubber since={SINCE} until={UNTIL} onChange={vi.fn()} basis="valid" onBasisChange={vi.fn()} />,
    );
    expect(screen.queryByText("Cuándo ocurrió")).not.toBeInTheDocument();
  });

  it("Detalle shows the bitemporal basis toggle", () => {
    render(
      <TimeScrubber
        since={SINCE}
        until={UNTIL}
        onChange={vi.fn()}
        basis="valid"
        onBasisChange={vi.fn()}
        scrubDetail={true}
      />,
    );
    expect(screen.getByText("Cuándo ocurrió")).toBeInTheDocument();
    expect(screen.getByText("Según lo conocido al momento")).toBeInTheDocument();
  });
});
