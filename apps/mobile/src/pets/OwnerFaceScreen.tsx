// The OWNER face of one pet — what the person responsible for the animal sees.
//
// THIS IS NOT THE CREDENTIAL, AND IT DOES NOT REPLACE IT. `CredentialScreen`
// renders the anonymous public document, which looks IDENTICAL to its owner and
// to a stranger who scanned the QR — that is its job, and it is why an owner
// looking at it learns nothing they did not already know. This face carries what
// the credential deliberately withholds: the alert strip, the compliance stamp,
// the reminders coming due, the arrangements the owner made. The two are tabs on
// the same screen, both reachable, neither standing in for the other.
//
// EVERY SECTION FAILS ON ITS OWN. The payload wraps each one, and `unavailable`
// means the server could not read it — NOT that it is empty. "No hay
// recordatorios activos" is a fact; "No se pudo leer esta sección" is a
// different fact; and a section that rendered as an empty view would be telling
// the owner the first one while the server meant the second.
//
// NOT CACHED — a deliberate v1 decision, written here because the absence is
// invisible otherwise. `credential-cache.ts` stores the public credential and
// justifies it precisely: it is the animal's PUBLIC document, on its owner's own
// device, so keeping a copy discloses nothing new. This payload is a different
// privacy class — open cases, caretaker names, the household's other animals —
// and none of that reasoning carries over. So there is no offline copy of this
// face in v1; a failed read says so and offers a retry, which is honest. If it
// is ever cached, the decision needs its own paragraph in that file, not a
// silent reuse of one written about something else.

import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { OwnerPetDetailV1 } from "@dim/contract/api";
import type { ApiResult } from "../api/client";
import { fetchOwnerPetDetail } from "../api/endpoints";
import { apiErrorMessage } from "../api/error-copy";
import { sessionPort } from "../auth/session-store";
import { Body, Card, Loading, Row, Unavailable } from "../ui/components";
import { FONTS } from "../ui/fonts";
import { Callout, Eyebrow, PrimaryButton, Screen, SecondaryButton } from "../ui/kit";
import { lostModeRoute } from "../ui/routes";
import { COLORS, LEADING, RADIUS, SPACE, TRACKING, TYPE } from "../ui/theme";
import {
  type OwnerFaceView,
  REMINDERS_EMPTY_LABEL,
  type SectionView,
  alertHeadline,
  alertTone,
  buildOwnerFaceView,
  caretakerBannerLines,
  casesLine,
  complianceStampLabel,
  complianceSummaryLabel,
  rehomeBannerLine,
  reminderDueLabel,
  transitBannerLine,
  truncationNote,
} from "./owner-face-view-model";

type ScreenState =
  | { phase: "loading" }
  | { phase: "ready"; view: OwnerFaceView }
  | { phase: "failed"; message: string };

/** One sentence per failure arm. No arm may fall through to a generic shrug. */
function failureMessage(result: ApiResult<OwnerPetDetailV1>): string {
  switch (result.outcome) {
    case "api-error":
      return apiErrorMessage(result.code);
    case "unsupported-version":
      return "Esta versión de la app no puede leer los datos de esta mascota. Actualizá la app.";
    case "malformed":
      return "La respuesta del servidor no se pudo leer.";
    case "unreachable":
      return "No pudimos conectarnos. Revisá tu conexión.";
    default:
      return "No pudimos leer esta mascota.";
  }
}

export function OwnerFaceScreen({ publicToken }: { publicToken: string }) {
  const [state, setState] = useState<ScreenState>({ phase: "loading" });
  // Guards against a stale response overwriting a newer one after a fast
  // double-tap on "Actualizar" — the same generation counter CredentialScreen
  // uses, and for the same reason.
  const generation = useRef(0);

  const load = useCallback(async () => {
    const mine = ++generation.current;
    setState({ phase: "loading" });
    const result = await fetchOwnerPetDetail(sessionPort, publicToken);
    if (mine !== generation.current) return;
    if (result.outcome === "ok") {
      setState({ phase: "ready", view: buildOwnerFaceView(result.payload) });
      return;
    }
    setState({ phase: "failed", message: failureMessage(result) });
  }, [publicToken]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Screen>
      {state.phase === "loading" ? <Loading label="Leyendo la ficha…" /> : null}
      {state.phase === "failed" ? (
        <Card title="No disponible">
          <Body>{state.message}</Body>
        </Card>
      ) : null}
      {state.phase === "ready" ? <OwnerFaceBody view={state.view} /> : null}
      <PrimaryButton
        label="Actualizar"
        onPress={() => void load()}
        disabled={state.phase === "loading"}
      />
    </Screen>
  );
}

/**
 * The way into the lost-mode cockpit.
 *
 * A SecondaryButton and not a Callout: this face's Callouts are the alert strip,
 * which the server ranks, and putting an owner-initiated action in that visual
 * language would make a control look like a warning.
 */
function LostModeLink({ publicToken }: { publicToken: string }) {
  const router = useRouter();
  return (
    <SecondaryButton
      label="Modo perdida"
      accessibilityHint="Marcar la mascota como perdida, seguir la búsqueda o marcarla encontrada."
      onPress={() => router.push(lostModeRoute(publicToken))}
    />
  );
}

/** Renders a section, or its refusal. The two are never the same view. */
function Section<T>({
  view,
  title,
  children,
}: {
  view: SectionView<T>;
  title: string;
  children: (data: T) => React.ReactNode;
}) {
  if (view.state === "unavailable") {
    return <Unavailable title={title} message={view.message} />;
  }
  return <Card title={title}>{children(view.data)}</Card>;
}

function OwnerFaceBody({ view }: { view: OwnerFaceView }) {
  return (
    <>
      <View style={styles.masthead}>
        <Eyebrow>Ficha del dueño</Eyebrow>
        <Text style={styles.viewerLine}>{view.viewerLabel}</Text>
      </View>

      {/* IDENTITY + STATUS ---------------------------------------------- */}
      <Section view={view.identity} title="Identidad">
        {(identity) => (
          <>
            <Text style={styles.petName}>{identity.name}</Text>
            {identity.breedLine ? <Body>{identity.breedLine}</Body> : null}
            {identity.jurisdictionLocality ? (
              <Row label="Localidad" value={identity.jurisdictionLocality} />
            ) : null}
            {identity.tags.length > 0 ? (
              <View style={styles.chipRow}>
                {identity.tags.map((tag) => (
                  <Text key={tag.key} style={styles.chip}>
                    {tag.label}
                  </Text>
                ))}
              </View>
            ) : null}
          </>
        )}
      </Section>

      <Section view={view.status} title="Estado">
        {(status) =>
          status.situation ? (
            <Row label="Situación" value={status.situation.label} />
          ) : (
            // No pill on the web either when the situation is the default. Say
            // it rather than render an empty card.
            <Body>Sin novedades en su situación.</Body>
          )
        }
      </Section>

      {/* MODO PERDIDA ----------------------------------------------------- */}
      {/* OFFERED UNCONDITIONALLY, and that is deliberate. The cockpit behind it
          serves both directions — marking an animal lost and running the search
          for one that already is — and WHICH of the five commands this caller
          may send is decided by the server and reported in that payload. A CTA
          that appeared only when this face happened to know the animal was lost
          would hide the entry point in the one state where somebody needs it
          fastest: the moment they notice it is gone. */}
      <LostModeLink publicToken={view.publicToken} />

      {/* THE ALERT STRIP ------------------------------------------------- */}
      {/* Already ranked by the server. A client that reorders this has
          reimplemented a product decision it cannot see the reasons for. */}
      <Section view={view.alerts} title="Avisos">
        {(alerts) =>
          alerts.items.length === 0 ? (
            <Body>No hay avisos.</Body>
          ) : (
            <View style={styles.stack}>
              {alerts.items.map((alert) => (
                <Callout key={alert.id} tone={alertTone(alert)}>
                  <Text style={styles.calloutBody}>{alertHeadline(alert)}</Text>
                </Callout>
              ))}
            </View>
          )
        }
      </Section>

      {/* THE COMPLIANCE STAMP -------------------------------------------- */}
      <Section view={view.compliance} title="Cumplimiento">
        {(compliance) => (
          <>
            <Text style={styles.stamp}>{complianceStampLabel(compliance)}</Text>
            <Body>{complianceSummaryLabel(compliance)}</Body>
            {compliance.cards.map((card) => (
              <Row key={card.key} label={card.label} value={card.state} />
            ))}
          </>
        )}
      </Section>

      {/* REMINDERS -------------------------------------------------------- */}
      <Section view={view.reminders} title="Recordatorios">
        {(reminders) =>
          reminders.items.length === 0 ? (
            <Body>{REMINDERS_EMPTY_LABEL}</Body>
          ) : (
            <>
              {reminders.items.map((reminder) => (
                <Row
                  key={reminder.reminderId}
                  label={reminder.title}
                  value={reminderDueLabel(reminder.daysUntilDue)}
                />
              ))}
              {/* A list that shows some of what exists must SAY so. */}
              {truncationNote(reminders.items.length, reminders.total, "recordatorios") ? (
                <Body>
                  {truncationNote(reminders.items.length, reminders.total, "recordatorios")}
                </Body>
              ) : null}
            </>
          )
        }
      </Section>

      {/* THE BANNERS ------------------------------------------------------ */}
      <Section view={view.banners} title="Arreglos">
        {(banners) => {
          const caretakerLines = caretakerBannerLines(banners);
          const rehome = rehomeBannerLine(banners);
          const transit = transitBannerLine(banners);
          if (caretakerLines.length === 0 && !rehome && !transit) {
            // A caretaker or a foster genuinely has no arrangements to see —
            // they are the titular's to make. Say which of the two this is
            // instead of leaving an unexplained gap that reads as a bug.
            return (
              <Body>
                {view.isTitular
                  ? "No hay arreglos activos."
                  : "Solo el titular ve los arreglos de esta mascota."}
              </Body>
            );
          }
          return (
            <>
              {transit ? <Body>{transit}</Body> : null}
              {caretakerLines.map((line) => (
                <Body key={line}>{line}</Body>
              ))}
              {rehome ? <Body>{rehome}</Body> : null}
            </>
          );
        }}
      </Section>

      {/* OPEN CASES ------------------------------------------------------- */}
      <Section view={view.cases} title="Trámites">
        {(cases) => <Body>{casesLine(cases)}</Body>}
      </Section>

      {/* PREGNANCY -------------------------------------------------------- */}
      <Section view={view.pregnancy} title="Preñez">
        {(pregnancy) =>
          pregnancy === null ? (
            <Body>No está preñada.</Body>
          ) : (
            <>
              <Row label="Comenzó" value={formatIsoDate(pregnancy.startedAt)} />
              <Row label="Parto estimado" value={formatIsoDate(pregnancy.expectedBirthAt)} />
              {pregnancy.weeksAtDiagnosis !== null ? (
                <Row label="Semanas al diagnóstico" value={String(pregnancy.weeksAtDiagnosis)} />
              ) : null}
            </>
          )
        }
      </Section>

      {/* THE CAROUSEL ----------------------------------------------------- */}
      {/* The server excludes THIS animal from both `items` and `total` — the
          section is the owner's OTHER pets and the contract says so. This screen
          used to filter it out for RENDERING and then branch and count on the
          unfiltered array, which produced the two states this file's own header
          forbids: a one-pet owner got a card containing literally nothing (the
          empty view that says "you have others" while showing none), and a
          nine-pet owner read "Mostrando 8 de 9" above seven rows. One list,
          filtered once, on the side that knows which animal is being read. */}
      <Section view={view.carousel} title="Tus otras mascotas">
        {(carousel) =>
          carousel.items.length === 0 ? (
            <Body>No tenés otras mascotas registradas.</Body>
          ) : (
            <>
              {carousel.items.map((item) => (
                <Row key={item.publicToken} label={item.name || item.publicToken} value="" />
              ))}
              {truncationNote(carousel.items.length, carousel.total, "mascotas") ? (
                <Body>{truncationNote(carousel.items.length, carousel.total, "mascotas")}</Body>
              ) : null}
            </>
          )
        }
      </Section>
    </>
  );
}

/**
 * An ISO instant as a plain Argentine date.
 *
 * `Intl` with an explicit time zone is what keeps this off the DEVICE's zone —
 * a phone travelling with its owner must not renumber an animal's dates.
 */
function formatIsoDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(date);
}

const styles = StyleSheet.create({
  masthead: { gap: SPACE.xs },
  viewerLine: {
    fontFamily: FONTS.sansMedium,
    fontSize: TYPE.md,
    lineHeight: TYPE.md * LEADING.md,
    color: COLORS.inkSoft,
  },
  petName: {
    fontFamily: FONTS.serif,
    fontSize: TYPE.xl2,
    lineHeight: TYPE.xl2 * LEADING.xl2,
    color: COLORS.ink,
  },
  stack: { gap: SPACE.sm },
  calloutBody: {
    fontFamily: FONTS.sans,
    fontSize: TYPE.md,
    lineHeight: TYPE.md * LEADING.md,
    color: COLORS.ink,
  },
  stamp: {
    fontFamily: FONTS.monoSemibold,
    fontSize: TYPE.lg,
    letterSpacing: TYPE.lg * TRACKING.wide,
    color: COLORS.ink,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.xs },
  chip: {
    fontFamily: FONTS.mono,
    fontSize: TYPE.sm,
    color: COLORS.inkSoft,
    backgroundColor: COLORS.canvas2,
    borderColor: COLORS.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.chip,
    paddingHorizontal: SPACE.sm,
    paddingVertical: SPACE.xs,
  },
});
