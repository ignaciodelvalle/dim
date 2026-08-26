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
// NO ATTACHMENTS. Every web form here offers a photo; this one cannot, because a
// native upload needs a signed URL and that path is blocked. The endpoint takes
// none either, so the two doors agree about it.

import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { EventRecordedV1 } from "@dim/contract/api";
import type { ApiResult } from "../api/client";
import { recordPetEvent } from "../api/endpoints";
import { apiErrorMessage } from "../api/error-copy";
import { sessionPort } from "../auth/session-store";
import { Body, Card } from "../ui/components";
import { FONTS } from "../ui/fonts";
import {
  Callout,
  Eyebrow,
  PrimaryButton,
  Screen,
  SecondaryButton,
  TextField,
  Title,
} from "../ui/kit";
import { credentialRoute } from "../ui/routes";
import { COLORS, LABEL_TRACKING_EM, RADIUS, SPACE, TOUCH_TARGET, TYPE } from "../ui/theme";

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
  kindSubtitle,
  kindTitle,
  noteCategoryLabel,
  sterilizationProcedureLabel,
  symptomSeverityLabel,
  validateDraft,
} from "./record-event-view-model";

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
      <Card title="Terminar una medicación">
        <Body>
          Abrí el asiento del inicio del tratamiento en la libreta y usá "Terminar medicación".
        </Body>
      </Card>
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
  // ONE key for this whole asiento. `useRef` and not `useState` because a
  // re-render must not be able to produce a different key, and because nothing
  // renders from it. Never `restart()`-ed: this form IS one attempt, and the
  // same-day confirm below is the SAME attempt resent.
  const attempt = useRef(createAttemptSession());

  function set<K extends keyof EventDraft>(field: K, value: EventDraft[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function submit(sameDayOverride: boolean) {
    const validated = validateDraft(kind, draft, { sourceEventId, sameDayOverride });
    if (!validated.ok) {
      setError(validated.message);
      setState({ phase: "editing" });
      return;
    }
    setError(null);
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
        <PrimaryButton
          label="Volver a la libreta"
          onPress={() => router.replace(credentialRoute(publicToken))}
        />
      </Screen>
    );
  }

  const busy = state.phase === "sending";

  return (
    <Screen keyboardAvoiding>
      <View style={styles.header}>
        <Eyebrow>Asentar</Eyebrow>
        <Title>{kindTitle(kind)}</Title>
        <Body>{kindSubtitle(kind)}</Body>
      </View>

      <Fields kind={kind} draft={draft} set={set} />

      <Card>
        <Body>{RECORD_IMMUTABILITY_NOTE}</Body>
      </Card>

      {error === null ? null : (
        <Callout tone="err" title="No se pudo guardar">
          <Body>{error}</Body>
        </Callout>
      )}

      {state.phase === "confirming-same-day" ? (
        <Callout tone="warn" title="¿Registrar otro?">
          <Body>{SAME_DAY_PROMPT_LABEL}</Body>
          <PrimaryButton label="Sí, registrar igual" onPress={() => void submit(true)} />
        </Callout>
      ) : null}

      <PrimaryButton
        label={busy ? "Guardando…" : "Guardar"}
        disabled={busy}
        onPress={() => void submit(false)}
      />
      {onBack === null ? null : (
        <SecondaryButton label="Elegir otro tipo" onPress={onBack} disabled={busy} />
      )}
    </Screen>
  );
}

/** The fields for one kind. Every date is `AAAA-MM-DD`; see the note below. */
function Fields({
  kind,
  draft,
  set,
}: {
  kind: WritableKind;
  draft: EventDraft;
  set: <K extends keyof EventDraft>(field: K, value: EventDraft[K]) => void;
}) {
  // A MONO TEXT FIELD AND NOT A CALENDAR, deliberately and temporarily. The kit
  // has no date picker and adding a native one is a dependency decision that
  // does not belong inside this change; the format is the same "AAAA-MM-DD" the
  // web posts, the field is pre-filled with today in ARGENTINE time, and the
  // contract refuses a day that does not exist rather than rolling it over.
  const dateField = (
    label: string,
    field: "occurredAt" | "nextDueAt" | "onsetAt",
    required: boolean,
  ) => (
    <TextField
      label={label}
      required={required}
      mono
      value={draft[field]}
      onChangeText={(value) => set(field, value)}
      placeholder="AAAA-MM-DD"
      autoCapitalize="none"
      autoCorrect={false}
      keyboardType="numbers-and-punctuation"
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
            onChangeText={(v) => set("vaccineName", v)}
            placeholder="Antirrábica"
          />
          {dateField("Fecha de aplicación", "occurredAt", true)}
          <TextField label="Marca" value={draft.brand} onChangeText={(v) => set("brand", v)} />
          <TextField label="Lote" mono value={draft.batch} onChangeText={(v) => set("batch", v)} />
          <TextField
            label="Aplicada por"
            value={draft.administeredBy}
            onChangeText={(v) => set("administeredBy", v)}
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
            onChangeText={(v) => set("kg", v)}
            placeholder="12,5"
            keyboardType="decimal-pad"
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
            onChangeText={(v) => set("product", v)}
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
            onChangeText={(v) => set("drugName", v)}
          />
          <TextField
            label="Dosis"
            required
            value={draft.dose}
            onChangeText={(v) => set("dose", v)}
            placeholder="250 mg"
          />
          <TextField
            label="Recetada por"
            value={draft.prescribedBy}
            onChangeText={(v) => set("prescribedBy", v)}
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
              onChangeText={(v) => set("customHours", v)}
              placeholder="8"
              keyboardType="number-pad"
            />
          ) : null}
          <TextField
            label="Duración (días)"
            mono
            value={draft.durationDays}
            onChangeText={(v) => set("durationDays", v)}
            placeholder="7"
            keyboardType="number-pad"
          />
          {/* TWO FIELDS FOR ONE VALUE, joined by the view-model. A single
              "AAAA-MM-DDTHH:mm" box would ask a person to type a `T`. */}
          <TextField
            label="Primera dosis — día"
            required
            mono
            value={draft.firstDoseDay}
            onChangeText={(v) => set("firstDoseDay", v)}
            placeholder="AAAA-MM-DD"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
          />
          <TextField
            label="Primera dosis — hora"
            required
            mono
            value={draft.firstDoseTime}
            onChangeText={(v) => set("firstDoseTime", v)}
            placeholder="08:00"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
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
            onChangeText={(v) => set("visitReason", v)}
            placeholder="Control anual"
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
          />
          <TextField label="Clínica" value={draft.clinic} onChangeText={(v) => set("clinic", v)} />
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
            onChangeText={(v) => set("title", v)}
            placeholder="Hemograma completo"
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
          />
          <TextField label="Clínica" value={draft.clinic} onChangeText={(v) => set("clinic", v)} />
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
            onChangeText={(v) => set("chipNumber", v)}
            placeholder="982000123456789"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
          />
          {dateField("Fecha de implantación", "occurredAt", true)}
          <TextField
            label="País"
            value={draft.countryCode}
            onChangeText={(v) => set("countryCode", v)}
            placeholder="AR"
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <TextField
            label="Implantado por"
            value={draft.implantedBy}
            onChangeText={(v) => set("implantedBy", v)}
          />
          <TextField
            label="Zona del cuerpo"
            value={draft.locationOnBody}
            onChangeText={(v) => set("locationOnBody", v)}
            placeholder="Cuello, lado izquierdo"
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

/**
 * A one-of-N chooser, in the field anatomy the kit already uses.
 *
 * LOCAL TO THIS SCREEN rather than promoted into `kit.tsx`: it has exactly one
 * consumer, and a primitive with one caller is a guess about the second. It
 * moves the day a second screen needs it.
 *
 * `accessibilityRole="radio"` with `checked` is what a screen reader needs to
 * announce the set as a set rather than as loose buttons.
 */
function Choice<T extends string>({
  label,
  required = false,
  options,
  selected,
  optionLabel,
  onSelect,
}: {
  label: string;
  required?: boolean;
  options: readonly T[];
  selected: T | null;
  optionLabel: (value: T) => string;
  onSelect: (value: T) => void;
}) {
  return (
    <View style={styles.choiceField}>
      <Text style={styles.choiceLabel}>
        {label}
        {required ? <Text style={styles.asterisk}>{" *"}</Text> : null}
      </Text>
      <View style={styles.choiceRow} accessibilityRole="radiogroup">
        {options.map((option) => {
          const active = option === selected;
          return (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
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

const styles = StyleSheet.create({
  header: { gap: SPACE.xs },
  choiceField: { alignSelf: "stretch", gap: SPACE.xs },
  choiceLabel: {
    fontFamily: FONTS.monoSemibold,
    fontSize: TYPE.xs,
    letterSpacing: TYPE.xs * LABEL_TRACKING_EM,
    textTransform: "uppercase",
    color: COLORS.inkMuted,
  },
  asterisk: { color: COLORS.seal },
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
});
