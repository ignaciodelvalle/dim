// BUSCAR UN TURNO — the service picker, and one service's results.
//
// ONE SCREEN FOR TWO STATES, which is what the endpoint answers and what the web
// does on one URL. With no service chosen it draws the catalogue; with one, the
// offerings near the person that still have a place. Splitting them into two
// native routes would have added a screen, a back step and a second fetch to
// render a twelve-row constant.
//
// THE CATALOGUE IS THE SERVER'S. Twelve labels hard-coded here would print a
// stale one the day a kind is added, and a raw `snake_case` code is the exact
// defect QA 2026-08-08 (S3-F07) found on the web's version of this page.
//
// WHY THE JURISDICTION LINE EXISTS AND THE WEB HAS NOTHING LIKE IT
// ---------------------------------------------------------------------------
// The server prefills the search from the person's first registered animal when
// they named no place. The browser draws those values into its own filter form,
// where they read as something the person typed — so somebody whose pet is
// registered in another province concludes their barrio has no campaigns when
// they never chose their barrio. `jurisdictionSource` is on the wire so this
// screen can say which of the two happened.
//
// THIS SCREEN CANNOT FILTER BY LOCALITY YET, and it says so rather than drawing a
// control that does nothing. The web's filter form is a locality typeahead over
// `/api/v1/localities`; wiring it here is a further slice, and what stands in for
// it is the honest note plus the search the server already defaulted to. An empty
// result never reads as "there is nothing" — it names the place it looked in.

import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { AppointmentSearchV1, BookableOfferingV1 } from "@dim/contract/api";

import type { ApiResult } from "../api/client";
import { apiErrorMessage } from "../api/error-copy";
import { sessionPort } from "../auth/session-store";
import { Body, EmptyState, Loading } from "../ui/components";
import { FONTS } from "../ui/fonts";
import { Callout, Eyebrow, Screen, SecondaryButton, Title } from "../ui/kit";
import { COLORS, LEADING, RADIUS, SPACE, TOUCH_TARGET, TRACKING, TYPE } from "../ui/theme";

import { fetchAppointmentSearch } from "../api/endpoints";
import {
  jurisdictionNoteLabel,
  noResultsLabel,
  offeringAvailabilityLabel,
  offeringKindLabel,
  offeringMetaLabel,
  offeringTitle,
} from "./buscar-view-model";
import { appointmentProviderLabel } from "./turnos-view-model";

/** One sentence per failure arm. No arm falls through to a generic shrug. */
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
      return "No pudimos buscar turnos.";
  }
}

type ScreenState =
  | { phase: "loading" }
  | { phase: "ready"; view: AppointmentSearchV1 }
  | { phase: "failed"; message: string };

export function BuscarTurnoScreen({
  onOpenOffering,
}: {
  onOpenOffering: (offeringToken: string) => void;
}) {
  const [serviceKind, setServiceKind] = useState<string | null>(null);
  const [state, setState] = useState<ScreenState>({ phase: "loading" });

  const load = useCallback(async (kind: string | null) => {
    setState({ phase: "loading" });
    const result = await fetchAppointmentSearch(sessionPort, { serviceKind: kind });
    if (result.outcome === "ok") {
      setState({ phase: "ready", view: result.payload });
      return;
    }
    setState({ phase: "failed", message: failureMessage(result) });
  }, []);

  useEffect(() => {
    void load(serviceKind);
  }, [load, serviceKind]);

  if (state.phase === "loading") {
    return <Loading label={serviceKind ? "Buscando turnos…" : "Cargando servicios…"} />;
  }

  if (state.phase === "failed") {
    return (
      <Screen>
        <Title>Buscar turno</Title>
        {/* NOT an empty catalogue. A read that failed and a service with no
            campaigns are different facts, and the first rendered as the second
            sends somebody away from a vaccination drive that is running. */}
        <Callout tone="err">
          <Body>{state.message}</Body>
        </Callout>
        <SecondaryButton label="Reintentar" onPress={() => void load(serviceKind)} />
      </Screen>
    );
  }

  const view = state.view;

  // THE PICKER. `view.serviceKind` is the SERVER's answer and not this screen's
  // `serviceKind` state — an unrecognised code comes back `null`, which is how a
  // stale or hand-made value falls through to the catalogue instead of becoming a
  // heading.
  if (view.serviceKind === null) {
    return (
      <Screen>
        <Title>Buscar turno</Title>
        <Body>Indicá qué servicio buscás.</Body>
        <View style={styles.section}>
          {view.serviceKinds.map((kind) => (
            <Pressable
              key={kind.code}
              accessibilityRole="button"
              accessibilityLabel={kind.label}
              onPress={() => setServiceKind(kind.code)}
              style={styles.row}
            >
              <Text style={styles.rowTitle}>{kind.label}</Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
        </View>
      </Screen>
    );
  }

  const note = jurisdictionNoteLabel(view);
  const heading =
    view.serviceKinds.find((k) => k.code === view.serviceKind)?.label ?? "Buscar turno";

  return (
    <Screen>
      <Title>{heading}</Title>
      {note === null ? null : <Body>{note}</Body>}

      <View style={styles.section}>
        <Eyebrow>Resultados</Eyebrow>
        {view.results.length === 0 ? (
          <EmptyState
            headline={noResultsLabel(view)}
            body="Probá con otro servicio, o buscá desde mimar.com.ar para elegir otra localidad."
          />
        ) : (
          view.results.map((offering) => (
            <OfferingRow
              key={offering.offeringToken}
              offering={offering}
              windowDays={view.windowDays}
              onOpen={onOpenOffering}
            />
          ))
        )}
      </View>

      <SecondaryButton label="Elegir otro servicio" onPress={() => setServiceKind(null)} />
    </Screen>
  );
}

/**
 * One offering, as a row.
 *
 * The whole row is the target rather than a "Ver" link at its end, which is the
 * rule `TurnosScreen` already follows: on a phone the touch target should be the
 * thing you are looking at. The accessibility label composes the four facts into
 * one sentence instead of reading four fragments.
 */
function OfferingRow({
  offering,
  windowDays,
  onOpen,
}: {
  offering: BookableOfferingV1;
  windowDays: number;
  onOpen: (offeringToken: string) => void;
}) {
  const title = offeringTitle(offering);
  const provider = appointmentProviderLabel(offering.provider);
  const meta = offeringMetaLabel(offering);
  const availability = offeringAvailabilityLabel(offering, windowDays);
  const kind = offeringKindLabel(offering);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, provider, meta, availability].join(". ")}
      onPress={() => onOpen(offering.offeringToken)}
      style={styles.row}
    >
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowMeta}>{provider}</Text>
        <Text style={styles.rowMeta}>{meta}</Text>
        {/* DRAWN ONLY WHEN THE CATALOGUE KNOWS THE CODE. A raw `snake_case` code
            under the provider's own name is the S3-F07 shape one line down. */}
        {kind === null ? null : <Text style={styles.rowMeta}>{kind}</Text>}
        <Text style={styles.rowAvailability}>{availability}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { gap: SPACE.sm, marginTop: SPACE.lg },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACE.sm,
    minHeight: TOUCH_TARGET,
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  rowMain: { flex: 1, gap: SPACE.xs / 2 },
  rowTitle: {
    fontFamily: FONTS.serif,
    fontSize: TYPE.lg,
    lineHeight: TYPE.lg * LEADING.sm,
    color: COLORS.ink,
  },
  rowMeta: {
    fontFamily: FONTS.sans,
    fontSize: TYPE.sm,
    lineHeight: TYPE.sm * LEADING.md,
    color: COLORS.inkMuted,
  },
  rowAvailability: {
    fontFamily: FONTS.monoSemibold,
    fontSize: TYPE.xs,
    letterSpacing: TYPE.xs * TRACKING.wider,
    textTransform: "uppercase",
    color: COLORS.ink,
  },
  chevron: {
    fontFamily: FONTS.sans,
    fontSize: TYPE.lg,
    color: COLORS.inkMuted,
    flexShrink: 0,
  },
});
