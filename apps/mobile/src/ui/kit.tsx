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

import type { ReactNode, Ref, RefObject } from "react";
import { createContext, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  type PressableStateCallbackType,
  RefreshControl,
  ScrollView,
  type ScrollViewProps,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";
import { type Edge, SafeAreaView } from "react-native-safe-area-context";

import { Icon } from "./Icon";
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
/**
 * The Screen's own ScrollView, offered to descendants that need to move it —
 * today that is `useScrollToError` (src/ui/use-scroll-to-error.ts), the mobile
 * mirror of the web's `useFormErrorFocus`. A context and not a prop because
 * the consumer is an ANCHOR deep inside a form, and threading a ref through
 * every intermediate component would tax screens that never scroll anywhere.
 * Null outside a Screen, and consumers must treat null as "nothing to move".
 */
export const ScreenScrollContext = createContext<RefObject<ScrollView | null> | null>(null);

/**
 * The pull-to-refresh control for `Screen`, with this app's colours already on
 * it. Pass the result straight to `<Screen refreshControl={…}>`.
 *
 * WHY IT IS HERE. `Screen` has accepted `refreshControl` since it was written,
 * and seven list screens use it — each declaring the same four props with the
 * same accent colour, because there was nothing to call. Meanwhile FIVE detail
 * screens reached for a full-width button labelled "Actualizar" instead:
 * CredentialScreen, PetDocumentScreen, LibretaScreen, EventDetailScreen,
 * LostScreen. On the pet document that produced a hierarchy inversion worth
 * stating plainly — the only blue, full-width, primary-weight button on a
 * national credential said "reload".
 *
 * Reloading is not an action a document offers. It is a gesture the platform
 * already has, every Android user already knows, and it costs no pixels.
 *
 * The seven existing screens still inline their own copy; migrating them is
 * mechanical and deliberately not bundled with the credential work.
 */
export function pullToRefresh(onRefresh: () => void, refreshing: boolean) {
  return (
    <RefreshControl
      colors={[COLORS.accent]}
      onRefresh={onRefresh}
      refreshing={refreshing}
      tintColor={COLORS.accent}
    />
  );
}

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
  const scrollRef = useRef<ScrollView>(null);
  const scroll = (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={[styles.scroll, { gap }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
    >
      <ScreenScrollContext.Provider value={scrollRef}>{children}</ScreenScrollContext.Provider>
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
  /** Ref to the underlying TextInput — return-key chains focus through it
   * (`useReturnKeyChain`). A dedicated prop rather than `ref` because this
   * component's own ref would name the wrapper View, not the input. */
  inputRef?: Ref<TextInput>;
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
 *
 * THE ACCESSIBLE NAME IS DERIVED, NOT HOPED FOR. The visible label is a sibling
 * <Text>, which React Native does not associate with the input the way a
 * <label for> does on the web — so an unlabelled TextInput announces itself as
 * a bare "text field". It worked until now only because all eight call sites
 * happened to pass `accessibilityLabel` by hand: a convention, and a convention
 * is one forgetful call site away from a screen reader reading nothing.
 *
 * Deriving it also makes the required-asterisk suppression moot. The asterisk
 * is a nested <Text> marked `accessibilityElementsHidden`, and RN flattens
 * nested text into its parent on Android — the flag may not survive, in which
 * case the name would end in a spoken "asterisco". The derived name never reads
 * the visual node at all; it says ", obligatorio", which is the fact the
 * asterisk was standing for.
 *
 * An explicit `accessibilityLabel` still wins: `...rest` is spread AFTER this.
 */
export function TextField({
  label,
  required = false,
  invalid = false,
  mono = false,
  onBlur,
  onFocus,
  inputRef,
  ...rest
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <FieldLabel required={required}>{label}</FieldLabel>
      <View style={[styles.ring, focused ? styles.ringOn : null]}>
        <TextInput
          ref={inputRef}
          accessibilityLabel={required ? `${label}, obligatorio` : label}
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

/**
 * `TextField` for passwords, with the reveal toggle the web has had all along
 * (`LnPasswordInput`, components/ui/Field.tsx:433) — QOL audit 2026-09-01,
 * the PO's own first example. The toggle matters MOST off the login screen:
 * signup and reset type a NEW password blind, twice, and a typo there is a
 * lockout on a pilot where mail recovery is days old. Visibility is per-field
 * local state — revealing one field never reveals its sibling — and the
 * control owns `secureTextEntry`, so a caller cannot half-wire it.
 */
export function PasswordField({
  label,
  required = false,
  invalid = false,
  onBlur,
  onFocus,
  ...rest
}: Omit<TextFieldProps, "mono" | "secureTextEntry">) {
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.field}>
      <FieldLabel required={required}>{label}</FieldLabel>
      <View style={[styles.ring, focused ? styles.ringOn : null, styles.passwordRow]}>
        <TextInput
          accessibilityLabel={required ? `${label}, obligatorio` : label}
          placeholderTextColor={COLORS.inkFaint}
          {...rest}
          secureTextEntry={!visible}
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
            styles.passwordInput,
            focused ? styles.inputFocused : null,
            invalid ? styles.inputInvalid : null,
          ]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          onPress={() => setVisible((v) => !v)}
          style={({ pressed }) => [
            styles.passwordEye,
            pressed ? { opacity: PRESSED_OPACITY } : null,
          ]}
        >
          <Icon name={visible ? "ocultar" : "ver"} size="md" color={COLORS.inkFaint} />
        </Pressable>
      </View>
    </View>
  );
}

// ---------- Choice ---------------------------------------------------------

/**
 * A one-of-N chooser, in the same field anatomy `TextField` uses.
 *
 * PROMOTED FROM `RecordEventScreen` (WU-O), on that file's own instruction. It
 * lived there as a local component whose docblock said: "LOCAL TO THIS SCREEN
 * rather than promoted into `kit.tsx`: it has exactly one consumer, and a
 * primitive with one caller is a guess about the second. It moves the day a
 * second screen needs it." The transfer form is the second screen — it picks one
 * of four reasons — so it moved, rather than being copied with a comment
 * explaining why there are now two.
 *
 * `accessibilityRole="radio"` inside a `radiogroup` is what a screen reader
 * needs to announce the set AS A SET rather than as loose buttons, and it is why
 * this is not four `SecondaryButton`s with a tick in the label: that spelling
 * looks selected and announces nothing.
 *
 * NOTHING IS PRESELECTED unless the caller passes a `selected` value. On a form
 * that hands over an animal, a default is a choice somebody did not make.
 */
export function Choice<T extends string>({
  label,
  required = false,
  options,
  selected,
  optionLabel,
  onSelect,
  disabled = false,
}: {
  label: string;
  required?: boolean;
  options: readonly T[];
  selected: T | null;
  optionLabel: (value: T) => string;
  onSelect: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.choiceField}>
      <FieldLabel required={required}>{label}</FieldLabel>
      <View style={styles.choiceRow} accessibilityRole="radiogroup">
        {options.map((option) => {
          const active = option === selected;
          return (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ checked: active, disabled }}
              disabled={disabled}
              onPress={() => onSelect(option)}
              style={[styles.chip, active ? styles.chipActive : null]}
            >
              <Text style={active ? styles.chipLabelActive : styles.chipLabel}>
                {optionLabel(option)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ---------- Buttons --------------------------------------------------------

/**
 * `active:scale-[0.98] active:opacity-90` on the web, for touch feedback.
 *
 * EXPORTED since 2026-09-03, and the reason is a measurement. The app holds 36
 * `<Pressable` JSX tags in NON-TEST files, counted at the tree this export
 * landed on; before this export, FIVE gave any visual response to a touch,
 * and all five were inside this file and `components.tsx`. The other 31 — the
 * credential's own action row included — were visually inert under a thumb,
 * because this helper existed and could not be reached from a screen. A
 * control that does not acknowledge a press is indistinguishable from a dead
 * one, which is exactly how the "Anotar" pill was reported on 2026-09-03: not
 * as "wrong", as *missing its event catcher*.
 *
 * Pass it straight to `style`, and add the static styles in the returned
 * array: `style={(s) => [styles.thing, pressedOpacity(s)]}`.
 */
export function pressedOpacity({ pressed }: PressableStateCallbackType) {
  return pressed ? { opacity: PRESSED_OPACITY } : null;
}

/**
 * A row that is a destination, or a row that explains why it is not one.
 *
 * WHY THIS IS IN THE KIT NOW. Until 2026-09-03 this file offered exactly two
 * controls — `PrimaryButton` and `SecondaryButton`, both full-width stretched
 * pills — and nothing else. Every screen that needed a *row* rather than a
 * call-to-action invented one, and at least six private shapes existed:
 * `PetRow` (app/mascotas/index.tsx — outside src/, which is why an rg over
 * src/ alone reads as if it were gone), `EntryCard` (pets/LibretaScreen.tsx),
 * `MoreRow` (pets/OwnerFace.tsx), and the hand-rolled pressables in
 * TurnosScreen, TransfersScreen and NotificationsScreen. The kit was a form
 * system pretending to be a design system, and the divergence it produced is
 * what the 2026-09-03 review reported as separate defects.
 *
 * THE INERT VARIANT IS THE POINT, not an afterthought. Omitting `onPress`
 * gives a row that renders in the same shape, states `disabled` to the
 * accessibility layer, and carries a `caption` saying why — the doctrine this
 * app already follows ("controls without a native destination are drawn
 * disabled, not omitted"). Before this existed, `RecordEventScreen` needed
 * that shape for "Terminar una medicación", found no such primitive, and
 * reached for a `Card` — so one entry in a list of eleven pills rendered as a
 * bordered information box. That is the whole of the "se ve diferente, como en
 * una caja" report: not a styling mistake, a missing primitive.
 */
export function ListRow({
  label,
  caption,
  accessibilityHint,
  onPress,
}: {
  label: string;
  caption?: string;
  accessibilityHint?: string;
  onPress?: () => void;
}) {
  const isInert = onPress === undefined;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isInert }}
      disabled={isInert}
      onPress={onPress}
      style={(state) => [styles.listRow, pressedOpacity(state)]}
    >
      {/* LABEL ABOVE CAPTION, always in a column — see `listRowText`. The
          column is rendered whether or not there is a caption so the row's
          anatomy does not change shape with its content, and so a trailing
          element (a chevron, a value) can be added beside it later without
          moving the text. */}
      <View style={styles.listRowText}>
        <Text style={isInert ? styles.listRowLabelMuted : styles.listRowLabel}>{label}</Text>
        {/* Two lines is a HEIGHT CAP, not the wrap: at the column's full width
            the 90-character RecordEventScreen caption fits in two lines at
            TYPE.sm, and the cap is what keeps a list of rows reading as a list
            instead of as a page of paragraphs. */}
        {caption === undefined ? null : (
          <Text numberOfLines={2} style={styles.listRowCaption}>
            {caption}
          </Text>
        )}
      </View>
    </Pressable>
  );
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
 *
 * THE ANNOUNCED STATE IS THE COMPUTED ONE. This button is inert when `disabled`
 * is true OR when no `onPress` was given — the second case is how the Mi
 * Argentina placeholder is built — but `accessibilityState` used to report the
 * PROP alone. A button with no handler therefore looked disabled, behaved
 * disabled, and announced itself as available: a screen-reader user was invited
 * to press the one control on the screen that does nothing. One expression now
 * feeds the behaviour, the styling and the announcement, so the three cannot
 * disagree.
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
  const isInert = disabled || onPress === undefined;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isInert }}
      disabled={isInert}
      onPress={onPress}
      style={(state) => [
        styles.button,
        styles.buttonGhost,
        isInert ? styles.buttonGhostDisabled : pressedOpacity(state),
      ]}
    >
      <Text style={isInert ? styles.buttonLabelMuted : styles.buttonLabelInk}>{label}</Text>
    </Pressable>
  );
}

// ---------- Callout --------------------------------------------------------

export type CalloutTone = "neutral" | "ok" | "warn" | "err";

/**
 * The bordered notice block the web login uses for every account-state message.
 *
 * A NOTE ON `neutral`. The web's two neutral notices (shift ended, sessions
 * revoked) render `bg-[var(--color-ln-paper-2)]`. When this was written that
 * custom property was declared NOWHERE, so those blocks drew with no background
 * at all and this used `stripe` rather than guess at a value. The token is now
 * declared (#f8f7f1, paper's slightly-darker sibling) and fenced by
 * lint:token-parity, so `neutral` binds to the real thing: the same notice reads
 * the same on both platforms, which is the point of the token package.
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
    <View
      // The err tone announces itself (QOL 2026-09-01): the web's error
      // surfaces carry role="alert" (Alert.tsx:18) so a screen reader hears a
      // failed submit immediately — without this, a TalkBack user had to
      // explore the screen to discover WHY nothing happened. Android reads the
      // live region; iOS reads the alert role. Non-error tones stay silent:
      // announcing an informational callout on mount is noise.
      accessibilityLiveRegion={tone === "err" ? "assertive" : undefined}
      accessibilityRole={tone === "err" ? "alert" : undefined}
      style={[styles.callout, CALLOUT_TONE[tone].box]}
    >
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

  // Choice — the chip row, moved here with the component (WU-O).
  choiceField: { alignSelf: "stretch", gap: SPACE.xs },
  choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.sm },
  chip: {
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: RADIUS.chip,
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACE.md,
  },
  chipActive: { borderColor: COLORS.accent, backgroundColor: COLORS.focusRing },
  chipLabel: { fontFamily: FONTS.sans, fontSize: TYPE.md, color: COLORS.ink },
  chipLabelActive: { fontFamily: FONTS.sansSemibold, fontSize: TYPE.md, color: COLORS.accent },

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
  // PasswordField: the input yields the ring's right edge to the eye toggle.
  passwordRow: { flexDirection: "row", alignItems: "center" },
  passwordInput: { flex: 1 },
  passwordEye: {
    minWidth: TOUCH_TARGET,
    minHeight: TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
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
  // ListRow. Lifted verbatim from OwnerFace's private `MoreRow`, because a
  // refactor that also restyles is two changes wearing one commit.
  //
  // THAT "changes nothing visually" IS NO LONGER TRUE, and saying so is the
  // point of keeping the sentence. The captioned rows in OwnerFace's ⋯ Más
  // list ("Chapa física · Disponible en la web", "Viaje y movilidad ·
  // Próximamente") now stack instead of sitting beside their label. It is not a
  // regression: `Acompañamiento de adopción` + `Disponible en la web` measured
  // ~317 points side by side against a row budget of ~288, so that row was
  // already overflowing — the promotion did not restyle those rows, it exposed
  // what they had been doing. See `listRowText` for why the column won.
  listRow: {
    minHeight: TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACE.md,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    borderRadius: RADIUS.control,
    backgroundColor: COLORS.canvas2,
  },
  /**
   * THE COLUMN IS THE BOUND, and neither Text is. Two facts decide this shape.
   *
   * First the RN one: `flexShrink` defaults to 0, and `listRow` is
   * `flexDirection: "row"` — a Text with an intrinsic width wider than what the
   * row has left does NOT wrap, it overflows the row's right edge in silence.
   * That is what the 90-character RecordEventScreen caption did on 2026-09-03.
   * Something in the row has to be allowed to give way.
   *
   * Second, WHICH something. Making both Texts shrinkable was the first fix and
   * it was wrong: Yoga hands out the negative space in proportion to each
   * child's basis, so the LABEL gives up ~66 points and "Terminar una
   * medicación" — the row's primary text, the thing a person is looking for —
   * wraps to two lines. The label styles below therefore carry NO `flexShrink`,
   * deliberately, exactly as `components.tsx`'s `row`/`rowLabel`/`rowValue`
   * already decided it (the value shrinks, the label does not).
   *
   * And side by side is not enough even with the caption bounded: it leaves the
   * caption ~108 points, about 17 characters a line, so two lines show ~34 of
   * the 90 — the sentence that says where the real control lives, truncated.
   * So the two stack, and this column takes the shrink for both of them.
   */
  listRowText: { flexShrink: 1, gap: 2 },
  listRowLabel: { fontFamily: FONTS.sansMedium, fontSize: TYPE.md, color: COLORS.ink },
  listRowLabelMuted: { fontFamily: FONTS.sans, fontSize: TYPE.md, color: COLORS.inkMuted },
  listRowCaption: {
    fontFamily: FONTS.sans,
    fontSize: TYPE.sm,
    // A caption that is allowed to wrap needs a line height; without one the
    // second line sits on the first. `body` in components.tsx sets it the same
    // way, off the shared LEADING scale.
    lineHeight: TYPE.sm * LEADING.sm,
    color: COLORS.inkFaint,
  },
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
    box: { backgroundColor: COLORS.canvas2, borderColor: COLORS.border },
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
