// The app root: providers, the session bootstrap, and one Stack.
//
// WHY expo-router AND NOT react-navigation DIRECTLY
// ---------------------------------------------------------------------------
// M1's `App.tsx` said the choice should be made against a real requirement
// rather than pre-committed by a scaffold. The requirement arrived with M2 and
// it points one way: this app has to be able to OPEN A LINK. Invariant #1 is
// that a `DIM-XXXX-XXXX` token resolves to a QR-verifiable page, and the end
// state (blocked only on a Play-signed fingerprint — see app.config.ts) is that
// scanning that QR opens THIS app at that pet. `@dim/contract/links` already
// holds the table mapping a logical destination to its path, shared with the web
// app; a file-based router whose screens ARE paths lines up with that table
// directly, while a hand-registered navigator would need a second, parallel
// mapping from path to screen name — which is exactly the drift the contract
// package exists to prevent.
//
// No blocker was found. expo-router sits on react-navigation, so nothing is lost
// if the file tree ever stops paying for itself.
//
// THE GATE IS NOT HERE. Every screen decides for itself whether it can render
// (see `useGate`), and this layout only declares the stack. A gate implemented
// as an effect in the layout has to guess at mount order and races the first
// paint; a gate implemented as a `<Redirect>` inside the screen is evaluated by
// the same render that would have drawn the protected content, so there is no
// frame in which it is visible.

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useSessionBootstrap } from "../src/auth/useSession";
import { FONTS, useLnFonts } from "../src/ui/fonts";
import { COLORS, TYPE } from "../src/ui/theme";

export default function RootLayout() {
  const fontsReady = useLnFonts();
  useSessionBootstrap();

  // THE FIRST PAINT WAITS FOR THE TYPEFACE, and the alternative is worse than a
  // pause. React Native draws immediately with the system face and re-lays-out
  // when the font arrives; at these sizes IBM Plex Serif and Roboto have very
  // different metrics, so what the user sees is the whole screen jumping. This
  // is a few hundred milliseconds ONCE per cold start, on a bundled asset with
  // no network in the path. `useLnFonts` releases the gate on failure too, so a
  // font that cannot load costs an ugly app rather than an app that never opens.
  if (!fontsReady) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: COLORS.canvas,
          }}
        >
          <ActivityIndicator color={COLORS.accent} />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: COLORS.canvas },
          headerTintColor: COLORS.ink,
          // The header title is the same display face as a `Title` inside the
          // page. A stack header in the system font over a serif screen is the
          // seam that made the app look assembled rather than designed.
          headerTitleStyle: {
            fontFamily: FONTS.serif,
            fontSize: TYPE.lg,
            color: COLORS.ink,
          },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: COLORS.canvas },
        }}
      >
        {/* The gate renders no chrome of its own — it is a decision, not a page. */}
        <Stack.Screen name="index" options={{ headerShown: false }} />
        {/* Ingreso draws its own title, exactly as the web login does — that page
            has no chrome either. A stack header saying "Ingresar" above an
            `<h1>` saying "Iniciar sesión" is the same word twice in two voices. */}
        <Stack.Screen name="ingreso" options={{ headerShown: false }} />
        {/* Same reasoning as ingreso, one door over: the web's `/registro` page
            has no chrome either and this screen draws its own "Crear cuenta"
            title. A stack header repeating it would be the same words twice in
            two voices. */}
        <Stack.Screen name="crear-cuenta" options={{ headerShown: false }} />
        <Stack.Screen
          name="identidad-pendiente"
          options={{ title: "Falta un paso", headerBackVisible: false }}
        />
        <Stack.Screen
          name="mascotas/index"
          options={{ title: "Mis mascotas", headerBackVisible: false }}
        />
        {/* The pet screen carries THREE faces now — the owner's chrome, the
            libreta and the public credential — so the header can no longer name
            one of them. "Mascota" is what the screen is; the switcher inside it
            says which face is showing. */}
        <Stack.Screen name="mascotas/[publicToken]" options={{ title: "Mascota" }} />
        <Stack.Screen
          name="mascotas/[publicToken]/eventos/[eventId]"
          options={{ title: "Registro" }}
        />
        {/* The header says the ACT, not the kind: which asiento is being written
            is the screen's own title, and the picker has not decided yet when
            this header first draws. */}
        <Stack.Screen name="mascotas/[publicToken]/asentar" options={{ title: "Asentar" }} />
        <Stack.Screen name="alta" options={{ title: "Registrar una mascota" }} />
        <Stack.Screen name="ajustes" options={{ title: "Ajustes" }} />
        {/* Registered for its TITLE, like `editar` below. An unregistered route
            takes its header from the last path segment, which here would read
            "privacidad" — lowercase, and half the name: the screen carries BOTH
            Ley 25.326 rights, and a header saying only "Privacidad" would let
            somebody who came to download their file think they were on the
            deletion page. "Mis datos" is what both halves are about. */}
        <Stack.Screen name="cuenta/privacidad" options={{ title: "Mis datos" }} />
        {/* The header says the ACT and the screen says the subject, which is the
            rule `mascotas/[publicToken]/editar` follows one line down. Unlike
            that one, this route's own segment would already read "editar" — the
            registration is here for the capital letter and for the accent. */}
        <Stack.Screen name="cuenta/editar" options={{ title: "Editar" }} />
        {/* The transfer hub is a SIBLING of the pet list, not a child of a pet:
            half of what it shows is offers from animals somebody else owns. */}
        <Stack.Screen name="transferencias/index" options={{ title: "Transferencias" }} />
        {/* The inbox, a sibling for the same reason and a stronger one: a
            notification is addressed to a person, not to an animal. */}
        <Stack.Screen name="notificaciones" options={{ title: "Notificaciones" }} />
        {/* THE DEEP-LINK DESTINATION. A person can arrive here from a
            notification with no history behind them, so the header says what the
            screen IS rather than naming a step in a flow they did not walk. */}
        <Stack.Screen name="transferencias/[transferToken]" options={{ title: "Transferencia" }} />
        {/* The header says the ACT. Which animal is the screen's own title. */}
        <Stack.Screen name="mascotas/[publicToken]/transferir" options={{ title: "Transferir" }} />
        {/* Registered for its TITLE and nothing else. An unregistered route
            takes its header from the path segment, which here would read
            "editar" — a lowercase English-looking verb in a Spanish stack. The
            screen carries two forms under one act, and the header says the act. */}
        <Stack.Screen name="mascotas/[publicToken]/editar" options={{ title: "Editar" }} />
        {/* Registered BY THE INTEGRATOR at the 2026-08-30 merge, not by the lane
            that shipped the screen: this file was a parallel lane's territory in
            that window, and the lane that owned it did not land. The gap is the
            one WU-S recorded for both `turnos` routes and that `cuidado/
            [grantToken]` has carried longer — an unregistered route takes its
            header from the path segment, so this one read "reclamar", lowercase,
            over a screen whose own title is capitalised.

            The wording was NOT invented here, which is why an integrator could
            close it at all: "Reclamar una mascota" is already the string the
            screen's own <Title> uses in its entry state AND the web's <h1> on
            `/mis-mascotas/reclamar`. Naming the act rather than the step matters
            more here than on most of these, because this screen's title changes
            under it three times — the lookup question, then the animal's name —
            and a header that tracked it would rename the page mid-flow. */}
        <Stack.Screen name="reclamar" options={{ title: "Reclamar una mascota" }} />
        {/* ADOPCIÓN — four routes, and every one of them needs a title for the
            reason `cuenta/privacidad` does: the path segments here are
            "adoptar", "[petToken]", "postular" and "postulaciones", so an
            unregistered stack would show a lowercase verb, a raw token, or a
            word that names the ACT on a screen that is a LIST.

            "Adoptar" for the catalogue and "Mascota en adopción" for the ficha,
            NOT the animal's name — the header draws before the fetch resolves,
            and a header that fills in after the body has painted reads as the
            screen changing under the reader. The animal is named by the screen
            itself, once. */}
        <Stack.Screen name="adoptar/index" options={{ title: "Adoptar" }} />
        <Stack.Screen name="adoptar/[petToken]" options={{ title: "Mascota en adopción" }} />
        {/* THE ACT, on the form. Which animal is display copy the route already
            carries in a query param, and it is the screen's own title. */}
        <Stack.Screen name="adoptar/[petToken]/postular" options={{ title: "Postularme" }} />
        {/* "Mis postulaciones" and not "Postulaciones": the same word means the
            shelter's REVIEW QUEUE on the web (`/adopciones`), and this app has
            no org surfaces at all. The possessive is what keeps a tester from
            reading this screen as one they do not have. */}
        <Stack.Screen name="adoptar/postulaciones" options={{ title: "Mis postulaciones" }} />
        {/* DENUNCIAR MALTRATO. Unregistered, the header would read "denunciar" —
            a lowercase Spanish verb, which is the one failure mode this file
            exists to prevent, on the screen where it would be read as the app
            addressing the reader in the imperative.

            THE TITLE IS TRANSCRIBED, NOT INVENTED, which is the condition the
            integrator set when it closed `/reclamar`'s registration and
            deliberately left the two `turnos` routes open: what a header should
            SAY is copy, and a merge is no place to argue it. Nothing is argued
            here — "Denunciar maltrato" is already the screen's own `<Title>` in
            its form state and already the label on the `/mascotas` footer button
            that reaches it. Two surfaces had decided this string before this line
            existed.

            IT IS THE ACT AND NOT THE OUTCOME. The screen's other state titles
            itself "Denuncia registrada", and a header that tracked it would
            rename the page under somebody at the moment they are trying to write
            down a reference code — the same argument `/reclamar` records about a
            screen whose title moves three times. */}
        <Stack.Screen name="denunciar" options={{ title: "Denunciar maltrato" }} />
      </Stack>
    </SafeAreaProvider>
  );
}
