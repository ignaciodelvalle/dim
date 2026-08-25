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

import * as Linking from "expo-linking";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { signOut } from "../src/auth/session-store";
import { useGate } from "../src/auth/useGate";
import { IDENTITY_COMPLETION_URL } from "../src/config/api";
import { Body, Card, PrimaryButton } from "../src/ui/components";
import { COLORS, RADIUS, SPACE } from "../src/ui/theme";

export default function IdentidadPendienteScreen() {
  const gate = useGate({ allowPendingIdentity: true });

  if (!gate.allowed) return gate.element;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.headline}>Falta completar tu registro</Text>

        <Card>
          <Body>
            Tu cuenta existe, pero todavía no completaste tus datos. Hasta que lo hagas no podemos
            asociarte mascotas ni emitir credenciales a tu nombre.
          </Body>
        </Card>

        <Card title="Dónde se completa">
          <Body>
            Por ahora este paso se hace en la web. Abrí este link en el navegador y seguí desde
            donde quedaste:
          </Body>
          {/* `selectable` and not a "copiar" button: a clipboard button means
              another native module in the dev-client build, and the URL is
              already selectable by long-press. The URL is shown IN FULL rather
              than hidden behind the button so somebody whose browser will not
              open from here can still type it. */}
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

        <PrimaryButton label="Cerrar sesión" tone="quiet" onPress={() => void signOut()} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.canvas },
  scroll: { padding: SPACE.xl, gap: SPACE.md },
  headline: { fontSize: 24, fontWeight: "700", color: COLORS.ink },
  url: {
    backgroundColor: COLORS.canvas,
    borderRadius: RADIUS.sm,
    padding: SPACE.md,
    color: COLORS.accent,
    fontSize: 13,
  },
  actions: { gap: SPACE.sm, marginTop: SPACE.xs },
});
