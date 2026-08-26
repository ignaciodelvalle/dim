// The in-app route to account deletion — the one Google Play will not ship the
// app without.
//
// WHY IT IS A COMPONENT AND NOT SIX LINES INSIDE `app/ajustes.tsx`
// ---------------------------------------------------------------------------
// jest's `roots` is `<rootDir>/src` (jest.config.js, and the comment there
// explains why the glob cannot be widened safely on Windows), so nothing under
// `app/` is reachable by a test. Leaving this inline would have made the ONE
// screen element a store policy depends on the only element in the app with no
// test at all — and its failure mode is silent: a refactor drops the card, the
// build still compiles, and the next thing that notices is a Play review
// rejection weeks later. Every other real screen in this app already lives in
// `src/` for the same reason (CrearCuentaScreen, LostScreen, LibretaScreen);
// this follows them rather than inventing a shape.
//
// WHY THE BUTTON IS SECONDARY AND NOT `tone="seal"`
// ---------------------------------------------------------------------------
// `seal` is this design's destructive tone, and pressing THIS button destroys
// nothing — it opens a browser. A red button that only navigates teaches people
// that red means "maybe", which is exactly the lesson that gets somebody to tap
// the real one. The destructive confirmation lives on the web page, where the
// mandatory reason field and the "Confirmar borrado" button are.
//
// WHY IT DOES NOT SIGN THE USER OUT ON PRESS
// ---------------------------------------------------------------------------
// Tapping a link is not a decision to delete. Somebody who opens the page, reads
// what happens to their pets' records and closes the tab must come back to a
// working app. The trade is that this app cannot know the deletion happened
// (see ACCOUNT_DELETION_URL) — so the card SAYS so and asks them to close the
// session here afterwards, instead of guessing.

import * as Linking from "expo-linking";
import { StyleSheet, Text, View } from "react-native";

import { ACCOUNT_DELETION_URL } from "../config/api";
import { Body, Card } from "../ui/components";
import { FONTS } from "../ui/fonts";
import { SecondaryButton } from "../ui/kit";
import { COLORS, RADIUS, SPACE, TRACKING, TYPE } from "../ui/theme";

export function AccountDeletionCard() {
  return (
    <Card title="Eliminar mi cuenta">
      <Body>
        Podés dar de baja tu cuenta y pedir la supresión de tus datos personales (Ley 25.326, art.
        16). Tus datos de contacto se anonimizan; los eventos sanitarios de tus mascotas se
        conservan como historial de salud del animal.
      </Body>
      <Body>Por ahora la baja se hace en la web. Abrí este link en el navegador:</Body>
      {/* Shown in full and `selectable`, same as identidad-pendiente: somebody
          whose browser will not open from here can still type it, and a Play
          reviewer can read the destination before tapping. Mono, like every
          other machine string in this design. */}
      <Text selectable style={styles.url}>
        {ACCOUNT_DELETION_URL}
      </Text>
      <Body>
        Vas a tener que ingresar de nuevo con el mismo email: el navegador no comparte la sesión de
        esta app.
      </Body>
      <Body>
        Cuando termines, cerrá la sesión acá: esta app no se entera de la baja por su cuenta.
      </Body>
      <View style={styles.actions}>
        <SecondaryButton
          label="Eliminar mi cuenta en la web"
          onPress={() => void Linking.openURL(ACCOUNT_DELETION_URL)}
        />
      </View>
    </Card>
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
