import Image from "next/image";
import type { ReactNode } from "react";
import type { LnPetStatus } from "./Chip";
import { LnStatusFlag } from "./StatusFlag";

/**
 * Libreta Nacional RegRow — pet registry row.
 *
 * Grid: 64px (photo) | 1fr (info) | auto (species+chevron)
 * - Circular photo with status dot
 * - Serif name + status flag + breed + next-event line
 * - Right: species label + chevron
 * - Left 3px border colored by status (lost/sick/pregnant)
 * - Hover: stripe background
 *
 * Used in: Inicio (64px), Mis Mascotas (72px variant)
 */

// ---------- Pet photo placeholder ----------------------------------------

export type LnPetPhotoProps = {
  src?: string;
  alt: string;
  status?: LnPetStatus;
  size?: number;
  radius?: "full" | "md";
};

export function LnPetPhoto({ src, alt, status, size = 56, radius = "full" }: LnPetPhotoProps) {
  const radiusClass = radius === "full" ? "rounded-full" : "rounded-[6px]";
  return (
    <div
      className={[
        "relative grid flex-shrink-0 place-items-center overflow-hidden border border-[var(--color-ln-line-strong)]",
        radiusClass,
        // Diagonal placeholder pattern (matches handoff)
        "bg-[repeating-linear-gradient(135deg,#e7e2d6_0_6px,#f3f0e7_6px_12px)]",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ width: size, height: size }}
    >
      {src ? (
        <Image src={src} alt={alt} fill sizes={`${size}px`} className="object-cover" />
      ) : (
        <span className="font-[var(--font-ln-mono)] text-[7px] uppercase tracking-[.04em] text-[var(--color-ln-mute)]">
          foto
        </span>
      )}

      {/* Status dot */}
      {status && (
        <span
          className={[
            "absolute bottom-[2px] right-[2px] h-[12px] w-[12px] rounded-full border-2 border-[var(--color-ln-card)]",
            status === "ok" && "bg-[var(--color-ln-ok)]",
            status === "sick" && "rounded-[2px] bg-[var(--color-ln-warn)]",
            status === "lost" && "rounded-[1px] bg-[var(--color-ln-err)]",
            status === "pregnant" && "bg-[var(--color-ln-rosa)]",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

// ---------- RegRow --------------------------------------------------------

const leftBorderByStatus: Partial<Record<LnPetStatus, string>> = {
  lost: "before:bg-[var(--color-ln-err)]",
  sick: "before:bg-[var(--color-ln-warn)]",
  pregnant: "before:bg-[var(--color-ln-rosa)]",
};

export type LnRegRowProps = {
  photoSrc?: string;
  name: string;
  status?: LnPetStatus;
  breed?: string;
  nextLine?: ReactNode;
  species?: string;
  photoSize?: number;
  href?: string;
  onClick?: () => void;
  className?: string;
};

export function LnRegRow({
  photoSrc,
  name,
  status = "ok",
  breed,
  nextLine,
  species,
  photoSize = 56,
  href,
  onClick,
  className = "",
}: LnRegRowProps) {
  const leftBorder = leftBorderByStatus[status] ?? "";

  const rowClasses = [
    "relative grid items-center gap-[16px] border-b border-[var(--color-ln-line-2)] px-[18px] py-[15px]",
    "text-inherit no-underline transition-colors hover:bg-[var(--color-ln-stripe)]",
    "last:border-b-0",
    // Left accent border via ::before
    "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:content-['']",
    leftBorder,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const gridStyle = { gridTemplateColumns: `${photoSize + 8}px 1fr auto` };

  const inner = (
    <>
      <LnPetPhoto src={photoSrc} alt={name} status={status} size={photoSize} />

      {/* Info column */}
      <div className="min-w-0">
        <div className="flex items-center gap-[10px]">
          <span className="font-[var(--font-ln-serif)] text-lg font-semibold leading-tight tracking-[-0.01em] text-[var(--color-ln-ink)]">
            {name}
          </span>
          {status && <LnStatusFlag status={status} />}
        </div>
        {breed && <p className="mt-[1px] text-[12.5px] text-[var(--color-ln-mute)]">{breed}</p>}
        {nextLine && (
          <div className="mt-[7px] inline-flex items-center gap-[7px] text-sm text-[var(--color-ln-ink-2)]">
            {nextLine}
          </div>
        )}
      </div>

      {/* Right column */}
      <div className="flex items-center gap-[6px] font-[var(--font-ln-mono)] text-[11px] whitespace-nowrap text-[var(--color-ln-mute)]">
        {species && <span>{species}</span>}
        <span aria-hidden="true">›</span>
      </div>
    </>
  );

  if (href) {
    return (
      <a href={href} className={rowClasses} style={gridStyle}>
        {inner}
      </a>
    );
  }

  return (
    <div
      className={rowClasses}
      style={gridStyle}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {inner}
    </div>
  );
}

// ---------- Registry container -------------------------------------------

export function LnRegistry({
  children,
  className = "",
}: { children: ReactNode; className?: string }) {
  return (
    <div
      className={[
        "overflow-hidden rounded-[4px] border border-[var(--color-ln-line)] bg-[var(--color-ln-card)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
