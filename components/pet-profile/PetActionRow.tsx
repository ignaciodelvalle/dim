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
// Each icon opens its sheet via SheetTriggerLink — the History API directly
// (pushSheetUrl), NOT a Link/router.push soft navigation. prefetch=false
// mitigation (8078eaed/b953c9c1) did not fully fix the underlying Next.js
// 15.5.x App Router production-mode defect where a clicked Link's own
// navigation fetch can resolve 200 with a fully valid flight payload yet the
// client router silently drops it — no history.pushState, no re-render, no
// error (engram #621, verify-report #617 CRITICAL-1). Sheets are this page's
// primary interaction surface, so they leave the router's hot path entirely:
// see lib/ui/sheet-nav.ts for the full mechanism (Next's native shallow
// routing over window.history.pushState/replaceState).

import { Icon } from "@/components/Icon";
import { SheetTriggerLink } from "@/components/pet-profile/SheetTriggerLink";

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
        <SheetTriggerLink
          href={`/mis-mascotas/${petPublicToken}?sheet=anotar`}
          aria-label="Anotar"
          title="Anotar"
          className={`${ICON_LINK_BASE} ${PRIMARY}`}
        >
          <Icon name="edit" size="sm" decorative />
        </SheetTriggerLink>
      )}
      <SheetTriggerLink
        href={`/mis-mascotas/${petPublicToken}?sheet=compartir`}
        aria-label="Compartir"
        title="Compartir"
        className={`${ICON_LINK_BASE} ${SECONDARY}`}
      >
        <Icon name="share" size="sm" decorative />
      </SheetTriggerLink>
      {petStatus === "active" && (
        <SheetTriggerLink
          href={`/mis-mascotas/${petPublicToken}?sheet=marcar-perdida`}
          aria-label="Marcar como perdida"
          title="Marcar como perdida"
          className={`${ICON_LINK_BASE} ${DANGER_OUTLINE}`}
        >
          <Icon name="alert-triangle" size="sm" decorative />
        </SheetTriggerLink>
      )}
      {petStatus === "lost" && (
        <SheetTriggerLink
          href={`/mis-mascotas/${petPublicToken}?sheet=marcar-encontrada`}
          aria-label="Marcar encontrada"
          title="Marcar encontrada"
          className={`${ICON_LINK_BASE} ${SUCCESS}`}
        >
          <Icon name="check" size="sm" decorative />
        </SheetTriggerLink>
      )}
      {isOwner && !isDeceased && (
        <SheetTriggerLink
          href={`/mis-mascotas/${petPublicToken}?sheet=chapita`}
          aria-label="Chapita"
          title="Chapita"
          className={`${ICON_LINK_BASE} ${SECONDARY}`}
        >
          <Icon name="tag" size="sm" decorative />
        </SheetTriggerLink>
      )}
      {isOwner && (
        <SheetTriggerLink
          href={`/mis-mascotas/${petPublicToken}?sheet=mas`}
          aria-label="Más"
          title="Más"
          className={`${ICON_LINK_BASE} ${SECONDARY}`}
        >
          <Icon name="ellipsis" size="sm" decorative />
        </SheetTriggerLink>
      )}
    </div>
  );
}
