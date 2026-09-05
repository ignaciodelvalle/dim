// Cuidador temporal, from the TITULAR'S side, for one animal.
//
// It mirrors the web's two pieces on `/mis-mascotas/{token}`: the banner that
// says who is looking after the pet, and the controls beside it —
// `DesignateCaretakerForm` when nothing is running, `CaretakerGrantControls`
// when something is.
//
// ONE ARRANGEMENT AT A TIME, AND THAT IS THE DATABASE'S RULE, NOT THIS SCREEN'S.
// Two partial unique indexes allow at most one `pending` and at most one
// `accepted` grant per pet, so the form and the controls are never both useful.
// The screen reads which of the two states it is in from the server's row rather
// than from a local flag, and offers the form only when there is no row at all.
//
// THE TWO CONTROLS ARE DIFFERENT FACTS AND THE COPY KEEPS THEM APART:
//
//   · RETIRAR una invitación pendiente — nothing ever started. No ownership row
//     existed, no spine event is written, and the person loses nothing because
//     they never had anything.
//   · FINALIZAR un cuidado activo — a real arrangement ends, `caretaker_ended`
//     is appended with `outcome='revoked_by_owner'`, and another person's access
//     disappears without their consent. The titular has exactly that right; the
//     confirmation step is what keeps it from firing by accident.
//
// AND THE CONFIRMATION FOR THE SECOND ONE SAYS WHAT IT DOES NOT DO. Ending the
// grant ends ACCESS. The animal may still be at the caretaker's house, and a
// titular who reads "finalizar" as "get my pet back" has been misled by their own
// credential. The web's dialog says so in as many words; so does this one.
//
// NO IDEMPOTENCY KEY on any of the three, and the reflex to add one for `revoke`
// is right but the answer is no: a spine write travels there, and the endpoint
// still does not read the header, because `endCaretakerGrant` takes no
// `clientIdempotencyKey`. What protects a retry is a locked re-read that refuses
// unless the row is still `accepted`. So a timeout comes back as
// `caretaker_already_resolved`, and the only correct response is to RE-READ —
// which is what this screen does after every failure, and why its copy says
// "actualizá" rather than "volvé a intentar".

import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import type { CaretakerCommandAckV1, MyCaretakerGrantV1 } from "@dim/contract/api";
import { CARETAKER_NOTE_MAX, type CaretakerCommandInput } from "@dim/contract/input";

import type { ApiResult } from "../api/client";
import { fetchMyCaretakerGrants, sendCaretakerCommand } from "../api/endpoints";
import { apiErrorMessage } from "../api/error-copy";
import { sessionPort } from "../auth/session-store";
import { Body, Card, Loading, Row } from "../ui/components";
import { Callout, PrimaryButton, Screen, SecondaryButton, TextField, Title } from "../ui/kit";
import { SPACE } from "../ui/theme";

import {
  CARETAKER_WINDOW_DAYS,
  buildCancelCaretakerGrant,
  buildDesignateCaretaker,
  buildRevokeCaretakerGrant,
  caretakerCounterpartyLabel,
  caretakerPeriodLabel,
  caretakerStatusLabel,
  grantForPet,
  todayInAr,
} from "./caretakers-view-model";

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
      return "No pudimos leer el cuidado de esta mascota.";
  }
}

/**
 * One sentence per command, for the line above the card.
 *
 * EXHAUSTIVE OVER THE CONTRACT'S UNION on purpose, including the two commands
 * this screen never sends: a new command becomes a compile error here rather than
 * a blank line on a phone.
 */
function ackLabel(ack: CaretakerCommandAckV1): string {
  switch (ack.command) {
    case "designate":
      return ack.inviteeNeedsAccount === true
        ? "Invitación creada. Esa dirección todavía no tiene cuenta en miMAR, así que avisale vos."
        : "Invitación enviada. Le avisamos a esa persona.";
    case "cancel":
      return "Retiraste la invitación.";
    case "revoke":
      return "Finalizaste el cuidado. Esa persona ya no tiene acceso.";
    case "accept":
      return "Aceptaste el cuidado.";
    case "reject":
      return "Rechazaste la invitación.";
  }
}

type ScreenState =
  | { phase: "loading" }
  | { phase: "ready"; grant: MyCaretakerGrantV1 | null }
  | { phase: "failed"; message: string };

type Notice = { tone: "ok" | "err"; message: string } | null;

export function CaretakerPetScreen({
  publicToken,
  petName,
}: {
  publicToken: string;
  /** For the copy. `null` when the caller reached this screen by deep link. */
  petName: string | null;
}) {
  const [state, setState] = useState<ScreenState>({ phase: "loading" });
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingEnd, setConfirmingEnd] = useState(false);

  const load = useCallback(async () => {
    setState({ phase: "loading" });
    const result = await fetchMyCaretakerGrants(sessionPort);
    if (result.outcome !== "ok") {
      setState({ phase: "failed", message: failureMessage(result) });
      return;
    }
    setState({ phase: "ready", grant: grantForPet(result.payload, publicToken) });
  }, [publicToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = useCallback(
    async (input: CaretakerCommandInput) => {
      setBusy(true);
      setNotice(null);
      const result = await sendCaretakerCommand(sessionPort, input);
      setBusy(false);
      setConfirmingEnd(false);
      if (result.outcome !== "ok") {
        setNotice({ tone: "err", message: failureMessage(result) });
        // RE-READ ON FAILURE, ALWAYS. Without an idempotency key, a refusal after
        // a timeout may mean the first attempt landed. The list is the only thing
        // that can say which.
        await load();
        return;
      }
      setNotice({ tone: "ok", message: ackLabel(result.payload) });
      await load();
    },
    [load],
  );

  const subject = petName ?? "esta mascota";

  if (state.phase === "loading") return <Loading label="Leyendo el cuidado…" />;

  if (state.phase === "failed") {
    return (
      <Screen>
        <Title>Cuidador temporal</Title>
        {/* NOT "no hay ningún cuidado". A read that failed and an animal nobody
            is looking after are different facts, and saying the second over a
            server outage would invite a titular to designate a SECOND caretaker
            while one is already running. */}
        <Callout tone="err">
          <Body>{state.message}</Body>
        </Callout>
        <SecondaryButton label="Reintentar" onPress={() => void load()} />
      </Screen>
    );
  }

  return (
    <Screen keyboardAvoiding>
      <Title>Cuidador temporal</Title>

      {notice !== null && (
        <Callout tone={notice.tone}>
          <Body>{notice.message}</Body>
        </Callout>
      )}

      {state.grant === null ? (
        <DesignateForm
          publicToken={publicToken}
          subject={subject}
          busy={busy}
          onSubmit={(input) => void run(input)}
          onInvalid={(message) => setNotice({ tone: "err", message })}
        />
      ) : (
        <ExistingGrant
          grant={state.grant}
          subject={subject}
          busy={busy}
          confirming={confirmingEnd}
          onConfirm={() => setConfirmingEnd(true)}
          onBack={() => setConfirmingEnd(false)}
          onEnd={(input) => void run(input)}
        />
      )}
    </Screen>
  );
}

/**
 * The arrangement that exists, and the one lever the titular has over it.
 *
 * WHICH LEVER IS DECIDED BY `capabilities`, never by `status`. They happen to
 * agree today — `canCancel` is pending, `canRevoke` is accepted — and reading the
 * status instead would be this screen re-deriving a rule that also folds in
 * "did YOU grant this", which the payload never tells it.
 */
function ExistingGrant({
  grant,
  subject,
  busy,
  confirming,
  onConfirm,
  onBack,
  onEnd,
}: {
  grant: MyCaretakerGrantV1;
  subject: string;
  busy: boolean;
  confirming: boolean;
  onConfirm: () => void;
  onBack: () => void;
  onEnd: (input: CaretakerCommandInput) => void;
}) {
  const { canCancel, canRevoke } = grant.capabilities;
  const counterparty = caretakerCounterpartyLabel(grant);
  const ending = canRevoke;

  const built = ending
    ? buildRevokeCaretakerGrant(grant.pet.publicToken, grant.grantToken)
    : buildCancelCaretakerGrant(grant.pet.publicToken, grant.grantToken);

  return (
    <>
      <Card title={caretakerStatusLabel(grant.status)}>
        {counterparty !== null && <Body>{counterparty}</Body>}
        <Row label="Período" value={caretakerPeriodLabel(grant)} />
        {grant.note !== null && <Row label="Nota" value={grant.note} />}
        {/* THE SCOPE, from the server. Both halves, always: the titular has at
            least as much right to read what they handed over as the person who
            accepted it. */}
        <Row label="Qué puede hacer" value={grant.scopeSentence} />
      </Card>

      {(canCancel || canRevoke) &&
        (confirming ? (
          <Callout tone="warn">
            {ending ? (
              <Body>
                Esa persona pierde el acceso a {subject} en este momento y deja de recibir los
                avisos. Si {subject} sigue en su casa, esto no la trae de vuelta: vas a tener que
                coordinar la devolución igual.
              </Body>
            ) : (
              <Body>
                La invitación se retira y el link deja de servir. Nunca tuvo acceso a {subject}, así
                que no pierde nada; si querés, después podés invitarla de nuevo.
              </Body>
            )}
            <PrimaryButton
              tone="seal"
              label={
                busy ? "Procesando…" : ending ? "Confirmar la finalización" : "Confirmar el retiro"
              }
              disabled={busy || !built.ok}
              onPress={() => built.ok && onEnd(built.input)}
            />
            <SecondaryButton label="Volver" disabled={busy} onPress={onBack} />
          </Callout>
        ) : (
          <View style={styles.actions}>
            <SecondaryButton
              label={ending ? "Finalizar el cuidado ahora" : "Retirar la invitación"}
              disabled={busy}
              onPress={onConfirm}
            />
          </View>
        ))}
    </>
  );
}

/**
 * The designation form.
 *
 * OFFERED WHENEVER NOTHING IS RUNNING, and refused by the server for a caller who
 * may not designate — a person-path holder whose ownership role is `caretaker`,
 * which is deny-list row `caretaker-sub-designation`. This payload carries no
 * flag for that, and a local guess would be a second copy of a rule that lives in
 * one place. The screen asks and renders `caretaker_forbidden` when the answer is
 * no, exactly as the transfer form does for its own narrower rule.
 *
 * THE DATES ARE ARGENTINE CALENDAR DAYS typed as `AAAA-MM-DD`, the same control
 * the asiento form uses, for the same reason: a native date picker would be a new
 * dependency and a second calendar. The contract refuses a day that does not
 * exist (`isRealArDay`) BEFORE the round trip, so `2026-02-31` gets a field
 * sentence here rather than a period that silently ends on the 3rd of March.
 */
function DesignateForm({
  publicToken,
  subject,
  busy,
  onSubmit,
  onInvalid,
}: {
  publicToken: string;
  subject: string;
  busy: boolean;
  onSubmit: (input: CaretakerCommandInput) => void;
  onInvalid: (message: string) => void;
}) {
  const [email, setEmail] = useState("");
  // Today in ARGENTINE time, computed rather than taken from the device's locale:
  // a phone that travels with its owner would otherwise offer "yesterday" from a
  // plane over the Atlantic, and the server would refuse a day nobody chose.
  const [startsAt, setStartsAt] = useState(() => todayInAr());
  const [endsAt, setEndsAt] = useState("");
  const [note, setNote] = useState("");

  const submit = useCallback(() => {
    // The CONTRACT's schema, run locally first, so a bad address or an impossible
    // day gets a field sentence instead of a round trip that answers
    // `invalid_request` with no field detail.
    const built = buildDesignateCaretaker({
      petPublicToken: publicToken,
      inviteeEmail: email,
      startsAt,
      endsAt,
      note,
    });
    if (!built.ok) {
      onInvalid(built.message);
      return;
    }
    onSubmit(built.input);
  }, [email, endsAt, note, onInvalid, onSubmit, publicToken, startsAt]);

  return (
    <>
      <Body>
        Le dejás {subject} a alguien de confianza por un tiempo. Puede cargar eventos médicos, notas
        y marcarla perdida o encontrada. Seguís siendo el titular y podés finalizar el cuidado
        cuando quieras, sin pedir permiso.
      </Body>

      <TextField
        accessibilityLabel="Correo de la persona"
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        editable={!busy}
        inputMode="email"
        label="Correo de la persona"
        onChangeText={setEmail}
        placeholder="persona@ejemplo.com"
        required
        value={email}
      />

      <TextField
        accessibilityLabel="Desde"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!busy}
        keyboardType="numbers-and-punctuation"
        label="Desde"
        mono
        onChangeText={setStartsAt}
        placeholder="AAAA-MM-DD"
        required
        value={startsAt}
      />

      <TextField
        accessibilityLabel="Hasta"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!busy}
        keyboardType="numbers-and-punctuation"
        label="Hasta"
        mono
        onChangeText={setEndsAt}
        placeholder="AAAA-MM-DD"
        required
        value={endsAt}
      />
      <Body>El período máximo de cuidado es de {CARETAKER_WINDOW_DAYS} días.</Body>

      <TextField
        accessibilityLabel="Nota para quien cuida"
        editable={!busy}
        label="Nota (opcional)"
        maxLength={CARETAKER_NOTE_MAX}
        multiline
        onChangeText={setNote}
        placeholder="Rutina, medicación, lo que necesite saber"
        value={note}
      />

      <PrimaryButton
        label={busy ? "Enviando…" : "Invitar como cuidador/a"}
        disabled={busy || email.trim().length === 0 || endsAt.trim().length === 0}
        onPress={submit}
      />
    </>
  );
}

const styles = StyleSheet.create({
  actions: { gap: SPACE.sm, marginTop: SPACE.md },
});
