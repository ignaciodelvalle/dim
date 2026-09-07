// ASENTAR — writing one of the asientos an owner may write, from the phone.
//
// SIX WHEN THIS SCREEN WAS BUILT, ELEVEN NOW: WU-L added visita veterinaria,
// información clínica, esterilización and microchip, and WU-M added síntoma —
// every web writer that appends a plain fact under the SAME guard the first six
// use and through the same idempotent insert. What is still missing from the
// picker is listed in `writers.ts`, with the evidence for each exclusion; the
// short of it is that mordedura opens a case, lost/found mutate status and have
// their own endpoints, and two others have no idempotency key to honour.
//
// SÍNTOMA IS THE ONE THAT DOES MORE THAN APPEND, and the screen says so before
// the form rather than after the write: its subtitle names the sanitary
// authority. The server decides everything about that fan-out off the free text
// — this form sends three fields and no disease, no signal and no recipient.
//
// IT APPENDS. Nothing here edits anything: every one of these lands as a new row
// on an append-only spine, and a mistake is corrected by appending a correction
// on top. `RECORD_IMMUTABILITY_NOTE` says so on every form, BEFORE the button,
// because a person about to write into a national registry should know that
// while they can still stop.
//
// ONE KIND IS NOT PICKED HERE. Ending a treatment needs the
// `medication_started` asiento it ends, and the only place a person already
// holds that identifier is that asiento's own screen — so that affordance lives
// there and arrives here with `sourceEventId` filled in. A picker would have to
// invent a list of open treatments from a second read, and a second read is a
// second source for something the ledger already says.
//
// ONE KEY PER FORM MOUNT, and the cost is the same one `idempotency.ts` argues
// for the alta and `EventDetailScreen` repeats for a correction: the key
// survives an EDIT, so a timeout whose first request committed will replay that
// first request and discard what was typed second. Accepted for the same reason
// — the alternative puts TWO asientos on an append-only spine for one act — and
// mitigated the same way: switching kinds remounts the form (a new key), and a
// finished write leaves the form rather than reusing it.
//
// NO ATTACHMENTS, AND THE REASON CHANGED. Every web form here offers a photo;
// this one still does not. It used to say the path was blocked because "a native
// upload needs a signed URL and that path is blocked" — that half is now false:
// `POST /pets/{token}/photo` is the ticket-then-confirm door, and
// `lib/infra/pet-photo-upload.ts` is a primitive an event attachment can reuse.
//
// What is still true is the other half: `POST .../events` takes no attachment,
// so wiring one here would be a client offering a field the endpoint discards.
// The two doors agree about it, and they have to move together — an attachment
// on an event is a `attachments` row with an `event_id`, which means the confirm
// step has to know which event it is claiming for, which is its own work unit.

import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import type { EventRecordedV1 } from "@dim/contract/api";
import type { ApiResult } from "../api/client";
import { recordPetEvent } from "../api/endpoints";
import { apiErrorMessage } from "../api/error-copy";
import { sessionPort } from "../auth/session-store";
import { Body, Card } from "../ui/components";
import {
  Callout,
  Choice,
  DateField,
  Eyebrow,
  ListRow,
  PrimaryButton,
  Screen,
  SecondaryButton,
  TextField,
  TimeField,
  Title,
} from "../ui/kit";
import { credentialRoute } from "../ui/routes";
import { SPACE } from "../ui/theme";
import { useIsDirty } from "../ui/use-draft-dirty";
import { useDraftDiscardGuard } from "../ui/use-draft-discard-guard";
import { useReturnKeyChain } from "../ui/use-return-key-chain";
import { useScrollToError } from "../ui/use-scroll-to-error";

import { createAttemptSession } from "./idempotency";
import {
  CLINICAL_SUB_KIND_OPTIONS,
  DEWORMING_TYPE_OPTIONS,
  type EventDraft,
  FREQUENCY_OPTIONS,
  NOTE_CATEGORY_OPTIONS,
  RECORD_DONE_LABEL,
  RECORD_DUPLICATE_LABEL,
  RECORD_IMMUTABILITY_NOTE,
  RECORD_KINDS,
  type RecordKind,
  SAME_DAY_PROMPT_LABEL,
  STERILIZATION_PROCEDURE_OPTIONS,
  SYMPTOM_SEVERITY_OPTIONS,
  type WritableKind,
  clinicalSubKindLabel,
  dewormingTypeLabel,
  emptyDraft,
  frequencyLabel,
  invalidFields,
  kindSubtitle,
  kindTitle,
  noteCategoryLabel,
  recordEventCta,
  sterilizationProcedureLabel,
  symptomSeverityLabel,
  validateDraft,
} from "./record-event-view-model";
import { DISCARD_COPY, confirmDiscard } from "./use-discard-guard";

/** One sentence per failure arm. No arm may fall through to a generic shrug. */
function failureMessage(result: ApiResult<EventRecordedV1>): string {
  switch (result.outcome) {
    case "api-error":
      return apiErrorMessage(result.code);
    case "unsupported-version":
      return "Esta versión de la app no puede registrar asientos. Actualizá la app.";
    case "malformed":
      return "La respuesta del servidor no se pudo leer.";
    case "unreachable":
      return "No pudimos conectarnos. Revisá tu conexión.";
    default:
      return "No pudimos guardar el registro.";
  }
}

export function RecordEventScreen({
  publicToken,
  initialKind = null,
  sourceEventId = null,
}: {
  publicToken: string;
  /** Set when the caller already decided — the medication-end path does. */
  initialKind?: WritableKind | null;
  /** The `medication_started` asiento a medication END refers to. */
  sourceEventId?: string | null;
}) {
  const [kind, setKind] = useState<WritableKind | null>(initialKind);

  if (kind === null) {
    return <KindPicker onPick={setKind} />;
  }

  return (
    <EventForm
      // REMOUNTS ON A KIND CHANGE, which is what gives the new form its own
      // idempotency key. Without it, switching from Peso to Nota and submitting
      // would reuse the abandoned weighing's key and be deduped into silence.
      key={kind}
      kind={kind}
      publicToken={publicToken}
      sourceEventId={sourceEventId}
      onBack={initialKind === null ? () => setKind(null) : null}
    />
  );
}

function KindPicker({ onPick }: { onPick: (kind: RecordKind) => void }) {
  return (
    <Screen>
      <View style={styles.header}>
        <Eyebrow>Libreta sanitaria</Eyebrow>
        <Title>Asentar</Title>
        <Body>¿Qué querés registrar?</Body>
      </View>
      {RECORD_KINDS.map((kind) => (
        <SecondaryButton
          key={kind}
          label={kindTitle(kind)}
          accessibilityHint={kindSubtitle(kind)}
          onPress={() => onPick(kind)}
        />
      ))}
      {/* Eleven pills and then this. It is NOT one of the eleven — ending a
          treatment happens on the asiento that started it, deliberately (see
          this file's header) — but until 2026-09-03 it was drawn as a `Card`,
          a bordered box among stretched pills, because the kit had no row that
          could say "this is here, and it is not a destination". It has one
          now. Same list, same rhythm, visibly not tappable, and the caption
          says where the real control lives. */}
      <ListRow
        label="Terminar una medicación"
        caption='Se hace desde el asiento del inicio del tratamiento, en la libreta: "Terminar medicación".'
      />
    </Screen>
  );
}

type FormPhase =
  | { phase: "editing" }
  | { phase: "sending" }
  /** The soft same-day gate. The same body, resent with the override. */
  | { phase: "confirming-same-day" }
  | { phase: "done"; wasDuplicate: boolean };

function EventForm({
  kind,
  publicToken,
  sourceEventId,
  onBack,
}: {
  kind: WritableKind;
  publicToken: string;
  sourceEventId: string | null;
  /** `null` when this form is the whole screen and there is nothing to go back to. */
  onBack: (() => void) | null;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<EventDraft>(() => emptyDraft());
  const [state, setState] = useState<FormPhase>({ phase: "editing" });
  const [error, setError] = useState<string | null>(null);
  // The fields the last refusal was about, for the red border (forms-F3).
  // Cleared per field as the person edits it, so the box stops being red the
  // moment they touch it rather than after the next submit.
  const [invalid, setInvalid] = useState<ReadonlySet<keyof EventDraft>>(() => new Set());
  const { anchorRef: errorAnchor, scrollRef } = useScrollToError(error);
  // THE BACK GESTURE MAY NOT DISCARD TEN FILLED-IN FIELDS (A2-alta-asentar-08).
  // Somebody finishing medicación·inicio nudges the Android back gesture while
  // dismissing the keyboard and lands on the libreta with all of it gone.
  //
  // `useIsDirty` and NOT `draft !== emptyDraft()`: those are two different
  // objects, so the comparison is true on mount and would ask the question of
  // everyone who merely opened the form — see that hook's header. `done` clears
  // it because the asiento is on the server and the screen is an ack.
  const dirty = useIsDirty(draft) && state.phase !== "done";
  const { allowLeave } = useDraftDiscardGuard(dirty);
  // ONE key for this whole asiento. `useRef` and not `useState` because a
  // re-render must not be able to produce a different key, and because nothing
  // renders from it. Never `restart()`-ed: this form IS one attempt, and the
  // same-day confirm below is the SAME attempt resent.
  const attempt = useRef(createAttemptSession());

  function set<K extends keyof EventDraft>(field: K, value: EventDraft[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
    setInvalid((current) => {
      if (!current.has(field)) return current;
      const next = new Set(current);
      next.delete(field);
      return next;
    });
  }

  async function submit(sameDayOverride: boolean) {
    const validated = validateDraft(kind, draft, { sourceEventId, sameDayOverride });
    if (!validated.ok) {
      setError(validated.message);
      setInvalid(invalidFields(validated.code));
      setState({ phase: "editing" });
      return;
    }
    setError(null);
    setInvalid(new Set());
    setState({ phase: "sending" });
    const result = await recordPetEvent(
      sessionPort,
      publicToken,
      validated.input,
      attempt.current.key(),
    );
    if (result.outcome === "ok") {
      setState({ phase: "done", wasDuplicate: result.payload.wasDuplicate });
      return;
    }
    // The soft gate is a QUESTION, not a refusal: the same body goes back with
    // the override, on the SAME key, because nothing was written.
    if (result.outcome === "api-error" && result.code === "same_day_duplicate_suspected") {
      setState({ phase: "confirming-same-day" });
      return;
    }
    setError(failureMessage(result));
    setState({ phase: "editing" });
  }

  if (state.phase === "done") {
    return (
      <Screen>
        <Callout tone="ok" title={state.wasDuplicate ? "Ya estaba registrado" : "Listo"}>
          <Body>{state.wasDuplicate ? RECORD_DUPLICATE_LABEL : RECORD_DONE_LABEL}</Body>
        </Callout>
        {/* BACK TO THE FACE THIS WROTE INTO, which is what the label has always
            promised (native QA batch 1, D3). `credentialRoute` with no options
            opens the document on the credential, so the person who had just
            written an asiento landed on the FRONT of the card and had to find
            the turn button to see what they had done. The asiento is on the
            back; so is the return. */}
        {/* `allowLeave()` FIRST, and it is not decoration: the guard fires on
            every navigation away, including the one this screen makes itself
            after the asiento has landed. Two screens shipped without it in the
            batch before this one (finding H1) and asked "¿Salir sin guardar?"
            about a write that was already on the server. `app/alta.tsx` is the
            precedent. `dirty` is false here anyway — `state.phase` is `done` —
            and the call stays because a future edit to that condition must not
            be able to trap somebody on an acknowledgement. */}
        <PrimaryButton
          label="Volver a la libreta"
          onPress={() => {
            allowLeave();
            router.replace(credentialRoute(publicToken, { face: "libreta" }));
          }}
        />
      </Screen>
    );
  }

  const busy = state.phase === "sending";
  const cta = recordEventCta(kind);

  return (
    <Screen keyboardAvoiding scrollRef={scrollRef}>
      <View style={styles.header}>
        <Eyebrow>Asentar</Eyebrow>
        <Title>{kindTitle(kind)}</Title>
        <Body>{kindSubtitle(kind)}</Body>
      </View>

      <Fields kind={kind} draft={draft} set={set} invalid={invalid} />

      <Card>
        <Body>{RECORD_IMMUTABILITY_NOTE}</Body>
      </Card>

      {error === null ? null : (
        // The anchor useScrollToError drives: on a form this long the refusal
        // can appear under the keyboard or below the fold. See the hook.
        <View ref={errorAnchor}>
          <Callout tone="err" title="No se pudo guardar">
            <Body>{error}</Body>
          </Callout>
        </View>
      )}

      {state.phase === "confirming-same-day" ? (
        <Callout tone="warn" title="¿Registrar otro?">
          <Body>{SAME_DAY_PROMPT_LABEL}</Body>
          <PrimaryButton label="Sí, registrar igual" onPress={() => void submit(true)} />
        </Callout>
      ) : null}

      {/* NAMES WHAT IT WRITES (A2-alta-asentar-R05). See `recordEventCta`. */}
      <PrimaryButton
        label={busy ? cta.busyLabel : cta.label}
        disabled={busy}
        onPress={() => void submit(false)}
      />
      {/* "ELEGIR OTRO TIPO" IS A DISCARD THE NAVIGATOR CANNOT SEE
          (A2-alta-asentar-08). The screen stays and the FORM is remounted under
          a new `key` — deliberately, so the new asiento gets its own idempotency
          key — which takes every field with it. `beforeRemove` never fires, so
          the confirm has to be asked here, in the same words. */}
      {onBack === null ? null : (
        <SecondaryButton
          label="Elegir otro tipo"
          onPress={() => (dirty ? confirmDiscard(DISCARD_COPY.form, onBack) : onBack())}
          disabled={busy}
        />
      )}
    </Screen>
  );
}

/**
 * How many SINGLE-LINE fields a kind's form has, in the order they are drawn —
 * the length of its return-key chain (forms-F6). Multiline fields and choice
 * rows are not in the chain: a multiline return types a newline, and a chip
 * row has no keyboard. The custom-interval field appears only for a custom
 * frequency, which is why this reads the draft.
 *
 * Kept beside the fields it counts, because a count and a form that drift
 * apart give the wrong field the "done" key — and a `switch` with no default
 * is what makes a new kind a compile error here rather than a wrong count.
 */
function chainLength(kind: WritableKind, draft: EventDraft): number {
  switch (kind) {
    case "vaccination":
      return 6;
    case "weight":
      return 2;
    case "deworming":
      return 3;
    case "medication_start":
      return draft.frequency === "custom" ? 8 : 7;
    case "medication_end":
      return 2;
    case "vet_visit":
      return 4;
    case "clinical_info":
      return 3;
    case "sterilization":
      return 3;
    case "microchip":
      return 5;
    case "note":
      return 1;
    case "symptom":
      return 1;
  }
}

/** The fields for one kind. Every date is `DD/MM/AAAA`; see `DateField`. */
function Fields({
  kind,
  draft,
  set,
  invalid,
}: {
  kind: WritableKind;
  draft: EventDraft;
  set: <K extends keyof EventDraft>(field: K, value: EventDraft[K]) => void;
  /** The fields the last refusal named — they draw the red border. */
  invalid: ReadonlySet<keyof EventDraft>;
}) {
  // The return key walks the single-line fields in draw order. `link()` hands
  // out the next slot each time it is called, and it is called in JSX order.
  const chain = useReturnKeyChain(chainLength(kind, draft));
  let slot = 0;
  const link = () => chain(slot++);

  // A MASKED TEXT FIELD AND NOT A CALENDAR, deliberately and temporarily. The
  // kit has no date picker and adding a native one is a dependency decision
  // that does not belong inside this change. The field asks for `DD/MM/AAAA`
  // over a number pad, is pre-filled with today in ARGENTINE time, and the
  // view-model converts to the wire's `AAAA-MM-DD` before the contract judges
  // it — which still refuses a day that does not exist rather than rolling it
  // over.
  const dateField = (
    label: string,
    field: "occurredAt" | "nextDueAt" | "onsetAt",
    required: boolean,
  ) => (
    <DateField
      label={label}
      required={required}
      value={draft[field]}
      invalid={invalid.has(field)}
      onChangeText={(value) => set(field, value)}
      {...link()}
    />
  );

  switch (kind) {
    case "vaccination":
      return (
        <>
          <TextField
            label="Vacuna"
            required
            value={draft.vaccineName}
            invalid={invalid.has("vaccineName")}
            onChangeText={(v) => set("vaccineName", v)}
            placeholder="Antirrábica"
            {...link()}
          />
          {dateField("Fecha de aplicación", "occurredAt", true)}
          <TextField
            label="Marca"
            value={draft.brand}
            onChangeText={(v) => set("brand", v)}
            {...link()}
          />
          <TextField
            label="Lote"
            mono
            value={draft.batch}
            onChangeText={(v) => set("batch", v)}
            {...link()}
          />
          <TextField
            label="Aplicada por"
            value={draft.administeredBy}
            onChangeText={(v) => set("administeredBy", v)}
            {...link()}
          />
          {dateField("Próxima dosis", "nextDueAt", false)}
          <NotesField draft={draft} set={set} />
        </>
      );

    case "weight":
      return (
        <>
          <TextField
            label="Peso (kg)"
            required
            mono
            value={draft.kg}
            invalid={invalid.has("kg")}
            onChangeText={(v) => set("kg", v)}
            placeholder="12,5"
            inputMode="decimal"
            {...link()}
          />
          {dateField("Fecha", "occurredAt", true)}
          <NotesField draft={draft} set={set} />
        </>
      );

    case "deworming":
      return (
        <>
          <TextField
            label="Producto"
            required
            value={draft.product}
            invalid={invalid.has("product")}
            onChangeText={(v) => set("product", v)}
            {...link()}
          />
          <Choice
            label="Tipo"
            required
            options={DEWORMING_TYPE_OPTIONS}
            selected={draft.dewormingType}
            optionLabel={dewormingTypeLabel}
            onSelect={(value) => set("dewormingType", value)}
          />
          {dateField("Fecha de aplicación", "occurredAt", true)}
          {dateField("Próxima dosis", "nextDueAt", false)}
          <NotesField draft={draft} set={set} />
        </>
      );

    case "medication_start":
      return (
        <>
          <TextField
            label="Medicamento"
            required
            value={draft.drugName}
            invalid={invalid.has("drugName")}
            onChangeText={(v) => set("drugName", v)}
            {...link()}
          />
          <TextField
            label="Dosis"
            required
            value={draft.dose}
            invalid={invalid.has("dose")}
            onChangeText={(v) => set("dose", v)}
            placeholder="250 mg"
            {...link()}
          />
          <TextField
            label="Recetada por"
            value={draft.prescribedBy}
            onChangeText={(v) => set("prescribedBy", v)}
            {...link()}
          />
          {dateField("Fecha de inicio", "occurredAt", true)}
          <Choice
            label="Frecuencia"
            required
            options={FREQUENCY_OPTIONS}
            selected={draft.frequency}
            optionLabel={frequencyLabel}
            onSelect={(value) => set("frequency", value)}
          />
          {draft.frequency === "custom" ? (
            <TextField
              label="Cada cuántas horas"
              required
              mono
              value={draft.customHours}
              invalid={invalid.has("customHours")}
              onChangeText={(v) => set("customHours", v)}
              placeholder="8"
              inputMode="numeric"
              {...link()}
            />
          ) : null}
          <TextField
            label="Duración (días)"
            mono
            value={draft.durationDays}
            invalid={invalid.has("durationDays")}
            onChangeText={(v) => set("durationDays", v)}
            placeholder="7"
            inputMode="numeric"
            {...link()}
          />
          {/* TWO FIELDS FOR ONE VALUE, joined by the view-model. A single
              "AAAA-MM-DDTHH:mm" box would ask a person to type a `T`. */}
          <DateField
            label="Primera dosis — día"
            required
            value={draft.firstDoseDay}
            invalid={invalid.has("firstDoseDay")}
            onChangeText={(v) => set("firstDoseDay", v)}
            {...link()}
          />
          <TimeField
            label="Primera dosis — hora"
            required
            value={draft.firstDoseTime}
            invalid={invalid.has("firstDoseTime")}
            onChangeText={(v) => set("firstDoseTime", v)}
            {...link()}
          />
          <NotesField draft={draft} set={set} />
        </>
      );

    case "medication_end":
      return (
        <>
          {dateField("Fecha de fin", "occurredAt", true)}
          <TextField
            label="Motivo"
            value={draft.reason}
            onChangeText={(v) => set("reason", v)}
            placeholder="Tratamiento completo"
            {...link()}
          />
          <NotesField draft={draft} set={set} />
        </>
      );

    case "vet_visit":
      return (
        <>
          <TextField
            label="Motivo de la visita"
            required
            value={draft.visitReason}
            invalid={invalid.has("visitReason")}
            onChangeText={(v) => set("visitReason", v)}
            placeholder="Control anual"
            {...link()}
          />
          {dateField("Fecha", "occurredAt", true)}
          {/* FREE TEXT, and deliberately not a disease picker. A diagnosis
              chosen from the catalog is a signed professional claim with an
              outbreak-signal cascade behind it; this is the owner writing down
              what the vet told them. */}
          <TextField
            label="Diagnóstico"
            multiline
            value={draft.diagnosis}
            onChangeText={(v) => set("diagnosis", v)}
            placeholder="Lo que te dijo el veterinario"
          />
          <TextField
            label="Veterinario/a"
            value={draft.vetName}
            onChangeText={(v) => set("vetName", v)}
            {...link()}
          />
          <TextField
            label="Clínica"
            value={draft.clinic}
            onChangeText={(v) => set("clinic", v)}
            {...link()}
          />
          <NotesField draft={draft} set={set} />
        </>
      );

    case "clinical_info":
      return (
        <>
          <Choice
            label="Tipo"
            required
            options={CLINICAL_SUB_KIND_OPTIONS}
            selected={draft.clinicalSubKind}
            optionLabel={clinicalSubKindLabel}
            onSelect={(value) => set("clinicalSubKind", value)}
          />
          <TextField
            label="Estudio o procedimiento"
            required
            value={draft.title}
            invalid={invalid.has("title")}
            onChangeText={(v) => set("title", v)}
            placeholder="Hemograma completo"
            {...link()}
          />
          {dateField("Fecha", "occurredAt", true)}
          <TextField
            label="Detalle"
            multiline
            value={draft.details}
            onChangeText={(v) => set("details", v)}
            placeholder="Resultados, valores, observaciones"
          />
          <TextField
            label="Realizado por"
            value={draft.performedBy}
            onChangeText={(v) => set("performedBy", v)}
            {...link()}
          />
          <NotesField draft={draft} set={set} />
        </>
      );

    case "sterilization":
      return (
        <>
          <Choice
            label="Procedimiento"
            required
            options={STERILIZATION_PROCEDURE_OPTIONS}
            selected={draft.procedure}
            optionLabel={sterilizationProcedureLabel}
            onSelect={(value) => set("procedure", value)}
          />
          {dateField("Fecha de la cirugía", "occurredAt", true)}
          <TextField
            label="Realizada por"
            value={draft.performedBy}
            onChangeText={(v) => set("performedBy", v)}
            {...link()}
          />
          <TextField
            label="Clínica"
            value={draft.clinic}
            onChangeText={(v) => set("clinic", v)}
            {...link()}
          />
          <NotesField draft={draft} set={set} />
        </>
      );

    case "microchip":
      return (
        <>
          {/* MONO AND numeric-ish, because this is a code that gets read back
              off a scanner and compared digit by digit. No length rule: the
              server checks it against the pet's CANONICAL chip, and a 15-digit
              mask invented here would refuse the shorter legacy codes the web
              accepts. */}
          <TextField
            label="Número de microchip"
            required
            mono
            value={draft.chipNumber}
            invalid={invalid.has("chipNumber")}
            onChangeText={(v) => set("chipNumber", v)}
            placeholder="982000123456789"
            autoCapitalize="none"
            autoCorrect={false}
            // `inputMode`, not `keyboardType="numbers-and-punctuation"`: that
            // keyboard type is iOS-only and Android opened QWERTY (forms-F1).
            inputMode="numeric"
            {...link()}
          />
          {dateField("Fecha de implantación", "occurredAt", true)}
          <TextField
            label="País"
            value={draft.countryCode}
            onChangeText={(v) => set("countryCode", v)}
            placeholder="AR"
            autoCapitalize="characters"
            autoCorrect={false}
            {...link()}
          />
          <TextField
            label="Implantado por"
            value={draft.implantedBy}
            onChangeText={(v) => set("implantedBy", v)}
            {...link()}
          />
          <TextField
            label="Zona del cuerpo"
            value={draft.locationOnBody}
            onChangeText={(v) => set("locationOnBody", v)}
            placeholder="Cuello, lado izquierdo"
            {...link()}
          />
          <NotesField draft={draft} set={set} />
        </>
      );

    case "note":
      return (
        <>
          <TextField
            label="Nota"
            required
            multiline
            value={draft.text}
            invalid={invalid.has("text")}
            onChangeText={(v) => set("text", v)}
          />
          {dateField("Fecha", "occurredAt", true)}
          <Choice
            label="Categoría"
            options={NOTE_CATEGORY_OPTIONS}
            selected={draft.category}
            optionLabel={noteCategoryLabel}
            onSelect={(value) => set("category", draft.category === value ? null : value)}
          />
        </>
      );

    case "symptom":
      return (
        <>
          {/* THE FIELD THAT DOES THE WORK. The server's matcher reads THIS —
              not the severity, not the date — so the placeholder asks for
              observations and not for a diagnosis. A person writing "parvovirus"
              here has guessed; a person writing what they saw has reported. */}
          <TextField
            label="Qué le viste"
            required
            multiline
            value={draft.freeText}
            invalid={invalid.has("freeText")}
            onChangeText={(v) => set("freeText", v)}
            placeholder="Decaído, no come desde ayer, vómitos"
          />
          <Choice
            label="Gravedad"
            options={SYMPTOM_SEVERITY_OPTIONS}
            selected={draft.severity}
            optionLabel={symptomSeverityLabel}
            onSelect={(value) => set("severity", draft.severity === value ? null : value)}
          />
          {/* OPTIONAL AND BLANK, unlike every other date on this screen. Left
              empty, the asiento is stamped at the moment of reporting — which
              is the honest answer when nobody knows when it started. */}
          {dateField("Desde cuándo (si sabés)", "onsetAt", false)}
        </>
      );
  }
}

function NotesField({
  draft,
  set,
}: {
  draft: EventDraft;
  set: <K extends keyof EventDraft>(field: K, value: EventDraft[K]) => void;
}) {
  return (
    <TextField
      label="Notas"
      multiline
      value={draft.notes}
      onChangeText={(v) => set("notes", v)}
      placeholder="Opcional"
    />
  );
}

// `Choice` USED TO LIVE HERE and now lives in `kit.tsx`. Its docblock said it
// would move "the day a second screen needs it"; the transfer form (WU-O) is
// that screen, so it moved rather than being copied.

const styles = StyleSheet.create({
  header: { gap: SPACE.xs },
});
