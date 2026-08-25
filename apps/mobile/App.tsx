// The app root.
//
// One screen, no navigator. A navigation library is not installed because M1
// has nowhere to navigate TO: the moment there is a pet list and a detail view
// (M2) the choice matters and should be made against that requirement, not
// pre-committed here by a scaffold. Same reasoning for state management —
// `useState` in one screen is not a problem a store solves.

import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { CredentialScreen } from "./src/credential/CredentialScreen";

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <CredentialScreen />
    </SafeAreaProvider>
  );
}
