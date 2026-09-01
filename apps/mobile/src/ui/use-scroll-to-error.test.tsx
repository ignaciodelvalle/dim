// `useScrollToError` — the transition rule and the courtesy rule.
//
// The web hook this mirrors moves focus ONLY when the error appears, never
// when one message replaces another; the scroll inherits that contract, and
// these tests are what hold it. And every native call is best-effort: no
// provider, no anchor, no measurement — no crash, because the refusal is
// already announced by the live region and the scroll is a courtesy.

import { describe, expect, it, jest } from "@jest/globals";
import { render } from "@testing-library/react-native";
import type { RefObject } from "react";
import type { ScrollView, View } from "react-native";

import { ScreenScrollContext } from "./kit";
import { SPACE } from "./theme";
import { useScrollToError } from "./use-scroll-to-error";

const HOST = { fake: "inner-view-node" };

function makeScroll() {
  const scrollTo = jest.fn();
  const scrollRef = {
    current: { getInnerViewNode: () => HOST, scrollTo },
  } as unknown as RefObject<ScrollView | null>;
  return { scrollRef, scrollTo };
}

/** An anchor whose measurement resolves at the given content-relative y. */
function anchorAt(y: number): View {
  return {
    measureLayout: (_host: unknown, onSuccess: (x: number, y: number) => void) => onSuccess(0, y),
  } as unknown as View;
}

let anchorRef: RefObject<View | null>;

function Harness({ error }: { error: string | null }) {
  anchorRef = useScrollToError(error);
  return null;
}

function renderHarness(scrollRef: RefObject<ScrollView | null>, anchorY: number) {
  const ui = (error: string | null) => (
    <ScreenScrollContext.Provider value={scrollRef}>
      <Harness error={error} />
    </ScreenScrollContext.Provider>
  );
  const screen = render(ui(null));
  anchorRef.current = anchorAt(anchorY);
  return { rerender: (error: string | null) => screen.rerender(ui(error)) };
}

describe("the transition rule — scroll when the error APPEARS", () => {
  it("scrolls the anchor into view, with breathing room above it", () => {
    const { scrollRef, scrollTo } = makeScroll();
    const { rerender } = renderHarness(scrollRef, 480);
    rerender("Revisá los datos.");
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ y: 480 - SPACE.lg, animated: true });
  });

  it("clamps to the top rather than scrolling to a negative offset", () => {
    const { scrollRef, scrollTo } = makeScroll();
    const { rerender } = renderHarness(scrollRef, 4);
    rerender("Revisá los datos.");
    expect(scrollTo).toHaveBeenCalledWith({ y: 0, animated: true });
  });

  it("does NOT re-scroll when one message replaces another — the web hook's rule", () => {
    const { scrollRef, scrollTo } = makeScroll();
    const { rerender } = renderHarness(scrollRef, 480);
    rerender("Primer error.");
    rerender("Segundo error.");
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it("scrolls again after the error CLEARED and a new one appeared — a fresh failure", () => {
    // The denuncia form clears its error on every keystroke (patch()), so a
    // fixed-and-resubmitted form that fails again is a new appearance.
    const { scrollRef, scrollTo } = makeScroll();
    const { rerender } = renderHarness(scrollRef, 480);
    rerender("Primer error.");
    rerender(null);
    rerender("Segundo error.");
    expect(scrollTo).toHaveBeenCalledTimes(2);
  });
});

describe("the courtesy rule — degrade to no-scroll, never to a crash", () => {
  it("no provider (rendered outside Screen): nothing happens", () => {
    const screen = render(<Harness error={null} />);
    expect(() => screen.rerender(<Harness error="Sin Screen." />)).not.toThrow();
  });

  it("no anchor mounted when the error appears: nothing happens", () => {
    const { scrollRef, scrollTo } = makeScroll();
    const ui = (error: string | null) => (
      <ScreenScrollContext.Provider value={scrollRef}>
        <Harness error={error} />
      </ScreenScrollContext.Provider>
    );
    const screen = render(ui(null));
    // anchorRef.current left null on purpose.
    anchorRef.current = null;
    screen.rerender(ui("Sin ancla."));
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
