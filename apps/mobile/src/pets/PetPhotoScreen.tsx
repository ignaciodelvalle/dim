// LA FOTO DE LA CREDENCIAL — elegirla, mirarla, subirla. Detrás de la costura.
//
// THE WHOLE SCREEN IS WRITTEN AND TESTED AGAINST `image-picker-port.ts`. In a
// build without `expo-image-picker` (every build until the PO ships the EAS
// build the handback doc describes) the port is the honest default: this
// screen draws a callout naming the web instead of a control that cannot work,
// which is the same rule the claim screen follows for its scanner. The day the
// module ships, `setImagePickerPort()` runs at bootstrap and every state below
// simply becomes reachable — nothing here changes.
//
// REVIEW BEFORE UPLOAD, deliberately. The OS picker returns and the bytes stay
// on the device while the person looks at a preview and decides. Two reasons:
// the upload costs real data on a phone plan and the review step is where a
// wrong tap gets caught for free; and the credential is the animal's public
// face, so "¿es esta?" is worth one screen. The web's edit form does the same
// with its preview box.
//
// THE THREE NETWORK STEPS LIVE IN `pet-photo-upload-flow.ts`, the words in
// `pet-photo-view-model.ts`, and this file only decides what each outcome
// looks like. A failure lands back on the REVIEW step with the picked photo
// intact: whatever failed, the person still holds the photo, and the next
// thing they will do is try again — re-picking would punish them for a network
// error.

import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import type { PetPhotoUpdatedV1 } from "@dim/contract/api";

import { sessionPort } from "../auth/session-store";
import { getImagePickerPort } from "../native/image-picker-port";
import { Body } from "../ui/components";
import { Callout, PrimaryButton, Screen, SecondaryButton, Subtitle, Title } from "../ui/kit";
import { COLORS, RADIUS, SPACE, TYPE } from "../ui/theme";

import { runPetPhotoUpload } from "./pet-photo-upload-flow";
import {
  type AcceptedImage,
  type PetPhotoUploadStep,
  acceptPickedImage,
  petPhotoFailureMessage,
  petPhotoStepLabel,
} from "./pet-photo-view-model";

type ScreenState =
  | { phase: "choosing"; error: string | null }
  /** The OS picker is up. Its UI is the module's; this screen just waits. */
  | { phase: "picking" }
  | { phase: "review"; image: AcceptedImage; error: string | null }
  | { phase: "uploading"; image: AcceptedImage; step: PetPhotoUploadStep }
  | { phase: "done"; photo: PetPhotoUpdatedV1 };

export function PetPhotoScreen({ publicToken }: { publicToken: string }) {
  const router = useRouter();
  const [state, setState] = useState<ScreenState>({ phase: "choosing", error: null });

  const pick = useCallback(async () => {
    setState({ phase: "picking" });
    const result = await getImagePickerPort().pickImage();
    const outcome = acceptPickedImage(result);
    if (outcome.ok) {
      setState({ phase: "review", image: outcome.image, error: null });
      return;
    }
    // `message: null` is a cancel: back to the start with nothing to say.
    setState({ phase: "choosing", error: outcome.message });
  }, []);

  const upload = useCallback(async (image: AcceptedImage) => {
    const result = await runPetPhotoUpload(sessionPort, publicToken, image, (step) =>
      setState({ phase: "uploading", image, step }),
    );
    if (result.outcome === "done") {
      setState({ phase: "done", photo: result.photo });
      return;
    }
    // BACK TO REVIEW WITH THE PHOTO INTACT — see the header. The sentence
    // already says what a retry would honestly do for this particular failure.
    setState({ phase: "review", image, error: petPhotoFailureMessage(result.failure) });
  }, [publicToken]);

  // THE BUILD WITHOUT THE MODULE. Read fresh on every render (a test swaps the
  // port per case; the app swaps it once, at bootstrap).
  if (!getImagePickerPort().available) {
    return (
      <Screen>
        <Title>Foto de la mascota</Title>
        <Callout tone="neutral" title="Todavía no se puede subir una foto desde la app">
          <Body>
            En esta versión la foto se carga desde la web: entrá a Mis mascotas, abrí la mascota y
            tocá Editar. La credencial la va a mostrar acá apenas la subas.
          </Body>
        </Callout>
      </Screen>
    );
  }

  if (state.phase === "done") {
    return (
      <Screen>
        <Title>Foto actualizada</Title>
        <Callout tone="ok" title="La credencial ya muestra la foto nueva">
          <Body>
            {state.photo.replacedPrevious
              ? "Reemplaza a la que estaba. La vas a ver en la credencial y en tu lista de mascotas."
              : "La vas a ver en la credencial y en tu lista de mascotas."}
          </Body>
        </Callout>
        <Image
          source={{ uri: state.photo.photoUrl }}
          style={styles.preview}
          resizeMode="cover"
          accessibilityRole="image"
          accessibilityLabel="La foto nueva de la mascota"
        />
        <PrimaryButton label="Listo" onPress={() => router.back()} />
      </Screen>
    );
  }

  if (state.phase === "review" || state.phase === "uploading") {
    const uploading = state.phase === "uploading";
    return (
      <Screen>
        <Title>¿Usar esta foto?</Title>
        {state.image.previewUri === null ? (
          // An adapter may offer no preview URI. The upload still works; the
          // box says what is missing instead of drawing a broken image.
          <View style={[styles.preview, styles.previewEmpty]}>
            <Text style={styles.previewEmptyText}>Sin vista previa</Text>
          </View>
        ) : (
          <Image
            source={{ uri: state.image.previewUri }}
            style={styles.preview}
            resizeMode="cover"
            accessibilityRole="image"
            accessibilityLabel="Vista previa de la mascota"
          />
        )}

        {!uploading && state.error !== null ? (
          <Callout tone="err">
            <Body>{state.error}</Body>
          </Callout>
        ) : null}

        <PrimaryButton
          label={uploading ? petPhotoStepLabel(state.step) : "Usar esta foto"}
          disabled={uploading}
          onPress={() => void upload(state.image)}
        />
        <SecondaryButton label="Elegir otra" disabled={uploading} onPress={() => void pick()} />
      </Screen>
    );
  }

  const picking = state.phase === "picking";
  return (
    <Screen>
      <Title>Foto de la mascota</Title>
      <Subtitle>
        Es la imagen de la credencial: la ve cualquiera que escanee el QR. Elegí una donde se
        reconozca al animal.
      </Subtitle>

      {state.phase === "choosing" && state.error !== null ? (
        <Callout tone="err">
          <Body>{state.error}</Body>
        </Callout>
      ) : null}

      <PrimaryButton
        label={picking ? "Abriendo tus fotos…" : "Elegir una foto"}
        disabled={picking}
        onPress={() => void pick()}
      />
      {/* The web's own format line, with the third type the bucket accepts. */}
      <Body>JPG, PNG o WebP, hasta 5 MB.</Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // The web's preview is 72px inside a form row; here the photo IS the page,
  // so it takes the credential's own aspect: a square, like `.ln-photo`.
  preview: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: RADIUS.control,
    backgroundColor: COLORS.stripe,
  },
  previewEmpty: { alignItems: "center", justifyContent: "center" },
  previewEmptyText: { fontSize: TYPE.md, color: COLORS.inkMuted, padding: SPACE.lg },
});
