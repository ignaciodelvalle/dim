// The kit's own primitives, rendered — the FIRST test of this file, and the
// gap is the point.
//
// `kit.tsx` is the design system every screen is built out of, and until
// 2026-09-03 nothing rendered it: `PasswordField.test.tsx` covers one control
// and the rest were proven only by the screens that happened to use them. A
// primitive with no test of its own exports whatever its last caller tolerated.
//
// WHAT IS PINNED HERE, AND WHY EACH ONE:
//
//   · `ListRow`'s two arms. The live row fires and announces enabled; the
//     inert row renders the same shape, announces disabled, and CARRIES ITS
//     CAPTION — the caption is the sentence that says where the real control
//     lives, so a row that dropped it would be a dead control with no reason.
//   · The caption's BOUND, and WHERE it lives. React Native's `flexShrink`
//     defaults to 0 and the row is `flexDirection: "row"`, so a caption Text
//     with intrinsic width does not wrap — it runs past the row's right edge.
//     That was reported on 2026-09-03 against RecordEventScreen's
//     90-character caption, and it is a property of the primitive rather than
//     of that screen. The bound is the COLUMN that holds both Texts, and the
//     asymmetry is pinned in both directions: the column shrinks, the label
//     must not. Letting the label shrink too was the first fix and it wraps
//     "Terminar una medicación" — the row's primary text — so a later
//     "helpful" flexShrink on the label has to fail here.
//   · `pullToRefresh` as a pure element factory: the props it puts on the
//     control, and that the control actually reaches the Screen's scroll view.
//     Five detail screens replaced an "Actualizar" button with this gesture; if
//     the factory stopped wiring `onRefresh`, every one of them would look fine
//     and refresh nothing.
//
// jest has no Yoga, so nothing here measures a pixel. What it asserts is the
// style CONTRACT — the properties layout is computed from.

import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { RefreshControl, StyleSheet, Text } from "react-native";

import { ListRow, Screen, pullToRefresh } from "./kit";
import { COLORS } from "./theme";

/**
 * The nearest HOST `View` above a node.
 *
 * `getByText` hands back the composite `Text`, whose `.parent` is another
 * composite — `toHaveStyle` needs a host element, and identity comparisons
 * between two composites say nothing about the tree. Walking to the first host
 * View is how a test reaches the column both Texts sit in without a testID
 * (the mobile convention: production stays a11y-only).
 */
function columnOf(node: { parent: unknown }): { type: string; props: Record<string, unknown> } {
  let current = node.parent as { type?: unknown; parent: unknown } | null;
  while (current !== null && current.type !== "View") {
    current = current.parent as { type?: unknown; parent: unknown } | null;
  }
  if (current === null) throw new Error("no host View above this node");
  return current as unknown as { type: string; props: Record<string, unknown> };
}

const LABEL = "Terminar una medicación";
// The RecordEventScreen caption verbatim (RecordEventScreen.tsx): 90 chars,
// wider than any phone at 12px — the case that overflowed on 2026-09-03.
const CAPTION =
  'Se hace desde el asiento del inicio del tratamiento, en la libreta: "Terminar medicación".';

describe("ListRow — the live row", () => {
  it("renders the label and fires onPress, announcing enabled", () => {
    const onPress = jest.fn();
    render(<ListRow label="Credencial pública" onPress={onPress} />);
    fireEvent.press(screen.getByText("Credencial pública"));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button").props.accessibilityState.disabled).toBe(false);
    expect(screen.queryByText(CAPTION)).toBeNull(); // no caption → no caption node
  });
});

describe("ListRow — the inert row says why", () => {
  it("renders the label AND the caption", () => {
    render(<ListRow label={LABEL} caption={CAPTION} />);
    expect(screen.getByText(LABEL)).toBeOnTheScreen();
    expect(screen.getByText(CAPTION)).toBeOnTheScreen();
  });

  it("announces disabled when there is no onPress", () => {
    render(<ListRow label={LABEL} caption={CAPTION} />);
    expect(screen.getByRole("button").props.accessibilityState.disabled).toBe(true);
    expect(screen.getByRole("button").props.disabled ?? true).toBe(true);
  });

  it("bounds the caption so a long sentence wraps inside the row instead of running past it", () => {
    // Three halves of one bound, and each is satisfiable by a change that
    // breaks another: the COLUMN gives way (without it the text overflows the
    // row), the caption caps its height (without it a list of rows becomes a
    // page of paragraphs), and it carries a lineHeight (without it the two
    // wrapped lines sit on each other).
    render(<ListRow label={LABEL} caption={CAPTION} />);
    const caption = screen.getByText(CAPTION);
    expect(StyleSheet.flatten(columnOf(caption).props.style)).toMatchObject({ flexShrink: 1 });
    expect(typeof caption.props.numberOfLines).toBe("number");
    expect(caption.props.numberOfLines).toBeGreaterThanOrEqual(2);
    const style = StyleSheet.flatten(caption.props.style) as { lineHeight?: number };
    expect(typeof style.lineHeight).toBe("number");
  });

  it("does NOT let the label shrink — the primary text is the last thing that breaks", () => {
    // Yoga distributes negative space in proportion to each child's basis, so
    // a shrinkable label gives up ~66 points and wraps. `components.tsx`'s
    // row/rowLabel/rowValue already made this call: the value shrinks, the
    // label does not. Asserted on BOTH arms because they are separate styles.
    render(<ListRow label={LABEL} caption={CAPTION} />);
    expect(screen.getByText(LABEL)).not.toHaveStyle({ flexShrink: 1 });
    screen.unmount();
    render(<ListRow label={LABEL} caption={CAPTION} onPress={() => {}} />);
    expect(screen.getByText(LABEL)).not.toHaveStyle({ flexShrink: 1 });
  });

  it("stacks the caption UNDER the label rather than beside it", () => {
    // Side by side the caption gets ~108 points — about 17 characters a line,
    // so two lines show ~34 of these 90 and the sentence that says where the
    // real control lives is lost. That is the failure the row was introduced
    // to fix, so the two share one column and the column is a column.
    render(<ListRow label={LABEL} caption={CAPTION} />);
    const column = columnOf(screen.getByText(CAPTION));
    expect(column).toBe(columnOf(screen.getByText(LABEL)));
    // No `flexDirection: "row"` on it: RN's default is column, and the row
    // direction lives one level up, on the Pressable.
    const style = StyleSheet.flatten(column.props.style) as { flexDirection?: string };
    expect(style.flexDirection).toBeUndefined();
  });
});

describe("pullToRefresh — the kit's RefreshControl, already coloured", () => {
  it("returns a RefreshControl carrying the callback, the flag and the accent", () => {
    const onRefresh = jest.fn();
    const control = pullToRefresh(onRefresh, true);
    expect(control.type).toBe(RefreshControl);
    // Exact, not a subset: a future prop added to the factory should be a
    // decision somebody makes here rather than one that arrives unnoticed.
    expect(control.props).toEqual({
      colors: [COLORS.accent],
      onRefresh,
      refreshing: true,
      tintColor: COLORS.accent,
    });
  });

  it("reaches the Screen's scroll view, and one pull calls back exactly once", () => {
    const onRefresh = jest.fn();
    render(
      <Screen refreshControl={pullToRefresh(onRefresh, false)}>
        <Text>cuerpo</Text>
      </Screen>,
    );
    // UNSAFE_ by the no-testID convention (skeleton.test.tsx states it): the
    // control has no accessible name of its own, so the type is the handle.
    const control = screen.UNSAFE_getByType(RefreshControl);
    expect(control.props.refreshing).toBe(false);
    fireEvent(control, "refresh");
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
