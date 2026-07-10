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

  it("current-state base: shows the honest 'estado actual' disclaimer alongside the active track (trust/safety)", () => {
    // A temporal overlay keeps the scrubber active, but the base metric is
    // current-state — the dated label must not imply it varies with the corte.
    render(
      <TimeScrubber
        since={SINCE}
        until={UNTIL}
        onChange={vi.fn()}
        basis="valid"
        onBasisChange={vi.fn()}
        temporalAvailable={true}
        currentStateBaseLabel="cobertura antirrábica"
      />,
    );

    expect(screen.getByRole("slider")).toBeInTheDocument();
    expect(
      screen.getByText("Estado actual — cobertura antirrábica no varía con la fecha de corte."),
    ).toBeInTheDocument();
  });

  it("temporal base: no current-state disclaimer is rendered", () => {
    render(
      <TimeScrubber
        since={SINCE}
        until={UNTIL}
        onChange={vi.fn()}
        basis="valid"
        onBasisChange={vi.fn()}
        temporalAvailable={true}
      />,
    );

    expect(screen.queryByText(/no varía con la fecha de corte/)).not.toBeInTheDocument();
  });

  it("defaults to available (temporalAvailable omitted) — backward compatible", () => {
    render(
      <TimeScrubber
        since={SINCE}
        until={UNTIL}
        onChange={vi.fn()}
        basis="valid"
        onBasisChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("slider")).toBeInTheDocument();
  });
});

describe("TimeScrubber — loop windows", () => {
  it("starting a 30-day loop shades the window and moves the thumb off the live edge", () => {
    render(
      <TimeScrubber
        since={SINCE}
        until={UNTIL}
        onChange={vi.fn()}
        basis="valid"
        onBasisChange={vi.fn()}
      />,
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
      <TimeScrubber
        since={SINCE}
        until={UNTIL}
        onChange={vi.fn()}
        basis="valid"
        onBasisChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "↺ 7 días" }));
    expect(screen.getByRole("button", { name: "↺ 7 días" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "Volver a ahora (en vivo)" }));

    const slider = screen.getByRole("slider") as HTMLInputElement;
    expect(slider.value).toBe(slider.max);
    expect(screen.getByRole("button", { name: "↺ 7 días" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("the loop keeps cycling within the window instead of stopping at 'ahora'", () => {
    vi.useFakeTimers();
    render(
      <TimeScrubber
        since={SINCE}
        until={UNTIL}
        onChange={vi.fn()}
        basis="valid"
        onBasisChange={vi.fn()}
      />,
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

describe("TimeScrubber — QA fix: playback stops when temporal gating hides the controls", () => {
  it("a running play loop stops advancing once temporalAvailable flips false (no onChange behind the empty state)", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const { rerender } = render(
      <TimeScrubber
        since={SINCE}
        until={UNTIL}
        onChange={onChange}
        basis="valid"
        onBasisChange={vi.fn()}
        temporalAvailable={true}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Reproducir la formación de la situación" }),
    );
    expect(screen.getByRole("button", { name: "Pausar reproducción" })).toBeInTheDocument();
    onChange.mockClear();

    // Temporal gating hides the controls — the empty state replaces the track.
    rerender(
      <TimeScrubber
        since={SINCE}
        until={UNTIL}
        onChange={onChange}
        basis="valid"
        onBasisChange={vi.fn()}
        temporalAvailable={false}
      />,
    );
    expect(screen.getByText("No disponible en esta vista")).toBeInTheDocument();

    // Advance well past several play-loop ticks — the interval must not still
    // be running behind the empty state.
    act(() => {
      vi.advanceTimersByTime(1100 * 5);
    });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("TimeScrubber — QA fix: resetToken forces a live reset independent of `win`", () => {
  it("parks back at live and clears play/loop when resetToken bumps, even though since/until are unchanged", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <TimeScrubber
        since={SINCE}
        until={UNTIL}
        onChange={onChange}
        basis="valid"
        onBasisChange={vi.fn()}
        resetToken={0}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "↺ 7 días" }));
    const slider = screen.getByRole("slider") as HTMLInputElement;
    expect(Number(slider.value)).toBeLessThan(Number(slider.max));
    onChange.mockClear();

    // Same since/until (win is unchanged) — only the token bumps, mirroring a
    // scope-only change or a temporalAvailable flip the parent handled itself.
    rerender(
      <TimeScrubber
        since={SINCE}
        until={UNTIL}
        onChange={onChange}
        basis="valid"
        onBasisChange={vi.fn()}
        resetToken={1}
      />,
    );

    expect(slider.value).toBe(slider.max);
    expect(screen.getByRole("button", { name: "↺ 7 días" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("omitting resetToken keeps the existing (backward-compatible) behavior — no forced reset", () => {
    render(
      <TimeScrubber
        since={SINCE}
        until={UNTIL}
        onChange={vi.fn()}
        basis="valid"
        onBasisChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "↺ 7 días" }));
    const slider = screen.getByRole("slider") as HTMLInputElement;
    expect(Number(slider.value)).toBeLessThan(Number(slider.max));
  });
});

describe("TimeScrubber — QA fix: loop chips disabled for month-stepped (long) windows", () => {
  it("disables the loop chips and shows a hint when the active period steps by month (> 90 days)", () => {
    const longSince = new Date("2023-07-01T00:00:00Z");
    const longUntil = new Date("2026-07-01T00:00:00Z"); // ~3 years — month-stepped
    render(
      <TimeScrubber
        since={longSince}
        until={longUntil}
        onChange={vi.fn()}
        basis="valid"
        onBasisChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "↺ 7 días" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "↺ 30 días" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "↺ 90 días" })).toBeDisabled();
    expect(screen.getByText(/no están disponibles para períodos largos/)).toBeInTheDocument();
  });

  it("keeps the loop chips enabled for short (day-stepped) windows", () => {
    render(
      <TimeScrubber
        since={SINCE}
        until={UNTIL}
        onChange={vi.fn()}
        basis="valid"
        onBasisChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "↺ 7 días" })).toBeEnabled();
    expect(screen.queryByText(/no están disponibles para períodos largos/)).not.toBeInTheDocument();
  });
});

describe("TimeScrubber — Simple/Detalle", () => {
  it("Simple (default) hides date ticks and the bitemporal basis toggle", () => {
    render(
      <TimeScrubber
        since={SINCE}
        until={UNTIL}
        onChange={vi.fn()}
        basis="valid"
        onBasisChange={vi.fn()}
      />,
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
