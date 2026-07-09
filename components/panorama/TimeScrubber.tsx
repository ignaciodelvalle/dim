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
//
// panorama-vista-redesign Phase 4 (design Decision 4):
//   - `temporalAvailable`: false → the track is replaced by a dashed empty
//     state ("No disponible en esta vista"). Sourced EXCLUSIVELY from the
//     parent's `isTemporalLayer()` derivation over the active layer set — no
//     scrubber-local temporal set (the exact regression risk flagged in the
//     design). Activating a temporal layer flips this true and self-enables.
//   - loop chips (7/30/90 días): shade the trailing window and cycle the
//     thumb within it instead of stopping at "ahora". `looping` is CLIENT-ONLY
//     ephemeral state — never URL-encoded (same treatment as `basis`).
//   - `scrubDetail`: Simple (default) = play + track + loop chips + Ahora.
//     Detalle adds date-tick references along the track and the bitemporal
//     basis toggle (previously always-on, now behind Detalle).
//   - loop/tick math stays INSIDE this component, reusing the existing
//     exported domain primitives — domain/time-scrub.ts is NOT modified.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import {
  type ScrubWindow,
  type TimeBasis,
  buildScrubWindow,
  dateToDayIndex,
  dayIndexToDate,
  formatAsOfLabel,
  nextPlayIndex,
} from "@/src/modules/panorama/domain/time-scrub";

/** Ms between play-loop day steps. ~1.1s reads as a deliberate reconstruction. */
const PLAY_INTERVAL_MS = 1100;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Loop window lengths offered by the loop chips (days back from "ahora"). */
const LOOP_WINDOWS = [7, 30, 90] as const;
type LoopWindow = (typeof LOOP_WINDOWS)[number];

/** Number of date-tick references shown along the track in Detalle mode. */
const TICK_COUNT = 5;

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
  /**
   * panorama-vista-redesign: whether the ACTIVE layer set has at least one
   * temporal layer (parent-derived via `isTemporalLayer()` — single source,
   * no scrubber-local set). false → the track is replaced by an empty state.
   * Defaults to true so existing callers (pre-redesign) keep today's behavior.
   */
  temporalAvailable?: boolean;
  /** Simple (default false) / Detalle (true) — persisted by the parent. */
  scrubDetail?: boolean;
  /**
   * Emits the chosen Simple/Detalle mode. Absent → the toggle is not
   * rendered (backward-compatible for callers that don't manage the pref).
   */
  onScrubDetailChange?: (value: boolean) => void;
};

export function TimeScrubber({
  since,
  until,
  onChange,
  basis,
  onBasisChange,
  temporalAvailable = true,
  scrubDetail = false,
  onScrubDetailChange,
}: Props) {
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
  // panorama-vista-redesign: the active loop window (null = not looping).
  const [looping, setLooping] = useState<LoopWindow | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const labelId = useId();
  const liveId = useId();

  // When the window changes (new period/scope), snap back to live and clear
  // any active loop (a new window invalidates the shaded range).
  useEffect(() => {
    setIndex(win.steps);
    setPlaying(false);
    setLooping(null);
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

  // The shaded loop-window start index (7/30/90 days back from "ahora"),
  // clamped into [0, win.steps] via the existing dateToDayIndex primitive.
  const windowStartIndex = useMemo(() => {
    if (looping === null) return null;
    return dateToDayIndex(win, new Date(untilMs - looping * DAY_MS));
  }, [looping, win, untilMs]);

  // Play loop: advance one step per tick. Outside a loop, stop cleanly at
  // "ahora" (unchanged behavior). Inside a loop, wrap back to the window
  // start instead of stopping — the reconstruction replays continuously
  // until "Ahora" is clicked.
  useEffect(() => {
    if (!playing) {
      stopInterval();
      return;
    }
    intervalRef.current = setInterval(() => {
      setIndex((cur) => {
        const next = nextPlayIndex(win, cur);
        if (next === null) {
          if (windowStartIndex !== null) return windowStartIndex;
          // Reached the live edge — stop the loop on the next microtask.
          setPlaying(false);
          return win.steps;
        }
        return next;
      });
    }, PLAY_INTERVAL_MS);
    return stopInterval;
  }, [playing, win, stopInterval, windowStartIndex]);

  // Cleanup on unmount (belt-and-suspenders; the effect above also returns it).
  useEffect(() => stopInterval, [stopInterval]);

  const togglePlay = useCallback(() => {
    setPlaying((p) => {
      if (!p) {
        // Starting from the live edge restarts the reconstruction from `since`
        // (or the loop window start, if a loop is active).
        setIndex((cur) => (cur >= win.steps ? (windowStartIndex ?? 0) : cur));
        return true;
      }
      return false;
    });
  }, [win.steps, windowStartIndex]);

  const reset = useCallback(() => {
    setPlaying(false);
    setLooping(null);
    setIndex(win.steps);
  }, [win.steps]);

  const onSlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setPlaying(false);
    setLooping(null);
    setIndex(Number(e.target.value));
  }, []);

  const startLoop = useCallback(
    (days: LoopWindow) => {
      const startIdx = dateToDayIndex(win, new Date(untilMs - days * DAY_MS));
      setLooping(days);
      setIndex(startIdx);
      setPlaying(true);
    },
    [win, untilMs],
  );

  // A degenerate window (single day) has nothing to scrub — render a hint only.
  const scrubbable = win.steps > 0 && temporalAvailable;
  const sinceLabel = formatAsOfLabel(dayIndexToDate(win, 0));

  // Detalle-only: N evenly-spaced date-tick references along the track.
  const ticks = useMemo(() => {
    if (!scrubDetail || win.steps === 0) return [];
    return Array.from({ length: TICK_COUNT }, (_, i) => {
      const idx = Math.round((win.steps * i) / (TICK_COUNT - 1));
      return { idx, label: formatAsOfLabel(dayIndexToDate(win, idx)) };
    });
  }, [scrubDetail, win]);

  return (
    <section
      className="space-y-2 rounded-[var(--radius-lg)] border border-ln-op-line bg-ln-op-card/40 p-3"
      aria-labelledby={labelId}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p id={labelId} className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Reproducción temporal
        </p>
        <div className="flex items-center gap-2">
          <p className="tabular-nums text-sm font-semibold text-ln-op-ink">{asOfLabel}</p>
          {onScrubDetailChange && (
            <div
              role="group"
              aria-label="Modo de la reproducción temporal"
              className="inline-flex overflow-hidden rounded-[var(--radius-md)] border border-ln-op-line"
            >
              <button
                type="button"
                aria-pressed={!scrubDetail}
                aria-label="Modo simple de la reproducción temporal"
                onClick={() => onScrubDetailChange(false)}
                className={`px-2 py-0.5 text-[var(--text-sm)] font-medium transition-colors ${
                  !scrubDetail
                    ? "bg-ln-op-azul/10 text-ln-op-azul"
                    : "bg-ln-op-card text-ln-op-ink-2 hover:bg-ln-op-stripe"
                }`}
              >
                Simple
              </button>
              <button
                type="button"
                aria-pressed={scrubDetail}
                aria-label="Modo detalle de la reproducción temporal"
                onClick={() => onScrubDetailChange(true)}
                className={`px-2 py-0.5 text-[var(--text-sm)] font-medium transition-colors ${
                  scrubDetail
                    ? "bg-ln-op-azul/10 text-ln-op-azul"
                    : "bg-ln-op-card text-ln-op-ink-2 hover:bg-ln-op-stripe"
                }`}
              >
                Detalle
              </button>
            </div>
          )}
        </div>
      </div>

      {!temporalAvailable ? (
        <p className="rounded-[var(--radius-md)] border border-dashed border-ln-op-line px-3 py-2 text-center text-[var(--text-sm)] text-ln-op-mute">
          No disponible en esta vista
        </p>
      ) : (
        <>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={togglePlay}
              disabled={!scrubbable}
              aria-pressed={playing}
              aria-label={
                playing ? "Pausar reproducción" : "Reproducir la formación de la situación"
              }
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card text-ln-op-ink hover:border-ln-op-azul disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span aria-hidden="true">{playing ? "⏸" : "▶"}</span>
            </button>

            <div className="relative flex-1">
              {/* Shaded loop-window overlay — purely visual, sits under the range input. */}
              {windowStartIndex !== null && win.steps > 0 && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 rounded-full bg-ln-op-azul/15"
                  style={{
                    left: `${(windowStartIndex / win.steps) * 100}%`,
                    right: 0,
                  }}
                />
              )}
              <input
                type="range"
                min={0}
                max={win.steps}
                step={1}
                value={index}
                onChange={onSlider}
                disabled={!scrubbable}
                className="relative h-1.5 w-full cursor-pointer appearance-none rounded-full bg-ln-op-line accent-ln-op-azul disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Línea de tiempo: arrastrá para ver la situación en una fecha anterior"
                aria-valuemin={0}
                aria-valuemax={win.steps}
                aria-valuenow={index}
                aria-valuetext={asOfLabel}
              />
            </div>

            <button
              type="button"
              onClick={reset}
              disabled={atLive && !playing && looping === null}
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

          {/* Detalle: date-tick references along the track. */}
          {scrubDetail && ticks.length > 0 && (
            <div
              className="flex items-center justify-between text-[var(--text-xs)] text-ln-op-faint"
              aria-hidden="true"
            >
              {ticks.map((t) => (
                <span key={t.idx} className="tabular-nums">
                  {t.label}
                </span>
              ))}
            </div>
          )}

          {/* Loop chips — shade a trailing window and cycle the thumb within it. */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              aria-hidden="true"
              className="mr-1 text-[var(--text-sm)] font-semibold uppercase tracking-[0.08em] text-ln-op-mute"
            >
              Repetir
            </span>
            {LOOP_WINDOWS.map((days) => (
              <button
                key={days}
                type="button"
                aria-pressed={looping === days}
                disabled={!scrubbable}
                onClick={() => startLoop(days)}
                className={`rounded-[var(--radius-md)] border px-2 py-1 text-[var(--text-sm)] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  looping === days
                    ? "border-ln-op-azul bg-ln-op-azul/10 font-semibold text-ln-op-ink"
                    : "border-ln-op-line bg-ln-op-card text-ln-op-ink-2 hover:border-ln-op-azul"
                }`}
              >
                ↺ {days} días
              </button>
            ))}
          </div>

          {/* task #77 bitemporal — replay-basis toggle. Detalle-only (panorama-
              vista-redesign): default "valid" replays by occurred_at ("cuándo
              pasó"); "transaction" replays by recorded_at ("cuándo lo supo el
              Estado"). The gap between the two IS the reporting-lag signal. */}
          {scrubDetail && (
            <>
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
                  : "Reproduciendo: arrastrá o reproducí para ver la situación formarse. Las capas sin dimensión temporal se atenúan durante la reproducción."}
              </p>
            </>
          )}
        </>
      )}

      {/* Live region: announces the as-of date to assistive tech as it changes. */}
      <p id={liveId} className="sr-only" aria-live="polite">
        Situación al {asOfLabel}
      </p>
    </section>
  );
}
