// Ingreso — email and password, and one sentence when they are wrong.
//
// THE COPY IS THE SERVER'S, VERBATIM, AND THAT IS A SECURITY PROPERTY.
// ---------------------------------------------------------------------------
// `/api/v1/auth/login` answers `invalid_credentials` for "no such account" and
// for "wrong password" alike, byte-identical, so the endpoint cannot be used to
// find out which email addresses have accounts. A client that improved on that
// — "no encontramos esa cuenta" vs "contraseña incorrecta" — would rebuild the
// enumeration oracle on the phone, out of helpfulness, and nothing on the server
// would notice.
//
// So this screen renders `apiFailureMessage(...)` and adds nothing. The only
// text it composes itself is for failures the server never sees: no connection,
// a body it could not parse, a build with no auth plane.
//
// THE PASSWORD NEVER GOES TO GoTrue FROM HERE. It goes to `/api/v1/auth/login`,
// which applies our rate limits, our account-state refusals and that single
// sentence, and hands back tokens; only then does the SDK get a session to keep
// alive. See `signIn` in session-store.ts.

import { Redirect } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { sessionEndMessage, signIn } from "../src/auth/session-store";
import { useSession } from "../src/auth/useSession";
import { Body, Card, ErrorNotice, PrimaryButton } from "../src/ui/components";
import { ROUTES } from "../src/ui/routes";
import { COLORS, RADIUS, SPACE } from "../src/ui/theme";

export default function IngresoScreen() {
  const session = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  // Already in. Reached when a session arrives while this screen is mounted —
  // the "cerrar sesión en todos los dispositivos" flow bounces through here.
  if (session.phase === "signed-in") return <Redirect href={ROUTES.root} />;

  // Why the person is looking at this screen, when we know. `null` for a
  // deliberate sign-out: telling somebody "cerraste sesión" right after they
  // pressed "Cerrar sesión" is noise.
  const reason = session.phase === "signed-out" ? sessionEndMessage(session.reason) : null;

  const canSubmit = email.trim().length > 0 && password.length > 0 && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setFailure(null);
    const result = await signIn(email.trim(), password);
    if (!result.ok) {
      setFailure(result.message);
      setBusy(false);
      return;
    }
    // On success the store flips to `signed-in` and the redirect above fires.
    // Deliberately NOT clearing `busy` first: leaving the button disabled until
    // this screen unmounts is what stops a second submit racing the first.
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.headline}>Ingresá a MiMAR</Text>

          {reason === null ? null : (
            <Card>
              <Body>{reason}</Body>
            </Card>
          )}

          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              accessibilityLabel="Email"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              editable={!busy}
              inputMode="email"
              onChangeText={setEmail}
              placeholder="tu@email.com"
              placeholderTextColor={COLORS.inkMuted}
              style={styles.input}
              value={email}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Contraseña</Text>
            <TextInput
              accessibilityLabel="Contraseña"
              autoCapitalize="none"
              autoComplete="current-password"
              editable={!busy}
              onChangeText={setPassword}
              onSubmitEditing={() => void submit()}
              returnKeyType="go"
              secureTextEntry
              style={styles.input}
              value={password}
            />
          </View>

          {failure === null ? null : <ErrorNotice message={failure} />}

          <PrimaryButton
            label={busy ? "Ingresando…" : "Ingresar"}
            onPress={() => void submit()}
            disabled={!canSubmit}
          />

          <Card title="¿No tenés cuenta?">
            {/* No native sign-up. The account creation flow needs the Ley 25.326
                consent copy and the identity step, both of which live on the web
                — see identidad-pendiente.tsx for the same reasoning in the case
                where the account already exists. */}
            <Body>
              Por ahora las cuentas se crean desde la web, en mimar.ar. Después entrás acá con el
              mismo email.
            </Body>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.canvas },
  flex: { flex: 1 },
  scroll: { padding: SPACE.xl, gap: SPACE.md },
  headline: { fontSize: 26, fontWeight: "700", color: COLORS.ink, marginBottom: SPACE.xs },
  field: { gap: SPACE.xs + 2 },
  label: { fontSize: 13, fontWeight: "600", color: COLORS.inkSoft },
  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.md,
    fontSize: 16,
    color: COLORS.ink,
  },
});
