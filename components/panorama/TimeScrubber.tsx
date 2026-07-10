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
  /**
   * trust/safety (2026-07-10): es-AR measure of the PRIMARY/base layer when it
   * is CURRENT-STATE (e.g. "cobertura antirrábica"). The scrubber reproduces
   * only temporal layers; a current-state base is dimmed, never reconstructed —
   * so its dated "Situación al …" framing would fabricate a dated situation over
   * a metric that cannot vary with the fecha de corte. When set, the scrubber
   * renders an honest "estado actual — no varía con la fecha de corte" note.
   * Undefined when the base is temporal (no disclaimer needed).
   */
  currentStateBaseLabel?: string;
  /** Simple (default false) / Detalle (true) — persisted by the parent. */
  scrubDetail?: boolean;
  /**
   * Emits the chosen Simple/Detalle mode. Absent → the toggle is not
   * rendered (backward-compatible for callers that don't manage the pref).
   */
  onScrubDetailChange?: (value: boolean) => void;
  /**
   * panorama-vista-redesign QA fix: bumped by the parent whenever it forces
   * the board back to live OUTSIDE a `since`/`until` change — e.g. a
   * scope-only change (province/locality, period unchanged) or temporal
   * availability flipping off. `since`/`until` (and therefore `win`) can stay
   * IDENTICAL in both cases, so the existing win-change reset below never
   * fires; without this signal the scrubber keeps its stale internal index
   * and immediately re-emits a non-null `onChange`, undoing the parent's own
   * reset. Absent → no external-reset behavior (backward-compatible).
   */
  resetToken?: number;
  /**
   * "Copiar vista" fidelity: a shared scrub position to seek to ONCE on mount
   * (decoded from the URL by the parent). Applied in a mount-only effect (post-
   * hydration, so no SSR mismatch) — a value outside the active window is
   * ignored (the slider stays at the live edge). Absent → open at the live edge.
   */
  initialAsOf?: Date | null;
  /**
   * Watermark honesty (task #69): the last-event timestamp (data freshness). The
   * data is BATCH, not "en vivo", so the live edge reads "Al último evento: HH:MM"
   * (not "Ahora (en vivo)") and the DISPLAY axis quantizes its upper bound to this
   * watermark instead of Date.now() — a client-side presentation clamp only, so
   * the server's 300s cache-key bucketing is untouched. Absent/null → the label
   * degrades to a neutral "Al último evento" and the axis keeps `until`.
   */
  watermark?: Date | null;
};

export function TimeScrubber({
  since,
  until,
  onChange,
  basis,
  onBasisChange,
  temporalAvailable = true,
  currentStateBaseLabel,
  scrubDetail = false,
  onScrubDetailChange,
  resetToken,
  initialAsOf = null,
  watermark = null,
}: Props) {
  // Rebuild the day-stepped axis only when the window endpoints change. Compare
  // by timestamp so a new Date object with the same instant does not rebuild.
  const sinceMs = since.getTime();
  // Watermark honesty: the DISPLAY axis ends at the last-event watermark, not at
  // `until` (≈ Date.now()). The data is batch, so the live edge is the last event
  // — clamp the axis to it when it falls within the window (never past `until`).
  const untilRawMs = until.getTime();
  const watermarkMs = watermark?.getTime() ?? null;
  const untilMs =
    watermarkMs !== null && watermarkMs > sinceMs && watermarkMs <= untilRawMs
      ? watermarkMs
      : untilRawMs;
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

  // panorama-vista-redesign QA fix: the parent's `resetToken` is an explicit
  // "park back to live" signal for transitions that do NOT change `win`
  // (scope-only changes, temporal availability flipping off — see the Props
  // doc comment). `win.steps` is read at fire time, not tracked reactively —
  // this must run ONLY when the token itself changes, mirroring the
  // win-change reset above.
  // biome-ignore lint/correctness/useExhaustiveDependencies: resetToken is the intentional sole trigger; win.steps is read live.
  useEffect(() => {
    if (resetToken === undefined) return;
    setIndex(win.steps);
    setPlaying(false);
    setLooping(null);
  }, [resetToken]);

  // "Copiar vista": seek ONCE on mount to a shared scrub day (if any). Declared
  // AFTER the win-change reset above so it wins the mount pass (that reset also
  // runs on mount, parking at live). A day outside the active window clamps to
  // the live edge via dateToDayIndex → treated as "no restore" (idx === steps).
  const initialAsOfSeekedRef = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only restore; win/initialAsOf read live.
  useEffect(() => {
    if (initialAsOfSeekedRef.current) return;
    initialAsOfSeekedRef.current = true;
    if (initialAsOf === null || win.steps === 0) return;
    const idx = dateToDayIndex(win, initialAsOf);
    if (idx > 0 && idx < win.steps) setIndex(idx);
  }, []);

  // Derive the as-of Date for the current index. At the live edge → null.
  const atLive = index >= win.steps;
  const asOf = useMemo(() => (atLive ? null : dayIndexToDate(win, index)), [win, index, atLive]);
  // Watermark honesty (task #69): the live edge is the last INGESTED event, not a
  // real-time "now" — the data is batch. Label it as such and keep "en vivo" out.
  const watermarkTime =
    watermark !== null && !Number.isNaN(watermark.getTime())
      ? watermark.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
      : null;
  const liveEdgeLabel =
    watermarkTime !== null ? `Al último evento: ${watermarkTime}` : "Al último evento";
  const asOfLabel = atLive ? liveEdgeLabel : formatAsOfLabel(dayIndexToDate(win, index));

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

  // A degenerate window (single day) has nothing to scrub — render a hint
  // only. Computed here (ahead of the play effect below) so the play loop can
  // gate on it directly — see the panorama-vista-redesign QA fix note there.
  const scrubbable = win.steps > 0 && temporalAvailable;

  // Play loop: advance one step per tick. Outside a loop, stop cleanly at
  // "ahora" (unchanged behavior). Inside a loop, wrap back to the window
  // start instead of stopping — the reconstruction replays continuously
  // until "Ahora" is clicked.
  //
  // panorama-vista-redesign QA fix: gate on `scrubbable` too, not just
  // `playing` — without it, a play loop started before temporal gating hides
  // the controls (temporalAvailable flips false) kept ticking and calling
  // `onChange` behind the "No disponible en esta vista" empty state. Also
  // clear `playing` itself so a later re-enable doesn't silently resume.
  useEffect(() => {
    if (!playing) {
      stopInterval();
      return;
    }
    if (!scrubbable) {
      stopInterval();
      setPlaying(false);
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
  }, [playing, scrubbable, win, stopInterval, windowStartIndex]);

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
            <fieldset className="m-0 inline-flex overflow-hidden rounded-[var(--radius-md)] border border-ln-op-line p-0">
              <legend className="sr-only">Modo de la reproducción temporal</legend>
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
            </fieldset>
          )}
        </div>
      </div>

      {!temporalAvailable ? (
        <p className="rounded-[var(--radius-md)] border border-dashed border-ln-op-line px-3 py-2 text-center text-[var(--text-sm)] text-ln-op-mute">
          No disponible en esta vista
        </p>
      ) : (
        <>
          {/* trust/safety (2026-07-10): the base metric is current-state — the
              scrubber reproduces only temporal overlays, so state plainly that
              the dated corte does NOT move the headline layer (it is dimmed,
              not reconstructed). Without this the "Situación al …" label reads
              as if the whole map were as-of-t. */}
          {currentStateBaseLabel && (
            <p className="rounded-[var(--radius-md)] border border-dashed border-ln-op-line px-3 py-1.5 text-[var(--text-xs)] text-ln-op-mute">
              Estado actual — {currentStateBaseLabel} no varía con la fecha de corte.
            </p>
          )}
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
              aria-label="Volver al último evento"
              className="inline-flex h-7 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card px-2 text-[var(--text-sm)] text-ln-op-ink-2 hover:border-ln-op-azul disabled:cursor-not-allowed disabled:opacity-40"
            >
              Ahora
            </button>
          </div>

          <div className="flex items-center justify-between text-xs text-ln-op-mute">
            <span className="tabular-nums">{sinceLabel}</span>
            <span className="tabular-nums">Último evento</span>
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

          {/* Loop chips — shade a trailing window and cycle the thumb within it.
              QA fix: the 7/30/90-day windows are computed as CALENDAR-DAY
              offsets (startLoop/windowStartIndex above), but a long period
              (> 90 days, e.g. the "3y" Panorama default) steps the axis by
              whole MONTHS (buildScrubWindow) — the day math only approximates
              a month-stepped index, making the shaded window/thumb position
              dishonest. Disable the chips with a hint instead of shipping an
              approximate reconstruction. */}
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
                disabled={!scrubbable || win.step === "month"}
                title={
                  win.step === "month"
                    ? "No disponible: el período activo reproduce por mes, no por día."
                    : undefined
                }
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
          {scrubbable && win.step === "month" && (
            <p className="text-[var(--text-sm)] text-ln-op-mute">
              Los atajos de repetición no están disponibles para períodos largos (reproducción
              mensual).
            </p>
          )}

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

      {/* Live region: announces the as-of date to assistive tech as it changes.
          At the live edge the label already reads "Al último evento: HH:MM", so
          skip the "Situación al" prefix there to avoid a doubled "al". */}
      <p id={liveId} className="sr-only" aria-live="polite">
        {atLive ? asOfLabel : `Situación al ${asOfLabel}`}
      </p>
    </section>
  );
}
