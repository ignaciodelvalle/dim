// One pet's credential, read honestly — and readable with no signal.
//
// WHAT THIS SCREEN IS FOR. Three things, each a place a native client could
// quietly go wrong:
//
//   1. A section the server could not read renders as "No disponible" — NOT as
//      an empty view, and NOT as "nothing to report". The whole per-section
//      contract exists for this and a phone is where it gets ignored.
//   2. The QR encodes the public web URL and is drawn on-device from a string.
//   3. When the network fails, the last good copy is shown WITH ITS AGE and with
//      the fact that it is a copy. Never one without the other.
//
// ONE FETCH ON MOUNT, ONE PER TAP. No polling timer, no focus-refetch, no retry
// loop. The endpoint carries a per-IP surface limit shared with the web page
// that anonymous finders load in the street; a client that re-reads on a timer
// spends that budget on a screen nobody is looking at.
//
// THE CACHE IS DISPLAY-ONLY AND IS NEVER SILENT. `credential-cache.ts` explains
// why AsyncStorage is the right home for it (this is the animal's PUBLIC
// document, on its owner's own device) and why it is wiped on sign-out. What
// belongs here is the rendering rule: a cached credential ALWAYS carries
// `cachedCredentialNotice`, because a "Vigente" rabies line from three months
// ago, drawn with no banner, is a claim about today that nobody made.

import type {
  CredentialIdentitySection,
  CredentialLostSection,
  CredentialNoticesSection,
  CredentialStatusSection,
  CredentialVaccinationSection,
  PublicCredentialV1,
} from "@dim/contract/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { publicCredentialPageUrl } from "../config/api";
import { Alert, Body, Card, Loading, Row, Unavailable } from "../ui/components";
import { FONTS } from "../ui/fonts";
import { Eyebrow, PrimaryButton, Screen, Title } from "../ui/kit";
import { COLORS, LEADING, RADIUS, SPACE, TRACKING, TYPE } from "../ui/theme";
import { CredentialQr } from "./CredentialQr";
import { type CredentialFetchResult, fetchCredential, fetchFailureMessage } from "./credential-api";
import { readCachedCredential, writeCachedCredential } from "./credential-cache";
import {
  type LostView,
  STALE_NOTICE,
  type SectionView,
  buildCredentialView,
  cachedCredentialNotice,
  noticeLines,
  petStatusLabel,
  rabiesProvenanceLabel,
  rabiesVigenciaLabel,
  situationLabel,
} from "./credential-view-model";

type ScreenState =
  | { phase: "loading" }
  /** What the server just said, whatever that was. */
  | { phase: "live"; result: CredentialFetchResult; readAt: Date }
  /** The server did not answer; this is the copy on disk, and it says so. */
  | { phase: "cached"; payload: PublicCredentialV1; readAt: Date; failure: string };

export function CredentialScreen({ publicToken }: { publicToken: string }) {
  const [state, setState] = useState<ScreenState>({ phase: "loading" });
  const generation = useRef(0);

  const load = useCallback(async () => {
    const mine = ++generation.current;
    setState({ phase: "loading" });

    const result = await fetchCredential(publicToken);
    if (mine !== generation.current) return;

    if (result.outcome === "ok") {
      // Only a COMPLETE credential is cached. The degraded envelope is a partial
      // read by definition; storing it would mean a later offline open shows an
      // animal with half its sections permanently "no disponible" and no way to
      // tell that from a real refusal.
      void writeCachedCredential(publicToken, result.payload);
      setState({ phase: "live", result, readAt: new Date() });
      return;
    }

    if (result.outcome === "degraded") {
      setState({ phase: "live", result, readAt: new Date() });
      return;
    }

    const cached = await readCachedCredential(publicToken);
    if (mine !== generation.current) return;
    if (cached !== null) {
      setState({
        phase: "cached",
        payload: cached,
        readAt: new Date(),
        failure: fetchFailureMessage(result) ?? "No pudimos conectarnos.",
      });
      return;
    }
    setState({ phase: "live", result, readAt: new Date() });
  }, [publicToken]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Screen>
      <View style={styles.masthead}>
        <Eyebrow>Credencial pública</Eyebrow>
        <Text style={styles.token}>{publicToken}</Text>
      </View>

      {state.phase === "loading" ? (
        <Loading label="Leyendo la credencial…" />
      ) : (
        <ScreenBody state={state} publicToken={publicToken} />
      )}

      <PrimaryButton
        label="Actualizar"
        onPress={() => void load()}
        disabled={state.phase === "loading"}
      />
    </Screen>
  );
}

function ScreenBody({ state, publicToken }: { state: ScreenState; publicToken: string }) {
  if (state.phase === "loading") return null;

  if (state.phase === "cached") {
    const notice = cachedCredentialNotice(
      buildCredentialView(state.payload, state.readAt).freshness,
    );
    return (
      <>
        {/* THE BANNER COMES FIRST and is not collapsible. Everything below it is
            a statement about the past. */}
        <View style={styles.offline}>
          <Text style={styles.offlineTitle}>{notice.headline}</Text>
          <Text style={styles.offlineBody}>{state.failure}</Text>
          {notice.warning === null ? null : (
            <Text style={styles.offlineWarning}>{notice.warning}</Text>
          )}
        </View>
        <CredentialBody payload={state.payload} readAt={state.readAt} publicToken={publicToken} />
      </>
    );
  }

  const { result, readAt } = state;

  // The degraded envelope (503) is NOT an error screen. It carries the animal's
  // name and the lost-report CTAs precisely so a finder is not left with
  // nothing; collapsing it into "algo salió mal" would throw that away.
  if (result.outcome === "degraded") {
    const identity = result.payload.identity;
    return (
      <>
        <Title>{identity.status === "ok" ? identity.data.name : "Credencial"}</Title>
        <Card title="Lectura degradada">
          <Body>
            El servidor respondió con una lectura parcial. Lo que ves puede estar incompleto.
          </Body>
          {identity.status === "ok" && identity.data.isLost ? (
            <Alert>Esta mascota está reportada como perdida.</Alert>
          ) : null}
        </Card>
        <QrBlock publicToken={publicToken} />
      </>
    );
  }

  if (result.outcome !== "ok") {
    return (
      <Card title="No se pudo leer">
        <Body>{fetchFailureMessage(result)}</Body>
      </Card>
    );
  }

  return <CredentialBody payload={result.payload} readAt={readAt} publicToken={publicToken} />;
}

function CredentialBody({
  payload,
  readAt,
  publicToken,
}: {
  payload: PublicCredentialV1;
  readAt: Date;
  publicToken: string;
}) {
  const view = buildCredentialView(payload, readAt);

  return (
    <>
      <Title>{view.petName ?? "Credencial"}</Title>

      <Text style={styles.freshness}>{view.freshness.label}</Text>
      {view.freshness.state === "stale" ? <Alert>{STALE_NOTICE}</Alert> : null}

      <QrBlock publicToken={publicToken} />

      {/* `view.tier2` is mapped but deliberately NOT rendered. Its only v1
          content is `medical: "not_included"` — the contract's honest answer to
          "why is there no medical data here" — so a Tier-2 card today could say
          nothing a user could act on. It stays in the view model because the
          section's `unavailable` state must keep travelling with the others; the
          day the medical read exists, the card is the only thing missing. This
          is a deliberate omission, not a dropped section. */}
      <IdentitySection section={view.identity} />
      <StatusSection section={view.status} />
      <VaccinationSection section={view.vaccination} />
      <NoticesSection section={view.notices} />
      <LostSection lost={view.lost} />
    </>
  );
}

// One component per section, rather than one long conditional tree. The split is
// not only for readability: every section's `unavailable` arm is now the FIRST
// branch of its own function, which is much harder to drop during a later edit
// than a ternary nested three levels into someone else's JSX.

function IdentitySection({ section }: { section: SectionView<CredentialIdentitySection> }) {
  return (
    <Card title="Identidad">
      {section.state === "unavailable" ? (
        <Unavailable message={section.message} />
      ) : (
        <>
          <Row label="Especie" value={section.data.species} />
          <Row label="Raza" value={section.data.breed ?? "Sin registrar"} />
          <Row
            label="Edad"
            value={
              section.data.ageYears === null ? "Sin registrar" : `${section.data.ageYears} años`
            }
          />
          <Row label="Libreta" value={section.data.libretaCode} />
          <Row label="Microchip" value={section.data.hasMicrochip ? "Sí" : "No"} />
        </>
      )}
    </Card>
  );
}

function StatusSection({ section }: { section: SectionView<CredentialStatusSection> }) {
  return (
    <Card title="Estado">
      {section.state === "unavailable" ? (
        <Unavailable message={section.message} />
      ) : (
        <>
          <Row label="Estado" value={petStatusLabel(section.data.status)} />
          {section.data.situation ? (
            <Row label="Situación" value={situationLabel(section.data.situation)} />
          ) : null}
        </>
      )}
    </Card>
  );
}

function VaccinationSection({ section }: { section: SectionView<CredentialVaccinationSection> }) {
  return (
    <Card title="Vacunación">
      {section.state === "unavailable" ? (
        <Unavailable message={section.message} />
      ) : (
        <>
          <Row label="Antirrábica" value={rabiesVigenciaLabel(section.data.rabies.vigencia)} />
          {/* The provenance qualifier is never dropped — an unqualified
              "Vigente" on an owner-typed dose claims a verification this
              registry never performed. */}
          <Row label="Origen" value={rabiesProvenanceLabel(section.data.rabies.provenance)} />
          {section.data.hasRecords ? null : <Body>Sin registros de vacunación.</Body>}
        </>
      )}
    </Card>
  );
}

function NoticesSection({ section }: { section: SectionView<CredentialNoticesSection> }) {
  return (
    <Card title="Avisos">
      {section.state === "unavailable" ? (
        <Unavailable message={section.message} />
      ) : (
        <NoticeList notices={noticeLines(section.data)} />
      )}
    </Card>
  );
}

/**
 * The three-state section, rendered with an EXHAUSTIVE switch.
 *
 * Every other section here is a binary ternary, which TypeScript makes
 * exhaustive for free. This one is not, and three independent ternaries would
 * not be either: a fourth variant added to `LostView` would compile unchanged
 * and render an empty "Búsqueda" card — no text, no error, nothing. That is
 * precisely the blank-instead-of-an-honest-failure bug this whole file exists to
 * prevent, arriving through the one section with enough states to hide it.
 */
function LostSection({ lost }: { lost: LostView }) {
  return <Card title="Búsqueda">{lostBody(lost)}</Card>;
}

function lostBody(lost: LostView) {
  switch (lost.state) {
    case "unavailable":
      return <Unavailable message={lost.message} />;
    case "not-lost":
      return <Body>No está reportada como perdida.</Body>;
    case "lost":
      return <LostDetail data={lost.data} />;
    default: {
      const unhandled: never = lost;
      throw new Error(`Unhandled lost state: ${JSON.stringify(unhandled)}`);
    }
  }
}

function LostDetail({ data }: { data: CredentialLostSection }) {
  return (
    <>
      <Alert>Reportada como perdida.</Alert>
      {data.owner.firstName ? <Row label="Contacto" value={data.owner.firstName} /> : null}
      {data.owner.phoneE164 ? <Row label="Teléfono" value={data.owner.phoneE164} /> : null}
      {data.lastSeen?.locality ? <Row label="Visto en" value={data.lastSeen.locality} /> : null}
    </>
  );
}

/**
 * `[]` here means "loaded, and nothing raised" — which this renders as a
 * sentence rather than as nothing at all. The empty view is reserved for the
 * unavailable arm, and the two must never look alike.
 */
function NoticeList({ notices }: { notices: string[] }) {
  if (notices.length === 0) return <Body>Sin avisos.</Body>;
  return (
    <>
      {notices.map((line) => (
        <Alert key={line}>{line}</Alert>
      ))}
    </>
  );
}

function QrBlock({ publicToken }: { publicToken: string }) {
  const url = publicCredentialPageUrl(publicToken);
  return (
    <View style={styles.qrCard}>
      <CredentialQr value={url} size={180} label={`Código QR de la credencial ${publicToken}`} />
      <Text style={styles.qrCaption}>{url}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  masthead: { gap: SPACE.xs },
  // The token is a machine string and reads as one: mono, letterspaced, with
  // tabular figures so `DIM-PAMP-0001` does not shimmer between two pets.
  token: {
    fontFamily: FONTS.mono,
    fontSize: TYPE.md,
    letterSpacing: TYPE.md * TRACKING.wide,
    color: COLORS.inkSoft,
    fontVariant: ["tabular-nums"],
  },
  freshness: { fontFamily: FONTS.sans, fontSize: TYPE.sm, color: COLORS.inkMuted },
  offline: {
    backgroundColor: COLORS.warnSurface,
    borderWidth: 1,
    borderColor: COLORS.warnBorder,
    borderRadius: RADIUS.control,
    padding: SPACE.lg,
    gap: SPACE.xs,
  },
  offlineTitle: { fontFamily: FONTS.sansSemibold, color: COLORS.warnInk, fontSize: TYPE.md },
  offlineBody: {
    fontFamily: FONTS.sans,
    color: COLORS.warnInk,
    fontSize: TYPE.md,
    lineHeight: TYPE.md * LEADING.md,
  },
  offlineWarning: { fontFamily: FONTS.sansSemibold, color: COLORS.danger, fontSize: TYPE.md },
  qrCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.control,
    padding: SPACE.lg,
    alignItems: "center",
    gap: SPACE.sm + 2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  qrCaption: {
    fontFamily: FONTS.mono,
    fontSize: TYPE.xs,
    color: COLORS.inkMuted,
    textAlign: "center",
  },
});
