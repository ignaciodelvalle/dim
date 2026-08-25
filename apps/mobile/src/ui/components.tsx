// The handful of pieces every screen in this app is built out of.
//
// Small on purpose. This is not a design system — it is the set of shapes that
// would otherwise be re-declared in six `StyleSheet.create` calls, plus the two
// that carry a RULE rather than a look:
//
//   `Unavailable` — the visible statement that something could not be read. The
//   alternative (rendering nothing) is what turns a failed read into "this
//   animal has no alerts", and the contract calls that out by name.
//
//   `EmptyState` — an empty list that INVITES an action instead of stating an
//   absence. "No tenés mascotas" is a dead end; "Registrá tu primera mascota"
//   with a button is the same fact with a way forward.
//
// Both exist because a blank area of screen is the single easiest way for this
// product to lie, and neither should be re-invented per screen.

import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { COLORS, RADIUS, SPACE } from "./theme";

export function Card({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <View style={styles.card}>
      {title === undefined ? null : <Text style={styles.cardTitle}>{title}</Text>}
      {children}
    </View>
  );
}

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
        <PrimaryButton label="Volver a intentar" onPress={onRetry} tone="quiet" />
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
      <ActivityIndicator />
      <Text style={styles.loadingText}>{label}</Text>
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  tone = "solid",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "solid" | "quiet" | "danger";
}) {
  const toneStyle =
    tone === "danger"
      ? styles.buttonDanger
      : tone === "quiet"
        ? styles.buttonQuiet
        : styles.buttonSolid;
  const labelStyle = tone === "quiet" ? styles.buttonQuietLabel : styles.buttonSolidLabel;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, toneStyle, disabled ? styles.buttonDisabled : null]}
    >
      <Text style={labelStyle}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACE.lg,
    gap: SPACE.xs + 2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.inkMuted,
    textTransform: "uppercase",
  },
  row: { flexDirection: "row", justifyContent: "space-between", gap: SPACE.md },
  rowLabel: { color: COLORS.inkMuted, fontSize: 14 },
  rowValue: { color: COLORS.ink, fontSize: 14, flexShrink: 1, textAlign: "right" },
  body: { color: COLORS.inkSoft, fontSize: 14 },
  alert: { color: COLORS.danger, fontSize: 14, fontWeight: "600" },
  unavailable: {
    backgroundColor: COLORS.warnSurface,
    borderRadius: RADIUS.sm,
    padding: SPACE.md,
    gap: SPACE.xs,
  },
  unavailableTitle: { fontWeight: "700", color: COLORS.warnInk, fontSize: 14 },
  unavailableBody: { color: COLORS.warnInk, fontSize: 13 },
  errorNotice: {
    backgroundColor: COLORS.dangerSurface,
    borderRadius: RADIUS.lg,
    padding: SPACE.lg,
    gap: SPACE.sm,
  },
  errorTitle: { fontWeight: "700", color: COLORS.danger, fontSize: 14 },
  errorBody: { color: COLORS.danger, fontSize: 14 },
  empty: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACE.xl,
    gap: SPACE.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "flex-start",
  },
  emptyHeadline: { fontSize: 18, fontWeight: "700", color: COLORS.ink },
  emptyBody: { fontSize: 14, color: COLORS.inkSoft },
  loading: { paddingVertical: SPACE.xxl + 8, alignItems: "center", gap: SPACE.sm + 2 },
  loadingText: { color: COLORS.inkMuted },
  button: {
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    paddingHorizontal: SPACE.lg,
    alignItems: "center",
    alignSelf: "stretch",
  },
  buttonSolid: { backgroundColor: COLORS.ink },
  buttonQuiet: { backgroundColor: "transparent", borderWidth: 1, borderColor: COLORS.border },
  buttonDanger: { backgroundColor: COLORS.danger },
  buttonDisabled: { backgroundColor: COLORS.disabled, borderColor: COLORS.disabled },
  buttonSolidLabel: { color: COLORS.surface, fontWeight: "600", fontSize: 15 },
  buttonQuietLabel: { color: COLORS.ink, fontWeight: "600", fontSize: 15 },
});
