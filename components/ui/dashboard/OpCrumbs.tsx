import Link from "next/link";

export type CrumbItem = {
  label: string;
  href?: string;
  /** Renders the label in font-ln-mono font-bold (for doc codes like req_4Kx9). */
  mono?: boolean;
};

type Props = {
  items: CrumbItem[];
};

const ChevronRight = () => (
  <svg
    width={8}
    height={8}
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    className="flex-shrink-0"
  >
    <path
      d="M9 18l6-6-6-6"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * Topbar breadcrumb strip.
 *
 * - Intermediate items: linked (if href provided), muted color.
 * - Last item: bold, ink color. Mono items use font-ln-mono.
 */
export function OpCrumbs({ items }: Props) {
  return (
    <nav aria-label="Ruta de navegación">
      <ol className="flex items-center gap-1.5 text-[12px] text-ln-op-mute">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          const textClass = isLast
            ? item.mono
              ? "font-ln-mono font-bold text-ln-op-ink"
              : "font-semibold text-ln-op-ink"
            : "text-ln-op-mute";

          return (
            <li key={`${item.label}-${i}`} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight />}
              {isLast || !item.href ? (
                <span className={textClass}>{item.label}</span>
              ) : (
                <Link href={item.href} className={`no-underline hover:text-ln-op-ink ${textClass}`}>
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
