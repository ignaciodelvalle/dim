// One transfer proposal, and the answer to it.
//
// THE DEEP-LINK DESTINATION. `mimar://transferencias/{PTR-…}` lands here, and so
// does the notification the sender's action queued (`ctaUrl:
// /transferencias/{token}`). It is therefore the one screen in this app that a
// person can reach without having navigated to it, which changes two things:
//
//   · IT READS THE HUB, not a per-token endpoint. The union of the three lists
//     `/me/transfers` returns is exactly the set this caller is authorized to
//     see — the server built them with the same addressee rule the accept writer
//     runs — so a token that is not in it is one this person may not read. That
//     is a fact the screen can state without a second round trip, and without
//     the server having to answer a question that would tell a stranger whether
//     a token is real.
//   · IT CANNOT ASSUME A PET. The person answering may hold no animal at all;
//     this may be their first. Nothing here reads `publicToken` from anywhere
//     but the proposal itself.
//
// ACCEPTING IS IRREVERSIBLE AND THE CONTROL SAYS SO — TWICE.
// ---------------------------------------------------------------------------
// Ownership changes hands, a `custody_transferred` asiento is appended to an
// append-only spine, and any live caretaker arrangement ends. There is no undo
// and the app must not imply one. The web reached the same conclusion by audit
// (`AcceptTransferActions.tsx:34-38`): accept used to fire on a single tap while
// REJECT asked for a reason and a second tap — backwards — and it now takes two.
// This screen takes two for the same reason.
//
// NO IDEMPOTENCY KEY, AND THE REFLEX IS RIGHT BUT THE ANSWER IS NO. A spine
// write travels here, so every other write in this app would carry one. This
// endpoint does not read the header, because `acceptPetTransfer` takes no
// `clientIdempotencyKey`; what it has instead is an `expectedStatus: "pending"`
// UPDATE, which REFUSES a replay rather than absorbing it. So the failure the
// header exists for — a timeout on a request that in fact committed — comes back
// as `transfer_already_resolved`, and the only correct response to it is to
// RE-READ. That is what this screen does on every failure, and why its error copy
// says "actualizá" rather than "volvé a intentar".

import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import type { MyTransferV1, MyTransfersV1, TransferCommandAckV1 } from "@dim/contract/api";
import { TRANSFER_NOTE_MAX } from "@dim/contract/input";
import type { TransferCommandInput } from "@dim/contract/input";

import type { ApiResult } from "../api/client";
import { fetchMyTransfers, sendTransferCommand } from "../api/endpoints";
import { apiErrorMessage } from "../api/error-copy";
import { sessionPort } from "../auth/session-store";
import { Body, Card, Loading, Row } from "../ui/components";
import { Callout, PrimaryButton, Screen, SecondaryButton, TextField, Title } from "../ui/kit";
import { SPACE } from "../ui/theme";

import {
  findTransfer,
  transferCounterpartyLabel,
  transferDeadlineLabel,
  transferHeadline,
  transferReasonLabel,
  transferStatusLabel,
} from "./transfers-view-model";

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
      return "No pudimos leer esta propuesta.";
  }
}

/** One sentence per command, for the line above the card. */
function ackLabel(ack: TransferCommandAckV1): string {
  switch (ack.command) {
    case "accept":
      return "Listo. La mascota ahora es tuya.";
    case "reject":
      return "Rechazaste la propuesta. Le avisamos a quien te la envió.";
    case "cancel":
      return "Retiraste la propuesta.";
    case "initiate":
      // Not reachable from this screen — it answers an EXISTING proposal — but
      // the switch is exhaustive over the contract's union on purpose, so a new
      // command is a compile error here rather than a blank line on a phone.
      return "Propuesta enviada.";
  }
}

type ScreenState =
  | { phase: "loading" }
  | { phase: "ready"; transfer: MyTransferV1 }
  | { phase: "missing" }
  | { phase: "failed"; message: string };

type Notice = { tone: "ok" | "err"; message: string } | null;

export function TransferDetailScreen({
  transferToken,
  onAccepted,
}: {
  transferToken: string;
  /** Where to go once the animal is this person's. Given the new pet's token. */
  onAccepted: (petPublicToken: string | null) => void;
}) {
  const [state, setState] = useState<ScreenState>({ phase: "loading" });
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingAccept, setConfirmingAccept] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    setState({ phase: "loading" });
    const result = await fetchMyTransfers(sessionPort);
    if (result.outcome !== "ok") {
      setState({ phase: "failed", message: failureMessage(result) });
      return;
    }
    const found = findTransfer(result.payload as MyTransfersV1, transferToken);
    setState(found === null ? { phase: "missing" } : { phase: "ready", transfer: found });
  }, [transferToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = useCallback(
    async (input: TransferCommandInput) => {
      setBusy(true);
      setNotice(null);
      const result = await sendTransferCommand(sessionPort, input);
      setBusy(false);
      setConfirmingAccept(false);
      setRejecting(false);
      if (result.outcome !== "ok") {
        setNotice({ tone: "err", message: failureMessage(result) });
        // RE-READ ON FAILURE, ALWAYS. Without an idempotency key, a refusal
        // after a timeout may mean the first attempt landed. The list is the
        // only thing that can say which.
        await load();
        return;
      }
      setNotice({ tone: "ok", message: ackLabel(result.payload) });
      if (result.payload.command === "accept") {
        onAccepted(result.payload.petPublicToken);
        return;
      }
      await load();
    },
    [load, onAccepted],
  );

  if (state.phase === "loading") return <Loading label="Cargando la propuesta…" />;

  if (state.phase === "failed") {
    return (
      <Screen>
        <Title>Transferencia</Title>
        <Callout tone="err">
          <Body>{state.message}</Body>
        </Callout>
        <SecondaryButton label="Reintentar" onPress={() => void load()} />
      </Screen>
    );
  }

  if (state.phase === "missing") {
    // NOT "no existe". This caller may simply not be a party to it, and the two
    // are deliberately indistinguishable from here: the screen never learned who
    // the addressee is, and saying "no existe" about a real proposal would be a
    // lie told with confidence.
    return (
      <Screen>
        <Title>Transferencia</Title>
        <Card>
          <Body>
            No encontramos esta propuesta en tu cuenta. Puede que ya no esté disponible o que no sea
            para vos.
          </Body>
        </Card>
        <SecondaryButton label="Reintentar" onPress={() => void load()} />
      </Screen>
    );
  }

  const transfer = state.transfer;
  const counterparty = transferCounterpartyLabel(transfer);
  const reason = transferReasonLabel(transfer);
  const deadline = transferDeadlineLabel(transfer);
  const { canAccept, canReject, canCancel } = transfer.capabilities;

  return (
    <Screen keyboardAvoiding>
      <Title>{transferHeadline(transfer)}</Title>
      <Body>{transferStatusLabel(transfer.status)}</Body>

      {notice !== null && (
        <Callout tone={notice.tone}>
          <Body>{notice.message}</Body>
        </Callout>
      )}

      <Card title="Detalle de la transferencia">
        {counterparty !== null && <Body>{counterparty}</Body>}
        {reason !== null && <Row label="Motivo" value={reason} />}
        {transfer.note !== null && <Row label="Comentario" value={transfer.note} />}
        {/* Only while there IS one. The status line under the title already says
            how an answered proposal ended. */}
        {deadline !== null && <Row label="Vencimiento" value={deadline} />}
        <Row label="Email del receptor" value={transfer.toEmail} />
        {transfer.rejectionReason !== null && (
          <Row label="Motivo del rechazo" value={transfer.rejectionReason} />
        )}
      </Card>

      {/* EVERY CONTROL IS GATED ON A SERVER FLAG, never on `status`. The three
          are independent: an expired proposal can still be rejected but not
          accepted, and only the SENDER may cancel. */}
      {canAccept && (
        <View style={styles.actions}>
          {confirmingAccept ? (
            <Callout tone="warn">
              <Body>
                Al aceptar, {transfer.pet.name} pasa a tu nombre. Es definitivo: no se puede
                deshacer.
              </Body>
              <PrimaryButton
                label={busy ? "Aceptando…" : "Sí, aceptar la titularidad"}
                disabled={busy}
                onPress={() =>
                  void run({ command: "accept", transferToken: transfer.transferToken })
                }
              />
              <SecondaryButton
                label="No, volver"
                disabled={busy}
                onPress={() => setConfirmingAccept(false)}
              />
            </Callout>
          ) : (
            <PrimaryButton
              label="Aceptar la titularidad"
              disabled={busy}
              onPress={() => setConfirmingAccept(true)}
            />
          )}
        </View>
      )}

      {canReject && (
        <View style={styles.actions}>
          {rejecting ? (
            <>
              <TextField
                accessibilityLabel="Motivo del rechazo"
                editable={!busy}
                label="Motivo (opcional)"
                maxLength={TRANSFER_NOTE_MAX}
                onChangeText={setRejectReason}
                value={rejectReason}
              />
              <PrimaryButton
                label={busy ? "Rechazando…" : "Confirmar el rechazo"}
                disabled={busy}
                onPress={() =>
                  void run({
                    command: "reject",
                    transferToken: transfer.transferToken,
                    reason: rejectReason.trim() || null,
                  })
                }
              />
              <SecondaryButton label="Volver" disabled={busy} onPress={() => setRejecting(false)} />
            </>
          ) : (
            <SecondaryButton
              label="Rechazar la propuesta"
              disabled={busy}
              onPress={() => setRejecting(true)}
            />
          )}
        </View>
      )}

      {canCancel && (
        <View style={styles.actions}>
          <SecondaryButton
            label={busy ? "Retirando…" : "Retirar la propuesta"}
            disabled={busy}
            onPress={() => void run({ command: "cancel", transferToken: transfer.transferToken })}
          />
          <Body>Retirarla la cancela para siempre. Podés enviar una nueva después.</Body>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { gap: SPACE.sm, marginTop: SPACE.md },
});
