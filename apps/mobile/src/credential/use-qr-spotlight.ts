// The QR moment: screen awake, brightness up — both undone on the way out.
//
// QOL 2026-09-01. The credential is the screen an owner HOLDS UP: to a vet at
// a counter, to a stranger who found the animal. Two things ruin that moment
// on a real phone: the screen dimming and locking mid-scan (a 30-second
// timeout is shorter than a nervous conversation), and a low-brightness
// screen a camera cannot read in the street. The web cannot fix either; the
// app can, and only while it matters.
//
// WINDOW brightness, not system brightness — `expo-brightness`'s
// `setBrightnessAsync` raises the CURRENT ACTIVITY's window on Android and
// the screen on iOS, needs no permission for that, and the capture-restore
// pair below puts the previous level back on unmount. The restore runs from
// the same closure that captured it, so a fast mount/unmount cannot restore a
// level it never read.
//
// BEST-EFFORT, both halves. An emulator with no brightness service, or a
// build where the native module is not yet linked (this dep lands with the
// D2 EAS build), must degrade to "the screen behaves as always" — never to a
// crash on the single most public screen in the app.

import * as Brightness from "expo-brightness";
import { useKeepAwake } from "expo-keep-awake";
import { useEffect } from "react";

/**
 * @param enabled Whether the owner wants the brightness raised. Defaults to
 * true, which is the behaviour this hook had before the preference existed.
 *
 * KEEP-AWAKE IS NOT PART OF THE CHOICE, deliberately. Turning the spotlight off
 * is about glare; a screen that locks mid-scan is a different failure and
 * bothers nobody. So the switch below governs the brightness half only.
 *
 * TOGGLING OFF WHILE MOUNTED RESTORES IMMEDIATELY — that is the whole point of
 * the control, so the effect depends on `enabled` and its cleanup runs on the
 * way down just as it does on unmount.
 */
export function useQrSpotlight(enabled = true): void {
  // Deactivates itself on unmount; separate from the brightness effect
  // because keep-awake has no state to capture or restore.
  useKeepAwake();

  useEffect(() => {
    if (!enabled) return;
    let previous: number | null = null;
    let cancelled = false;
    void (async () => {
      try {
        previous = await Brightness.getBrightnessAsync();
        // The unmount can win the race against this read; setting AFTER a
        // cancelled capture would brighten a screen nobody is showing.
        if (!cancelled) await Brightness.setBrightnessAsync(1);
      } catch {
        previous = null;
      }
    })();
    return () => {
      cancelled = true;
      if (previous !== null) {
        void Brightness.setBrightnessAsync(previous).catch(() => {});
      }
    };
  }, [enabled]);
}
