// Mis mascotas — the list, and the four things it can honestly be.
//
//   loading   — a spinner with a sentence, not a bare spinner.
//   failed    — the server's own message plus a retry. NEVER an empty list:
//               "no tenés mascotas" is a claim, and a failed read has not earned
//               the right to make it. That confusion is the single most likely
//               way this screen could lie, because both states draw nothing.
//   empty     — an invitation, not a statement of absence.
//   loaded    — the pets, plus an honest note when the server TRUNCATED the list.
//
// `truncated` DESERVES ITS OWN NOTE. The payload carries `total` and a boolean
// saying the array is shorter than it; a client that ignores both shows a
// complete-looking list that is not complete. There is no pagination in v1, so
// the honest answer is to say how many are missing and where to see them, not to
// pretend the page is the set.
//
// ONE READ PER MOUNT, PLUS PULL-TO-REFRESH. No focus-refetch and no timer: the
// endpoint runs a 120/min per-user limiter, and a list that re-reads every time
// it comes back into view spends that on nothing.

import type { MyPetsV1, MyPetsV1Item } from "@dim/contract/api";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Image, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

import { type ApiResult, apiFailureMessage } from "../../src/api/client";
import { fetchMyPets } from "../../src/api/endpoints";
import { sessionPort } from "../../src/auth/session-store";
import { useGate } from "../../src/auth/useGate";
import { petStatusLabel } from "../../src/credential/credential-view-model";
import { speciesLabel } from "../../src/pets/species";
import { Body, Card, EmptyState, ErrorNotice, Loading } from "../../src/ui/components";
import { FONTS } from "../../src/ui/fonts";
import { PrimaryButton, Screen, SecondaryButton } from "../../src/ui/kit";
import { ROUTES, credentialRoute } from "../../src/ui/routes";
import { COLORS, LEADING, RADIUS, SPACE, TRACKING, TYPE } from "../../src/ui/theme";

type ListState = { phase: "loading" } | { phase: "loaded"; result: ApiResult<MyPetsV1> };

export default function MisMascotasScreen() {
  const gate = useGate();
  const router = useRouter();
  const [state, setState] = useState<ListState>({ phase: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  // A read started before the screen unmounted must not write into a dead
  // component; and two overlapping reads must not race to be last.
  const generation = useRef(0);

  const load = useCallback(async (mode: "initial" | "refresh") => {
    const mine = ++generation.current;
    if (mode === "initial") setState({ phase: "loading" });
    else setRefreshing(true);

    const result = await fetchMyPets(sessionPort);
    if (mine !== generation.current) return;
    setState({ phase: "loaded", result });
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load("initial");
  }, [load]);

  // Reload after a registration: coming back to this screen with a pet that is
  // not in the list is the one moment where a stale cache is obviously wrong.
  // Guarded by a ref so the FIRST focus does not double-read on mount.
  const mounted = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!mounted.current) {
        mounted.current = true;
        return;
      }
      void load("refresh");
    }, [load]),
  );

  if (!gate.allowed) return gate.element;

  return (
    <Screen
      refreshControl={
        // Pull-to-refresh stays, and the spinner is tinted: the platform default
        // is a grey that reads as chrome from another app on a cream page.
        <RefreshControl
          colors={[COLORS.accent]}
          onRefresh={() => void load("refresh")}
          refreshing={refreshing}
          tintColor={COLORS.accent}
        />
      }
    >
      {state.phase === "loading" ? (
        <Loading label="Buscando tus mascotas…" />
      ) : (
        <ListBody
          result={state.result}
          onRetry={() => void load("initial")}
          onOpen={(token) => router.push(credentialRoute(token))}
          onRegister={() => router.push(ROUTES.altaMascota)}
        />
      )}

      <View style={styles.footer}>
        <SecondaryButton label="Ajustes" onPress={() => router.push(ROUTES.ajustes)} />
      </View>
    </Screen>
  );
}

function ListBody({
  result,
  onRetry,
  onOpen,
  onRegister,
}: {
  result: ApiResult<MyPetsV1>;
  onRetry: () => void;
  onOpen: (publicToken: string) => void;
  onRegister: () => void;
}) {
  if (result.outcome !== "ok") {
    // NOT an empty list. See the header.
    return (
      <ErrorNotice message={apiFailureMessage(result) ?? "No se pudo leer."} onRetry={onRetry} />
    );
  }

  const { pets, total, truncated } = result.payload;

  if (pets.length === 0) {
    return (
      <EmptyState
        headline="Todavía no registraste ninguna mascota"
        body="Registrala una vez y su credencial queda disponible para siempre: un QR que cualquiera puede escanear si se pierde."
        actionLabel="Registrar una mascota"
        onAction={onRegister}
      />
    );
  }

  return (
    <>
      {pets.map((pet) => (
        <PetRow key={pet.publicToken} pet={pet} onPress={() => onOpen(pet.publicToken)} />
      ))}

      {truncated ? (
        <Card title="La lista está incompleta">
          <Body>
            {`Estamos mostrando ${pets.length} de ${total}. Todavía no hay paginado en la app: para ver el resto entrá desde la web.`}
          </Body>
        </Card>
      ) : null}

      <PrimaryButton label="Registrar otra mascota" onPress={onRegister} />
    </>
  );
}

function PetRow({ pet, onPress }: { pet: MyPetsV1Item; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${pet.name}, ${speciesLabel(pet.species)}, ${petStatusLabel(pet.status)}`}
      onPress={onPress}
      style={styles.petRow}
    >
      {pet.photoUrl === null ? (
        // A placeholder that says WHAT is missing. A grey square says nothing,
        // and photo upload is a later work unit (M4b) rather than a bug.
        <View style={styles.photoFallback}>
          <Text style={styles.photoFallbackText}>Sin foto</Text>
        </View>
      ) : (
        <Image
          source={{ uri: pet.photoUrl }}
          style={styles.photo}
          accessibilityIgnoresInvertColors
        />
      )}

      <View style={styles.petText}>
        <Text style={styles.petName}>{pet.name}</Text>
        <Text style={styles.petSpecies}>{speciesLabel(pet.species)}</Text>
      </View>

      <StatusChip status={pet.status} />
    </Pressable>
  );
}

/**
 * The status chip.
 *
 * "Perdida" and "Fallecida" are not decorated the same way as "Activa", and that
 * is not styling: a lost animal is the state the whole product exists for, and a
 * list where it reads like every other row buries the one row that matters.
 */
function StatusChip({ status }: { status: MyPetsV1Item["status"] }) {
  const tone = status === "lost" ? styles.chipAlert : styles.chipQuiet;
  const label = status === "lost" ? styles.chipAlertLabel : styles.chipQuietLabel;
  return (
    <View style={[styles.chip, tone]}>
      <Text style={[styles.chipLabel, label]}>{petStatusLabel(status)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: { marginTop: SPACE.lg },
  petRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.control,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACE.md,
  },
  photo: { width: 52, height: 52, borderRadius: RADIUS.control, backgroundColor: COLORS.stripe },
  photoFallback: {
    width: 52,
    height: 52,
    borderRadius: RADIUS.control,
    backgroundColor: COLORS.stripe,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  photoFallbackText: {
    fontFamily: FONTS.mono,
    fontSize: TYPE.xs,
    letterSpacing: TYPE.xs * TRACKING.wide,
    color: COLORS.inkFaint,
  },
  petText: { flex: 1, gap: 2 },
  // Serif, because a pet's name is the display element of this row — the same
  // role the web gives it on the credential document.
  petName: {
    fontFamily: FONTS.serif,
    fontSize: TYPE.lg,
    lineHeight: TYPE.lg * LEADING.lg,
    color: COLORS.ink,
  },
  petSpecies: { fontFamily: FONTS.sans, fontSize: TYPE.md, color: COLORS.inkMuted },
  chip: {
    borderRadius: RADIUS.chip,
    borderWidth: 1,
    paddingHorizontal: SPACE.sm,
    paddingVertical: SPACE.xs,
  },
  chipQuiet: { backgroundColor: COLORS.stripe, borderColor: COLORS.border },
  chipAlert: { backgroundColor: COLORS.dangerSurface, borderColor: COLORS.dangerBorder },
  chipLabel: {
    fontFamily: FONTS.monoSemibold,
    fontSize: TYPE.xs,
    letterSpacing: TYPE.xs * TRACKING.wider,
    textTransform: "uppercase",
  },
  chipQuietLabel: { color: COLORS.inkMuted },
  chipAlertLabel: { color: COLORS.danger },
});
