// One pet, reached from the list — THREE faces, and the differences matter.
//
// The route is a thin shell: it resolves the path parameter, refuses to render
// without a session, and picks which face to show. All the honesty rules live in
// the three screens.
//
// WHY THREE AND NOT ONE. `CredentialScreen` renders the pet's PUBLIC credential
// — the anonymous document behind the QR, which looks identical to its owner and
// to a stranger who found the animal in the street. That is exactly what it is
// for, and exactly why an owner who opens it learns nothing they did not already
// know: it is the same page a finder sees.
//
// `OwnerFaceScreen` is what the person RESPONSIBLE for the animal sees — the
// alert strip, the compliance stamp, the reminders coming due, the arrangements
// they made. It is the web's `/mis-mascotas/{token}` chrome, over a bearer.
//
// `LibretaScreen` is the health record itself: what is coming due, and every
// asiento the animal has. THE WEB CALLS THESE TWO BY NAME — its profile is a
// card with two faces and the band above it reads "Credencial · frente" and
// "Libreta · dorso" — so the label here is the web's own word for that face, not
// a new one invented for a phone.
//
// None of the three is a superset of the others, and the layering is why:
// deleting the credential because the owner face "shows more" would take away
// the one screen an owner can hand to a stranger; deleting the libreta because
// the owner face shows a compliance stamp would take away the record the stamp
// is a summary OF. The default is the owner face, because that is the question
// someone opening their own pet is asking first.
//
// THE PARAMETER IS VALIDATED, not trusted. `useLocalSearchParams` is typed
// `string | string[]` because a path segment can legally repeat, and a bad value
// here would become a request for `/api/v1/pets/undefined/credential` — which the
// server answers 404, i.e. "no existe esa credencial", which is a lie about the
// pet rather than about the link. Better to say the link is broken.

import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useGate } from "../../src/auth/useGate";
import { CredentialScreen } from "../../src/credential/CredentialScreen";
import { LibretaScreen } from "../../src/pets/LibretaScreen";
import { OwnerFaceScreen } from "../../src/pets/OwnerFaceScreen";
import { ErrorNotice } from "../../src/ui/components";
import { FONTS } from "../../src/ui/fonts";
import { Screen } from "../../src/ui/kit";
import { COLORS, LEADING, RADIUS, SPACE, TOUCH_TARGET, TYPE } from "../../src/ui/theme";

type Face = "owner" | "libreta" | "credential";

// The labels say what each face IS, not what it does — "Credencial pública" and
// "Libreta" are the words the web uses for the same two documents, and the
// public-ness is the whole distinction between them.
const FACES: ReadonlyArray<{ key: Face; label: string }> = [
  { key: "owner", label: "Mi mascota" },
  { key: "libreta", label: "Libreta" },
  { key: "credential", label: "Credencial pública" },
];

export default function PetDetailRoute() {
  const gate = useGate();
  const params = useLocalSearchParams<{ publicToken?: string | string[] }>();
  const [face, setFace] = useState<Face>("owner");

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

  return (
    <>
      <FaceSwitcher face={face} onChange={setFace} />
      {face === "owner" ? <OwnerFaceScreen publicToken={publicToken} /> : null}
      {face === "libreta" ? <LibretaScreen publicToken={publicToken} /> : null}
      {face === "credential" ? <CredentialScreen publicToken={publicToken} /> : null}
    </>
  );
}

/**
 * The two-face switcher.
 *
 * `accessibilityRole="tab"` with `selected` state, so a screen reader announces
 * which face is showing rather than reading two buttons with no relationship.
 * The labels say what each face IS ("Credencial pública") rather than what it
 * does, because the public-ness is the whole distinction between them.
 */
function FaceSwitcher({ face, onChange }: { face: Face; onChange: (next: Face) => void }) {
  return (
    <View style={styles.tabs} accessibilityRole="tablist">
      {FACES.map((item) => {
        const selected = item.key === face;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(item.key)}
            style={[styles.tab, selected ? styles.tabOn : null]}
          >
            <Text style={selected ? styles.tabLabelOn : styles.tabLabel}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: "row",
    gap: SPACE.xs,
    paddingHorizontal: SPACE.xl2,
    paddingTop: SPACE.md,
    backgroundColor: COLORS.canvas,
  },
  tab: {
    flex: 1,
    minHeight: TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.canvas2,
    paddingHorizontal: SPACE.sm,
  },
  tabOn: { backgroundColor: COLORS.surface, borderColor: COLORS.borderStrong },
  tabLabel: {
    fontFamily: FONTS.sans,
    fontSize: TYPE.md,
    lineHeight: TYPE.md * LEADING.md,
    color: COLORS.inkMuted,
    textAlign: "center",
  },
  tabLabelOn: {
    fontFamily: FONTS.sansSemibold,
    fontSize: TYPE.md,
    lineHeight: TYPE.md * LEADING.md,
    color: COLORS.ink,
    textAlign: "center",
  },
});
