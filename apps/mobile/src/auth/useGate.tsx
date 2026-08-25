// One gate, used by every screen that needs a session.
//
// It returns EITHER the signed-in user OR the element to render instead, and the
// caller's first line is always the same two lines. That shape is deliberate:
// the alternative — a hook that redirects as a side effect — runs after the
// render that would have drawn the protected content, so there is a frame in
// which a signed-out person sees somebody's pet list. Returning the redirect as
// a value removes the frame.
//
// The five non-allowed answers are not interchangeable and none of them is
// "send them to sign-in":
//
//   starting            → a splash. We do not know yet; asserting anything is a
//                         guess, and the guess flickers.
//   unconfigured        → this BUILD cannot sign anyone in. Saying "iniciá
//                         sesión" would send a person to a screen that cannot
//                         work, forever.
//   session-unverified  → tokens present, server unreachable. NOT signed out —
//                         signing them out would need the network they do not
//                         have.
//   signed-out          → sign-in, carrying the reason it ended.
//   profilePending      → the identity gate. They ARE signed in; what is missing
//                         is a registration step this app deliberately does not
//                         implement.

import type { MeV1User } from "@dim/contract/api";
import { Redirect } from "expo-router";
import type { ReactElement } from "react";
import { StyleSheet, View } from "react-native";

import { Body, Card, ErrorNotice, Loading } from "../ui/components";
import { Screen, SecondaryButton, Title } from "../ui/kit";
import { ROUTES } from "../ui/routes";
import { SPACE } from "../ui/theme";
import { bootstrapSession, signOut } from "./session-store";
import { useSession } from "./useSession";

export type Gate = { allowed: true; user: MeV1User } | { allowed: false; element: ReactElement };

export function useGate(options: { allowPendingIdentity?: boolean } = {}): Gate {
  const state = useSession();

  switch (state.phase) {
    case "starting":
      return { allowed: false, element: <Splash /> };

    case "unconfigured":
      return { allowed: false, element: <UnconfiguredScreen /> };

    case "session-unverified":
      return { allowed: false, element: <UnverifiedScreen message={state.message} /> };

    case "signed-out":
      return { allowed: false, element: <Redirect href={ROUTES.ingreso} /> };

    case "signed-in":
      if (state.user.profilePending && options.allowPendingIdentity !== true) {
        return { allowed: false, element: <Redirect href={ROUTES.identidadPendiente} /> };
      }
      return { allowed: true, user: state.user };
  }
}

function Splash() {
  return (
    <Screen edges={["top", "bottom"]}>
      <Loading label="Abriendo MiMAR…" />
    </Screen>
  );
}

/**
 * The build has no auth plane. See SUPABASE_URL in config/api.ts.
 *
 * This screen exists rather than a silent failure because the alternative is an
 * app that shows a sign-in form which cannot possibly work, and a person who
 * concludes their password is wrong.
 */
function UnconfiguredScreen() {
  return (
    <Screen edges={["top", "bottom"]}>
      <Title>Esta app no está configurada</Title>
      <Card>
        <Body>
          Esta compilación no tiene un servidor de sesiones configurado, así que no se puede iniciar
          sesión. No es un problema de tu conexión ni de tu cuenta.
        </Body>
        <Body>Avisale a quien te pasó la app: le falta EXPO_PUBLIC_SUPABASE_URL.</Body>
      </Card>
    </Screen>
  );
}

/** Tokens on the device, identity unconfirmed. The subway case. */
function UnverifiedScreen({ message }: { message: string }) {
  return (
    <Screen edges={["top", "bottom"]}>
      <Title>No pudimos verificar tu sesión</Title>
      <ErrorNotice message={message} onRetry={() => void bootstrapSession()} />
      <Card>
        <Body>
          Tu sesión sigue guardada en este teléfono. Cuando vuelvas a tener conexión, probá de
          nuevo.
        </Body>
      </Card>
      <View style={styles.footer}>
        <SecondaryButton label="Cerrar sesión" onPress={() => void signOut()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: { marginTop: SPACE.sm },
});
