// The domain-shaped pieces every screen is built out of.
//
// Small on purpose. This is not a design system — `kit.tsx` is, and holds the
// Libreta Nacional primitives (Screen, Title, FieldLabel, TextField, the two
// buttons, Callout). What lives HERE is the handful of shapes that carry a
// RULE rather than a look:
//
//   `Unavailable` — the visible statement that something could not be read. The
//   alternative (rendering nothing) is what turns a failed read into "this
//   animal has no alerts", and the contract calls that out by name.
//
//   `EmptyState` — an empty list that INVITES an action instead of stating an
//   absence. "No tenés mascotas" is a dead end; "Registrá tu primera mascota"
//   with a button is the same fact with a way forward.
//
//   `ErrorNotice` — a failed read with the retry attached, so "no se pudo" is
//   never the end of the road.
//
// Both blank-screen rules exist because a blank area is the single easiest way
// for this product to lie, and neither should be re-invented per screen.
//
// The LOOK is no longer this file's business: every value below comes from
// `theme.ts`, which reads `@dim/contract/tokens`, which `pnpm lint:token-parity`
// holds against app/globals.css.

import * as Linking from "expo-linking";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { contactLink } from "./contact-link";
import { FONTS } from "./fonts";
import { PrimaryButton, SecondaryButton } from "./kit";
import { COLORS, LABEL_TRACKING_EM, LEADING, RADIUS, SPACE, TOUCH_TARGET, TYPE } from "./theme";

/**
 * A titled panel. `LnCard` on the web: white fill, warm hairline, 4px corners,
 * and a mono uppercase title.
 */
export function Card({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <View style={styles.card}>
      {title === undefined ? null : <Text style={styles.cardTitle}>{title}</Text>}
      {children}
    </View>
  );
}

/** A label/value line inside a Card. */
export function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

/**
 * A Row whose value is a CONTACT — a phone OR an email, the shape every
 * schema carrying one promises (`finderContact` in
 * `@dim/contract/api/pet-lost`, the lost owner's `phoneE164`). Tappable,
 * because it renders in the one flow where reaching the other person is the
 * whole point (QOL 2026-09-01): the owner's phone in front of the finder
 * holding the animal, and a finder's contact in front of the owner reading
 * the search feed. The web's own lost surfaces link them (`tel:` in
 * LostScanFeed:227, the "Llamar" CTA on the public credential); on the phone
 * — the device that CALLS — they were inert text.
 *
 * `contact-link.ts` decides which kind `value` is and builds the `tel:` /
 * `mailto:` href and the accessible label — an email routed through `tel:`
 * used to read "Llamar al juan@…" to a screen reader and then fail against a
 * dialer that cannot open it, silently, since the tap handler swallows the
 * rejection. A value neither kind can make sense of falls back to the plain
 * `Row` shape.
 */
export function ContactRow({ label, value }: { label: string; value: string }) {
  const link = contactLink(value);
  if (link === null) {
    return <Row label={label} value={value} />;
  }
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={link.label}
      onPress={() => void Linking.openURL(link.href).catch(() => {})}
      style={({ pressed }) => [styles.row, styles.contactRow, pressed ? { opacity: 0.6 } : null]}
    >
      <Text style={styles.rowLabel}>{label}</Text>
      <Text selectable style={[styles.rowValue, styles.contactValue]}>
        {value}
      </Text>
    </Pressable>
  );
}

export function Body({
  children,
  selectable = false,
}: {
  children: ReactNode;
  /** Long-press select/copy — for codes and tokens a person has to carry
   * somewhere else (QOL 2026-09-01; TurnoDetailScreen set the idiom: "so the
   * token can be copied as well as read aloud"). A copy BUTTON needs
   * expo-clipboard, a native dep — that lands with the D2 build batch. */
  selectable?: boolean;
}) {
  return (
    <Text selectable={selectable} style={styles.body}>
      {children}
    </Text>
  );
}

/** Something the reader has to act on. Never used for anything merely emphatic. */
export function Alert({ children }: { children: ReactNode }) {
  return <Text style={styles.alert}>{children}</Text>;
}

/** A refusal that explains itself. See the header. */
export function Unavailable({
  title = "No disponible",
  message,
}: { title?: string; message: string }) {
  return (
    <View style={styles.unavailable}>
      <Text style={styles.unavailableTitle}>{title}</Text>
      <Text style={styles.unavailableBody}>{message}</Text>
    </View>
  );
}

/** A failed read, with the way to try again attached. Announces itself to a
 * screen reader the way the web's error surfaces do (role="alert") — QOL
 * 2026-09-01, same rationale as Callout's err tone in kit.tsx. */
export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View accessibilityLiveRegion="assertive" accessibilityRole="alert" style={styles.errorNotice}>
      <Text style={styles.errorTitle}>No se pudo</Text>
      <Text style={styles.errorBody}>{message}</Text>
      {onRetry === undefined ? null : (
        <SecondaryButton label="Volver a intentar" onPress={onRetry} />
      )}
    </View>
  );
}

/** An absence that offers a next step. See the header. */
export function EmptyState({
  headline,
  body,
  actionLabel,
  onAction,
}: {
  headline: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyHeadline}>{headline}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
      {actionLabel !== undefined && onAction !== undefined ? (
        <PrimaryButton label={actionLabel} onPress={onAction} />
      ) : null}
    </View>
  );
}

export function Loading({ label }: { label: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={COLORS.accent} />
      <Text style={styles.loadingText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.control,
    padding: SPACE.lg,
    gap: SPACE.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardTitle: {
    fontFamily: FONTS.monoSemibold,
    fontSize: TYPE.xs,
    letterSpacing: TYPE.xs * LABEL_TRACKING_EM,
    textTransform: "uppercase",
    color: COLORS.inkMuted,
  },
  row: { flexDirection: "row", justifyContent: "space-between", gap: SPACE.md },
  rowLabel: { fontFamily: FONTS.sans, color: COLORS.inkMuted, fontSize: TYPE.md },
  rowValue: {
    fontFamily: FONTS.sansSemibold,
    color: COLORS.ink,
    fontSize: TYPE.md,
    flexShrink: 1,
    textAlign: "right",
  },
  // ContactRow: the value reads as the link it is, and the row is a full
  // touch target — a phone or email nobody can hit is worse than plain text.
  contactRow: { minHeight: TOUCH_TARGET, alignItems: "center" },
  contactValue: { color: COLORS.accent, textDecorationLine: "underline" },
  body: {
    fontFamily: FONTS.sans,
    color: COLORS.inkSoft,
    fontSize: TYPE.md,
    lineHeight: TYPE.md * LEADING.md,
  },
  alert: { fontFamily: FONTS.sansSemibold, color: COLORS.danger, fontSize: TYPE.md },
  unavailable: {
    backgroundColor: COLORS.warnSurface,
    borderWidth: 1,
    borderColor: COLORS.warnBorder,
    borderRadius: RADIUS.control,
    padding: SPACE.md,
    gap: SPACE.xs,
  },
  unavailableTitle: { fontFamily: FONTS.sansSemibold, color: COLORS.warnInk, fontSize: TYPE.md },
  unavailableBody: {
    fontFamily: FONTS.sans,
    color: COLORS.warnInk,
    fontSize: TYPE.md,
    lineHeight: TYPE.md * LEADING.md,
  },
  errorNotice: {
    backgroundColor: COLORS.dangerSurface,
    borderWidth: 1,
    borderColor: COLORS.dangerBorder,
    borderRadius: RADIUS.control,
    padding: SPACE.lg,
    gap: SPACE.sm,
  },
  errorTitle: { fontFamily: FONTS.sansSemibold, color: COLORS.danger, fontSize: TYPE.md },
  errorBody: {
    fontFamily: FONTS.sans,
    color: COLORS.danger,
    fontSize: TYPE.md,
    lineHeight: TYPE.md * LEADING.md,
  },
  empty: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.control,
    padding: SPACE.xl,
    gap: SPACE.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "flex-start",
  },
  emptyHeadline: {
    fontFamily: FONTS.serif,
    fontSize: TYPE.xl,
    lineHeight: TYPE.xl * LEADING.xl,
    color: COLORS.ink,
  },
  emptyBody: {
    fontFamily: FONTS.sans,
    fontSize: TYPE.md,
    lineHeight: TYPE.md * LEADING.md,
    color: COLORS.inkSoft,
  },
  loading: { paddingVertical: SPACE.xl3 + SPACE.sm, alignItems: "center", gap: SPACE.sm + 2 },
  loadingText: { fontFamily: FONTS.sans, fontSize: TYPE.md, color: COLORS.inkMuted },
});
