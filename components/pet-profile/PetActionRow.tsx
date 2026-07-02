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
import { iconCircleButtonClass } from "@/components/ui/IconCircleButton";

type Props = {
  petPublicToken: string;
  isOwner: boolean;
  isDeceased: boolean;
  petStatus: "active" | "lost" | "deceased";
};

// wave-3 D5 (design-system audit finding 4): the circular icon-button shape
// itself (44×44 min touch target, rounded-full, centered) and its named
// color variants now live in the shared iconCircleButtonClass (also used by
// FlipCard's "Girar" affordance) — this file only adds its own `px-3`
// (harmless no-op given the fixed min-w-11 box, kept for exact parity) and
// `no-underline` (needed since these render as <a> via SheetTriggerLink).
const LINK_EXTRA = "px-3 no-underline";

export function PetActionRow({ petPublicToken, isOwner, isDeceased, petStatus }: Props) {
  return (
    <div data-section="action-row" className="flex flex-wrap gap-2">
      {isOwner && !isDeceased && (
        <SheetTriggerLink
          href={`/mis-mascotas/${petPublicToken}?sheet=anotar`}
          aria-label="Anotar"
          title="Anotar"
          className={iconCircleButtonClass("primary", LINK_EXTRA)}
        >
          <Icon name="edit" size="sm" decorative />
        </SheetTriggerLink>
      )}
      <SheetTriggerLink
        href={`/mis-mascotas/${petPublicToken}?sheet=compartir`}
        aria-label="Compartir"
        title="Compartir"
        className={iconCircleButtonClass("secondary", LINK_EXTRA)}
      >
        <Icon name="share" size="sm" decorative />
      </SheetTriggerLink>
      {petStatus === "active" && (
        <SheetTriggerLink
          href={`/mis-mascotas/${petPublicToken}?sheet=marcar-perdida`}
          aria-label="Marcar como perdida"
          title="Marcar como perdida"
          className={iconCircleButtonClass("danger-outline", LINK_EXTRA)}
        >
          <Icon name="alert-triangle" size="sm" decorative />
        </SheetTriggerLink>
      )}
      {petStatus === "lost" && (
        <SheetTriggerLink
          href={`/mis-mascotas/${petPublicToken}?sheet=marcar-encontrada`}
          aria-label="Marcar encontrada"
          title="Marcar encontrada"
          className={iconCircleButtonClass("success", LINK_EXTRA)}
        >
          <Icon name="check" size="sm" decorative />
        </SheetTriggerLink>
      )}
      {isOwner && !isDeceased && (
        <SheetTriggerLink
          href={`/mis-mascotas/${petPublicToken}?sheet=chapita`}
          aria-label="Chapita"
          title="Chapita"
          className={iconCircleButtonClass("secondary", LINK_EXTRA)}
        >
          <Icon name="tag" size="sm" decorative />
        </SheetTriggerLink>
      )}
      {isOwner && (
        <SheetTriggerLink
          href={`/mis-mascotas/${petPublicToken}?sheet=mas`}
          aria-label="Más"
          title="Más"
          className={iconCircleButtonClass("secondary", LINK_EXTRA)}
        >
          <Icon name="ellipsis" size="sm" decorative />
        </SheetTriggerLink>
      )}
    </div>
  );
}
