// The guard, as every writer screen now gets it — one test instead of twelve.
//
// `use-discard-guard.test.tsx` (src/pets) pins the POLICY against a two-method
// fake: it answers "does a dirty form stop the exit, does a clean one not, does
// `allowLeave` let a programmatic exit through". This file pins the BINDING: the
// wrapper reads the router's navigation object, subscribes to the same event,
// and carries the form wording rather than the alta wizard's.
//
// Why that is worth its own file: the wrapper is the only place in `src/` that
// imports expo-router, and the failure it exists to prevent — a screen that
// looks guarded and silently is not — is invisible from the policy's side.

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { render } from "@testing-library/react-native";
import { Alert, Text } from "react-native";

type RemoveEvent = { preventDefault: () => void; data: { action: unknown } };

const mockListeners: ((event: RemoveEvent) => void)[] = [];
const mockDispatched: unknown[] = [];

jest.mock("expo-router", () => ({
  useNavigation: () => ({
    addListener: (_type: string, cb: (event: RemoveEvent) => void) => {
      mockListeners.push(cb);
      return () => undefined;
    },
    dispatch: (action: unknown) => {
      mockDispatched.push(action);
    },
  }),
}));

import { DISCARD_COPY } from "../pets/use-discard-guard";
import { useDraftDiscardGuard } from "./use-draft-discard-guard";

function Form({ dirty }: { dirty: boolean }) {
  useDraftDiscardGuard(dirty);
  return <Text>form</Text>;
}

/** Fire the back gesture at the listener the guard registered. */
function pressBack(): { prevented: boolean } {
  let prevented = false;
  const event: RemoveEvent = {
    preventDefault: () => {
      prevented = true;
    },
    data: { action: { type: "POP" } },
  };
  for (const listener of mockListeners) listener(event);
  return { prevented };
}

let alerts: { title: string; body?: string; buttons?: { text?: string }[] }[] = [];

beforeEach(() => {
  mockListeners.length = 0;
  mockDispatched.length = 0;
  alerts = [];
  jest
    .spyOn(Alert, "alert")
    .mockImplementation((title: string, body?: string, buttons?: { text?: string }[]) => {
      alerts.push({ title, body, buttons });
    });
});

describe("useDraftDiscardGuard", () => {
  it("stops the back gesture on a form that has been typed in", () => {
    render(<Form dirty />);
    expect(mockListeners).toHaveLength(1);

    expect(pressBack().prevented).toBe(true);
    expect(alerts).toHaveLength(1);
    // The FORM wording, not the alta wizard's: there is nothing to "seguir
    // cargando" on a single form, and "¿Salir del alta?" on the denuncia screen
    // would name a flow the person is not in.
    expect(alerts[0]?.title).toBe(DISCARD_COPY.form.title);
    expect(alerts[0]?.body).toBe(DISCARD_COPY.form.body);
    expect(alerts[0]?.buttons?.map((button) => button.text)).toEqual([
      DISCARD_COPY.form.stay,
      DISCARD_COPY.form.leave,
    ]);
  });

  it("lets an untouched form go without a word", () => {
    // The control that makes the test above mean something. A guard that always
    // asks is a guard that gets dismissed without reading, and it would fire on
    // every person who opened a screen and changed their mind.
    render(<Form dirty={false} />);
    expect(pressBack().prevented).toBe(false);
    expect(alerts).toHaveLength(0);
  });

  it("subscribes through the ROUTER's navigation object", () => {
    // The binding, which is the only thing this file adds over the policy test:
    // a wrapper that built its own object, or that read the wrong hook, would
    // pass every assertion above against a listener nobody ever fires.
    render(<Form dirty />);
    expect(mockListeners).toHaveLength(1);
    pressBack();
    // Nothing dispatched yet — the person has not answered the question.
    expect(mockDispatched).toEqual([]);
  });
});
