import { getSizePx, getStatusBadgeProps, getStatusRingClass } from "./Photo.helpers";
import type { PhotoSize, PhotoStatus } from "./Photo.helpers";

export type { PhotoSize, PhotoStatus };

/**
 * Pet photo with status-driven visual treatment.
 *
 * Status variants:
 *  - ok       → neutral gray ring
 *  - lost     → red ring + "perdida" pill
 *  - found    → green ring + "encontrada" pill
 *  - deceased → grayscale + dark ring + "en memoria" pill
 *
 * When `src` is omitted, renders the first 2 chars of `alt` as initials.
 *
 * Accessibility:
 *  - `alt` is always required — use the pet's name or a descriptive label.
 *  - Status pill text is visible for all users; not hidden behind aria attributes.
 */

export type PhotoProps = {
  status: PhotoStatus;
  size?: PhotoSize;
  src?: string;
  alt: string;
  className?: string;
};

const toneBadgeClasses: Record<"danger" | "success" | "neutral", string> = {
  danger: "bg-gob-danger/10 text-gob-danger",
  success: "bg-gob-success/10 text-gob-success",
  neutral: "bg-gob-surface-alt text-gob-text-gray",
};

export function Photo({ status, size = "md", src, alt, className = "" }: PhotoProps) {
  const px = getSizePx(size);
  const ringClass = getStatusRingClass(status);
  const badge = getStatusBadgeProps(status);
  const initials = alt.slice(0, 2).toUpperCase();

  return (
    <div className={`relative inline-block ${className}`.trim()}>
      {/* Photo or initials placeholder */}
      <div
        className={`rounded-full overflow-hidden flex items-center justify-center bg-gob-surface-alt ${ringClass}`}
        style={{ width: px, height: px }}
        aria-hidden={src ? "true" : undefined}
      >
        {src ? (
          <img src={src} alt={alt} width={px} height={px} className="w-full h-full object-cover" />
        ) : (
          <span
            className="font-semibold text-gob-text-gray select-none"
            style={{ fontSize: px * 0.3 }}
            aria-label={alt}
          >
            {initials}
          </span>
        )}
      </div>

      {/* Status pill — bottom-right */}
      {badge && (
        <span
          className={`
            absolute bottom-0 right-0 translate-x-1/4 translate-y-1/4
            inline-flex items-center rounded-full px-1.5 py-px
            text-[10px] font-semibold leading-none whitespace-nowrap
            ${toneBadgeClasses[badge.tone]}
          `}
        >
          {badge.label}
        </span>
      )}
    </div>
  );
}
