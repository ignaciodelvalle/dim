// Credencial — one pet, reached from the list.
//
// The route is a thin shell: it resolves the path parameter, refuses to render
// without a session, and hands the token to the screen. All the honesty rules
// live in `CredentialScreen`.
//
// THE PARAMETER IS VALIDATED, not trusted. `useLocalSearchParams` is typed
// `string | string[]` because a path segment can legally repeat, and a bad
// value here would become a request for `/api/v1/pets/undefined/credential` —
// which the server answers 404, i.e. "no existe esa credencial", which is a lie
// about the pet rather than about the link. Better to say the link is broken.

import { useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useGate } from "../../src/auth/useGate";
import { CredentialScreen } from "../../src/credential/CredentialScreen";
import { ErrorNotice } from "../../src/ui/components";
import { COLORS, SPACE } from "../../src/ui/theme";

export default function CredentialRoute() {
  const gate = useGate();
  const params = useLocalSearchParams<{ publicToken?: string | string[] }>();

  if (!gate.allowed) return gate.element;

  const raw = params.publicToken;
  const publicToken = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";

  if (publicToken.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <ErrorNotice message="Este link no tiene un código de credencial. Volvé a tu lista de mascotas y entrá desde ahí." />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return <CredentialScreen publicToken={publicToken} />;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.canvas },
  scroll: { padding: SPACE.xl, gap: SPACE.md },
});
