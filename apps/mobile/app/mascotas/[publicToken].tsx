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

import { useGate } from "../../src/auth/useGate";
import { CredentialScreen } from "../../src/credential/CredentialScreen";
import { ErrorNotice } from "../../src/ui/components";
import { Screen } from "../../src/ui/kit";

export default function CredentialRoute() {
  const gate = useGate();
  const params = useLocalSearchParams<{ publicToken?: string | string[] }>();

  if (!gate.allowed) return gate.element;

  const raw = params.publicToken;
  const publicToken = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";

  if (publicToken.length === 0) {
    return (
      <Screen>
        <ErrorNotice message="Este link no tiene un código de credencial. Volvé a tu lista de mascotas y entrá desde ahí." />
      </Screen>
    );
  }

  return <CredentialScreen publicToken={publicToken} />;
}
