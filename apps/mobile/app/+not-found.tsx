// Where a link the app does not recognise lands.
//
// IT EXISTS BECAUSE LINKS NOW ARRIVE. Until `DEEP_LINK_MAP` had `appPath`
// values (WU-O) almost nothing could open this app from outside, so expo-router's
// default unmatched screen was a corner nobody reached. Now a notification, an
// invitation e-mail and a check-in QR can all hand this app a path, and one of
// them — `mimar://appointment/{token}`, the front-desk payload whose reader does
// not exist yet — resolves to no screen ON PURPOSE.
//
// The default screen is an English "Unmatched Route" with a developer's stack
// hint. That is the right answer for a developer and the wrong one for the
// person holding the phone: they followed a link somebody sent them and the app
// opened onto a page that talks about routing. This says what happened, in the
// app's own language, and offers the one thing that always works.
//
// IT DOES NOT GUESS. There is no "did you mean…" and no silent redirect to the
// pet list: an unknown link may be a link for a DIFFERENT account, and quietly
// landing somebody on their own animals would answer a question they did not
// ask.

import { useRouter } from "expo-router";

import { Body, Card } from "../src/ui/components";
import { PrimaryButton, Screen, Title } from "../src/ui/kit";
import { ROUTES } from "../src/ui/routes";

export default function NotFoundRoute() {
  const router = useRouter();
  return (
    <Screen edges={["top", "bottom"]}>
      <Title>No pudimos abrir ese link</Title>
      <Card>
        <Body>
          El link que seguiste no corresponde a ninguna pantalla de esta app. Puede que sea de una
          versión más nueva, o que se haya copiado incompleto.
        </Body>
        <Body>Si te lo mandaron por mail, probá abrirlo desde el navegador.</Body>
      </Card>
      <PrimaryButton label="Ir a mis mascotas" onPress={() => router.replace(ROUTES.misMascotas)} />
    </Screen>
  );
}
