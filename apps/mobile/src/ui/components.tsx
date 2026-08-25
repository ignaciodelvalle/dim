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

import type { ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { FONTS } from "./fonts";
import { PrimaryButton, SecondaryButton } from "./kit";
import { COLORS, LABEL_TRACKING_EM, LEADING, RADIUS, SPACE, TYPE } from "./theme";

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

export function Body({ children }: { children: ReactNode }) {
  return <Text style={styles.body}>{children}</Text>;
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

/** A failed read, with the way to try again attached. */
export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.errorNotice}>
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
