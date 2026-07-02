// PetActionRow — icon-only action bar for the pet profile (ADR-12b, ADR-17b).
// Extracted from page.tsx (Phase 4) so it's independently unit-testable
// (touch targets / aria-labels — a11y-touch-targets.test.tsx) without
// needing the full RSC page's DB fetches.
//
// [Anotar][Compartir][Perdida|Encontrada][Chapita][Más] — active owner, 5
// icons. Deceased (ADR-15/REQ-9.3) collapses to [Compartir][Más] only — no
// Anotar (closed life record), no Perdida/Encontrada (moot), no Chapita
// (nonsensical for a deceased pet). Every icon is aria-label + title only,
// no visible text (mirrors FlipCard's "Girar" affordance pattern).
//
// prefetch=false on every icon (CRITICAL-1 fix, verify-report #617): each
// icon only ever changes `?sheet=` on the SAME route — there is no separate
// page/data to prefetch, so the default eager Link prefetch bought nothing.
// Left at the default, all 5 icons (plus every other always-mounted Link on
// this page — see EventTimeline.tsx/CaseBadge.tsx) fire background RSC
// prefetch fetches concurrently on mount. That concurrent fetch pressure is
// the documented trigger for a known Next.js 15.5.x App Router
// production-mode router defect: a clicked Link's own navigation fetch can
// resolve 200 with a fully valid flight payload, yet the client router
// silently drops it — no history.pushState, no re-render, no error —
// reproduced live via Playwright network+history instrumentation against
// the :3000 prod build. Disabling prefetch here removes this page's biggest
// source of that pressure at the exact moment a user is most likely to
// click one of these icons (first interaction after page load).

import { Icon } from "@/components/Icon";
import Link from "next/link";

type Props = {
  petPublicToken: string;
  isOwner: boolean;
  isDeceased: boolean;
  petStatus: "active" | "lost" | "deceased";
};

const ICON_LINK_BASE =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-3 no-underline transition-colors";
const PRIMARY = "bg-[var(--color-ln-azul)] text-white hover:bg-ln-azul-700";
const SECONDARY =
  "border-[3px] border-[var(--color-ln-line)] bg-[var(--color-ln-card)] text-[var(--color-ln-azul)] hover:border-[var(--color-ln-line-strong)]";
const DANGER_OUTLINE =
  "border-[3px] border-ln-err bg-transparent text-ln-err hover:bg-ln-err hover:text-white";
const SUCCESS = "bg-ln-ok text-white hover:opacity-90";

export function PetActionRow({ petPublicToken, isOwner, isDeceased, petStatus }: Props) {
  return (
    <div data-section="action-row" className="flex flex-wrap gap-2">
      {isOwner && !isDeceased && (
        <Link
          href={`/mis-mascotas/${petPublicToken}?sheet=anotar`}
          prefetch={false}
          aria-label="Anotar"
          title="Anotar"
          className={`${ICON_LINK_BASE} ${PRIMARY}`}
        >
          <Icon name="edit" size="sm" decorative />
        </Link>
      )}
      <Link
        href={`/mis-mascotas/${petPublicToken}?sheet=compartir`}
        prefetch={false}
        aria-label="Compartir"
        title="Compartir"
        className={`${ICON_LINK_BASE} ${SECONDARY}`}
      >
        <Icon name="share" size="sm" decorative />
      </Link>
      {petStatus === "active" && (
        <Link
          href={`/mis-mascotas/${petPublicToken}?sheet=marcar-perdida`}
          prefetch={false}
          aria-label="Marcar como perdida"
          title="Marcar como perdida"
          className={`${ICON_LINK_BASE} ${DANGER_OUTLINE}`}
        >
          <Icon name="alert-triangle" size="sm" decorative />
        </Link>
      )}
      {petStatus === "lost" && (
        <Link
          href={`/mis-mascotas/${petPublicToken}?sheet=marcar-encontrada`}
          prefetch={false}
          aria-label="Marcar encontrada"
          title="Marcar encontrada"
          className={`${ICON_LINK_BASE} ${SUCCESS}`}
        >
          <Icon name="check" size="sm" decorative />
        </Link>
      )}
      {isOwner && !isDeceased && (
        <Link
          href={`/mis-mascotas/${petPublicToken}?sheet=chapita`}
          prefetch={false}
          aria-label="Chapita"
          title="Chapita"
          className={`${ICON_LINK_BASE} ${SECONDARY}`}
        >
          <Icon name="tag" size="sm" decorative />
        </Link>
      )}
      {isOwner && (
        <Link
          href={`/mis-mascotas/${petPublicToken}?sheet=mas`}
          prefetch={false}
          aria-label="Más"
          title="Más"
          className={`${ICON_LINK_BASE} ${SECONDARY}`}
        >
          <Icon name="ellipsis" size="sm" decorative />
        </Link>
      )}
    </div>
  );
}
