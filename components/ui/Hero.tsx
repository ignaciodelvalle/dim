import type { ReactNode } from "react";
import type { LnPetStatus } from "./Chip";
import { LnPetPhoto } from "./RegRow";
import { LnStatusFlag } from "./StatusFlag";

/**
 * Libreta Nacional Hero — pet profile blue band.
 *
 * Structure:
 *  - Azul-900 → azul → celeste diagonal gradient band (86px tall) with
 *    diagonal texture overlay and "LIBRETA SANITARIA NACIONAL" watermark
 *  - Photo (132px, radius-6) overlapping the band by 50px
 *  - Name (serif 32px) + status flag
 *  - Breed text
 *  - Tags row (microchip, sterilized, location, etc.)
 *  - Action buttons (right side)
 */

export type LnHeroTag = {
  key: string;
  label: string;
  icon?: ReactNode;
  variant?: "celeste" | "gray";
};

export type LnHeroProps = {
  name: string;
  status?: LnPetStatus;
  breed?: string;
  photoSrc?: string;
  tags?: LnHeroTag[];
  actions?: ReactNode;
  className?: string;
};

export function LnHero({
  name,
  status = "ok",
  breed,
  photoSrc,
  tags = [],
  actions,
  className = "",
}: LnHeroProps) {
  return (
    <div
      className={[
        "mb-[24px] overflow-hidden rounded-[4px] border border-[var(--color-ln-line)] bg-[var(--color-ln-card)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Blue gradient band */}
      <div
        className="relative h-[86px]"
        style={{
          background:
            "repeating-linear-gradient(135deg,rgba(255,255,255,.5) 0 1px,transparent 1px 9px)," +
            "linear-gradient(120deg,var(--color-ln-azul-900),var(--color-ln-azul) 60%,var(--color-ln-celeste))",
        }}
        aria-hidden="true"
      >
        {/* Watermark */}
        <span className="absolute bottom-[8px] right-[16px] font-[var(--font-ln-mono)] text-[9px] uppercase tracking-[.24em] text-white/60">
          LIBRETA SANITARIA NACIONAL
        </span>
      </div>

      {/* Main content — negative margin to overlap the band */}
      <div className="flex items-end gap-[22px] px-[24px] pb-[22px]" style={{ marginTop: -50 }}>
        {/* Photo overlapping band */}
        <LnPetPhoto src={photoSrc} alt={name} status={status} size={132} radius="md" />

        {/* Info */}
        <div className="min-w-0 flex-1 pb-[4px]">
          <div className="flex items-center gap-[14px]">
            <h1 className="m-0 font-[var(--font-ln-serif)] text-[32px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ln-ink)]">
              {name}
            </h1>
            {status && <LnStatusFlag status={status} />}
          </div>

          {breed && <p className="mt-[3px] text-[14px] text-[var(--color-ln-mute)]">{breed}</p>}

          {tags.length > 0 && (
            <div className="mt-[12px] flex flex-wrap gap-[7px]">
              {tags.map((tag) => {
                const isCeleste = tag.variant !== "gray";
                return (
                  <span
                    key={tag.key}
                    className={[
                      "inline-flex items-center gap-[6px] rounded-full border px-[10px] py-[3px] text-[11.5px] font-medium",
                      isCeleste
                        ? "border-[var(--color-ln-celeste-100)] bg-[var(--color-ln-celeste-050)] text-[var(--color-ln-azul-700)]"
                        : "border-[var(--color-ln-line)] bg-[var(--color-ln-stripe)] text-[var(--color-ln-ink-2)]",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {tag.icon}
                    {tag.label}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Actions */}
        {actions && (
          <div className="flex flex-shrink-0 items-end gap-[8px] pb-[8px]">{actions}</div>
        )}
      </div>
    </div>
  );
}
