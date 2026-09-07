// Ofrecer la titularidad — the form that starts a transfer.
//
// THE ONE PET-ADDRESSED COMMAND of the four, which is why this is a screen under
// an animal while the other three live on the hub. Its rule is also the narrowest
// on this surface: the caller must hold the ACTIVE `role='owner'` ownership row
// (`initiate-pet-transfer.ts:101-105`). A co-owner passes `requireTitularAccess`
// everywhere else in this app and is refused here — so the screen does NOT
// pre-judge, it asks, and it renders `transfer_forbidden` when the server says
// no. There is no capability flag to read: the pet payload does not carry one,
// and inventing a local guess ("am I the owner?") would be a second copy of a
// rule that lives in one place.
//
// NO IDEMPOTENCY KEY, LIKE THE OTHER THREE, and here the protection is a partial
// unique index (`pet_transfers_one_pending_per_pet`) rather than a status guard.
// A double submit does not create a second proposal — it is REFUSED as
// `transfer_pending_exists`, which is a safe outcome and an honest one: the
// person is told there is already one in flight and where to go to withdraw it.
//
// THE ADDRESS IS NOT CHECKED FOR EXISTENCE, and must not be. Answering "esa
// cuenta no existe" would turn this form into an oracle over the user table. The
// server resolves the address to an account when it can and sends an invitation
// when it cannot, and it reports WHICH in the ack — `recipientNeedsInvite` — so
// this screen can tell the person what kind of wait they are in for instead of
// leaving them refreshing a list that will never change.

import { useCallback, useState } from "react";
import { View } from "react-native";

import type { OwnerTransferReason, TransferCommandInputCode } from "@dim/contract/input";
import { TRANSFER_NOTE_MAX } from "@dim/contract/input";

import type { ApiResult } from "../api/client";
import { sendTransferCommand } from "../api/endpoints";
import { apiErrorMessage } from "../api/error-copy";
import { sessionPort } from "../auth/session-store";
import { Body } from "../ui/components";
import { Callout, Choice, PrimaryButton, Screen, TextField, Title } from "../ui/kit";
import { useScrollToError } from "../ui/use-scroll-to-error";

import {
  TRANSFER_REASON_CHOICES,
  TRANSFER_WINDOW_DAYS,
  buildInitiateTransfer,
} from "./transfers-view-model";

/** The four values, in the web's order, for the chooser. */
const REASON_VALUES: readonly OwnerTransferReason[] = TRANSFER_REASON_CHOICES.map((c) => c.reason);

function failureMessage(result: ApiResult<unknown>): string {
  switch (result.outcome) {
    case "api-error":
      return apiErrorMessage(result.code);
    case "unsupported-version":
      return "Esta versión de la app no puede enviar esta propuesta. Actualizá la app.";
    case "malformed":
      return "La respuesta del servidor no se pudo leer.";
    case "unreachable":
      return "No pudimos conectarnos. Revisá tu conexión.";
    default:
      return "No pudimos enviar la propuesta.";
  }
}

type Notice = { tone: "ok" | "err"; message: string } | null;

export function TransferInitiateScreen({
  publicToken,
  petName,
  onSent,
}: {
  publicToken: string;
  /** For the copy. `null` when the caller reached this screen by deep link. */
  petName: string | null;
  onSent: (transferToken: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState<OwnerTransferReason | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  // Only a REFUSAL moves the view. A notice with any other tone is news, not a
  // thing to go fix, and yanking the scroll for it is the "jarring focus jump"
  // the web hook this mirrors refuses to make.
  const { anchorRef: errorAnchor, scrollRef } = useScrollToError(
    notice !== null && notice.tone === "err" ? notice.message : null,
  );

  // WHICH field the refusal was about, for the red border (forms-F3: the kit
  // has an `invalid` prop and almost nothing used it). The CODE and not a
  // boolean per field, because the code is what the contract already told us —
  // this invents no validation of its own. Cleared the moment a field is
  // edited, so the box stops being red on the keystroke and not on the retry.
  const [invalidCode, setInvalidCode] = useState<TransferCommandInputCode | null>(null);

  const submit = useCallback(async () => {
    setNotice(null);
    // The CONTRACT's schema, run locally first, so a bad address gets a field
    // sentence instead of a round trip that answers `invalid_request` with no
    // field detail. Same rule every other form in this app follows.
    const built = buildInitiateTransfer({
      petPublicToken: publicToken,
      toEmail: email,
      reason: reason ?? "",
      note,
    });
    if (!built.ok) {
      setNotice({ tone: "err", message: built.message });
      setInvalidCode(built.code);
      return;
    }
    setInvalidCode(null);

    setBusy(true);
    const result = await sendTransferCommand(sessionPort, built.input);
    setBusy(false);
    if (result.outcome !== "ok") {
      setNotice({ tone: "err", message: failureMessage(result) });
      return;
    }
    onSent(result.payload.transferToken);
  }, [email, note, onSent, publicToken, reason]);

  const subject = petName ?? "esta mascota";

  return (
    <Screen keyboardAvoiding scrollRef={scrollRef}>
      <Title>Transferir {subject}</Title>
      <Body>
        Le pasás la titularidad a otra persona. Recibe una propuesta y tiene {TRANSFER_WINDOW_DAYS}{" "}
        días para aceptarla o rechazarla. Hasta que acepte, no cambia nada.
      </Body>

      {notice !== null && (
        <View ref={errorAnchor}>
          <Callout tone={notice.tone}>
            <Body>{notice.message}</Body>
          </Callout>
        </View>
      )}

      <TextField
        accessibilityLabel="Email del receptor"
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        editable={!busy}
        inputMode="email"
        invalid={invalidCode === "EMAIL_INVALID"}
        label="Email del receptor"
        onChangeText={(value) => {
          setEmail(value);
          setInvalidCode(null);
        }}
        placeholder="receptor@ejemplo.com"
        required
        value={email}
      />

      {/* NOTHING IS PRESELECTED. The web's `<select>` opens on "Regalo", which
          on a form that hands over an animal means the commonest submission is
          a reason nobody chose. Four visible chips with none checked costs one
          tap and removes that. */}
      <Choice
        label="Motivo"
        required
        options={REASON_VALUES}
        selected={reason}
        optionLabel={(value) =>
          TRANSFER_REASON_CHOICES.find((c) => c.reason === value)?.label ?? value
        }
        onSelect={setReason}
        disabled={busy}
      />

      <TextField
        accessibilityLabel="Comentario para el receptor"
        editable={!busy}
        invalid={invalidCode === "NOTE_TOO_LONG"}
        label="Comentario (opcional)"
        maxLength={TRANSFER_NOTE_MAX}
        multiline
        onChangeText={(value) => {
          setNote(value);
          setInvalidCode(null);
        }}
        value={note}
      />

      <PrimaryButton
        label={busy ? "Enviando…" : "Enviar la propuesta"}
        disabled={busy || email.trim().length === 0 || reason === null}
        onPress={() => void submit()}
      />
    </Screen>
  );
}
