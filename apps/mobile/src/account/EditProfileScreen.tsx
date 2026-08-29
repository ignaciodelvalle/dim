// EDITAR MIS DATOS — the person's own name, phone, vet and emergency contact.
//
// WHY THE FOUR CONTACT FIELDS ARE HERE AND NOT ONLY ON THE PET
// ---------------------------------------------------------------------------
// A tester who opens their animal's "Editar" screen finds an emergency-contact
// block already — but that one is the pet-level OVERRIDE, and its own form says
// so: cleared, it falls back to "the account default". Until this screen
// existed, the phone had no way to set that default, so the fallback pointed at
// a value only a browser could write. Two pets meant typing the same vet twice.
//
// WHAT IS ABSENT, AND WHY EACH ONE IS
// ---------------------------------------------------------------------------
//   · THE AVATAR. It needs an image picker, which needs a native module, which
//     needs an EAS build — the pipeline the board rules out. The endpoint does
//     not carry an avatar URL either, deliberately: a payload holding one no
//     client can change would only be there to draw a control that cannot work.
//   · EMAIL, DNI, JURISDICTION, ROLE. None of them is editable on the web's own
//     form, and `GET /api/v1/me` withholds all four on purpose. This screen does
//     not get to be the place they leak onto a device.
//
// THE PHONE FORMAT IS A WARNING AND NOT A REFUSAL, which is the web's decision
// and the server's: `update-profile.ts` states it — "Older landlines, satellite
// phones, and foreign numbers all save without error." A native form that
// refused what the server accepts would be inventing a rule on behalf of
// somebody in Salta with a landline. So the hint is soft, the save is not
// blocked, and the copy matches `PhoneFormatWarning` on the web.
//
// CLEARING IS EXPLICIT AND THE THREE-WAY RULE SURVIVES THE ROUND TRIP. The
// server treats an omitted key as "leave it" and `""` as "clear it". This form
// renders all six fields, so it always sends all six — which means emptying a
// field really does clear it, and there is no case where a field this screen did
// not show gets erased by a save.

import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { MyProfileV1 } from "@dim/contract/api";
import {
  CONTACT_NAME_MAX_LENGTH,
  CONTACT_PHONE_MAX_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
  type MyProfileEditInput,
} from "@dim/contract/input";

import type { ApiResult } from "../api/client";
import { fetchMyProfile, saveMyProfile } from "../api/endpoints";
import { apiErrorMessage } from "../api/error-copy";
import { sessionPort } from "../auth/session-store";
import { Body, Card, Loading } from "../ui/components";
import { FONTS } from "../ui/fonts";
import { Callout, PrimaryButton, Screen, SecondaryButton, TextField, Title } from "../ui/kit";
import { COLORS, LEADING, SPACE, TYPE } from "../ui/theme";

import { type ProfileDraft, draftFrom, looksLikeArPhone, toEditInput } from "./profile-draft";

/**
 * One sentence per failure arm. No arm falls through to a generic shrug, and
 * none of them quotes anything the server sent.
 */
function failureMessage(result: ApiResult<unknown>): string {
  switch (result.outcome) {
    case "api-error":
      return apiErrorMessage(result.code);
    case "unsupported-version":
      return "Esta versión de la app no puede leer esta pantalla. Actualizá la app.";
    case "malformed":
      return "La respuesta del servidor no se pudo leer.";
    case "unreachable":
      return "No pudimos conectarnos. Revisá tu conexión.";
    default:
      return "No pudimos abrir tus datos.";
  }
}

type ScreenState = { phase: "loading" } | { phase: "ready" } | { phase: "failed"; message: string };

/** What just happened, for the line above the form. */
type Notice = { tone: "ok" | "err"; message: string } | null;

function PhoneHint({ value }: { value: string }) {
  if (value.trim().length === 0 || looksLikeArPhone(value)) return null;
  return (
    <Text style={styles.hint}>
      Formato inusual para Argentina — lo guardamos igual, revisalo si querés.
    </Text>
  );
}

export function EditProfileScreen() {
  const [state, setState] = useState<ScreenState>({ phase: "loading" });
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setState({ phase: "loading" });
    const result = await fetchMyProfile(sessionPort);
    if (result.outcome === "ok") {
      // THE DRAFT IS SEEDED FROM THE SERVER ON EVERY LOAD, including the re-read
      // after a save: the writer trims `displayName`, so the field has to end up
      // saying what was actually stored rather than what was typed.
      setDraft(draftFrom(result.payload as MyProfileV1));
      setState({ phase: "ready" });
      return;
    }
    setState({ phase: "failed", message: failureMessage(result) });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (input: MyProfileEditInput) => {
      setBusy(true);
      setNotice(null);
      const result = await saveMyProfile(sessionPort, input);
      setBusy(false);
      if (result.outcome !== "ok") {
        setNotice({ tone: "err", message: failureMessage(result) });
        return;
      }
      setNotice({ tone: "ok", message: "Tus datos fueron actualizados." });
      // Re-read rather than trust the draft: see `load`.
      await load();
    },
    [load],
  );

  if (state.phase === "loading") return <Loading label="Abriendo tus datos…" />;

  if (state.phase === "failed" || draft === null) {
    return (
      <Screen>
        <Title>Mis datos</Title>
        <Callout tone="err">
          <Text style={styles.calloutText}>
            {state.phase === "failed" ? state.message : "No pudimos abrir tus datos."}
          </Text>
        </Callout>
        <View style={styles.actions}>
          <SecondaryButton label="Reintentar" onPress={() => void load()} />
        </View>
      </Screen>
    );
  }

  const set = (field: keyof ProfileDraft) => (value: string) =>
    setDraft((current) => (current === null ? current : { ...current, [field]: value }));

  const nameLength = draft.displayName.trim().length;
  const nameUsable = nameLength >= DISPLAY_NAME_MIN_LENGTH && nameLength <= DISPLAY_NAME_MAX_LENGTH;

  return (
    <Screen>
      <Title>Mis datos</Title>

      {notice === null ? null : (
        <Callout tone={notice.tone === "ok" ? "ok" : "err"}>
          <Text style={styles.calloutText}>{notice.message}</Text>
        </Callout>
      )}

      <Card title="Cómo te mostramos">
        <TextField
          label="Nombre"
          required
          value={draft.displayName}
          onChangeText={set("displayName")}
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          placeholder="Tu nombre o apodo"
          editable={!busy}
        />
        {nameUsable ? null : (
          <Text style={styles.hint}>
            El nombre tiene que tener al menos {DISPLAY_NAME_MIN_LENGTH} caracteres.
          </Text>
        )}
        <TextField
          label="Teléfono"
          value={draft.phone}
          onChangeText={set("phone")}
          maxLength={CONTACT_PHONE_MAX_LENGTH}
          keyboardType="phone-pad"
          placeholder="+54 9 11 1234-5678"
          editable={!busy}
        />
        <PhoneHint value={draft.phone} />
      </Card>

      <Card title="A quién llamar">
        <Body>
          Estos son tus contactos por defecto. Cada mascota puede tener los suyos; si los dejás
          vacíos en la mascota, se usan estos.
        </Body>
        <TextField
          label="Veterinaria de cabecera"
          value={draft.preferredVetName}
          onChangeText={set("preferredVetName")}
          maxLength={CONTACT_NAME_MAX_LENGTH}
          editable={!busy}
        />
        <TextField
          label="Teléfono de la veterinaria"
          value={draft.preferredVetPhone}
          onChangeText={set("preferredVetPhone")}
          maxLength={CONTACT_PHONE_MAX_LENGTH}
          keyboardType="phone-pad"
          editable={!busy}
        />
        <PhoneHint value={draft.preferredVetPhone} />
        <TextField
          label="Contacto de emergencia"
          value={draft.emergencyContactName}
          onChangeText={set("emergencyContactName")}
          maxLength={CONTACT_NAME_MAX_LENGTH}
          editable={!busy}
        />
        <TextField
          label="Teléfono de emergencia"
          value={draft.emergencyContactPhone}
          onChangeText={set("emergencyContactPhone")}
          maxLength={CONTACT_PHONE_MAX_LENGTH}
          keyboardType="phone-pad"
          editable={!busy}
        />
        <PhoneHint value={draft.emergencyContactPhone} />
      </Card>

      <View style={styles.actions}>
        <PrimaryButton
          label={busy ? "Guardando…" : "Guardar cambios"}
          disabled={busy || !nameUsable}
          onPress={() => void save(toEditInput(draft))}
        />
      </View>

      <Text style={styles.footnote}>
        La foto de perfil, el correo y tu DNI se cambian desde la web. Esta pantalla edita sólo lo
        que ves acá.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { gap: SPACE.sm, marginTop: SPACE.sm },
  calloutText: {
    fontFamily: FONTS.sans,
    fontSize: TYPE.md,
    lineHeight: TYPE.md * LEADING.md,
    color: COLORS.ink,
  },
  hint: {
    fontFamily: FONTS.sans,
    fontSize: TYPE.sm,
    lineHeight: TYPE.sm * LEADING.sm,
    color: COLORS.inkMuted,
    marginTop: -SPACE.xs,
  },
  footnote: {
    fontFamily: FONTS.sans,
    fontSize: TYPE.sm,
    lineHeight: TYPE.sm * LEADING.sm,
    color: COLORS.inkMuted,
    marginTop: SPACE.lg,
  },
});
