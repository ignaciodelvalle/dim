// `useReturnKeyChain` — what each position in the chain promises.
//
// Middle fields advance focus WITHOUT closing the keyboard; the last field
// says "done", blurs, and fires `onDone` only when the screen opted in.
// The refs must be stable across renders — a chain that re-created them
// would detach every TextInput mid-typing.

import { describe, expect, it, jest } from "@jest/globals";
import { render } from "@testing-library/react-native";
import type { TextInput } from "react-native";

import { useReturnKeyChain } from "./use-return-key-chain";

type Chain = ReturnType<typeof useReturnKeyChain>;

let chain: Chain;

function Harness({ count, onDone }: { count: number; onDone?: () => void }) {
  chain = useReturnKeyChain(count, onDone);
  return null;
}

describe("the three props per position", () => {
  it("middle fields say NEXT and keep the keyboard open; the last says DONE and blurs", () => {
    render(<Harness count={3} />);
    expect(chain(0).returnKeyType).toBe("next");
    expect(chain(0).submitBehavior).toBe("submit");
    expect(chain(1).returnKeyType).toBe("next");
    expect(chain(2).returnKeyType).toBe("done");
    expect(chain(2).submitBehavior).toBe("blurAndSubmit");
  });

  it("submit on a middle field focuses the NEXT field through its ref", () => {
    render(<Harness count={2} />);
    const focus = jest.fn();
    chain(1).inputRef.current = { focus } as unknown as TextInput;
    chain(0).onSubmitEditing();
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it("submit on the last field fires onDone when the screen opted in, and only then", () => {
    const onDone = jest.fn();
    render(<Harness count={2} onDone={onDone} />);
    chain(0).onSubmitEditing();
    expect(onDone).not.toHaveBeenCalled();
    chain(1).onSubmitEditing();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("without onDone, the last field's submit is a quiet blur — no crash", () => {
    render(<Harness count={1} />);
    expect(() => chain(0).onSubmitEditing()).not.toThrow();
  });
});

describe("ref stability", () => {
  it("hands back the SAME ref object across renders, so inputs stay attached", () => {
    const screen = render(<Harness count={2} />);
    const first = chain(0).inputRef;
    screen.rerender(<Harness count={2} />);
    expect(chain(0).inputRef).toBe(first);
  });
});
