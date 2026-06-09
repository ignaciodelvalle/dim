type Props = {
  /** Short code displayed in mono bold (e.g. "UNIVERSAL", "CABA"). */
  code: string;
  /** Optional secondary label (e.g. scope descriptor). */
  label?: string;
  /** "default" = navy (gob tier); "superadmin" = danger red; "org" = teal (org tier). */
  variant?: "default" | "superadmin" | "org";
};

/**
 * Scope chip shown in the topbar to identify the operator's jurisdiction.
 */
export function OpScopeChip({ code, label, variant = "default" }: Props) {
  const bgClass =
    variant === "superadmin"
      ? "bg-ln-op-danger"
      : variant === "org"
        ? "bg-[var(--color-ln-tl-rail)]"
        : "bg-ln-op-navy";

  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-[4px] px-[10px] py-1",
        bgClass,
        "text-[11px] text-white",
      ].join(" ")}
    >
      <span className="font-ln-mono font-bold tracking-[0.04em]">{code}</span>
      {label && (
        <span className="text-[10px] uppercase tracking-[0.04em] text-ln-op-rail-mute">
          · {label}
        </span>
      )}
    </span>
  );
}
