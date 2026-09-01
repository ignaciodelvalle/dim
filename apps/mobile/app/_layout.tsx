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

import * as Sentry from "@sentry/react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useSessionBootstrap } from "../src/auth/useSession";
import { initSentry } from "../src/observability/sentry";
import { OfflineBanner } from "../src/ui/OfflineBanner";
import { FONTS, useLnFonts } from "../src/ui/fonts";
import { COLORS, TYPE } from "../src/ui/theme";

// AT MODULE SCOPE, before the first render: an error during the initial render
// is precisely the kind the pilot needs reported, and an init inside an effect
// runs after it. `initSentry` no-ops (returning false) when the build carries
// no DSN — local dev and the emulator stay silent by design; see
// src/observability/sentry.ts for everything that is deliberately off.
initSentry();

function RootLayout() {
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
      {/* Once, above the Stack: the network's absence said proactively, on
          every screen, before anybody spends a tap on a dead spot. */}
      <OfflineBanner />
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
        {/* LA FOTO. Sin registrar, el encabezado diría "foto" en minúscula. EL
            TÍTULO SE TRANSCRIBE, NO SE INVENTA — la condición del integrador al
            registrar `/reclamar`: "Foto de la mascota" es el `<Title>` que la
            pantalla ya dibuja en su estado de entrada, y "Foto" es la etiqueta
            del campo en el formulario de la web (`LnPhotoField`). Es el SUJETO
            y no el resultado, como `/denunciar`: la pantalla se retitula sola
            ("¿Usar esta foto?", "Foto actualizada") y un encabezado que la
            siguiera renombraría la página mientras alguien decide. */}
        <Stack.Screen
          name="mascotas/[publicToken]/foto"
          options={{ title: "Foto de la mascota" }}
        />
        {/* MUDANZA. Sin registrar, el encabezado saldría de la ruta — "mudanza",
            en minúscula, sobre una pantalla cuyo propio título va capitalizado:
            el mismo hueco que `/reclamar` tenía y que WU-S dejó abierto en las
            dos rutas de turnos.

            EL TÍTULO SE TRANSCRIBE, NO SE INVENTA, que es la condición que el
            integrador puso cuando cerró la registración de `/reclamar`. "Mudanza
            de {nombre}" es el `<h1>` de la web en `/mis-mascotas/{token}/mudanza`
            y el `<Title>` que esta pantalla dibuja; acá va sin el nombre por la
            razón que fijó "Mascota en adopción" para las fichas — el encabezado
            se dibuja antes de que resuelva el fetch, y uno que se completa
            después se lee como que la pantalla cambió abajo del lector.

            ES EL ACTO Y NO EL RESULTADO, como `/denunciar`: la pantalla se
            retitula sola cuando el movimiento queda anotado, y un encabezado que
            siguiera ese cambio renombraría la página justo cuando alguien está
            leyendo en qué localidad quedó registrado su animal. */}
        <Stack.Screen
          name="mascotas/[publicToken]/mudanza"
          options={{ title: "Registrar una mudanza" }}
        />
        {/* DEVOLUCIÓN. Sin registrar, el encabezado saldría de la ruta —
            "devolucion", en minúscula y sin tilde, que es la peor de las tres
            formas que este archivo existe para evitar.

            EL TÍTULO SE TRANSCRIBE: "Devolución" es el `<h1>` de la web en
            `/mis-mascotas/{token}/devolucion` en sus tres estados y la etiqueta
            de la fila del "⋯ Más" que lleva ahí. Va SIN el nombre del animal por
            la razón que fijó "Mascota en adopción": el encabezado se dibuja antes
            de que resuelva el fetch, y uno que se completa después se lee como
            que la pantalla cambió abajo del lector — y acá el nombre además
            aparece en el propio título de la pantalla. */}
        <Stack.Screen name="mascotas/[publicToken]/devolucion" options={{ title: "Devolución" }} />
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
        {/* BUSCAR TURNO. El título es el `<Title>` que la pantalla ya dibuja en
            su estado de picker y el `<h1>` de la web en `/turnos/buscar`, así que
            transcribe una decisión que alguien ya tomó en vez de tomar una. */}
        <Stack.Screen name="turnos/buscar/index" options={{ title: "Buscar turno" }} />
        {/* La grilla de una offering. El encabezado NO es el nombre del servicio:
            se dibuja antes de que resuelva el fetch, y uno que se completa después
            se lee como que la pantalla cambió abajo del lector. Es el mismo
            argumento que fijó "Mascota en adopción" para las fichas de adopción. */}
        <Stack.Screen name="turnos/buscar/[offeringToken]" options={{ title: "Reservar turno" }} />
        {/* LAS CINCO QUE EL RECUENTO DEL 31/08 DEJÓ SIN ENCABEZADO y cuyo string
            ya estaba decidido por dos superficies — transcriptas, no inventadas,
            2026-09-01. Las tres restantes del recuento (`perdida`,
            `turnos/[appointmentToken]`, `cuidado/[grantToken]`) NO se registran
            acá a propósito: sus superficies dicen strings DISTINTOS y esa es una
            discusión de copy, no de merge — están exentas con su pregunta
            escrita en __tests__/mobile-screen-titles.test.ts, que además cierra
            la clase: una ruta nueva sin registrar pone el gate en rojo.

            · "Mis turnos": el <Title> de la pantalla en sus dos estados y el
              botón del pie de /mascotas que la alcanza. Verificado en pantalla
              el 31/08 — la condición que WU-S dejó escrita quedó cumplida.
            · "Recuperar contraseña": el <Title> de RecuperarScreen y el <h1> de
              la web en /recuperar.
            · "Compartir": el <Title> de SharesScreen en sus dos estados y la
              FaceAction de /mascotas que la abre.
            · "Cuidador temporal": el <Title> de CaretakerPetScreen (dos
              estados), la FaceAction, y el <h1> de la web ("Cuidador temporal
              de {nombre}" — acá sin el nombre, por la razón que fijó Mudanza:
              el encabezado se dibuja antes del fetch).
            · "Credencial pública": la FaceAction que la abre y la
              autodescripción de la página pública (funcionalidades + el OG de
              /p/{token}). El "Credencial" pelado de la pantalla es su
              placeholder de carga, no un título decidido. */}
        <Stack.Screen name="turnos/index" options={{ title: "Mis turnos" }} />
        <Stack.Screen name="recuperar" options={{ title: "Recuperar contraseña" }} />
        <Stack.Screen name="mascotas/[publicToken]/compartir" options={{ title: "Compartir" }} />
        <Stack.Screen
          name="mascotas/[publicToken]/cuidado"
          options={{ title: "Cuidador temporal" }}
        />
        <Stack.Screen
          name="mascotas/[publicToken]/credencial"
          options={{ title: "Credencial pública" }}
        />
        {/* LAS TRES QUE TENÍAN SUPERFICIES EN DESACUERDO, decididas por el PO el
            01/09 (las preguntas vivieron en la fence, TITLE_PENDING):
            · «Modo perdida» — el string del botón que la abre y el nombre con
              que el proyecto entero habla de la función; «Búsqueda» queda como
              título interno del estado activo.
            · «Turno» — lo que la pantalla ya dice en carga y error; corto como
              Mascota/Registro/Transferencia. El nombre del servicio vive en el
              contenido, no en el encabezado (la regla de Mudanza).
            · «Cuidado temporal» — el ACTO que le confiaron al invitado; el lado
              del dueño sigue «Cuidador temporal» (la PERSONA que designó) y la
              asimetría es la decisión, no un descuido. */}
        <Stack.Screen name="mascotas/[publicToken]/perdida" options={{ title: "Modo perdida" }} />
        <Stack.Screen name="turnos/[appointmentToken]" options={{ title: "Turno" }} />
        <Stack.Screen name="cuidado/[grantToken]" options={{ title: "Cuidado temporal" }} />
      </Stack>
    </SafeAreaProvider>
  );
}

// `Sentry.wrap` is what attaches the SDK's own error boundary to the root, so
// a render-phase throw is captured WITH its component stack instead of only
// surfacing as the native crash that follows it. With no DSN the wrapper is
// inert chrome around an unreported tree — harmless in dev, load-bearing in
// the pilot build.
export default Sentry.wrap(RootLayout);
