// The pet's PUBLIC credential, as its own route — one tap from the QR.
//
// A ROUTE AND NOT A FACE (two-face rewrite, PO decision 2026-08-28). The web's
// owner card links to `/p/{token}` from its QR block; this is that link's
// native landing. `CredentialScreen` renders here UNCHANGED — its offline
// cache, its degraded-envelope handling and its per-section honesty all
// predate the rewrite and none of them moved.
//
// BEHIND THE GATE, deliberately, even though the document itself is public:
// this app has no anonymous surface, and an unauthenticated open of a deep
// link lands on the sign-in gate like every other screen. The anonymous
// reader's surface is the web page the QR encodes.

import { useLocalSearchParams } from "expo-router";

import { useGate } from "../../../src/auth/useGate";
import { CredentialScreen } from "../../../src/credential/CredentialScreen";
import { ErrorNotice } from "../../../src/ui/components";
import { Screen } from "../../../src/ui/kit";

export default function PublicCredentialRoute() {
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
