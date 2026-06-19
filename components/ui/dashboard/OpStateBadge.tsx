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
 * Icons that reinforce state meaning beyond color alone (WCAG 1.4.1 — color not
 * sole means of conveying information). Each icon is aria-hidden; the visible
 * text label already describes the state to screen readers.
 */
const STATE_ICONS: Record<State, string> = {
  published: "●",
  paused: "⏸",
  draft: "○",
  adopted: "★",
};

const STATE_LABELS: Record<State, string> = {
  published: "Publicado",
  paused: "Pausado",
  draft: "Borrador",
  adopted: "Adoptado",
};

/**
 * State badge for org pet pipeline states.
 *
 * A11y: meaning is conveyed by BOTH icon and text, not color alone (WCAG 1.4.1).
 * The icon is aria-hidden; the text label (or override) is the accessible name.
 *
 * Visually derived from .org-statebadge (redesign-a-org.css L27-31).
 * States: published · paused · draft · adopted.
 */
export function OpStateBadge({ state, label }: Props) {
  const resolvedLabel = label ?? STATE_LABELS[state];
  return (
    <span
      className={[
        "inline-flex items-center gap-[3px] rounded-[3px] border px-[7px] py-[2px]",
        "font-ln-mono text-[9px] font-bold uppercase tracking-[0.06em]",
        STATE_CLASSES[state],
      ].join(" ")}
    >
      <span aria-hidden="true">{STATE_ICONS[state]}</span>
      {resolvedLabel}
    </span>
  );
}
