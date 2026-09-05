// Identidad pendiente — the gate for `profilePending: true`.
//
// WHAT THIS SCREEN REFUSES TO DO, AND WHY THAT IS THE POINT
// ---------------------------------------------------------------------------
// It does not collect a name, a DNI or a jurisdiction. Building a native form
// that posted "some fields" would create a SECOND definition of what a verified
// identity is — a weaker one — beside the web's, which carries the Ley 25.326
// consent copy, the DNI hashing (`lib/utils/dni-hash.ts`: no DNI in plaintext,
// ever) and the shape the Mi Argentina federation path has to slot into.
// Invariant #6 says no decision may harm that path, and inventing a parallel
// identity capture is exactly such a decision.
//
// So the honest move is to say where it happens and hand over the URL.
//
// AND TO SAY THE AWKWARD PART. The link does NOT carry this session: the web
// resolves a visitor from a cookie, this app holds a bearer token, so the
// browser will open signed out and ask for the same email and password again.
// A screen that omitted that would look broken to the one person it is for.
//
// WHY THIS FILE, AND NOT `app/identidad-pendiente.tsx`. This app's jest suite
// is anchored at `<rootDir>/src` (jest.config.js says so, and says why), so a
// component that lives under `app/` cannot be render-tested — and the check
// below is exactly the one that caused a redirect-loop bug (fixed 2026-09-04),
// which makes it the last check in this screen that should stay untestable.
//
// `profilePending` IS A PROP, NOT A RE-DERIVED READ. The thin route already
// asked `useGate` and holds the answer; a second read here would be a second
// place the two could disagree.

import * as Linking from "expo-linking";
import { Redirect } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { IDENTITY_COMPLETION_URL } from "../config/api";
import { Body, Card } from "../ui/components";
import { FONTS } from "../ui/fonts";
import { PrimaryButton, Screen, SecondaryButton, Title } from "../ui/kit";
import { ROUTES } from "../ui/routes";
import { COLORS, RADIUS, SPACE, TRACKING, TYPE } from "../ui/theme";
import { signOut } from "./session-store";

export function IdentidadPendienteScreen({ profilePending }: { profilePending: boolean }) {
  // THE LOAD-BEARING CHECK, moved here (from the thin route) so a render test
  // can actually exercise it. A caller whose identity is already complete — a
  // deep link, a stale back-stack entry, or the redirect loop `return-to.ts`
  // used to create by carrying `next=/identidad-pendiente` through sign-in —
  // must not keep seeing this screen. `allowPendingIdentity: true` on the
  // gate is a build-time relaxation that lets THIS screen render while
  // identity is pending; it says nothing about whether it still is.
  if (!profilePending) return <Redirect href={ROUTES.misMascotas} />;

  return (
    <Screen>
      <Title>Falta completar tu registro</Title>

      <Card>
        <Body>
          Tu cuenta existe, pero todavía no completaste tus datos. Hasta que lo hagas no podemos
          asociarte mascotas ni emitir credenciales a tu nombre.
        </Body>
      </Card>

      <Card title="Dónde se completa">
        <Body>
          Por ahora este paso se hace en la web. Abrí este link en el navegador y seguí desde donde
          quedaste:
        </Body>
        {/* `selectable` and not a "copiar" button: a clipboard button means
            another native module in the dev-client build, and the URL is
            already selectable by long-press. The URL is shown IN FULL rather
            than hidden behind the button so somebody whose browser will not
            open from here can still type it. Mono, like every other machine
            string in this design — see the eyebrow and the public token. */}
        <Text selectable style={styles.url}>
          {IDENTITY_COMPLETION_URL}
        </Text>
        <Body>
          Vas a tener que ingresar de nuevo con el mismo email: el navegador no comparte la sesión
          de esta app.
        </Body>
        <View style={styles.actions}>
          <PrimaryButton
            label="Abrir en el navegador"
            onPress={() => void Linking.openURL(IDENTITY_COMPLETION_URL)}
          />
        </View>
      </Card>

      <Card title="Cuando termines">
        <Body>Volvé a esta app y cerrá y abrí la sesión para que tome tus datos nuevos.</Body>
      </Card>

      <SecondaryButton label="Cerrar sesión" onPress={() => void signOut()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  url: {
    backgroundColor: COLORS.stripe,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.control,
    padding: SPACE.md,
    fontFamily: FONTS.mono,
    fontSize: TYPE.sm,
    letterSpacing: TYPE.sm * TRACKING.wide,
    color: COLORS.accent,
  },
  actions: { gap: SPACE.sm, marginTop: SPACE.xs },
});
