// DeltaGlyph — the up/down/flat delta direction glyph shared by PanoramaKpiTile
// and KpiChips. Both places render a KpiDelta["direction"] next to a period
// delta figure; this was copy-pasted verbatim (cheap dedupe, consistency pass).
//
// up/down route through the Icon registry (no bare triangle glyphs); "flat"
// has no lucide equivalent worth a registry entry for a single fullwidth "＝"
// (not a banned symbol-as-icon character).

import { Icon } from "@/components/Icon";
import type { KpiDelta } from "@/src/modules/panorama/application/get-panorama-kpis";

export function DeltaGlyph({ direction }: { direction: KpiDelta["direction"] }) {
  if (direction === "flat") return <span aria-hidden="true">＝</span>;
  return <Icon name={direction === "up" ? "chevron-up" : "chevron-down"} size="sm" decorative />;
}
