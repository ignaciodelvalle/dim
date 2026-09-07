// The guard between a filled form and the Android back gesture.
//
// QOL 2026-09-01 (first-5-minutes): the alta wizard is six steps, and hardware
// back — or the header arrow, or the iOS swipe — discarded ALL of it silently.
// A tester three steps into registering their real pet loses everything to a
// gesture the platform teaches them to make. `beforeRemove` is React
// Navigation's own seam for exactly this (expo-router re-exports the
// navigation object that emits it), so every way of leaving funnels through
// one confirm.
//
// Lives in src/ rather than inline in app/alta.tsx because app/ is outside
// jest's roots — a guard nobody can test is a guard the next refactor deletes
// without noticing (that is how the class this repo calls "fence-shaped"
// starts).

import { useCallback, useEffect, useRef } from "react";
import { Alert } from "react-native";

type BeforeRemoveEvent<A> = {
  preventDefault: () => void;
  data: { action: A };
};

/**
 * Structural, generic over the ACTION type so the real navigation object's
 * `dispatch` (which takes React Navigation's action union) type-checks without
 * this module importing react-navigation types — the action flows from the
 * event straight back into dispatch and is never inspected here.
 */
type GuardableNavigation<A> = {
  addListener: (type: "beforeRemove", cb: (e: BeforeRemoveEvent<A>) => void) => () => void;
  dispatch: (action: A) => void;
};

/**
 * The words the confirm uses. One shape, so every writer screen asks the same
 * question in the same order and only the noun changes.
 *
 * `DISCARD_COPY.alta` is the wizard's original wording, kept verbatim: it is
 * the one this app has shipped and the one its test pins. `DISCARD_COPY.form`
 * is the general one — "Salir sin guardar" rather than "Salir del alta",
 * because most writer screens are a single form and there is nothing to "seguir
 * cargando" on them.
 */
export type DiscardCopy = { title: string; body: string; stay: string; leave: string };

export const DISCARD_COPY = {
  alta: {
    title: "¿Salir del alta?",
    body: "Lo que cargaste hasta acá se pierde.",
    stay: "Seguir cargando",
    leave: "Salir",
  },
  form: {
    title: "¿Salir sin guardar?",
    body: "Lo que escribiste hasta acá se pierde.",
    stay: "Seguir editando",
    leave: "Salir",
  },
} as const satisfies Record<string, DiscardCopy>;

/**
 * Confirm-before-discard on any navigation away while `dirty`.
 *
 * Returns `allowLeave` — call it right before a PROGRAMMATIC exit that must
 * not be intercepted (the post-submit `router.replace` to the credential:
 * blocking one's own success navigation would trap the person on a form whose
 * pet already exists).
 *
 * `copy` defaults to the ALTA wording for exactly one reason: alta was the only
 * consumer when this was written, and a default that changed its sentence would
 * be a copy change disguised as a refactor. Every new consumer passes
 * `DISCARD_COPY.form`.
 */
export function useDiscardGuard<A>(
  navigation: GuardableNavigation<A>,
  dirty: boolean,
  copy: DiscardCopy = DISCARD_COPY.alta,
) {
  const allowedRef = useRef(false);

  useEffect(() => {
    return navigation.addListener("beforeRemove", (e) => {
      if (!dirty || allowedRef.current) return;
      e.preventDefault();
      Alert.alert(copy.title, copy.body, [
        { text: copy.stay, style: "cancel" },
        {
          text: copy.leave,
          style: "destructive",
          onPress: () => {
            allowedRef.current = true;
            navigation.dispatch(e.data.action);
          },
        },
      ]);
    });
  }, [navigation, dirty, copy]);

  // Stable identity so a caller may list it in a useCallback deps array
  // without re-creating that callback every render.
  const allowLeave = useCallback(() => {
    allowedRef.current = true;
  }, []);

  return { allowLeave };
}
