// `/crear-cuenta` — the account half of the web's two-step signup.
//
// A THIN ROUTE over `CrearCuentaScreen`, unlike its sibling `ingreso.tsx` which
// is a whole screen in this directory. The split is not cosmetic: this app's
// jest suite is anchored at `<rootDir>/src` (jest.config.js says so, and says
// why — a `<rootDir>`-absolute glob makes micromatch read `\` as an escape on
// Windows and match nothing), so a component that lives under `app/` cannot be
// render-tested. A signup form is the last screen in this app that should be
// untestable.
//
// NO `useGate` HERE, AND THAT IS THE DIFFERENCE FROM EVERY OTHER ROUTE. The
// gate answers "who is holding this phone" for screens that need a session;
// this one is reached WITHOUT one, exactly like `ingreso`. What it does share
// with ingreso is the already-signed-in bounce, which fires when a session
// arrives while this screen is mounted — which is precisely what a successful
// signup does.
//
// THE BOUNCE GOES TO `/` — THE GATE — AND NOT TO A DESTINATION. A brand-new
// account has no profile row, so `/me` answers `profilePending: true` and the
// gate sends the person to `identidad-pendiente` (step 2, on the web: see
// IDENTITY_COMPLETION_URL for why this app must not fake it). Naming that
// screen here would duplicate a decision `useGate` already makes for every
// route, and it would be the wrong one the day identity completion gets an
// `/api/v1` door of its own.

import { Redirect, useRouter } from "expo-router";

import { CrearCuentaScreen } from "../src/auth/CrearCuentaScreen";
import { useSession } from "../src/auth/useSession";
import { ROUTES } from "../src/ui/routes";

export default function CrearCuentaRoute() {
  const session = useSession();
  const router = useRouter();

  if (session.phase === "signed-in") return <Redirect href={ROUTES.root} />;

  return (
    <CrearCuentaScreen
      // REPLACE, not push. Somebody who decides they already have an account
      // does not want this form behind the back gesture, and somebody sent here
      // by the "ya podés ingresar" panel must not be able to swipe back onto a
      // filled-in signup form whose next submit answers with the masquerade.
      onGoToSignIn={() => router.replace(ROUTES.ingreso)}
    />
  );
}
