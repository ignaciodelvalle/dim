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
 * Confirm-before-discard on any navigation away while `dirty`.
 *
 * Returns `allowLeave` — call it right before a PROGRAMMATIC exit that must
 * not be intercepted (the post-submit `router.replace` to the credential:
 * blocking one's own success navigation would trap the person on a form whose
 * pet already exists).
 */
export function useDiscardGuard<A>(navigation: GuardableNavigation<A>, dirty: boolean) {
  const allowedRef = useRef(false);

  useEffect(() => {
    return navigation.addListener("beforeRemove", (e) => {
      if (!dirty || allowedRef.current) return;
      e.preventDefault();
      Alert.alert("¿Salir del alta?", "Lo que cargaste hasta acá se pierde.", [
        { text: "Seguir cargando", style: "cancel" },
        {
          text: "Salir",
          style: "destructive",
          onPress: () => {
            allowedRef.current = true;
            navigation.dispatch(e.data.action);
          },
        },
      ]);
    });
  }, [navigation, dirty]);

  // Stable identity so a caller may list it in a useCallback deps array
  // without re-creating that callback every render.
  const allowLeave = useCallback(() => {
    allowedRef.current = true;
  }, []);

  return { allowLeave };
}
