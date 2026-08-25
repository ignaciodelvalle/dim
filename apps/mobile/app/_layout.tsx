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
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useSessionBootstrap } from "../src/auth/useSession";
import { COLORS } from "../src/ui/theme";

export default function RootLayout() {
  useSessionBootstrap();

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: COLORS.canvas },
          headerTintColor: COLORS.ink,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: COLORS.canvas },
        }}
      >
        {/* The gate renders no chrome of its own — it is a decision, not a page. */}
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="ingreso" options={{ title: "Ingresar", headerBackVisible: false }} />
        <Stack.Screen
          name="identidad-pendiente"
          options={{ title: "Falta un paso", headerBackVisible: false }}
        />
        <Stack.Screen
          name="mascotas/index"
          options={{ title: "Mis mascotas", headerBackVisible: false }}
        />
        <Stack.Screen name="mascotas/[publicToken]" options={{ title: "Credencial" }} />
        <Stack.Screen name="alta" options={{ title: "Registrar una mascota" }} />
        <Stack.Screen name="ajustes" options={{ title: "Ajustes" }} />
      </Stack>
    </SafeAreaProvider>
  );
}
