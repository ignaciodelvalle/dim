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
// decides which of the state commands this caller may send, because four of the
// five conditions need facts a client does not hold — whether a
// `lost_pet_episode` is open, and whether this caller reached the animal through
// an organization (which is refused for reactivation and for nothing else). A
// screen that computed them from `status` would get four right and the fifth
// wrong, and the wrong one would only show up as a 403 in somebody's hands.
//
// "REPORTAR" IS THE EXCEPTION, AND IT IS NOT A CAPABILITY. The sixth command
// takes an ITEM rather than the animal, and the right to report one is
// co-extensive with the right to read the feed it is on — so there is no flag to
// obey, and a flag would have been `true` on every payload that ever reached
// this screen. What decides where the control appears is the item's KIND: a
// sighting and a finder message were typed by an anonymous stranger, a scan is a
// machine reading a QR. `feedItemReportable` is that one line.
//
// AND IT IS "REPORTAR", NEVER "DENUNCIAR". In this product `denuncia` already
// names a Ley 14.346 animal-cruelty complaint routed to an authority. Using that
// word on a button that hides a message would promise a proceeding that is not
// happening.
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
// same reason: a double tap on a flaky connection must not put two sightings in
// one episode. The other five commands send no key at all — their writers are
// idempotent on the state, and a key they would ignore is a guarantee nobody
// has. `report_content` APPENDS and still sends none, which is the proof the
// rule is about state: an item already reported is not reported twice.
//
// NO MAP AND NO COORDINATES. The web captures a pin; this sends the last-seen
// place as TEXT, which is exactly what an untouched web wizard sends. Adding a
// pin later is a widget here and nothing at all on the server — the contract's
// pair is already optional and both-or-neither.

import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Share, StyleSheet, Text, View } from "react-native";

import type { LostCommandAckV1, LostFeedItemV1, PetLostV1 } from "@dim/contract/api";
import type { ContentReportCategory } from "@dim/contract/events";
import type { LostCommandInput } from "@dim/contract/input";

import type { ApiResult } from "../api/client";
import { fetchPetLostMode, sendLostCommand } from "../api/endpoints";
import { apiErrorMessage } from "../api/error-copy";
import { sessionPort } from "../auth/session-store";
import { publicCredentialPageUrl } from "../config/api";
import { createAttemptSession } from "../pets/idempotency";
import { Body, Card, Loading, PhoneRow, Row } from "../ui/components";
import { FONTS } from "../ui/fonts";
import { hapticConfirm, hapticError, hapticSuccess } from "../ui/haptics";
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
  REPORT_ACTION_LABEL,
  REPORT_CATEGORY_OPTIONS,
  REPORT_INTRO,
  buildMarkFound,
  buildMarkLost,
  buildReactivateSearch,
  buildReportContent,
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
  feedItemReportable,
  feedItemTitle,
  feedTruncationNote,
  lostAdjective,
  reportCategoryLabel,
  shareSearchMessage,
  situationHeadline,
} from "./lost-view-model";

/**
 * Hand the search to the OS share sheet — the 2 a.m. action this screen exists
 * for, since "share to the neighbourhood WhatsApp group" is how a search
 * actually spreads. BEST-EFFORT: the sheet belongs to the OS, sends nothing to
 * our server, and a device with no share targets throwing here is not a failure
 * the person can act on — so no error surface, no busy state.
 */
async function shareSearch(view: PetLostV1): Promise<void> {
  try {
    await Share.share({
      message: shareSearchMessage(view, publicCredentialPageUrl(view.publicToken)),
    });
  } catch {
    // Nothing to say: the person is looking at the sheet's own failure, or at
    // its silent refusal to open, and a second banner would explain neither.
  }
}

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

/**
 * Which pane is on screen. The forms are panes, not routes.
 *
 * `report` is the AVISTAJE form and `report-content` is the MODERATION one, and
 * the two names are close enough to be worth separating out loud: one adds a
 * sighting to the search, the other takes a stranger's message off it. The
 * commands behind them are `report_last_seen` and `report_content`, which is the
 * same collision the contract carries — "reportar un avistaje" is the ordinary
 * Spanish for logging one, and the word arrived here first.
 */
type Pane = "overview" | "mark-lost" | "report" | "report-content";

export function LostScreen({ publicToken }: { publicToken: string }) {
  const [state, setState] = useState<ScreenState>({ phase: "loading" });
  const [pane, setPane] = useState<Pane>("overview");
  const [notice, setNotice] = useState<{ tone: "ok" | "warn"; message: string } | null>(null);
  // The feed row the person chose to report. Held on the SCREEN and not inside
  // the pane, because the pane is unmounted the moment the command returns and
  // the row's id has to survive being handed to it.
  const [reporting, setReporting] = useState<LostFeedItemV1 | null>(null);
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
        hapticError();
        setError(failureMessage(result));
        return;
      }
      // The haptic tracks `changed` the way the copy does: a replay that
      // changed nothing gets the warn sentence and NO success buzz — a buzz
      // saying "done" over "ya estaba así" would be the two channels
      // disagreeing.
      if (result.payload.changed) hapticSuccess();
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
          onReportItem={(item) => {
            setReporting(item);
            setPane("report-content");
          }}
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

      {state.phase === "ready" && pane === "report-content" && reporting !== null ? (
        <ReportContentForm
          item={reporting}
          busy={busy}
          onCancel={() => {
            setReporting(null);
            setPane("overview");
          }}
          onRun={run}
        />
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
  onReportItem,
  onRun,
  onReload,
}: {
  view: PetLostV1;
  busy: boolean;
  onMarkLost: () => void;
  onReport: () => void;
  onReportItem: (item: LostFeedItemV1) => void;
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
            onPress={() => {
              // The confirm haptic marks the WEIGHT of what just armed, not an
              // outcome — closing a search notifies everyone who was looking.
              hapticConfirm();
              setConfirmingFound(true);
            }}
          />
        )
      ) : null}

      {/* ON `status === "lost"`, INCLUDING a search closed for inactivity: the
          public page's sighting writer refuses on the pet's status alone
          (report-pet-sighting.ts:172), not on an open episode, so the link the
          message invites people to use keeps working in both lost states. NOT
          gated on `busy`: sharing runs no command and touches no state. */}
      {view.status === "lost" ? (
        <SecondaryButton label="Compartir la búsqueda" onPress={() => void shareSearch(view)} />
      ) : null}

      <Card title="Avistajes y escaneos">
        {view.feed.items.length === 0 ? (
          <Body>{FEED_EMPTY_LABEL}</Body>
        ) : (
          <>
            {view.feed.items.map((item) => (
              <FeedRow key={item.id} item={item} busy={busy} onReport={() => onReportItem(item)} />
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

function FeedRow({
  item,
  busy,
  onReport,
}: {
  item: LostFeedItemV1;
  busy: boolean;
  onReport: () => void;
}) {
  const detail = feedItemDetail(item);
  const contact = feedItemContact(item);
  return (
    <View style={styles.feedRow}>
      <Text style={styles.feedTitle}>{feedItemTitle(item)}</Text>
      <Text style={styles.feedMeta}>{formatIsoDateTime(item.at)}</Text>
      {detail ? <Body>{detail}</Body> : null}
      {contact ? <PhoneRow label="Contacto" value={contact} /> : null}
      {item.kind !== "scan" && item.hasPhoto ? (
        // The file is not on this payload — see the contract header. Saying it
        // exists is honest; a broken image would not be.
        <Body>Dejó una foto. Se ve desde la web.</Body>
      ) : null}

      {/* ON THE TWO AUTHORED KINDS ONLY. A `scan` is a machine reading a QR: no
          author, no text, nothing anybody could have written wrongly — so there
          is no control here at all, rather than a disabled one. The rule is
          `feedItemReportable`, and the server refuses a scan target regardless. */}
      {feedItemReportable(item) ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${REPORT_ACTION_LABEL} este mensaje`}
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={onReport}
          style={styles.reportControl}
        >
          <Text style={styles.reportLabel}>{REPORT_ACTION_LABEL}</Text>
        </Pressable>
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
 * REPORTAR UN MENSAJE — the moderation pane.
 *
 * ONE CATEGORY, OPTIONAL WORDS, ONE BUTTON. There is no "block" and no "stop
 * accepting messages": the two reportable kinds are written by ANONYMOUS people
 * who scanned a QR in the street, so there is no account to block — and a valve
 * that closed the channel would be a defence nobody uses at the moment they need
 * it, because an owner searching for their animal will not shut off the message
 * that might find it.
 *
 * NO CONFIRMATION STEP, unlike "marcar encontrada". That one is a two-step
 * because a mis-tap closes a search and notifies everybody who was looking; this
 * one removes a row from one person's own list and notifies nobody. Making a
 * safety affordance harder to reach than it needs to be is its own failure.
 *
 * NO IDEMPOTENCY KEY — the command is idempotent on the state, and a double tap
 * answers `changed: false` with its own sentence.
 */
function ReportContentForm({
  item,
  busy,
  onCancel,
  onRun,
}: {
  item: LostFeedItemV1;
  busy: boolean;
  onCancel: () => void;
  onRun: RunFn;
}) {
  const [category, setCategory] = useState<ContentReportCategory | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    if (category === null) {
      setMessage("Elegí un motivo.");
      return;
    }
    const built = buildReportContent(item.id, category, reason);
    if (!built.ok) {
      setMessage(built.message);
      return;
    }
    setMessage(null);
    await onRun(built.input, null);
  }

  return (
    <>
      {/* The heading NAMES the pane and the button NAMES the act, and the two
          are deliberately different strings. Both reading "Reportar" put two
          identical labels on one screen — invisible to a sighted person and
          genuinely ambiguous to anybody navigating by label. */}
      <Card title="Reportar un mensaje">
        {/* The row being reported, echoed — a list of five motives with no
            reminder of WHICH message they are about is how somebody reports the
            wrong one. */}
        <Body>{feedItemTitle(item)}</Body>
        <Text style={styles.feedMeta}>{formatIsoDateTime(item.at)}</Text>
        <Body>{REPORT_INTRO}</Body>
      </Card>

      <Card title="¿Qué pasa con este mensaje?">
        {REPORT_CATEGORY_OPTIONS.map((option) => (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityState={{ checked: category === option, disabled: busy }}
            disabled={busy}
            onPress={() => setCategory(option)}
            style={styles.disclosureRow}
          >
            <Text style={category === option ? styles.disclosureOn : styles.disclosureOff}>
              {reportCategoryLabel(option)}
            </Text>
          </Pressable>
        ))}
      </Card>

      <TextField
        label="Contanos más (opcional)"
        multiline
        value={reason}
        onChangeText={setReason}
        placeholder="Lo que quieras agregar"
      />

      {message === null ? null : (
        <Callout tone="err" title="Revisá los datos">
          <Body>{message}</Body>
        </Callout>
      )}

      <PrimaryButton
        label={busy ? "Enviando…" : REPORT_ACTION_LABEL}
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
  // A full touch target, on a control that is deliberately quiet. Reporting a
  // message must be REACHABLE and must not compete with "marcá que la
  // encontraste" for attention on the same screen.
  reportControl: {
    alignSelf: "flex-start",
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    paddingHorizontal: SPACE.sm,
    borderRadius: RADIUS.chip,
  },
  reportLabel: {
    fontFamily: FONTS.monoSemibold,
    fontSize: TYPE.xs,
    letterSpacing: TYPE.xs * LABEL_TRACKING_EM,
    textTransform: "uppercase",
    color: COLORS.inkMuted,
  },
});
