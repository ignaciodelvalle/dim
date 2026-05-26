/**
 * Breadcrumb navigation component.
 *
 * Renders items separated by ›. The last item is treated as the current page
 * (aria-current="page") and is not rendered as a link even if `href` is provided.
 *
 * Server-renderable — no client directives needed.
 *
 * Accessibility:
 *  - Wrapped in <nav aria-label="Breadcrumb">.
 *  - Last item has aria-current="page".
 *  - Separator is aria-hidden to avoid reading aloud.
 */

export type Crumb = {
  href?: string;
  label: string;
};

export type CrumbsProps = {
  items: Crumb[];
  className?: string;
};

export function Crumbs({ items, className = "" }: CrumbsProps) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-x-1 text-sm text-gob-text-muted">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: breadcrumb items are positionally stable
            <li key={index} className="flex items-center gap-x-1">
              {isLast || !item.href ? (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className={isLast ? "font-medium text-gob-text" : undefined}
                >
                  {item.label}
                </span>
              ) : (
                <a
                  href={item.href}
                  className="hover:text-gob-text hover:underline transition-colors"
                >
                  {item.label}
                </a>
              )}
              {!isLast && (
                <span aria-hidden="true" className="select-none">
                  ›
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
