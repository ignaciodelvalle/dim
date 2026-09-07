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
//   signed-out          → sign-in, carrying the reason it ended AND where they
//                         were going. See below.
//   profilePending      → the identity gate. They ARE signed in; what is missing
//                         is signup step 2 — and since 2026-09-05 that screen
//                         COLLECTS it (`POST /api/v1/me/identity`) rather than
//                         handing over a web URL, so the gate now leads
//                         somewhere the person can finish. `allowPendingIdentity`
//                         is what lets that one screen render in this state.
//
// THE SIGN-IN REDIRECT CARRIES A DESTINATION (WU-O), AND IT HAS TO NOW
// ---------------------------------------------------------------------------
// Until deep links resolved, every protected screen was reached by tapping
// through from the pet list, so a signed-out person sent to `ingreso` came back
// to a stack they could walk again in two taps. Losing the destination cost
// almost nothing.
//
// A deep link changes that completely. Somebody taps "Ver propuesta" in a
// notification, the app opens at `/transferencias/PTR-…`, the stored session has
// expired, and they land on sign-in — and after signing in they arrive at their
// pet list with no idea what the link was for. The proposal is still there and
// still expiring, and the only route back is the notification they already
// dismissed.
//
// So the gate hands `ingreso` a `next` parameter, and `ingreso` returns to it.
// WHAT IT PASSES IS `usePathname()` — the path the router already resolved —
// never a value from the link itself. That distinction is the security of it:
// the router will only produce a path it has a screen for, so `next` cannot be
// made to name an arbitrary destination by whoever composed the url. `ingreso`
// checks it again before using it.

import type { MeV1User } from "@dim/contract/api";
import { Redirect, usePathname, useRouter } from "expo-router";
import type { ReactElement } from "react";
import { StyleSheet, View } from "react-native";

import { Body, Card, ErrorNotice, Loading } from "../ui/components";
import { Screen, SecondaryButton, Title } from "../ui/kit";
import { ROUTES } from "../ui/routes";
import { SPACE } from "../ui/theme";
import { signedOutHref } from "./return-to";
import { bootstrapSession, signOut } from "./session-store";
import { useSession } from "./useSession";

export type Gate = { allowed: true; user: MeV1User } | { allowed: false; element: ReactElement };

export function useGate(options: { allowPendingIdentity?: boolean } = {}): Gate {
  const state = useSession();
  // Read UNCONDITIONALLY, above the switch: hooks may not run behind a branch,
  // and the value is only used in one arm.
  const pathname = usePathname();

  switch (state.phase) {
    case "starting":
      return { allowed: false, element: <Splash /> };

    case "unconfigured":
      return { allowed: false, element: <UnconfiguredScreen /> };

    case "session-unverified":
      return {
        allowed: false,
        element: <UnverifiedScreen message={state.message} pathname={pathname} />,
      };

    case "signed-out":
      // NO `next` ON THE SCREEN THE PERSON SIGNED OUT FROM (NAV-2), and `next`
      // everywhere else. The destination is for a session that was TAKEN
      // mid-task; carrying it out of a deliberate sign-out re-opens the screen
      // they just closed — which on Ajustes is the screen with the button. But
      // the reason is sticky for the whole signed-out session, so the rule is
      // scoped to WHERE it happened: a deep link tapped afterwards still
      // carries its destination. See `signedOutHref`.
      return {
        allowed: false,
        element: (
          <Redirect
            href={signedOutHref({ reason: state.reason, endedAt: state.endedAt, pathname })}
          />
        ),
      };

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
      <Loading label="Abriendo miMAR…" />
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
function UnverifiedScreen({ message, pathname }: { message: string; pathname: string }) {
  const router = useRouter();
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
        <SecondaryButton
          label="Cerrar sesión"
          onPress={() => {
            // AWAITED, then routed (NAV-2, the shape `ajustes.tsx` established):
            // `signOut` flips the store as its LAST act, so firing and
            // navigating in the same tick draws a frame of the wrong screen.
            // The gate is what redirects either way — this makes the
            // destination explicit instead of leaving it to whichever screen
            // happens to re-render first.
            void (async () => {
              // The path is passed so the gate knows which screen must not be
              // re-opened at the next sign-in, and only that one.
              await signOut(pathname);
              router.replace(ROUTES.root);
            })();
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: { marginTop: SPACE.sm },
});
