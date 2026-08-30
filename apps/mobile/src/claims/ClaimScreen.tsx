// RECLAMAR UNA MASCOTA — decir "esta es mía" desde el teléfono.
//
// TWO STEPS AND NOT THREE, and the missing one is the whole design.
//
//   1. CONFIRMAR EL CHIP. Somebody enters the microchip or the tattoo code, the
//      server answers which animal it resolves to, and this screen shows a card
//      naming it. That is the confirmation step: you are looking at the animal
//      in front of you and at what miMAR thinks of it, before you assert
//      anything about it.
//   2. RECLAMAR. Only when the server said `canClaim`.
//
// The web has a third — iniciar una disputa when the animal already has a
// custody — and it is NOT missing here, it is refused. That writer requires at
// least one evidence FILE and refuses without one, absolutely, because raising a
// dispute notifies the registered owner, appends an uneditable row to their
// animal's spine, flips `pets.in_custody_dispute` (which strips the owner's
// phone and the finder form off the public credential, on exactly the animals a
// finder needs to reach) and opens a case a local authority must adjudicate.
// This build has no image picker, so it cannot attach anything — and a form that
// took two hundred characters of explanation and then always failed would be
// worse than a sentence naming the browser.
//
// THE CAMERA IS NOT HERE EITHER, and that is the same wall rather than a
// different one. Reading a chip's barcode off a vet's sticker needs
// `expo-camera`, which is a native module, which is an EAS build — the pipeline
// the board records as six builds with five distinct root causes, three of them
// invisible to every local gate. The field below is a keyboard field with
// `keyboardType="number-pad"`, which is what somebody with the number in their
// hand actually needs, and the scan is a strictly additive change: it would set
// the same string this field sets, and nothing else on this screen would move.
//
// NOTHING HERE DECIDES WHETHER A CLAIM IS ALLOWED. `canClaim` arrives on the
// lookup ack and is read, never derived — see `claim-view-model.ts`'s header for
// why that matters more here than anywhere else in this app.

import * as Linking from "expo-linking";
import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";

import type { PetClaimLookupAckV1 } from "@dim/contract/api";
import type { PetClaimIdentifierKind } from "@dim/contract/input";
import { PET_CLAIM_IDENTIFIER_KINDS } from "@dim/contract/input";

import type { ApiResult } from "../api/client";
import { sendPetClaimCommand } from "../api/endpoints";
import { apiErrorMessage } from "../api/error-copy";
import { sessionPort } from "../auth/session-store";
import { API_BASE_URL } from "../config/api";
import { Body } from "../ui/components";
import {
  Callout,
  Choice,
  LinkText,
  PrimaryButton,
  Screen,
  SecondaryButton,
  Subtitle,
  TextField,
  Title,
} from "../ui/kit";
import { SPACE } from "../ui/theme";

import {
  buildClaimCommand,
  claimDisputeUrl,
  claimIdentifierFieldLabel,
  claimIdentifierKindLabel,
  claimIdentifierPlaceholder,
  claimInputMessage,
  claimSightingUrl,
  claimVariantBody,
  claimVariantHeadline,
  claimVariantTone,
} from "./claim-view-model";

/** One sentence per failure arm. No arm falls through to a generic shrug. */
function failureMessage(result: ApiResult<unknown>): string {
  switch (result.outcome) {
    case "api-error":
      return apiErrorMessage(result.code);
    case "unsupported-version":
      return "Esta versión de la app no puede leer esta respuesta. Actualizá la app.";
    case "malformed":
      return "La respuesta del servidor no se pudo leer.";
    case "unreachable":
      return "No pudimos conectarnos. Revisá tu conexión.";
    default:
      return "No pudimos completar la búsqueda.";
  }
}

type ScreenState =
  | { phase: "asking"; error: string | null }
  | { phase: "working" }
  | { phase: "result"; ack: PetClaimLookupAckV1; error: string | null }
  | { phase: "claimed"; petToken: string; petName: string };

export function ClaimScreen({ onOpenPet }: { onOpenPet: (publicToken: string) => void }) {
  // NOTHING IS PRESELECTED for the kind — `Choice`'s own rule, and the web's
  // radio defaults to microchip. Here it defaults to microchip too, because
  // unlike a transfer's reason this is not a choice with consequences: it says
  // which field you are about to fill, and both are re-derivable by tapping.
  const [kind, setKind] = useState<PetClaimIdentifierKind>("microchip");
  const [value, setValue] = useState("");
  const [state, setState] = useState<ScreenState>({ phase: "asking", error: null });

  // THE IDENTIFIER LIVES IN THIS COMPONENT AND NOWHERE ELSE. It is not written
  // to AsyncStorage, not logged, and not carried in a route param: the 15-digit
  // chip is the evidence that authorizes a claim, and `/p/{token}` deliberately
  // renders "Microchip: Sí/No" and never the number.
  const run = useCallback(
    async (command: "lookup" | "claim_free") => {
      const draft = buildClaimCommand(command, kind, value);
      if (!draft.ok) {
        const message = claimInputMessage(draft.code);
        setState((current) =>
          current.phase === "result"
            ? { ...current, error: message }
            : { phase: "asking", error: message },
        );
        return;
      }

      setState({ phase: "working" });
      const result = await sendPetClaimCommand(sessionPort, draft.input);

      if (result.outcome !== "ok") {
        const message = failureMessage(result);
        // BACK TO THE FORM, not to a dead screen: whatever failed, the person
        // still holds the number and the next thing they will do is try again.
        setState({ phase: "asking", error: message });
        return;
      }

      if (result.payload.command === "lookup") {
        setState({ phase: "result", ack: result.payload, error: null });
        return;
      }
      setState({
        phase: "claimed",
        // THE TOKEN THE WRITER RESOLVED, never one this screen was holding —
        // the lookup does not even carry one for a free animal, precisely so
        // that this cannot be got wrong.
        petToken: result.payload.petToken,
        petName: result.payload.petName,
      });
    },
    [kind, value],
  );

  if (state.phase === "claimed") {
    return (
      <Screen>
        <Title>{`${state.petName} ahora está a tu nombre`}</Title>
        <Callout tone="ok">
          <Body>
            Registramos la mascota a tu nombre. Ya podés ver su credencial y completar su libreta
            sanitaria.
          </Body>
        </Callout>
        <PrimaryButton label={`Ver a ${state.petName}`} onPress={() => onOpenPet(state.petToken)} />
      </Screen>
    );
  }

  if (state.phase === "result") {
    const { ack } = state;
    // Hoisted out of the JSX because a narrowing on `ack.petToken` does not
    // survive into a callback — and the callback is exactly where it is needed.
    const sightingToken = ack.variant === "lost" ? ack.petToken : null;
    return (
      <Screen>
        <Title>¿Es esta tu mascota?</Title>
        <Callout tone={claimVariantTone(ack.variant)} title={claimVariantHeadline(ack)}>
          <Body>{claimVariantBody(ack)}</Body>
        </Callout>

        {state.error === null ? null : (
          <Callout tone="err">
            <Body>{state.error}</Body>
          </Callout>
        )}

        {/* THE ONLY PLACE THIS SCREEN OFFERS A CLAIM, and the condition is the
            SERVER'S boolean. Not `variant === "free"`, not a local guess: see
            the view-model's header. */}
        {ack.canClaim ? (
          <PrimaryButton label="Reclamarla" onPress={() => void run("claim_free")} />
        ) : null}

        {/* The two ways out that are not a claim, each drawn only where it
            leads somewhere. Both open the BROWSER, and say so. */}
        {sightingToken === null ? null : (
          <View style={styles.secondary}>
            <LinkText
              accessibilityHint="Se abre en el navegador"
              onPress={() => void Linking.openURL(claimSightingUrl(API_BASE_URL, sightingToken))}
            >
              Reportar un avistaje
            </LinkText>
          </View>
        )}

        {ack.variant === "active_owner" ? (
          <View style={styles.secondary}>
            <LinkText
              accessibilityHint="Se abre en el navegador"
              onPress={() => void Linking.openURL(claimDisputeUrl(API_BASE_URL))}
            >
              Iniciar una disputa desde la web
            </LinkText>
          </View>
        ) : null}

        {/* CLEARS THE FIELD, like the web's own "Volver" (which resets the
            wizard to `INITIAL`). Two reasons and only one of them is parity: the
            label says ANOTHER identifier, and — the one that is not cosmetic —
            the value sitting in that field is the evidence that authorizes a
            claim. Leaving a stranger's 15-digit chip on screen after the answer
            was "ya tiene dueño/a" is the one thing this screen holds that
            `/p/{token}` deliberately refuses to render. */}
        <SecondaryButton
          label="Buscar otro identificador"
          onPress={() => {
            setValue("");
            setState({ phase: "asking", error: null });
          }}
        />
      </Screen>
    );
  }

  const working = state.phase === "working";

  return (
    <Screen>
      <Title>Reclamar una mascota</Title>
      <Subtitle>
        Si tu mascota ya está registrada por su microchip o su tatuaje, podés vincularla a tu
        cuenta.
      </Subtitle>

      <Choice
        label="¿Cómo la identificás?"
        required
        options={PET_CLAIM_IDENTIFIER_KINDS}
        selected={kind}
        optionLabel={claimIdentifierKindLabel}
        disabled={working}
        onSelect={(next) => {
          setKind(next);
          // The value is cleared with the kind, exactly as the web's radio does:
          // a tattoo code left in the field under "Microchip" is a value that
          // will be refused for a reason the person did not cause.
          setValue("");
          setState({ phase: "asking", error: null });
        }}
      />

      <TextField
        label={claimIdentifierFieldLabel(kind)}
        required
        // `number-pad` for the chip, because the value is fifteen digits and a
        // full keyboard is fifteen chances to type a letter. NOT `numeric`,
        // which on iOS carries a decimal separator this value can never have.
        keyboardType={kind === "microchip" ? "number-pad" : "default"}
        autoCapitalize="characters"
        autoCorrect={false}
        // Mono for both: these are codes read off a sticker or a tattoo, and
        // proportional digits are how a 1 and a 7 get transcribed wrong.
        mono
        editable={!working}
        maxLength={kind === "microchip" ? 15 : undefined}
        placeholder={claimIdentifierPlaceholder(kind)}
        value={value}
        onChangeText={(next) => {
          setValue(next);
          if (state.phase === "asking" && state.error !== null) {
            setState({ phase: "asking", error: null });
          }
        }}
      />

      {state.phase === "asking" && state.error !== null ? (
        <Callout tone="err">
          <Body>{state.error}</Body>
        </Callout>
      ) : null}

      <PrimaryButton
        label={working ? "Buscando…" : "Buscar"}
        disabled={working || value.trim().length === 0}
        onPress={() => void run("lookup")}
      />

      {/* THE CAMERA'S ABSENCE, said in the interface and not only in a comment.
          Somebody standing in front of a stray with a chip reader is the person
          this screen is for, and telling them the number goes in by hand is
          better than letting them hunt for a scan button that is not there. */}
      <Callout tone="neutral" title="Todavía no se puede escanear">
        <Body>
          Por ahora el número se escribe a mano. Podés leerlo del carnet, del lector del veterinario
          o de la etiqueta del chip.
        </Body>
      </Callout>
    </Screen>
  );
}

const styles = StyleSheet.create({
  secondary: { marginTop: SPACE.xs, marginBottom: SPACE.sm },
});
