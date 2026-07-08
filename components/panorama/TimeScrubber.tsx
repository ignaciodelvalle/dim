"use client";

// TimeScrubber — Panorama's temporal-reproduction control (spec F4).
//
// THE flagship differentiator: scrub the active period [since, now] back in time
// to WATCH a situation form (e.g. the Salta rabies cluster forming over ~12 days).
// The control owns NO data — it just emits the current `asOf` Date (or null when
// parked at "ahora"/live) and the parent console refetches the active TEMPORAL
// layers with `?asOf=<iso>`. Non-temporal layers are dimmed by the console.
//
// ACCESSIBILITY (WCAG 2.1):
//   - the slider is a native <input type="range"> with an aria-label, an
//     aria-valuetext announcing the HUMAN as-of date (not the raw index), and
//     keyboard arrows that step whole days (native range behaviour over a 0..steps
//     domain). aria-valuemin/max/now are the native attributes.
//   - play/pause and reset are real <button>s with aria-pressed / aria-label.
//   - a live region announces the current as-of date as it changes.
//
// PLAY LOOP: play steps the slider forward one day every PLAY_INTERVAL_MS via a
// single setInterval, cleaned up on pause, on reaching "ahora", and on unmount.
// (Date.now() is fine in client components in this repo; only workflow scripts
// forbid it. The window's `until` is provided by the parent so the axis is stable.)

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import {
  type ScrubWindow,
  type TimeBasis,
  buildScrubWindow,
  dayIndexToDate,
  formatAsOfLabel,
  nextPlayIndex,
} from "@/src/modules/panorama/domain/time-scrub";

/** Ms between play-loop day steps. ~1.1s reads as a deliberate reconstruction. */
const PLAY_INTERVAL_MS = 1100;

type Props = {
  /** Active period lower bound (the dashboards' `since`). */
  since: Date;
  /** Active period upper bound ("ahora" / live). Usually now. */
  until: Date;
  /**
   * Emits the current as-of Date, or null when parked at the live edge. The
   * parent refetches active temporal layers with this (null → drop `asOf`).
   */
  onChange: (asOf: Date | null) => void;
  /**
   * task #77 bitemporal — the active replay basis. "valid" (occurred_at, default)
   * replays "what happened when"; "transaction" (recorded_at) replays "what the
   * State KNEW when". The parent owns this so it can thread it into the layer fetch.
   */
  basis: TimeBasis;
  /** Emits the chosen basis when the operator flips the toggle. */
  onBasisChange: (basis: TimeBasis) => void;
};

export function TimeScrubber({ since, until, onChange, basis, onBasisChange }: Props) {
  // Rebuild the day-stepped axis only when the window endpoints change. Compare
  // by timestamp so a new Date object with the same instant does not rebuild.
  const sinceMs = since.getTime();
  const untilMs = until.getTime();
  const win: ScrubWindow = useMemo(
    () => buildScrubWindow(new Date(sinceMs), new Date(untilMs)),
    [sinceMs, untilMs],
  );

  // Slider index 0..steps. `steps` (the max) is "ahora"/live.
  const [index, setIndex] = useState<number>(win.steps);
  const [playing, setPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const labelId = useId();
  const liveId = useId();

  // When the window changes (new period/scope), snap back to live.
  useEffect(() => {
    setIndex(win.steps);
    setPlaying(false);
  }, [win]);

  // Derive the as-of Date for the current index. At the live edge → null.
  const atLive = index >= win.steps;
  const asOf = useMemo(() => (atLive ? null : dayIndexToDate(win, index)), [win, index, atLive]);
  const asOfLabel = atLive ? "Ahora (en vivo)" : formatAsOfLabel(dayIndexToDate(win, index));

  // Notify the parent whenever the resolved as-of changes (onChange via a ref so
  // a new callback identity each render does not re-fire the effect).
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    onChangeRef.current(asOf);
  }, [asOf]);

  const stopInterval = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Play loop: advance one day per tick; stop cleanly when we reach "ahora".
  useEffect(() => {
    if (!playing) {
      stopInterval();
      return;
    }
    intervalRef.current = setInterval(() => {
      setIndex((cur) => {
        const next = nextPlayIndex(win, cur);
        if (next === null) {
          // Reached the live edge — stop the loop on the next microtask.
          setPlaying(false);
          return win.steps;
        }
        return next;
      });
    }, PLAY_INTERVAL_MS);
    return stopInterval;
  }, [playing, win, stopInterval]);

  // Cleanup on unmount (belt-and-suspenders; the effect above also returns it).
  useEffect(() => stopInterval, [stopInterval]);

  const togglePlay = useCallback(() => {
    setPlaying((p) => {
      if (!p) {
        // Starting from the live edge restarts the reconstruction from `since`.
        setIndex((cur) => (cur >= win.steps ? 0 : cur));
        return true;
      }
      return false;
    });
  }, [win.steps]);

  const reset = useCallback(() => {
    setPlaying(false);
    setIndex(win.steps);
  }, [win.steps]);

  const onSlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setPlaying(false);
    setIndex(Number(e.target.value));
  }, []);

  // A degenerate window (single day) has nothing to scrub — render a hint only.
  const scrubbable = win.steps > 0;
  const sinceLabel = formatAsOfLabel(dayIndexToDate(win, 0));

  return (
    <section
      className="space-y-2 rounded-[var(--radius-lg)] border border-ln-op-line bg-ln-op-card/40 p-3"
      aria-labelledby={labelId}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p id={labelId} className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Reproducción temporal
        </p>
        <p className="tabular-nums text-sm font-semibold text-ln-op-ink">{asOfLabel}</p>
      </div>

      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={togglePlay}
          disabled={!scrubbable}
          aria-pressed={playing}
          aria-label={playing ? "Pausar reproducción" : "Reproducir la formación de la situación"}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card text-ln-op-ink hover:border-ln-op-azul disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span aria-hidden="true">{playing ? "⏸" : "▶"}</span>
        </button>

        <input
          type="range"
          min={0}
          max={win.steps}
          step={1}
          value={index}
          onChange={onSlider}
          disabled={!scrubbable}
          className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-ln-op-line accent-ln-op-azul disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Línea de tiempo: arrastrá para ver la situación en una fecha anterior"
          aria-valuemin={0}
          aria-valuemax={win.steps}
          aria-valuenow={index}
          aria-valuetext={asOfLabel}
        />

        <button
          type="button"
          onClick={reset}
          disabled={atLive && !playing}
          aria-label="Volver a ahora (en vivo)"
          className="inline-flex h-7 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card px-2 text-[var(--text-sm)] text-ln-op-ink-2 hover:border-ln-op-azul disabled:cursor-not-allowed disabled:opacity-40"
        >
          Ahora
        </button>
      </div>

      <div className="flex items-center justify-between text-xs text-ln-op-mute">
        <span className="tabular-nums">{sinceLabel}</span>
        <span className="tabular-nums">Ahora</span>
      </div>

      {/* task #77 bitemporal — replay-basis toggle. Default "valid" replays by
          occurred_at ("cuándo pasó"); "transaction" replays by recorded_at
          ("cuándo lo supo el Estado"). The gap between the two IS the reporting-lag
          signal: an event that occurred el 1/3 pero se registró el 13/3 aparece 12
          días más tarde en el modo "según lo conocido". */}
      <fieldset className="m-0 flex flex-wrap items-center gap-1.5 border-0 p-0">
        <legend className="sr-only">Base temporal de la reproducción</legend>
        <span
          aria-hidden="true"
          className="mr-1 text-[var(--text-sm)] font-semibold uppercase tracking-[0.08em] text-ln-op-mute"
        >
          Base
        </span>
        <button
          type="button"
          aria-pressed={basis === "valid"}
          onClick={() => onBasisChange("valid")}
          className={`rounded-[var(--radius-md)] border px-2 py-1 text-[var(--text-sm)] transition-colors ${
            basis === "valid"
              ? "border-ln-op-azul bg-ln-op-azul/10 font-semibold text-ln-op-ink"
              : "border-ln-op-line bg-ln-op-card text-ln-op-ink-2 hover:border-ln-op-azul"
          }`}
        >
          Cuándo ocurrió
        </button>
        <button
          type="button"
          aria-pressed={basis === "transaction"}
          onClick={() => onBasisChange("transaction")}
          className={`rounded-[var(--radius-md)] border px-2 py-1 text-[var(--text-sm)] transition-colors ${
            basis === "transaction"
              ? "border-ln-op-azul bg-ln-op-azul/10 font-semibold text-ln-op-ink"
              : "border-ln-op-line bg-ln-op-card text-ln-op-ink-2 hover:border-ln-op-azul"
          }`}
        >
          Según lo conocido al momento
        </button>
      </fieldset>

      <p className="text-[var(--text-sm)] text-ln-op-mute">
        {basis === "transaction"
          ? "Reproduciendo por fecha de registro (cuándo el Estado tomó conocimiento): la brecha con la fecha de ocurrencia revela demoras de reporte y presencia territorial."
          : "Reproduciendo: arrastrá o reproducí para ver la situación formarse. Las capas sin dimensión temporal (refugios, cobertura, mortalidad) se atenúan durante la reproducción."}
      </p>

      {/* Live region: announces the as-of date to assistive tech as it changes. */}
      <p id={liveId} className="sr-only" aria-live="polite">
        Situación al {asOfLabel}
      </p>
    </section>
  );
}
