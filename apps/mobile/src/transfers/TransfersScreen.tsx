// TRANSFERENCIAS — the hub. What is coming to me, and what I sent.
//
// THE ONE SCREEN IN THIS APP THAT IS NOT ABOUT A PET IT HOLDS. Every other
// authenticated screen starts from `publicToken`, because it is about one animal
// the person is responsible for. Half of this one is about animals they are NOT
// responsible for — a proposal is an offer from somebody else's pet — which is
// why the read hangs off `/me` and why this screen takes no token.
//
// It mirrors the web's `/transferencias`, in its three sections and its order:
// Recibidas · Pendientes, Recibidas · Historial, Enviadas. History is only drawn
// when it has rows, exactly as on the web, because an empty "Historial" heading
// above nothing is furniture.
//
// EVERY AFFORDANCE COMES FROM THE SERVER. There are no controls on this screen —
// it is a list — but the SENTENCE under each row comes from `capabilities` and
// `expired`, both computed server-side against the addressee rule and the
// server's clock. A screen that decided "this one is answerable" from `status`
// would tell the sender of a proposal that they can accept it.

import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

import type { MyTransferV1, MyTransfersV1 } from "@dim/contract/api";

import type { ApiResult } from "../api/client";
import { fetchMyTransfers } from "../api/endpoints";
import { apiErrorMessage } from "../api/error-copy";
import { sessionPort } from "../auth/session-store";
import { Body, Card, EmptyState } from "../ui/components";
import { FONTS } from "../ui/fonts";
import { Callout, Eyebrow, Screen, SecondaryButton, Title } from "../ui/kit";
import { ListSkeleton } from "../ui/skeleton";
import { COLORS, LEADING, RADIUS, SPACE, TOUCH_TARGET, TRACKING, TYPE } from "../ui/theme";

import {
  emptyIncomingLabel,
  emptyOutgoingLabel,
  transferCounterpartyLabel,
  transferDeadlineLabel,
  transferStatusLabel,
} from "./transfers-view-model";

/** One sentence per failure arm. No arm falls through to a generic shrug. */
function failureMessage(result: ApiResult<unknown>): string {
  switch (result.outcome) {
    case "api-error":
      return apiErrorMessage(result.code);
    case "unsupported-version":
      return "Esta versión de la app no puede leer esta pantalla. Actualizá la app.";
    case "malformed":
      return "La respuesta del servidor no se pudo leer.";
    case "unreachable":
      return "No pudimos conectarnos. Revisá tu conexión.";
    default:
      return "No pudimos leer tus transferencias.";
  }
}

type ScreenState =
  | { phase: "loading" }
  | { phase: "ready"; view: MyTransfersV1 }
  | { phase: "failed"; message: string };

export function TransfersScreen({ onOpen }: { onOpen: (transferToken: string) => void }) {
  const [state, setState] = useState<ScreenState>({ phase: "loading" });

  // Pull-to-refresh (QOL 2026-09-01): the shared Screen carried the prop all
  // along and /mascotas + notificaciones already used it — these lists were
  // the odd ones out. A refresh keeps the list on screen instead of blanking
  // to the loading phase; only the very first load does that.
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "refresh") setRefreshing(true);
    else setState({ phase: "loading" });
    const result = await fetchMyTransfers(sessionPort);
    if (mode === "refresh") setRefreshing(false);
    if (result.outcome === "ok") {
      setState({ phase: "ready", view: result.payload });
      return;
    }
    setState({ phase: "failed", message: failureMessage(result) });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refresher = (
    <RefreshControl
      colors={[COLORS.accent]}
      onRefresh={() => void load("refresh")}
      refreshing={refreshing}
      tintColor={COLORS.accent}
    />
  );

  if (state.phase === "loading")
    return (
      <Screen>
        <ListSkeleton rows={3} label="Cargando transferencias…" />
      </Screen>
    );

  if (state.phase === "failed") {
    return (
      <Screen>
        <Title>Transferencias</Title>
        {/* NOT an empty list. A read that failed and a person with no proposals
            are different facts, and "no tenés transferencias pendientes" over a
            server outage hides a seven-day window that closes by itself. */}
        <Callout tone="err">
          <Body>{state.message}</Body>
        </Callout>
        <SecondaryButton label="Reintentar" onPress={() => void load()} />
      </Screen>
    );
  }

  const { incoming, outgoing } = state.view;

  return (
    <Screen refreshControl={refresher}>
      <Title>Transferencias</Title>
      <Body>Transferencias de mascotas recibidas y enviadas.</Body>

      <View style={styles.section}>
        <Eyebrow>Recibidas · Pendientes</Eyebrow>
        {incoming.pending.length === 0 ? (
          <EmptyState
            headline={emptyIncomingLabel()}
            body="Cuando alguien te ofrezca la titularidad de una mascota, la propuesta aparece acá."
          />
        ) : (
          incoming.pending.map((transfer) => (
            <TransferRow key={transfer.transferToken} transfer={transfer} onOpen={onOpen} />
          ))
        )}
      </View>

      {/* Drawn only when it has rows — an empty "Historial" is furniture. */}
      {incoming.history.length > 0 && (
        <View style={styles.section}>
          <Eyebrow>Recibidas · Historial</Eyebrow>
          {incoming.history.map((transfer) => (
            <TransferRow key={transfer.transferToken} transfer={transfer} onOpen={onOpen} />
          ))}
        </View>
      )}

      <View style={styles.section}>
        <Eyebrow>Enviadas</Eyebrow>
        {outgoing.length === 0 ? (
          <EmptyState
            headline={emptyOutgoingLabel()}
            body="Podés ofrecer la titularidad de una mascota desde su ficha."
          />
        ) : (
          outgoing.map((transfer) => (
            <TransferRow key={transfer.transferToken} transfer={transfer} onOpen={onOpen} />
          ))
        )}
      </View>
    </Screen>
  );
}

/**
 * One proposal, as a row.
 *
 * The whole row is the target rather than a "Ver" link at its end, because a
 * phone's touch target should be the thing you are looking at. `accessibilityRole
 * ="button"` with a composed label, so a screen reader announces the animal, the
 * other party and the state as one sentence instead of reading three fragments.
 */
function TransferRow({
  transfer,
  onOpen,
}: {
  transfer: MyTransferV1;
  onOpen: (transferToken: string) => void;
}) {
  const counterparty = transferCounterpartyLabel(transfer);
  const deadline = transferDeadlineLabel(transfer);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        transfer.pet.name,
        counterparty,
        deadline ?? transferStatusLabel(transfer.status),
      ]
        .filter(Boolean)
        .join(". ")}
      onPress={() => onOpen(transfer.transferToken)}
      style={styles.row}
    >
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle}>{transfer.pet.name}</Text>
        {counterparty !== null && <Text style={styles.rowMeta}>{counterparty}</Text>}
        {/* Only while there IS a deadline. A resolved proposal's state is on the
            badge, and printing it here too said the same word twice. */}
        {deadline !== null && <Text style={styles.rowMeta}>{deadline}</Text>}
      </View>
      <Text style={styles.rowBadge}>{transferStatusLabel(transfer.status)}</Text>
    </Pressable>
  );
}

/** Kept for the detail screen's "nothing here" case, which needs a Card shell. */
export function TransferMissingCard({ message }: { message: string }) {
  return (
    <Card>
      <Body>{message}</Body>
    </Card>
  );
}

const styles = StyleSheet.create({
  section: { gap: SPACE.sm, marginTop: SPACE.lg },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACE.sm,
    minHeight: TOUCH_TARGET,
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  rowMain: { flex: 1, gap: SPACE.xs / 2 },
  rowTitle: {
    fontFamily: FONTS.serif,
    fontSize: TYPE.lg,
    lineHeight: TYPE.lg * LEADING.sm,
    color: COLORS.ink,
  },
  rowMeta: {
    fontFamily: FONTS.sans,
    fontSize: TYPE.sm,
    lineHeight: TYPE.sm * LEADING.md,
    color: COLORS.inkMuted,
  },
  rowBadge: {
    fontFamily: FONTS.monoSemibold,
    fontSize: TYPE.xs,
    letterSpacing: TYPE.xs * TRACKING.wider,
    textTransform: "uppercase",
    color: COLORS.inkMuted,
  },
});
