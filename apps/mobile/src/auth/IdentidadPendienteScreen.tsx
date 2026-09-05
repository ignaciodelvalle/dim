// Completar registro — the screen for `profilePending: true`, and since
// 2026-09-05 the place the step actually HAPPENS.
//
// WHAT THIS SCREEN USED TO REFUSE TO DO
// ---------------------------------------------------------------------------
// It collected nothing. Its header argued that a native form posting "some
// fields" would create a SECOND, weaker definition of what a verified identity is
// — the Ley 25.326 consent copy, the DNI hashing (`lib/utils/dni-hash.ts`) and
// the Mi Argentina federation path (invariant #6) all live on the web — so the
// honest move was to hand over a URL and say the awkward part out loud: the link
// carries no session, the browser opens signed out, and the person has to type
// their email and password AGAIN.
//
// WHY THAT CHANGED (PO decision, 2026-09-05)
// ---------------------------------------------------------------------------
// The argument was right about the DNI and wrong about the NAME, and the pilot
// is what measured the difference. Testers read the second login as "confirm
// your email": one hour of GoTrue log on 2026-09-05 carries 8
// invalid-credential attempts and 2 duplicate signups on that web step. The
// handoff was not a rough edge, it was the drop-off.
//
// A name is not a claim about a national registry. It is the field
// `handle_new_user` GUESSES at from an email address, and the thing every other
// surface renders the person as. `POST /api/v1/me/identity` applies the same
// rules the web action applies — both halves required, both bounded, joined by
// `identityDisplayName`, refused if the result would still read as provisional —
// so this form is step 2 rather than a weaker copy of it.
//
// THE WEB LINK STAYS, DEMOTED. The DNI did not move, and it is the reason: it is
// hashed, it carries a uniqueness claim through `profiles_dni_hash_unique`, and
// it is the half federation will eventually replace. Somebody who wants to add
// it can still go there, and the link still says the session is not carried.
//
// WHY THIS FILE, AND NOT `app/identidad-pendiente.tsx`. This app's jest suite is
// anchored at `<rootDir>/src` (jest.config.js says so, and says why), so a
// component that lives under `app/` cannot be render-tested — and the redirect
// below is exactly the check that caused a redirect-loop bug (fixed 2026-09-04),
// which makes it the last check in this screen that should stay untestable.
//
// `profilePending` IS A PROP, NOT A RE-DERIVED READ. The thin route already asked
// `useGate` and holds the answer; a second read here would be a second place the
// two could disagree. It is also what makes the SUCCESS path work with no
// navigation call of its own: `completeIdentity` swaps the stored user, the route
// re-renders with `profilePending: false`, and the redirect below fires.
//
// THE FORM SITS ABOVE THE EXPLANATORY COPY, which is not the usual order and is
// deliberate. `Screen keyboardAvoiding` passes `behavior={undefined}` on Android
// (kit.tsx), so on an edge-to-edge Android build the keyboard is not compensated
// for by React Native and the platform no longer resizes the window either.
// Every form screen in this app has that property and fixing it belongs in
// `kit.tsx` as its own change; what this screen does is not depend on it — the
// two fields are the first thing under the title, and the return-key chain
// SUBMITS from "Apellido", so nothing anybody has to reach is ever under the
// keyboard.

import * as Linking from "expo-linking";
import { Redirect } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";

import { IDENTITY_COMPLETION_URL } from "../config/api";
import { Body, Card } from "../ui/components";
import {
  Callout,
  LinkText,
  PrimaryButton,
  Screen,
  SecondaryButton,
  Subtitle,
  TextField,
  Title,
} from "../ui/kit";
import { ROUTES } from "../ui/routes";
import { SPACE } from "../ui/theme";
import { useReturnKeyChain } from "../ui/use-return-key-chain";
import {
  EMPTY_IDENTITY_DRAFT,
  type IdentityDraft,
  canSubmitIdentity,
  toIdentityInput,
} from "./identity-input";
import { completeIdentity, signOut } from "./session-store";

export function IdentidadPendienteScreen({ profilePending }: { profilePending: boolean }) {
  const [draft, setDraft] = useState<IdentityDraft>(EMPTY_IDENTITY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [invalidField, setInvalidField] = useState<keyof IdentityDraft | null>(null);

  // NO `useScrollToError`, and the omission is measured rather than lazy. That
  // hook moves the Screen's ScrollView through `ScreenScrollContext`, whose
  // PROVIDER lives inside `Screen` — so a screen component that renders its own
  // `<Screen>` is outside it and reads null. (`DenunciaScreen` and
  // `RecordEventScreen` call it from exactly that position; the hook is
  // best-effort by design and degrades to no-op, so nothing goes red. Worth
  // fixing, not here.) On a form this short it would buy nothing anyway: the
  // refusal renders between the last field and the button, both on screen.

  const patch = useCallback((next: Partial<IdentityDraft>) => {
    setDraft((current) => ({ ...current, ...next }));
  }, []);

  const submit = useCallback(async () => {
    if (busy) return;
    setFailure(null);
    setInvalidField(null);

    // The CONTRACT's schema, run locally first, so a refusal is a field sentence
    // instead of a round trip that answers `invalid_request` with no field detail
    // — the error envelope is one key (§2), so "which box" is a thing this screen
    // answers and the wire does not.
    const verdict = toIdentityInput(draft);
    if (!verdict.ok) {
      setFailure(verdict.message);
      setInvalidField(verdict.field);
      return;
    }

    setBusy(true);
    const result = await completeIdentity(verdict.input);
    if (!result.ok) {
      // THE TYPED VALUES SURVIVE. `draft` is this component's own state and
      // nothing here clears it — the web form had to fight React 19's automatic
      // reset for the same property (bug #46) and echo the names back through
      // `IdentityFormState`. Somebody whose save was refused must not have to
      // retype their own name.
      setFailure(result.message);
      setBusy(false);
      return;
    }
    // Saved. The store swapped the session user for the one the write returned,
    // so `profilePending` is now false, this component re-renders through the
    // route's `useGate`, and the redirect at the top of the render takes over.
    // Deliberately NOT clearing `busy`: leaving the button disabled until the
    // screen unmounts is what stops a second submit racing the first.
  }, [busy, draft]);

  // "Apellido" ends the chain and SUBMITS. Every other multi-field form in this
  // app leaves the last field on `done`-and-blur, because "a person reviewing six
  // fields has not said save yet" (`useReturnKeyChain`). Two required fields with
  // one button is the opposite case — the claim lookup makes the same call for
  // the same reason: finishing the last box IS the ask.
  const chain = useReturnKeyChain(2, () => void submit());

  // THE LOAD-BEARING CHECK, and it stays exactly where it was. A caller whose
  // identity is already complete — a deep link, a stale back-stack entry, the
  // redirect loop `return-to.ts` used to create by carrying
  // `next=/identidad-pendiente` through sign-in, or the save that just landed —
  // must not keep seeing this screen. `allowPendingIdentity: true` on the gate is
  // a build-time relaxation that lets THIS screen render while identity is
  // pending; it says nothing about whether it still is.
  if (!profilePending) return <Redirect href={ROUTES.misMascotas} />;

  return (
    <Screen edges={["top", "bottom"]} keyboardAvoiding gap={SPACE.xl}>
      <View style={styles.heading}>
        <Title>Completá tu registro</Title>
        <Subtitle>Es una sola vez.</Subtitle>
      </View>

      <View style={styles.form}>
        <TextField
          autoCapitalize="words"
          autoComplete="given-name"
          editable={!busy}
          invalid={invalidField === "firstName"}
          label="Nombre"
          onChangeText={(firstName) => patch({ firstName })}
          required
          textContentType="givenName"
          value={draft.firstName}
          {...chain(0)}
        />

        <TextField
          autoCapitalize="words"
          autoComplete="family-name"
          editable={!busy}
          invalid={invalidField === "lastName"}
          label="Apellido"
          onChangeText={(lastName) => patch({ lastName })}
          required
          textContentType="familyName"
          value={draft.lastName}
          {...chain(1)}
        />

        {/* BETWEEN THE LAST FIELD AND THE BUTTON, which is where somebody who
            just pressed Guardar is looking. The `err` tone is an assertive live
            region and an alert role (kit.tsx), so a TalkBack user hears it
            without exploring the screen. */}
        {failure === null ? null : (
          <Callout tone="err">
            <Body>{failure}</Body>
          </Callout>
        )}

        <PrimaryButton
          label={busy ? "Guardando…" : "Guardar"}
          onPress={() => void submit()}
          disabled={busy || !canSubmitIdentity(draft)}
        />
      </View>

      <Card>
        <Body>
          Con tu nombre y tu apellido podemos emitir la credencial de tus mascotas a tu nombre.
        </Body>
      </Card>

      {/* THE WEB DOOR, KEPT AND DEMOTED. It is the only place a DNI can be
          loaded, so removing it would take a field away rather than move it —
          and the sentence still says the awkward part, because the link carries
          no session and the browser opens signed out. `LinkText` and not a
          button: this is the secondary path now. */}
      <Card title="¿Querés cargar tu DNI?">
        <Body>
          El DNI se carga en la web. Vas a tener que ingresar de nuevo con el mismo correo: el
          navegador no comparte la sesión de esta app.
        </Body>
        <View style={styles.webDoor}>
          <LinkText
            accessibilityHint="Se abre en el navegador"
            onPress={() => void Linking.openURL(IDENTITY_COMPLETION_URL)}
          >
            Prefiero completarlo en la web
          </LinkText>
        </View>
      </Card>

      <SecondaryButton label="Cerrar sesión" onPress={() => void signOut()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { alignItems: "center", gap: SPACE.xs + 2 },
  form: { gap: SPACE.lg },
  webDoor: { alignItems: "flex-start", marginTop: SPACE.xs },
});
