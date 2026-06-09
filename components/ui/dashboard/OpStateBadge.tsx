type State = "published" | "paused" | "draft" | "adopted";

type Props = {
  state: State;
  /** Optional override label. Defaults to the state value. */
  label?: string;
};

const STATE_CLASSES: Record<State, string> = {
  published: "bg-ln-op-ok-bg text-ln-op-ok border-ln-op-ok-bd",
  paused: "bg-ln-op-warn-bg text-ln-op-warn border-ln-op-warn-bd",
  draft: "bg-ln-op-stripe text-ln-op-mute border-ln-op-line",
  adopted: "bg-ln-op-viol-bg text-ln-op-viol border-ln-op-viol-bd",
};

/**
 * State badge for org pet pipeline states.
 *
 * Visually derived from .org-statebadge (redesign-a-org.css L27-31).
 * States: published · paused · draft · adopted.
 */
export function OpStateBadge({ state, label }: Props) {
  return (
    <span
      className={[
        "inline-block rounded-[3px] border px-[7px] py-[2px]",
        "font-ln-mono text-[9px] font-bold uppercase tracking-[0.06em]",
        STATE_CLASSES[state],
      ].join(" ")}
    >
      {label ?? state}
    </span>
  );
}
