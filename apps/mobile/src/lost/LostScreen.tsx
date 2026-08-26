// MODO PERDIDA — the screen a person opens at two in the morning.
//
// ONE SCREEN FOR THE WHOLE FEATURE, where the web has two places: a page for
// marking lost and updating the last-seen point, and a block on the profile for
// the search, the feed, the disclosure toggles and the poster link. On a phone
// that split would be two taps between "what has happened" and "tell it what
// happened next", and this is the flow where those two questions are the same
// question.
//
// EVERY AFFORDANCE COMES FROM `capabilities`, NEVER FROM `status`. The server
// decides which of the five commands this caller may send, because four of the
// five conditions need facts a client does not hold — whether a
// `lost_pet_episode` is open, and whether this caller reached the animal through
// an organization (which is refused for reactivation and for nothing else). A
// screen that computed them from `status` would get four right and the fifth
// wrong, and the wrong one would only show up as a 403 in somebody's hands.
//
// THE DISCLOSURE ROWS ARE THE PRIVACY SURFACE, and they are the reason this
// screen says who sees each thing rather than just naming it. Every toggle
// governs a field on the PUBLIC credential — the page a stranger who scanned the
// QR is reading — and a row labelled only "Mostrar mi teléfono" does not say to
// whom. A preference this caller may not change is SHOWN and marked, not hidden:
// hiding it would leave a caretaker wondering whether the setting exists, and
// rendering a live switch that answers 403 would be a control that lies.
//
// ONE KEY PER AVISTAJE FORM MOUNT, the same rule "Asentar" follows and for the
// same reason: the avistaje is the one command here that APPENDS, and a double
// tap on a flaky connection must not put two sightings in one episode. The other
// four commands send no key at all — their writers are idempotent on the state,
// and a key they would ignore is a guarantee nobody has.
//
// NO MAP AND NO COORDINATES. The web captures a pin; this sends the last-seen
// place as TEXT, which is exactly what an untouched web wizard sends. Adding a
// pin later is a widget here and nothing at all on the server — the contract's
// pair is already optional and both-or-neither.

import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { LostCommandAckV1, LostFeedItemV1, PetLostV1 } from "@dim/contract/api";
import type { LostCommandInput } from "@dim/contract/input";

import type { ApiResult } from "../api/client";
import { fetchPetLostMode, sendLostCommand } from "../api/endpoints";
import { apiErrorMessage } from "../api/error-copy";
import { sessionPort } from "../auth/session-store";
import { createAttemptSession } from "../pets/idempotency";
import { Body, Card, Loading, Row } from "../ui/components";
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
import { COLORS, LABEL_TRACKING_EM, RADIUS, SPACE, TOUCH_TARGET, TYPE } from "../ui/theme";

import {
  DISCLOSURE_TITULAR_ONLY_NOTE,
  type DisclosureKey,
  FEED_EMPTY_LABEL,
  type LostDraft,
  POSTER_UNAVAILABLE_NOTE,
  buildMarkFound,
  buildMarkLost,
  buildReactivateSearch,
  buildReportLastSeen,
  buildSetDisclosure,
  commandDoneLabel,
  commandUnchangedLabel,
  disclosureHelp,
  disclosureLabel,
  disclosureRows,
  emptyLostDraft,
  feedItemContact,
  feedItemDetail,
  feedItemTitle,
  feedTruncationNote,
  lostAdjective,
  situationHeadline,
} from "./lost-view-model";

/** One sentence per failure arm. No arm may fall through to a generic shrug. */
function failureMessage(result: ApiResult<unknown>): string {
  switch (result.outcome) {
    case "api-error":
      return apiErrorMessage(result.code);
    case "unsupported-version":
      return "Esta versión de la app no puede leer el modo perdida. Actualizá la app.";
    case "malformed":
      return "La respuesta del servidor no se pudo leer.";
    case "unreachable":
      return "No pudimos conectarnos. Revisá tu conexión.";
    default:
      return "No pudimos leer el modo perdida.";
  }
}

type ScreenState =
  | { phase: "loading" }
  | { phase: "ready"; view: PetLostV1 }
  | { phase: "failed"; message: string };

/** Which of the three panes is on screen. The forms are panes, not routes. */
type Pane = "overview" | "mark-lost" | "report";

export function LostScreen({ publicToken }: { publicToken: string }) {
  const [state, setState] = useState<ScreenState>({ phase: "loading" });
  const [pane, setPane] = useState<Pane>("overview");
  const [notice, setNotice] = useState<{ tone: "ok" | "warn"; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Guards against a stale response overwriting a newer one after a fast double
  // tap on "Actualizar" — the same generation counter every other screen uses.
  const generation = useRef(0);

  const load = useCallback(async () => {
    const mine = ++generation.current;
    setState({ phase: "loading" });
    const result = await fetchPetLostMode(sessionPort, publicToken);
    if (mine !== generation.current) return;
    if (result.outcome === "ok") {
      setState({ phase: "ready", view: result.payload });
      return;
    }
    setState({ phase: "failed", message: failureMessage(result) });
  }, [publicToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const petSex = state.phase === "ready" ? state.view.petSex : null;

  /**
   * Send one command, then RE-READ.
   *
   * The acknowledgement deliberately does not carry the new state — the read is
   * the one place the episode, the feed, the preferences and the capability
   * flags are computed together, and patching four of them from a write would be
   * a second, thinner source for the same facts.
   */
  const run = useCallback(
    async (input: LostCommandInput, idempotencyKey: string | null) => {
      setBusy(true);
      setError(null);
      setNotice(null);
      const result: ApiResult<LostCommandAckV1> = await sendLostCommand(
        sessionPort,
        publicToken,
        input,
        idempotencyKey,
      );
      setBusy(false);
      if (result.outcome !== "ok") {
        setError(failureMessage(result));
        return;
      }
      setNotice(
        result.payload.changed
          ? { tone: "ok", message: commandDoneLabel(result.payload.command, petSex) }
          : { tone: "warn", message: commandUnchangedLabel(result.payload.command) },
      );
      setPane("overview");
      await load();
    },
    [load, petSex, publicToken],
  );

  return (
    <Screen keyboardAvoiding>
      <View style={styles.header}>
        <Eyebrow>Modo perdida</Eyebrow>
        <Title>Búsqueda</Title>
      </View>

      {state.phase === "loading" ? <Loading label="Leyendo la búsqueda…" /> : null}

      {state.phase === "failed" ? (
        <Card title="No disponible">
          <Body>{state.message}</Body>
          <PrimaryButton label="Reintentar" onPress={() => void load()} />
        </Card>
      ) : null}

      {notice === null ? null : (
        <Callout tone={notice.tone} title={notice.tone === "ok" ? "Listo" : "Sin cambios"}>
          <Body>{notice.message}</Body>
        </Callout>
      )}

      {error === null ? null : (
        <Callout tone="err" title="No se pudo">
          <Body>{error}</Body>
        </Callout>
      )}

      {state.phase === "ready" && pane === "overview" ? (
        <Overview
          view={state.view}
          busy={busy}
          onMarkLost={() => setPane("mark-lost")}
          onReport={() => setPane("report")}
          onRun={run}
          onReload={() => void load()}
        />
      ) : null}

      {state.phase === "ready" && pane === "mark-lost" ? (
        <MarkLostForm
          view={state.view}
          busy={busy}
          onCancel={() => setPane("overview")}
          onRun={run}
        />
      ) : null}

      {state.phase === "ready" && pane === "report" ? (
        <ReportForm busy={busy} onCancel={() => setPane("overview")} onRun={run} />
      ) : null}
    </Screen>
  );
}

type RunFn = (input: LostCommandInput, idempotencyKey: string | null) => Promise<void>;

function Overview({
  view,
  busy,
  onMarkLost,
  onReport,
  onRun,
  onReload,
}: {
  view: PetLostV1;
  busy: boolean;
  onMarkLost: () => void;
  onReport: () => void;
  onRun: RunFn;
  onReload: () => void;
}) {
  const [confirmingFound, setConfirmingFound] = useState(false);
  const { capabilities: can, episode } = view;

  return (
    <>
      <Card title="Situación">
        <Body>{situationHeadline(view)}</Body>
        {episode === null ? null : (
          <>
            <Row label="Caso" value={episode.publicCode} />
            <Row label="Perdida desde" value={formatIsoDate(episode.openedAt)} />
            {episode.placeName ? <Row label="Última vez" value={episode.placeName} /> : null}
            {episode.ownerNote ? <Body>{episode.ownerNote}</Body> : null}
          </>
        )}
      </Card>

      {can.canMarkLost ? (
        <PrimaryButton
          label={`Marcar como ${lostAdjective(view.petSex)}`}
          disabled={busy}
          onPress={onMarkLost}
        />
      ) : null}

      {can.canReportLastSeen ? (
        <SecondaryButton label="Actualizar dónde la vieron" disabled={busy} onPress={onReport} />
      ) : null}

      {can.canReactivateSearch ? (
        <SecondaryButton
          label="Reactivar búsqueda"
          disabled={busy}
          onPress={() => void onRun(unwrap(buildReactivateSearch()), null)}
        />
      ) : null}

      {/* MARCAR ENCONTRADA IS A TWO-STEP, and the one affordance here that is.
          It closes the search and tells everyone who was asked to look; a
          mis-tap on a list of buttons should not do that. */}
      {can.canMarkFound ? (
        confirmingFound ? (
          <Callout tone="warn" title="¿Confirmás?">
            <Body>
              Se cierra la búsqueda, la credencial pública deja de mostrar el aviso y avisamos a
              quienes la estaban buscando.
            </Body>
            <PrimaryButton
              label="Sí, la encontré"
              disabled={busy}
              onPress={() => void onRun(unwrap(buildMarkFound()), null)}
            />
            <SecondaryButton label="Cancelar" onPress={() => setConfirmingFound(false)} />
          </Callout>
        ) : (
          <SecondaryButton
            label="Marcar como encontrada"
            disabled={busy}
            onPress={() => setConfirmingFound(true)}
          />
        )
      ) : null}

      <Card title="Avistajes y escaneos">
        {view.feed.items.length === 0 ? (
          <Body>{FEED_EMPTY_LABEL}</Body>
        ) : (
          <>
            {view.feed.items.map((item) => (
              <FeedRow key={item.id} item={item} />
            ))}
            {feedTruncationNote(view.feed.truncated) ? (
              <Body>{feedTruncationNote(view.feed.truncated)}</Body>
            ) : null}
          </>
        )}
      </Card>

      <Card title="Qué se muestra en la credencial pública">
        {disclosureRows(view.disclosure, view.capabilities.editableDisclosureKeys).map((row) => (
          <DisclosureRow
            key={row.key}
            row={row}
            busy={busy}
            onToggle={() => void onRun(unwrap(buildSetDisclosure(row.key, !row.value)), null)}
          />
        ))}
      </Card>

      <Card title="Cartel para imprimir">
        <Body>{POSTER_UNAVAILABLE_NOTE}</Body>
      </Card>

      <SecondaryButton label="Actualizar" disabled={busy} onPress={onReload} />
    </>
  );
}

function FeedRow({ item }: { item: LostFeedItemV1 }) {
  const detail = feedItemDetail(item);
  const contact = feedItemContact(item);
  return (
    <View style={styles.feedRow}>
      <Text style={styles.feedTitle}>{feedItemTitle(item)}</Text>
      <Text style={styles.feedMeta}>{formatIsoDateTime(item.at)}</Text>
      {detail ? <Body>{detail}</Body> : null}
      {contact ? <Row label="Contacto" value={contact} /> : null}
      {item.kind !== "scan" && item.hasPhoto ? (
        // The file is not on this payload — see the contract header. Saying it
        // exists is honest; a broken image would not be.
        <Body>Dejó una foto. Se ve desde la web.</Body>
      ) : null}
    </View>
  );
}

function DisclosureRow({
  row,
  busy,
  onToggle,
}: {
  row: { key: DisclosureKey; value: boolean; editable: boolean };
  busy: boolean;
  onToggle: () => void;
}) {
  const stateLabel = row.value ? "Sí" : "No";

  if (!row.editable) {
    return (
      <View style={styles.disclosureRow}>
        <Text style={styles.disclosureLabel}>{disclosureLabel(row.key)}</Text>
        <Body>{`${stateLabel} — ${DISCLOSURE_TITULAR_ONLY_NOTE}`}</Body>
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: row.value, disabled: busy }}
      accessibilityHint={disclosureHelp(row.key)}
      disabled={busy}
      onPress={onToggle}
      style={styles.disclosureRow}
    >
      <Text style={styles.disclosureLabel}>{disclosureLabel(row.key)}</Text>
      <Text style={row.value ? styles.disclosureOn : styles.disclosureOff}>{stateLabel}</Text>
      <Body>{disclosureHelp(row.key)}</Body>
    </Pressable>
  );
}

function MarkLostForm({
  view,
  busy,
  onCancel,
  onRun,
}: {
  view: PetLostV1;
  busy: boolean;
  onCancel: () => void;
  onRun: RunFn;
}) {
  const [draft, setDraft] = useState<LostDraft>(() => emptyLostDraft());
  const [message, setMessage] = useState<string | null>(null);

  function set<K extends keyof LostDraft>(field: K, value: LostDraft[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function toggle(key: keyof LostDraft["disclosure"]) {
    setDraft((current) => ({
      ...current,
      disclosure: { ...current.disclosure, [key]: !current.disclosure[key] },
    }));
  }

  async function submit() {
    const built = buildMarkLost(draft);
    if (!built.ok) {
      setMessage(built.message);
      return;
    }
    setMessage(null);
    // NO KEY. `mark_lost` is idempotent on the state — the server refuses an
    // animal already lost — so a header here would be a guarantee nobody has.
    await onRun(built.input, null);
  }

  return (
    <>
      <Card title={`Marcar a ${view.petName} como ${lostAdjective(view.petSex)}`}>
        <Body>
          Su credencial pública va a mostrar el aviso de búsqueda. Abajo elegís qué datos tuyos se
          publican mientras la búsqueda esté activa.
        </Body>
      </Card>

      <TextField
        label="Dónde la viste por última vez"
        value={draft.locationDescription}
        onChangeText={(v) => set("locationDescription", v)}
        placeholder="Plaza San Martín, Santa Rosa"
      />
      <TextField
        label="Qué pasó"
        multiline
        value={draft.note}
        onChangeText={(v) => set("note", v)}
        placeholder="Se escapó por el portón"
      />

      <Card title="Cómo reconocerla">
        <Body>Todo esto es opcional. Podés marcarla ahora y completar después.</Body>
      </Card>
      <TextField label="Color" value={draft.color} onChangeText={(v) => set("color", v)} />
      <TextField
        label="Señas particulares"
        value={draft.distinguishingFeatures}
        onChangeText={(v) => set("distinguishingFeatures", v)}
        placeholder="Mancha blanca en el pecho"
      />
      <TextField
        label="Qué llevaba puesto"
        value={draft.accessoriesWhenLost}
        onChangeText={(v) => set("accessoriesWhenLost", v)}
        placeholder="Collar rojo con chapita"
      />
      <TextField
        label="Cómo se comporta"
        multiline
        value={draft.behaviorNotes}
        onChangeText={(v) => set("behaviorNotes", v)}
        placeholder="Es miedosa, no se acerca a desconocidos"
      />
      <TextField
        label="Contexto del extravío"
        multiline
        value={draft.lastSeenContext}
        onChangeText={(v) => set("lastSeenContext", v)}
        placeholder="Había tormenta"
      />
      <TextField
        label="Número de microchip"
        mono
        value={draft.microchipId}
        onChangeText={(v) => set("microchipId", v)}
        placeholder="982000123456789"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="numbers-and-punctuation"
      />

      <Card title="Qué se muestra en la credencial pública">
        <Body>
          Nada de esto se publica por defecto. Lo que prendas acá lo ve cualquiera que escanee su QR
          mientras la búsqueda esté activa.
        </Body>
        {(Object.keys(draft.disclosure) as Array<keyof LostDraft["disclosure"]>).map((key) => (
          <DisclosureRow
            key={key}
            row={{ key, value: draft.disclosure[key], editable: true }}
            busy={busy}
            onToggle={() => toggle(key)}
          />
        ))}
      </Card>

      {message === null ? null : (
        <Callout tone="err" title="Revisá los datos">
          <Body>{message}</Body>
        </Callout>
      )}

      <PrimaryButton
        label={busy ? "Guardando…" : `Marcar como ${lostAdjective(view.petSex)}`}
        disabled={busy}
        onPress={() => void submit()}
      />
      <SecondaryButton label="Cancelar" disabled={busy} onPress={onCancel} />
    </>
  );
}

function ReportForm({
  busy,
  onCancel,
  onRun,
}: {
  busy: boolean;
  onCancel: () => void;
  onRun: RunFn;
}) {
  const [draft, setDraft] = useState<LostDraft>(() => emptyLostDraft());
  const [message, setMessage] = useState<string | null>(null);
  // ONE key for this whole avistaje. `useRef` and not `useState` because a
  // re-render must not be able to produce a different key, and nothing renders
  // from it.
  const attempt = useRef(createAttemptSession());

  async function submit() {
    const built = buildReportLastSeen(draft);
    if (!built.ok) {
      setMessage(built.message);
      return;
    }
    setMessage(null);
    await onRun(built.input, attempt.current.key());
  }

  return (
    <>
      <Card title="Actualizar dónde la vieron">
        <Body>
          Se agrega como un avistaje más a la búsqueda. Los avistajes no se editan ni se borran.
        </Body>
      </Card>

      <TextField
        label="Dónde"
        value={draft.locationDescription}
        onChangeText={(v) => setDraft((c) => ({ ...c, locationDescription: v }))}
        placeholder="Cerca de la plaza"
      />
      <TextField
        label="Qué te contaron"
        multiline
        value={draft.note}
        onChangeText={(v) => setDraft((c) => ({ ...c, note: v }))}
        placeholder="Un vecino la vio cruzando"
      />

      {message === null ? null : (
        <Callout tone="err" title="Revisá los datos">
          <Body>{message}</Body>
        </Callout>
      )}

      <PrimaryButton
        label={busy ? "Guardando…" : "Guardar avistaje"}
        disabled={busy}
        onPress={() => void submit()}
      />
      <SecondaryButton label="Cancelar" disabled={busy} onPress={onCancel} />
    </>
  );
}

/**
 * The four commands with NO form cannot fail validation — they have no fields.
 *
 * They still go through the contract's schema, because "this build and the
 * contract agree about what a command is" is worth checking once at the boundary
 * rather than assuming. A failure here is a build out of step with its own
 * contract, which is a bug and not a user's mistake.
 */
function unwrap(result: ReturnType<typeof buildMarkFound>): LostCommandInput {
  if (!result.ok) throw new Error(`lost command failed to build: ${result.code ?? "unknown"}`);
  return result.input;
}

/** `"2026-08-20T12:00:00Z"` → `"20/08/2026"`. */
function formatIsoDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
}

/** `"2026-08-20T12:00:00Z"` → `"20/08/2026 09:00"`, in Argentine time. */
function formatIsoDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const styles = StyleSheet.create({
  header: { gap: SPACE.xs },
  feedRow: {
    alignSelf: "stretch",
    gap: SPACE.xs,
    paddingVertical: SPACE.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  feedTitle: { fontFamily: FONTS.sansSemibold, fontSize: TYPE.md, color: COLORS.ink },
  feedMeta: {
    fontFamily: FONTS.mono,
    fontSize: TYPE.xs,
    letterSpacing: TYPE.xs * LABEL_TRACKING_EM,
    color: COLORS.inkMuted,
  },
  disclosureRow: {
    alignSelf: "stretch",
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    gap: SPACE.xs,
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.sm,
    borderRadius: RADIUS.chip,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  disclosureLabel: {
    fontFamily: FONTS.monoSemibold,
    fontSize: TYPE.xs,
    letterSpacing: TYPE.xs * LABEL_TRACKING_EM,
    textTransform: "uppercase",
    color: COLORS.inkMuted,
  },
  disclosureOn: { fontFamily: FONTS.sansSemibold, fontSize: TYPE.md, color: COLORS.accent },
  disclosureOff: { fontFamily: FONTS.sans, fontSize: TYPE.md, color: COLORS.ink },
});
