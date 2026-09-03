// One pet, as ONE two-sided document — the native mirror of the web's card.
//
// TWO FACES, NOT THREE (PO decision, 2026-08-28): Credencial · frente (the
// owner's front face, `OwnerCredentialFace`) and Libreta · dorso
// (`LibretaScreen`), inside the shared `DocumentChromeNative` — band, mono
// title, situation chip, turn button, hairline frame. The public credential is
// a ROUTE one tap from the QR block and from "Más", not a face; see the route
// shell (`app/mascotas/[publicToken].tsx`) for the argument with the old
// three-face layering.
//
// THE TURN IS ANIMATED, AND THE INSTANT SWAP IS STILL A FIRST-CLASS PATH — it
// is what a reader who asked for less motion gets, and what this document
// shipped with. `DocumentTurn.tsx` owns the motion and the preference; see its
// header for why the preference lives in a ref instead of state.
//
// TWO FACE VARIABLES, AND THE DIFFERENCE MATTERS. `face` is what the reader
// REQUESTED (a button press changes it, and the turn button's toggle state
// reports it at once); `turn.paintedFace` is what is actually on the sheet, and
// it lags by the ~205ms the sheet spends standing edge-on. Everything that
// renders content — the sheet's body, the band's subtitle, and the sections
// BELOW the card — follows the painted face, so the whole screen changes at the
// single moment the document turns over rather than in two visible waves.
//
// WHO OWNS WHAT. This screen owns the one scroll view, the owner-detail read
// (the front face's data AND the band chip's situation — the chip must
// survive a flip to the back face, so the read cannot live inside the face
// that unmounts), and the face state. The libreta face brings its own read,
// failure copy and write, unchanged. The situation chip's key/tone/icon/label
// are decided SERVER-SIDE (`OwnerPetSituationV1`); nothing here re-derives
// them.
//
// NOT CACHED — the deliberate v1 decision the old owner face recorded, still
// true: `credential-cache.ts` justifies caching the PUBLIC document precisely
// because it is public; this payload (open cases, caretaker names, the
// household's other animals) is a different privacy class and none of that
// reasoning carries over. A failed read says so and offers a retry.

import type { OwnerPetDetailV1, OwnerPetSituationV1 } from "@dim/contract/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { ApiResult } from "../api/client";
import { fetchOwnerPetDetail } from "../api/endpoints";
import { apiErrorMessage } from "../api/error-copy";
import { sessionPort } from "../auth/session-store";
import { Body, Card, Loading } from "../ui/components";
import { FONTS } from "../ui/fonts";
import { Screen, pullToRefresh } from "../ui/kit";
import { COLORS, LEADING, SPACE, TYPE } from "../ui/theme";
import { DocumentChromeNative, type DocumentFace } from "./DocumentChromeNative";
import { TurningSheet, useDocumentTurn } from "./DocumentTurn";
import { LibretaScreen } from "./LibretaScreen";
import { OwnerCredentialFace, OwnerExtraSections } from "./OwnerFace";
import { type OwnerFaceView, buildOwnerFaceView } from "./owner-face-view-model";

type OwnerState =
  | { phase: "loading" }
  | { phase: "ready"; view: OwnerFaceView }
  | { phase: "failed"; message: string };

/** One sentence per failure arm. No arm may fall through to a generic shrug. */
function failureMessage(result: ApiResult<OwnerPetDetailV1>): string {
  switch (result.outcome) {
    case "api-error":
      return apiErrorMessage(result.code);
    case "unsupported-version":
      return "Esta versión de la app no puede leer los datos de esta mascota. Actualizá la app.";
    case "malformed":
      return "La respuesta del servidor no se pudo leer.";
    case "unreachable":
      return "No pudimos conectarnos. Revisá tu conexión.";
    default:
      return "No pudimos leer esta mascota.";
  }
}

/** The band chip's payload, read off the view — null when the read failed or
 *  the situation is the default (no pill rather than a green one). */
function situationOf(view: OwnerFaceView | null): OwnerPetSituationV1 | null {
  if (view === null || view.status.state !== "ok") return null;
  return view.status.data.situation;
}

export function PetDocumentScreen({ publicToken }: { publicToken: string }) {
  const [face, setFace] = useState<DocumentFace>("credencial");
  const turn = useDocumentTurn(face);
  const painted = turn.paintedFace;
  const [owner, setOwner] = useState<OwnerState>({ phase: "loading" });
  // Guards against a stale response overwriting a newer one after two fast
  // pulls — the same generation counter CredentialScreen uses, and for the
  // same reason. (It guarded a double-tapped "Actualizar" button until
  // 2026-09-03; the race is identical, the gesture is not.)
  const generation = useRef(0);
  /**
   * Bumped by every pull-to-refresh, and it is what gives the LIBRETA face a
   * way to reload now that its own "Actualizar" button is gone.
   *
   * The two faces have SEPARATE reads — this screen owns the owner detail,
   * `LibretaScreen` owns the ledger — so refreshing one does not refresh the
   * other, and a single pull has to reach both. Keying the libreta by this
   * counter remounts it, which re-runs its read; that is cheap and correct for
   * a read-only list, and it holds no state a remount would lose.
   */
  const [refreshNonce, setRefreshNonce] = useState(0);

  const load = useCallback(async () => {
    const mine = ++generation.current;
    setOwner({ phase: "loading" });
    const result = await fetchOwnerPetDetail(sessionPort, publicToken);
    if (mine !== generation.current) return;
    if (result.outcome === "ok") {
      setOwner({ phase: "ready", view: buildOwnerFaceView(result.payload) });
      return;
    }
    setOwner({ phase: "failed", message: failureMessage(result) });
  }, [publicToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const view = owner.phase === "ready" ? owner.view : null;

  return (
    // PULL TO REFRESH, and no button. A national credential's only blue
    // full-width control used to say "Actualizar" — the loudest thing on the
    // document was reload. The gesture Android already has does the same job
    // and costs no pixels. See `pullToRefresh` in the kit.
    <Screen
      refreshControl={pullToRefresh(() => {
        setRefreshNonce((n) => n + 1);
        void load();
      }, owner.phase === "loading")}
    >
      <View style={styles.masthead}>
        {/* The "Ficha del dueño" eyebrow was deleted on 2026-09-03: an
            ALL-CAPS mono label floating above the document with no heading
            under it, saying what the band says two lines lower ("Libreta
            Sanitaria Nacional / Credencial · frente"). */}
        {/* The viewer line — a caretaker or a foster reading this document
            needs to know WHY some things are missing from it; an unexplained
            gap reads as a bug. */}
        {view === null ? null : <Text style={styles.viewerLine}>{view.viewerLabel}</Text>}
      </View>

      <TurningSheet turn={turn}>
        <DocumentChromeNative
          face={painted}
          isLibretaActive={face === "libreta"}
          onTurn={() => setFace((current) => (current === "credencial" ? "libreta" : "credencial"))}
          situation={situationOf(view)}
        >
          {painted === "credencial" ? (
            <FrontFaceBody state={owner} />
          ) : (
            <LibretaScreen key={refreshNonce} publicToken={publicToken} />
          )}
        </DocumentChromeNative>
      </TurningSheet>

      {painted === "credencial" && view !== null ? <OwnerExtraSections view={view} /> : null}
    </Screen>
  );
}

/** The front face's three phases, inside the chrome. A failed read renders its
 *  refusal INSIDE the card — the document is still a document, just unread. */
function FrontFaceBody({ state }: { state: OwnerState }) {
  if (state.phase === "loading") {
    return (
      <View style={styles.facePad}>
        <Loading label="Leyendo la ficha…" />
      </View>
    );
  }
  if (state.phase === "failed") {
    return (
      <View style={styles.facePad}>
        <Card title="No disponible">
          <Body>{state.message}</Body>
        </Card>
      </View>
    );
  }
  return <OwnerCredentialFace view={state.view} />;
}

const styles = StyleSheet.create({
  masthead: { gap: SPACE.xs },
  viewerLine: {
    fontFamily: FONTS.sansMedium,
    fontSize: TYPE.md,
    lineHeight: TYPE.md * LEADING.md,
    color: COLORS.inkSoft,
  },
  // The `.ln-sec` phone padding, for the two non-face bodies (loading/failed).
  facePad: { paddingVertical: 20, paddingHorizontal: 18 },
});
