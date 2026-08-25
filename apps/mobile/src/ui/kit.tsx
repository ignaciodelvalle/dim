// The Libreta Nacional primitives, for React Native.
//
// WHAT THIS IS FOR
// ---------------------------------------------------------------------------
// The web app has a small set of form and surface primitives — `LnField`,
// `LnInput`, `LnCard`, `LnButton` — and every citizen screen is built out of
// them. This app had none: six screens, six `StyleSheet.create` calls, system
// font throughout, and a neutral grey palette that had never matched the web's
// warm cream. The two products did not look related, which is what the PO saw
// when they put the emulator next to the browser.
//
// These are the same primitives, in the same tokens, drawn by React Native.
// Not a port — a port would drag `className` plumbing across a boundary that
// does not have CSS. What crosses is the DESIGN: the fonts, the palette, the
// geometry, the spacing rhythm, and the field anatomy (mono uppercase label,
// seal-red required asterisk, warm border, celeste focus ring).
//
// WHERE THIS DELIBERATELY DIFFERS FROM THE WEB, AND WHY
// ---------------------------------------------------------------------------
// Three deviations, each because the web's own token scale says so or because
// a phone is not a browser. None of them is a taste call:
//
//   · SUBTITLE at 14px, not the login page's `text-sm` (12px). The scale in
//     globals.css assigns 12px to "secondary labels, table cells, chips" and
//     14px to "body secondary, form help". A subtitle under a page title is
//     the second thing; the login page uses the wrong step for the role, and
//     copying that would be copying the mistake rather than the design.
//
//   · LINKS at 14px with a 44px touch target, not the login page's `text-xs`
//     (10px). A 10px link is a fine mouse target and a poor thumb target;
//     WCAG 2.5.5 is why `LN_CONTROL_CLASS` already carries `min-h-[44px]` on
//     the web's own controls. The floor applies to everything tappable here.
//
//   · BUTTONS are pills, which the login CTA is not. See the note on `RADIUS`
//     in theme.ts: that CTA is one of the 307 grandfathered raw `<button>`s
//     `check-raw-buttons.mjs` counts as debt, and the decided citizen geometry
//     (X2-S2, PO decision 2026-07-29) is `--radius-pill`.
//
// Everything else is the web's value, read from `@dim/contract/tokens` and
// proven still current by `pnpm lint:token-parity`.
//
// WEIGHT IS PART OF THE FAMILY NAME. React Native does not synthesize weights
// on Android, so `fontWeight: "600"` over a family whose SemiBold face was
// never registered renders Regular, silently. Every style here names a face
// (`FONTS.sansSemibold`) and no style sets `fontWeight`. See fonts.ts.

import type { ReactNode } from "react";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  type PressableStateCallbackType,
  ScrollView,
  type ScrollViewProps,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";
import { type Edge, SafeAreaView } from "react-native-safe-area-context";

import { FONTS } from "./fonts";
import {
  COLORS,
  DISABLED_OPACITY,
  LABEL_TRACKING_EM,
  LEADING,
  PRESSED_OPACITY,
  RADIUS,
  SPACE,
  TOUCH_TARGET,
  TRACKING,
  TYPE,
} from "./theme";

// ---------- Screen ---------------------------------------------------------

/**
 * The page: cream ground, safe area, and a scroll view with the web's gutter.
 *
 * `p-6` on the web's login `<main>` is 24px, which is `SPACE.xl2`. The gap
 * between blocks is the caller's business — screens differ — so this sets the
 * gutter and a default rhythm and gets out of the way.
 */
export function Screen({
  children,
  edges = ["bottom"],
  keyboardAvoiding = false,
  refreshControl,
  gap = SPACE.lg,
}: {
  children: ReactNode;
  edges?: readonly Edge[];
  /** Set on screens with a text input the keyboard could cover. */
  keyboardAvoiding?: boolean;
  refreshControl?: ScrollViewProps["refreshControl"];
  gap?: number;
}) {
  const scroll = (
    <ScrollView
      contentContainerStyle={[styles.scroll, { gap }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      {keyboardAvoiding ? (
        <KeyboardAvoidingView
          style={styles.fill}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          {scroll}
        </KeyboardAvoidingView>
      ) : (
        scroll
      )}
    </SafeAreaView>
  );
}

// ---------- Typography -----------------------------------------------------

/** The page title. IBM Plex Serif at the web's dominant display step (28px). */
export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

/** The line under a Title. See the deviation note in the header. */
export function Subtitle({ children }: { children: ReactNode }) {
  return <Text style={styles.subtitle}>{children}</Text>;
}

/**
 * The mono uppercase micro-label above a block. "Credencial pública",
 * "Paso 2 de 6". The web's eyebrow convention (`lint:eyebrow` fences its
 * pairing with a title there).
 */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

/**
 * The field label. Mono, uppercase, letterspaced, with the seal-red asterisk
 * when the field is required — the Libreta Nacional field anatomy, verbatim.
 *
 * The asterisk is `aria-hidden` on the web and its native equivalent here is
 * not to expose it at all: it is decoration, and the requiredness that matters
 * to a screen reader travels on the control's own `accessibilityLabel`.
 */
export function FieldLabel({
  children,
  required = false,
}: {
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <Text style={styles.fieldLabel}>
      {children}
      {required ? (
        <Text accessibilityElementsHidden importantForAccessibility="no" style={styles.asterisk}>
          {" *"}
        </Text>
      ) : null}
    </Text>
  );
}

/**
 * A link out of a flow. Blue, underlined, and given a real touch target.
 *
 * `hitSlop` rather than padding: the web's links sit inline in a sentence and
 * padding would push the sentence apart, but a 10px-tall tap target on a phone
 * is a miss waiting to happen. Slop grows the target without moving the text.
 */
export function LinkText({
  children,
  onPress,
  accessibilityHint,
}: {
  children: ReactNode;
  onPress: () => void;
  accessibilityHint?: string;
}) {
  const slop = Math.round((TOUCH_TARGET - TYPE.md * LEADING.md) / 2);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityHint={accessibilityHint}
      hitSlop={{ top: slop, bottom: slop, left: SPACE.sm, right: SPACE.sm }}
      onPress={onPress}
      style={pressedOpacity}
    >
      <Text style={styles.link}>{children}</Text>
    </Pressable>
  );
}

// ---------- Text field -----------------------------------------------------

export type TextFieldProps = Omit<TextInputProps, "style"> & {
  /** Renders the mono uppercase label above the control. */
  label: string;
  required?: boolean;
  /** Red border, matching the web's `aria-[invalid=true]` rule. */
  invalid?: boolean;
  /** Mono variant — codes, tokens, dates. */
  mono?: boolean;
};

/**
 * The Libreta Nacional control: white fill, warm border, 4px corners, and a
 * 3px celeste ring on focus.
 *
 * THE RING IS PADDING, NOT A BORDER, and that is the whole reason the wrapper
 * exists. The web draws it with `box-shadow: 0 0 0 3px`, which occupies no
 * layout. React Native has no equivalent that renders on Android, and growing
 * a border on focus would move the field 3px and shove the rest of the form
 * down every time the keyboard opens. So the wrapper always reserves the 3px
 * and only fills it when focused.
 */
export function TextField({
  label,
  required = false,
  invalid = false,
  mono = false,
  onBlur,
  onFocus,
  ...rest
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <FieldLabel required={required}>{label}</FieldLabel>
      <View style={[styles.ring, focused ? styles.ringOn : null]}>
        <TextInput
          placeholderTextColor={COLORS.inkFaint}
          {...rest}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          style={[
            styles.input,
            mono ? styles.inputMono : null,
            focused ? styles.inputFocused : null,
            invalid ? styles.inputInvalid : null,
          ]}
        />
      </View>
    </View>
  );
}

// ---------- Buttons --------------------------------------------------------

/** `active:scale-[0.98] active:opacity-90` on the web, for touch feedback. */
function pressedOpacity({ pressed }: PressableStateCallbackType) {
  return pressed ? { opacity: PRESSED_OPACITY } : null;
}

export type ButtonTone = "primary" | "seal";

/**
 * The primary action. Solid institutional blue, white label, pill.
 *
 * `tone="seal"` is the destructive twin — `LnButton`'s `seal` variant, which is
 * the red the web reserves for actions that end something.
 *
 * DISABLED IS THE SAME BUTTON AT 60%, which is `LnButton`'s
 * `disabled:opacity-60` and is deliberate: the old native button turned grey
 * when disabled, and a grey fill reads as a DIFFERENT button rather than as
 * this one being unavailable. `accessibilityState` carries the fact to a
 * screen reader, which opacity cannot.
 */
export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  tone = "primary",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: ButtonTone;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={(state) => [
        styles.button,
        tone === "seal" ? styles.buttonSeal : styles.buttonPrimary,
        disabled ? styles.buttonDisabled : pressedOpacity(state),
      ]}
    >
      <Text style={styles.buttonLabelOnFill}>{label}</Text>
    </Pressable>
  );
}

/**
 * The outline button — `LnButton`'s `ghost` variant. White fill, warm border,
 * ink label. "Volver", "Cancelar", "Ajustes".
 *
 * Its DISABLED state is not the primary's. A ghost button at 60% opacity is
 * nearly invisible on cream, so disabled here drops the fill and mutes the
 * label, which is exactly how the web draws its one permanently-disabled
 * button (the Mi Argentina stub: border, muted text, no fill).
 */
export function SecondaryButton({
  label,
  onPress,
  disabled = false,
  accessibilityHint,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityHint?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled || onPress === undefined}
      onPress={onPress}
      style={(state) => [
        styles.button,
        styles.buttonGhost,
        disabled ? styles.buttonGhostDisabled : pressedOpacity(state),
      ]}
    >
      <Text style={disabled ? styles.buttonLabelMuted : styles.buttonLabelInk}>{label}</Text>
    </Pressable>
  );
}

// ---------- Callout --------------------------------------------------------

export type CalloutTone = "neutral" | "ok" | "warn" | "err";

/**
 * The bordered notice block the web login uses for every account-state message.
 *
 * A NOTE ON `neutral`. The web's two neutral notices (shift ended, sessions
 * revoked) render `bg-[var(--color-ln-paper-2)]` — a custom property that is
 * declared NOWHERE in globals.css, so those blocks currently draw with no
 * background at all. Four call sites across three files reference it. This uses
 * `stripe`, the warm cream that neutral surfaces elsewhere in the design system
 * actually use; the dangling web token is reported rather than guessed at here.
 */
export function Callout({
  children,
  tone = "neutral",
  title,
}: {
  children: ReactNode;
  tone?: CalloutTone;
  title?: string;
}) {
  return (
    <View style={[styles.callout, CALLOUT_TONE[tone].box]}>
      {title === undefined ? null : (
        <Text style={[styles.calloutTitle, CALLOUT_TONE[tone].title]}>{title}</Text>
      )}
      {children}
    </View>
  );
}

// ---------- Divider --------------------------------------------------------

/** The web login's rule-word-rule separator: `──── o ────`. */
export function LabelledDivider({ label }: { label: string }) {
  return (
    <View style={styles.divider}>
      <View style={styles.dividerRule} />
      <Text style={styles.dividerLabel}>{label}</Text>
      <View style={styles.dividerRule} />
    </View>
  );
}

// ---------- Styles ---------------------------------------------------------

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.canvas },
  fill: { flex: 1 },
  scroll: { padding: SPACE.xl2 },

  title: {
    fontFamily: FONTS.serif,
    fontSize: TYPE.xl3,
    lineHeight: TYPE.xl3 * LEADING.xl2,
    letterSpacing: TYPE.xl3 * TRACKING.tight,
    color: COLORS.ink,
  },
  subtitle: {
    fontFamily: FONTS.sans,
    fontSize: TYPE.md,
    lineHeight: TYPE.md * LEADING.md,
    color: COLORS.inkSoft,
  },
  eyebrow: {
    fontFamily: FONTS.monoSemibold,
    fontSize: TYPE.xs,
    letterSpacing: TYPE.xs * LABEL_TRACKING_EM,
    textTransform: "uppercase",
    color: COLORS.inkMuted,
  },
  fieldLabel: {
    fontFamily: FONTS.monoSemibold,
    fontSize: TYPE.xs,
    letterSpacing: TYPE.xs * LABEL_TRACKING_EM,
    textTransform: "uppercase",
    color: COLORS.inkMuted,
    marginBottom: SPACE.xs + 2,
  },
  asterisk: { color: COLORS.seal },
  link: {
    fontFamily: FONTS.sansMedium,
    fontSize: TYPE.md,
    lineHeight: TYPE.md * LEADING.md,
    color: COLORS.accent,
    textDecorationLine: "underline",
  },

  field: { alignSelf: "stretch" },
  // The 3px the focus ring will occupy, reserved always so focusing a field
  // never reflows the form. See the note on TextField.
  ring: { padding: 3, margin: -3, borderRadius: RADIUS.control + 3 },
  ringOn: { backgroundColor: COLORS.focusRing },
  input: {
    minHeight: TOUCH_TARGET,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: RADIUS.control,
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm + 2,
    fontFamily: FONTS.sans,
    // 16px, and not only for the scale: it is the floor that stops iOS Safari
    // auto-zooming a focused field, which the web control carries for the same
    // reason (Wave 2 Item 9).
    fontSize: TYPE.base,
    color: COLORS.ink,
  },
  inputMono: { fontFamily: FONTS.mono, letterSpacing: TYPE.base * TRACKING.wide },
  inputFocused: { borderColor: COLORS.accent },
  inputInvalid: { borderColor: COLORS.danger },

  button: {
    minHeight: TOUCH_TARGET,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: RADIUS.button,
    paddingHorizontal: SPACE.lg + 2,
    paddingVertical: SPACE.sm + 2,
  },
  buttonPrimary: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  buttonSeal: { backgroundColor: COLORS.seal, borderColor: COLORS.seal },
  buttonGhost: { backgroundColor: COLORS.surface, borderColor: COLORS.borderStrong },
  buttonDisabled: { opacity: DISABLED_OPACITY },
  buttonGhostDisabled: { backgroundColor: "transparent" },
  buttonLabelOnFill: {
    fontFamily: FONTS.sansSemibold,
    fontSize: TYPE.md,
    color: COLORS.surface,
  },
  buttonLabelInk: { fontFamily: FONTS.sansSemibold, fontSize: TYPE.md, color: COLORS.ink },
  buttonLabelMuted: { fontFamily: FONTS.sans, fontSize: TYPE.md, color: COLORS.inkMuted },

  callout: {
    borderWidth: 1,
    borderRadius: RADIUS.control,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
    gap: SPACE.sm,
  },
  calloutTitle: { fontFamily: FONTS.sansSemibold, fontSize: TYPE.md },

  divider: { flexDirection: "row", alignItems: "center", gap: SPACE.md },
  dividerRule: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerLabel: { fontFamily: FONTS.sans, fontSize: TYPE.sm, color: COLORS.inkMuted },
});

/** Tone → the box and title colours. Kept out of `styles` so it can be indexed. */
const CALLOUT_TONE: Record<
  CalloutTone,
  { box: { backgroundColor: string; borderColor: string }; title: { color: string } }
> = {
  neutral: {
    box: { backgroundColor: COLORS.stripe, borderColor: COLORS.border },
    title: { color: COLORS.ink },
  },
  ok: {
    box: { backgroundColor: COLORS.okSurface, borderColor: COLORS.okBorder },
    title: { color: COLORS.okInk },
  },
  warn: {
    box: { backgroundColor: COLORS.warnSurface, borderColor: COLORS.warnBorder },
    title: { color: COLORS.warnInk },
  },
  err: {
    box: { backgroundColor: COLORS.dangerSurface, borderColor: COLORS.dangerBorder },
    title: { color: COLORS.danger },
  },
};
