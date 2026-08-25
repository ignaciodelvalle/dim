// ONE asiento, opened from the libreta.
//
// The curated field set, when it happened and when it was written, who signed
// it, every correction it has received, its files — and, when this viewer may,
// the way to correct it.
//
// A CORRECTION DOES NOT EDIT ANYTHING, and this screen says so twice: once in
// the note above the button, and once in the history below, where the original
// values stay legible. That is not belt and braces — an owner who taps
// "Corregir" and then sees the old value still on screen would read it as a
// failed save unless the screen has already told them that is the design.
//
// THE ATTACHMENT LINKS EXPIRE, AND THE SCREEN SAYS WHEN. They are short-lived
// capabilities over private files: whoever holds the string holds the file until
// it stops working. So they live in this screen's state, they are never written
// anywhere, and the moment one is past its stated expiry the screen stops
// offering it and says to refresh instead of showing a thumbnail that 400s.
//
// A PDF OPENS IN THE BROWSER, and the screen says that before the tap. This app
// has no PDF viewer; a tap that silently did nothing, or a blank viewer, would
// be worse than an honest handoff.

import * as Linking from "expo-linking";
import { useCallback, useEffect, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import type { EventAttachmentV1, PetEventDetailV1 } from "@dim/contract/api";
import type { ApiResult } from "../api/client";
import { amendPetEvent, fetchPetEventDetail } from "../api/endpoints";
import { apiErrorMessage } from "../api/error-copy";
import { sessionPort } from "../auth/session-store";
import { Body, Card, ErrorNotice, Loading, Row, Unavailable } from "../ui/components";
import { FONTS } from "../ui/fonts";
import { Callout, PrimaryButton, Screen, SecondaryButton, TextField } from "../ui/kit";
import { COLORS, LEADING, RADIUS, SPACE, TOUCH_TARGET, TRACKING, TYPE } from "../ui/theme";
import {
  AMENDMENTS_EMPTY_LABEL,
  AMENDMENT_NO_VISIBLE_CHANGE,
  AMEND_CONFIRM_LABEL,
  AMEND_IMMUTABILITY_NOTE,
  AMEND_NO_CHANGES_LABEL,
  ATTACHMENTS_EMPTY_LABEL,
  ATTACHMENT_EXTERNAL_HINT,
  ATTACHMENT_UNAVAILABLE_LABEL,
  type EventDetailView,
  amendmentChangeLine,
  amendmentHeadline,
  attachmentExpired,
  attachmentExpiryLabel,
  buildAmendChanges,
  buildEventDetailView,
  initialAmendEdits,
} from "./event-detail-view-model";
import { createAttemptSession } from "./idempotency";
import { formatArDate } from "./libreta-view-model";
import type { SectionView } from "./owner-face-view-model";

type ScreenState =
  | { phase: "loading" }
  | { phase: "ready"; view: EventDetailView }
  | { phase: "failed"; message: string };

function failureMessage(result: ApiResult<PetEventDetailV1>): string {
  switch (result.outcome) {
    case "api-error":
      return apiErrorMessage(result.code);
    case "unsupported-version":
      return "Esta versión de la app no puede leer este registro. Actualizá la app.";
    case "malformed":
      return "La respuesta del servidor no se pudo leer.";
    case "unreachable":
      return "No pudimos conectarnos. Revisá tu conexión.";
    default:
      return "No pudimos leer este registro.";
  }
}

export function EventDetailScreen({
  publicToken,
  eventId,
}: {
  publicToken: string;
  eventId: string;
}) {
  const [state, setState] = useState<ScreenState>({ phase: "loading" });
  const generation = useRef(0);

  const load = useCallback(async () => {
    const mine = ++generation.current;
    setState({ phase: "loading" });
    const result = await fetchPetEventDetail(sessionPort, publicToken, eventId);
    if (mine !== generation.current) return;
    if (result.outcome === "ok") {
      setState({ phase: "ready", view: buildEventDetailView(result.payload) });
      return;
    }
    setState({ phase: "failed", message: failureMessage(result) });
  }, [publicToken, eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Screen>
      {state.phase === "loading" ? <Loading label="Leyendo el registro…" /> : null}
      {state.phase === "failed" ? (
        <ErrorNotice message={state.message} onRetry={() => void load()} />
      ) : null}
      {state.phase === "ready" ? (
        <EventDetailBody
          view={state.view}
          publicToken={publicToken}
          onAmended={() => void load()}
        />
      ) : null}
      {state.phase === "ready" ? (
        <PrimaryButton label="Actualizar" onPress={() => void load()} />
      ) : null}
    </Screen>
  );
}

function Section<T>({
  view,
  title,
  children,
}: {
  view: SectionView<T>;
  title: string;
  children: (data: T) => React.ReactNode;
}) {
  if (view.state === "unavailable") return <Unavailable title={title} message={view.message} />;
  return <Card title={title}>{children(view.data)}</Card>;
}

function EventDetailBody({
  view,
  publicToken,
  onAmended,
}: {
  view: EventDetailView;
  publicToken: string;
  onAmended: () => void;
}) {
  // Frozen at mount: an expiry countdown that recomputed on every keystroke in
  // the correction form would flicker between "vence a las 15:42" and the
  // expired sentence at the boundary.
  const [now] = useState(() => new Date());

  return (
    <>
      <View style={styles.masthead}>
        <Text style={styles.kind}>{view.kind}</Text>
        <Text style={styles.title}>{view.title}</Text>
        {view.subtitle ? <Body>{view.subtitle}</Body> : null}
        <Text style={styles.author}>{view.authorLine}</Text>
      </View>

      {/* FECHAS ----------------------------------------------------------- */}
      {/* Two dates and they are DIFFERENT questions: when it happened, and when
          somebody wrote it down. They can be years apart on an imported record,
          and collapsing them would hide exactly that. */}
      <Card title="Fechas">
        <Row label="Ocurrió" value={formatArDate(view.occurredAt)} />
        <Row label="Registrado" value={formatArDate(view.recordedAt)} />
      </Card>

      {/* DETALLE ---------------------------------------------------------- */}
      <Card title="Detalle">
        {view.facts.length === 0 ? (
          <Body>Sin campos adicionales.</Body>
        ) : (
          view.facts.map((fact) => <Row key={fact.field} label={fact.label} value={fact.value} />)
        )}
      </Card>

      {view.notes ? (
        <Card title="Notas">
          <Body>{view.notes}</Body>
        </Card>
      ) : null}

      {view.location ? (
        <Card title="Ubicación">
          {/* No map: this app ships no map library. The coordinate is the fact
              the record carries, and printing it beats implying a map that is
              not there. */}
          <Row
            label="Coordenadas"
            value={`${view.location.lat.toFixed(5)}, ${view.location.lng.toFixed(5)}`}
          />
        </Card>
      ) : null}

      {/* ADJUNTOS --------------------------------------------------------- */}
      <Section view={view.attachments} title="Adjuntos">
        {(attachments) =>
          attachments.items.length === 0 ? (
            <Body>{ATTACHMENTS_EMPTY_LABEL}</Body>
          ) : (
            <View style={styles.attachments}>
              {attachments.items.map((item) => (
                <AttachmentRow key={item.attachmentId} attachment={item} now={now} />
              ))}
            </View>
          )
        }
      </Section>

      {/* CORRECCIONES ----------------------------------------------------- */}
      <Section view={view.amendments} title="Correcciones">
        {(amendments) =>
          amendments.items.length === 0 ? (
            <Body>{AMENDMENTS_EMPTY_LABEL}</Body>
          ) : (
            <View style={styles.amendments}>
              {amendments.items.map((step) => (
                <View key={step.amendmentId} style={styles.amendStep}>
                  <Text style={styles.amendHeadline}>{amendmentHeadline(step)}</Text>
                  {step.changes.length === 0 ? (
                    <Body>{AMENDMENT_NO_VISIBLE_CHANGE}</Body>
                  ) : (
                    step.changes.map((change) => (
                      <Body key={change.label}>{amendmentChangeLine(change)}</Body>
                    ))
                  )}
                  {step.reason ? <Body>Motivo: {step.reason}</Body> : null}
                </View>
              ))}
            </View>
          )
        }
      </Section>

      <AmendBlock view={view} publicToken={publicToken} onAmended={onAmended} />
    </>
  );
}

/**
 * One file.
 *
 * An image renders inline; anything else is a labelled handoff to the browser.
 * A link past its expiry renders neither: it says the link is gone and points at
 * the refresh, because a broken thumbnail teaches people the app does not work.
 */
function AttachmentRow({ attachment, now }: { attachment: EventAttachmentV1; now: Date }) {
  const expired = attachmentExpired(attachment, now);
  const expiry = attachmentExpiryLabel(attachment.expiresAt, now);

  if (expired || attachment.url === null) {
    return (
      <View style={styles.attachment}>
        <Text style={styles.attachmentLabel}>{ATTACHMENT_UNAVAILABLE_LABEL}</Text>
        <Text style={styles.attachmentMeta}>{expiry}</Text>
      </View>
    );
  }

  if (attachment.kind === "image") {
    const url = attachment.url;
    return (
      <View style={styles.attachment}>
        <Image
          source={{ uri: url }}
          style={styles.image}
          resizeMode="cover"
          accessibilityLabel="Archivo adjunto de este registro"
        />
        <Text style={styles.attachmentMeta}>{expiry}</Text>
      </View>
    );
  }

  const url = attachment.url;
  return (
    <Pressable
      onPress={() => void Linking.openURL(url)}
      accessibilityRole="button"
      accessibilityLabel={`Abrir el archivo adjunto. ${ATTACHMENT_EXTERNAL_HINT}`}
      style={styles.attachmentButton}
    >
      <Text style={styles.attachmentLabel}>Ver adjunto ({attachment.mimeType})</Text>
      <Text style={styles.attachmentMeta}>{ATTACHMENT_EXTERNAL_HINT}</Text>
      <Text style={styles.attachmentMeta}>{expiry}</Text>
    </Pressable>
  );
}

/**
 * The correction affordance, and the form behind it.
 *
 * WHEN THE VIEWER MAY NOT CORRECT, THE REASON IS SHOWN. `amend.refusal` carries
 * an es-AR sentence for every case the server refuses — a deceased animal, a
 * type that has its own reversal path, a viewer who only holds the pet through
 * an organization. A disabled control with no explanation reads as a bug; no
 * control at all reads as a missing feature.
 */
function AmendBlock({
  view,
  publicToken,
  onAmended,
}: {
  view: EventDetailView;
  publicToken: string;
  onAmended: () => void;
}) {
  const [open, setOpen] = useState(false);

  if (!view.canAmend) {
    return view.amendRefusal ? (
      <Callout tone="neutral">
        <Text style={styles.calloutBody}>{view.amendRefusal}</Text>
      </Callout>
    ) : null;
  }

  if (!open) {
    return (
      <Card title="Corregir">
        <Body>{AMEND_IMMUTABILITY_NOTE}</Body>
        <SecondaryButton label="Corregir registro" onPress={() => setOpen(true)} />
      </Card>
    );
  }

  return (
    <AmendForm
      view={view}
      publicToken={publicToken}
      onCancel={() => setOpen(false)}
      onDone={() => {
        setOpen(false);
        onAmended();
      }}
    />
  );
}

function AmendForm({
  view,
  publicToken,
  onCancel,
  onDone,
}: {
  view: EventDetailView;
  publicToken: string;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [edits, setEdits] = useState<Record<string, string>>(() => initialAmendEdits(view.facts));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // ONE key per correction ATTEMPT, reused across every retry of it — a fresh
  // key per HTTP attempt would opt out of the exact failure the header exists
  // for (a timeout whose first request already committed). `restart()` is never
  // called here: this form IS one attempt.
  const attempt = useRef(createAttemptSession());

  async function submit() {
    const changes = buildAmendChanges(view.facts, edits);
    if (changes.length === 0) {
      setError(AMEND_NO_CHANGES_LABEL);
      return;
    }
    setError(null);
    setSubmitting(true);
    const trimmed = reason.trim();
    const result = await amendPetEvent(
      sessionPort,
      { publicToken, eventId: view.eventId },
      // An empty reason is `null`, not "": the schema requires five characters
      // when a reason is PRESENT, and sending a blank string would be refused
      // for a field the owner deliberately left alone.
      { reason: trimmed.length === 0 ? null : trimmed, changes },
      attempt.current.key(),
    );
    setSubmitting(false);
    if (result.outcome === "ok") {
      onDone();
      return;
    }
    setError(
      result.outcome === "api-error"
        ? apiErrorMessage(result.code)
        : "No pudimos guardar la corrección. Volvé a intentar.",
    );
  }

  return (
    <Card title="Corregir registro">
      <Body>{AMEND_IMMUTABILITY_NOTE}</Body>

      {view.facts.map((fact) => (
        <TextField
          key={fact.field}
          label={fact.label}
          value={edits[fact.field] ?? ""}
          onChangeText={(next) => setEdits((prev) => ({ ...prev, [fact.field]: next }))}
          editable={!submitting}
        />
      ))}

      {/* Optional for an owner correcting their own record — the CHANGE is the
          record. The five-character floor is the SPINE's, and it applies only
          when a reason is present, so the placeholder states both halves rather
          than letting somebody discover the second from a refusal. */}
      <TextField
        label="Motivo de la corrección"
        placeholder="Opcional. Si lo escribís, mínimo 5 caracteres."
        value={reason}
        onChangeText={setReason}
        multiline
        editable={!submitting}
      />

      {error ? (
        <Callout tone="err">
          <Text style={styles.calloutBody}>{error}</Text>
        </Callout>
      ) : null}

      <PrimaryButton
        label={submitting ? "Guardando…" : AMEND_CONFIRM_LABEL}
        onPress={() => void submit()}
        disabled={submitting}
      />
      <SecondaryButton label="Volver" onPress={onCancel} disabled={submitting} />
    </Card>
  );
}

const styles = StyleSheet.create({
  masthead: { gap: SPACE.xs },
  kind: {
    fontFamily: FONTS.mono,
    fontSize: TYPE.xs,
    letterSpacing: TYPE.xs * TRACKING.wider,
    textTransform: "uppercase",
    color: COLORS.inkMuted,
  },
  title: {
    fontFamily: FONTS.serif,
    fontSize: TYPE.xl2,
    lineHeight: TYPE.xl2 * LEADING.xl2,
    color: COLORS.ink,
  },
  author: { fontFamily: FONTS.sans, fontSize: TYPE.sm, color: COLORS.inkSoft },
  attachments: { gap: SPACE.sm },
  attachment: { gap: SPACE.xs },
  attachmentButton: {
    minHeight: TOUCH_TARGET,
    borderRadius: RADIUS.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.canvas2,
    padding: SPACE.md,
    gap: SPACE.xs,
  },
  attachmentLabel: { fontFamily: FONTS.sansSemibold, fontSize: TYPE.md, color: COLORS.accent },
  attachmentMeta: { fontFamily: FONTS.sans, fontSize: TYPE.sm, color: COLORS.inkMuted },
  image: {
    width: "100%",
    height: 192,
    borderRadius: RADIUS.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  amendments: { gap: SPACE.md },
  amendStep: {
    gap: SPACE.xs,
    borderLeftWidth: 2,
    borderLeftColor: COLORS.border,
    paddingLeft: SPACE.sm,
  },
  amendHeadline: { fontFamily: FONTS.monoSemibold, fontSize: TYPE.sm, color: COLORS.inkSoft },
  calloutBody: {
    fontFamily: FONTS.sans,
    fontSize: TYPE.md,
    lineHeight: TYPE.md * LEADING.md,
    color: COLORS.ink,
  },
});
