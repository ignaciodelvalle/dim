// The M1 spike screen: one credential, read once, rendered honestly.
//
// WHAT THIS SCREEN IS FOR. Not to look like the product — to prove that the
// `/api/v1` contract survives the trip to a phone. Three things are being
// tested, and each one is a place a native client could quietly go wrong:
//
//   1. `@dim/contract/api` resolves and type-checks through Metro, so the types
//      the route handler emits are the types the phone parses.
//   2. A section the server could not read renders as "no disponible" — NOT as
//      an empty view, and NOT as "nothing to report". The whole per-section
//      contract exists for this and a phone is where it gets ignored.
//   3. The QR encodes the public web URL and is drawn on-device from a string.
//
// ONE FETCH ON MOUNT, ONE PER TAP. There is no polling timer, no focus-refetch,
// no retry loop. The endpoint carries a per-IP surface limit of 60/min shared
// with the web page that anonymous finders load in the street; a client that
// re-reads on a timer spends that budget on a screen nobody is looking at.
// `useEffect` with an empty dep array plus an explicit "Actualizar" button is
// the entire refresh policy, and it is deliberate.

import type {
  CredentialIdentitySection,
  CredentialLostSection,
  CredentialNoticesSection,
  CredentialStatusSection,
  CredentialVaccinationSection,
} from "@dim/contract/api";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SPIKE_PUBLIC_TOKEN, publicCredentialPageUrl } from "../config/api";
import { CredentialQr } from "./CredentialQr";
import { type CredentialFetchResult, fetchCredential, fetchFailureMessage } from "./credential-api";
import {
  type LostView,
  STALE_NOTICE,
  type SectionView,
  buildCredentialView,
  noticeLines,
  petStatusLabel,
  rabiesProvenanceLabel,
  rabiesVigenciaLabel,
  situationLabel,
} from "./credential-view-model";

type ScreenState =
  | { phase: "loading" }
  | { phase: "loaded"; result: CredentialFetchResult; readAt: Date };

/** A titled block. Every section on this screen is one, including the failures. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

/**
 * The unavailable arm, rendered as a VISIBLE statement.
 *
 * This component is the point of the screen. The alternative — returning
 * `null` for a section the server could not read — is what turns a failed read
 * into "this animal has no alerts", and the contract calls that out by name.
 */
function Unavailable({ message }: { message: string }) {
  return (
    <View style={styles.unavailable}>
      <Text style={styles.unavailableTitle}>No disponible</Text>
      <Text style={styles.unavailableBody}>{message}</Text>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export function CredentialScreen() {
  const [state, setState] = useState<ScreenState>({ phase: "loading" });

  const load = useCallback(() => {
    setState({ phase: "loading" });
    fetchCredential(SPIKE_PUBLIC_TOKEN).then((result) => {
      setState({ phase: "loaded", result, readAt: new Date() });
    });
  }, []);

  // Empty deps: exactly one read per mount. See the header. `load` is stable
  // (useCallback over no dependencies), so listing it here would only invite a
  // future edit to make it unstable and turn this into a fetch loop against a
  // rate-limited endpoint.
  useEffect(load, []);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.eyebrow}>Credencial pública</Text>
        <Text style={styles.token}>{SPIKE_PUBLIC_TOKEN}</Text>

        {state.phase === "loading" ? (
          <View style={styles.loading}>
            <ActivityIndicator />
            <Text style={styles.loadingText}>Leyendo la credencial…</Text>
          </View>
        ) : (
          <Body state={state} />
        )}

        <Pressable
          style={styles.refresh}
          onPress={load}
          disabled={state.phase === "loading"}
          accessibilityRole="button"
        >
          <Text style={styles.refreshText}>Actualizar</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Body({ state }: { state: Extract<ScreenState, { phase: "loaded" }> }) {
  const { result, readAt } = state;

  // The degraded envelope (503) is NOT an error screen. It carries the animal's
  // name and the lost-report CTAs precisely so a finder is not left with
  // nothing; collapsing it into "algo salió mal" would throw that away.
  if (result.outcome === "degraded") {
    const identity = result.payload.identity;
    return (
      <>
        <Text style={styles.name}>
          {identity.status === "ok" ? identity.data.name : "Credencial"}
        </Text>
        <Section title="Lectura degradada">
          <Text style={styles.body}>
            El servidor respondió con una lectura parcial. Lo que ves puede estar incompleto.
          </Text>
          {identity.status === "ok" && identity.data.isLost ? (
            <Text style={styles.alert}>Esta mascota está reportada como perdida.</Text>
          ) : null}
        </Section>
        <QrBlock />
      </>
    );
  }

  if (result.outcome !== "ok") {
    return (
      <Section title="No se pudo leer">
        <Text style={styles.body}>{fetchFailureMessage(result)}</Text>
      </Section>
    );
  }

  const view = buildCredentialView(result.payload, readAt);

  return (
    <>
      <Text style={styles.name}>{view.petName ?? "Credencial"}</Text>

      <Text style={styles.freshness}>{view.freshness.label}</Text>
      {view.freshness.state === "stale" ? <Text style={styles.alert}>{STALE_NOTICE}</Text> : null}

      <QrBlock />

      {/* `view.tier2` is mapped but deliberately NOT rendered in the spike.
          Its only v1 content is `medical: "not_included"` — the contract's
          honest answer to "why is there no medical data here" — so a Tier-2
          card today could say nothing a user could act on. It stays in the view
          model because the section's `unavailable` state must keep travelling
          with the others; the day the medical read exists, the card is the only
          thing missing. This is a deliberate omission, not a dropped section. */}
      <IdentitySection section={view.identity} />
      <StatusSection section={view.status} />
      <VaccinationSection section={view.vaccination} />
      <NoticesSection section={view.notices} />
      <LostSection lost={view.lost} />
    </>
  );
}

// One component per section, rather than one long conditional tree inside
// `Body`. The split is not only for readability: every section's `unavailable`
// arm is now the FIRST branch of its own function, which is much harder to drop
// during a later edit than a ternary nested three levels into someone else's
// JSX.

function IdentitySection({ section }: { section: SectionView<CredentialIdentitySection> }) {
  return (
    <Section title="Identidad">
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
    </Section>
  );
}

function StatusSection({ section }: { section: SectionView<CredentialStatusSection> }) {
  return (
    <Section title="Estado">
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
    </Section>
  );
}

function VaccinationSection({ section }: { section: SectionView<CredentialVaccinationSection> }) {
  return (
    <Section title="Vacunación">
      {section.state === "unavailable" ? (
        <Unavailable message={section.message} />
      ) : (
        <>
          <Row label="Antirrábica" value={rabiesVigenciaLabel(section.data.rabies.vigencia)} />
          {/* The provenance qualifier is never dropped — an unqualified
              "Vigente" on an owner-typed dose claims a verification this
              registry never performed. */}
          <Row label="Origen" value={rabiesProvenanceLabel(section.data.rabies.provenance)} />
          {section.data.hasRecords ? null : (
            <Text style={styles.body}>Sin registros de vacunación.</Text>
          )}
        </>
      )}
    </Section>
  );
}

function NoticesSection({ section }: { section: SectionView<CredentialNoticesSection> }) {
  return (
    <Section title="Avisos">
      {section.state === "unavailable" ? (
        <Unavailable message={section.message} />
      ) : (
        <NoticeList notices={noticeLines(section.data)} />
      )}
    </Section>
  );
}

/**
 * The three-state section, rendered with an EXHAUSTIVE switch.
 *
 * Every other section here is a binary ternary, which TypeScript makes
 * exhaustive for free. This one is not, and three independent ternaries would
 * not be either: a fourth variant added to `LostView` would compile unchanged
 * and render an empty "Búsqueda" card — no text, no error, nothing. That is
 * precisely the blank-instead-of-an-honest-failure bug this whole file exists
 * to prevent, arriving through the one section with enough states to hide it.
 *
 * The `never` assignment in the default arm is the guard: it turns that future
 * edit into a compile error instead of a silent blank on a public credential.
 */
function LostSection({ lost }: { lost: LostView }) {
  return <Section title="Búsqueda">{lostBody(lost)}</Section>;
}

function lostBody(lost: LostView) {
  switch (lost.state) {
    case "unavailable":
      return <Unavailable message={lost.message} />;
    case "not-lost":
      return <Text style={styles.body}>No está reportada como perdida.</Text>;
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
      <Text style={styles.alert}>Reportada como perdida.</Text>
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
  if (notices.length === 0) {
    return <Text style={styles.body}>Sin avisos.</Text>;
  }
  return (
    <>
      {notices.map((line) => (
        <Text key={line} style={styles.alert}>
          {line}
        </Text>
      ))}
    </>
  );
}

function QrBlock() {
  return (
    <View style={styles.qrCard}>
      <CredentialQr
        value={publicCredentialPageUrl(SPIKE_PUBLIC_TOKEN)}
        size={180}
        label={`Código QR de la credencial ${SPIKE_PUBLIC_TOKEN}`}
      />
      <Text style={styles.qrCaption}>{publicCredentialPageUrl(SPIKE_PUBLIC_TOKEN)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f7f7f5" },
  scroll: { padding: 20, gap: 12 },
  eyebrow: { fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: "#6b7280" },
  token: { fontSize: 14, color: "#374151", fontVariant: ["tabular-nums"] },
  name: { fontSize: 30, fontWeight: "700", color: "#111827" },
  freshness: { fontSize: 13, color: "#6b7280" },
  loading: { paddingVertical: 40, alignItems: "center", gap: 10 },
  loadingText: { color: "#6b7280" },
  section: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  sectionTitle: { fontSize: 12, fontWeight: "700", color: "#6b7280", textTransform: "uppercase" },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  rowLabel: { color: "#6b7280", fontSize: 14 },
  rowValue: { color: "#111827", fontSize: 14, flexShrink: 1, textAlign: "right" },
  body: { color: "#374151", fontSize: 14 },
  alert: { color: "#b91c1c", fontSize: 14, fontWeight: "600" },
  unavailable: {
    backgroundColor: "#fef3c7",
    borderRadius: 8,
    padding: 12,
    gap: 4,
  },
  unavailableTitle: { fontWeight: "700", color: "#92400e", fontSize: 14 },
  unavailableBody: { color: "#92400e", fontSize: 13 },
  qrCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  qrCaption: { fontSize: 11, color: "#6b7280" },
  refresh: {
    marginTop: 8,
    backgroundColor: "#111827",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  refreshText: { color: "#ffffff", fontWeight: "600", fontSize: 15 },
});
