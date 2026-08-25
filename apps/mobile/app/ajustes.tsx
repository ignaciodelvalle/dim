// Ajustes — who you are, and the two ways out.
//
// WHAT `GET /me` GIVES US, AND WHAT IT DELIBERATELY DOES NOT
// ---------------------------------------------------------------------------
// Four fields: id, display name, role, account type. No email, no DNI in any
// form, no phone, no jurisdiction. That is the whole defence for what a stolen
// access token buys, and this screen must not undo it by fetching the missing
// pieces from somewhere else to make a nicer profile card. What it can show, it
// shows; what it cannot, it does not invent.
//
// THE TWO SIGN-OUTS ARE DIFFERENT PROMISES AND ARE LABELLED AS SUCH
// ---------------------------------------------------------------------------
//   "Cerrar sesión" ends it HERE. It always works, because the local delete does
//   not depend on the network (see `dropLocalSession` — the library will leave a
//   session in place on a 5xx, and this app does not).
//
//   "Cerrar sesión en todos los dispositivos" is a REQUEST to the server, it can
//   fail, and on success it also ends this one — GoTrue rejects the access token
//   immediately and the refresh comes back `refresh_token_not_found`. Presenting
//   it as a bigger version of the first button would surprise somebody who meant
//   to sign out their old phone and got signed out of the one in their hand. So
//   the confirmation says so, in those words.

import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { signOut, signOutEverywhere } from "../src/auth/session-store";
import { useGate } from "../src/auth/useGate";
import { API_BASE_URL } from "../src/config/api";
import { Body, Card, ErrorNotice, PrimaryButton, Row } from "../src/ui/components";
import { COLORS, SPACE } from "../src/ui/theme";

type RevokeState =
  | { phase: "idle" }
  | { phase: "confirming" }
  | { phase: "sending" }
  | { phase: "failed"; message: string };

const ROLE_LABELS = {
  owner: "Titular",
  vet: "Veterinaria",
  govt: "Organismo público",
  admin: "Administración",
} as const;

const ACCOUNT_TYPE_LABELS = {
  personal: "Personal",
  institutional: "Institucional",
} as const;

export default function AjustesScreen() {
  const gate = useGate({ allowPendingIdentity: true });
  const router = useRouter();
  const [revoke, setRevoke] = useState<RevokeState>({ phase: "idle" });

  if (!gate.allowed) return gate.element;
  const { user } = gate;

  async function confirmRevoke() {
    setRevoke({ phase: "sending" });
    const result = await signOutEverywhere();
    if (!result.ok) {
      // The session is untouched on failure. A half-done revocation that also
      // signed you out locally would be the worst of both: the other devices
      // keep working and you lost the one you are holding.
      setRevoke({ phase: "failed", message: result.message });
      return;
    }
    // On success the store flips to `signed-out` and the gate redirects.
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Card title="Tu cuenta">
          {user.profilePending ? (
            <Body>
              Todavía no completaste tus datos, así que no tenemos un nombre para mostrar acá.
            </Body>
          ) : (
            <>
              <Row label="Nombre" value={user.displayName} />
              <Row label="Rol" value={ROLE_LABELS[user.role]} />
              <Row label="Tipo de cuenta" value={ACCOUNT_TYPE_LABELS[user.accountType]} />
            </>
          )}
        </Card>

        <Card title="Servidor">
          {/* Shown because a tester with three builds on one phone has no other
              way to tell which backend they are looking at, and "los datos no
              aparecen" is otherwise unanswerable. */}
          <Body>{API_BASE_URL}</Body>
        </Card>

        <View style={styles.actions}>
          <PrimaryButton
            label="Cerrar sesión"
            tone="quiet"
            onPress={() => {
              void signOut();
              router.replace("/");
            }}
          />

          {revoke.phase === "confirming" ? (
            <Card title="Cerrar sesión en todos los dispositivos">
              <Body>
                Vas a cerrar la sesión en todos los teléfonos y navegadores donde entraste, incluido
                este. Después tenés que volver a ingresar acá.
              </Body>
              <View style={styles.confirmActions}>
                <PrimaryButton
                  label="Sí, cerrar todo"
                  tone="danger"
                  onPress={() => void confirmRevoke()}
                />
                <PrimaryButton
                  label="Cancelar"
                  tone="quiet"
                  onPress={() => setRevoke({ phase: "idle" })}
                />
              </View>
            </Card>
          ) : (
            <PrimaryButton
              label={
                revoke.phase === "sending"
                  ? "Cerrando sesiones…"
                  : "Cerrar sesión en todos los dispositivos"
              }
              tone="danger"
              disabled={revoke.phase === "sending"}
              onPress={() => setRevoke({ phase: "confirming" })}
            />
          )}

          {revoke.phase === "failed" ? (
            <ErrorNotice
              message={`${revoke.message} Tu sesión en este teléfono sigue abierta.`}
              onRetry={() => setRevoke({ phase: "confirming" })}
            />
          ) : null}
        </View>

        <Text style={styles.footnote}>
          El alta de mascotas con foto, las notificaciones y el ingreso con Mi Argentina todavía no
          están en la app.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.canvas },
  scroll: { padding: SPACE.xl, gap: SPACE.md },
  actions: { gap: SPACE.md, marginTop: SPACE.sm },
  confirmActions: { gap: SPACE.sm, marginTop: SPACE.sm },
  footnote: { fontSize: 12, color: COLORS.inkMuted, marginTop: SPACE.lg },
});
