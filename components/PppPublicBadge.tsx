// Public-facing PPP badge — Tier 0 public credential page.
//
// Renders an amber warning card when the pet is subject to the PPP regime
// (Ley CABA 4078 / Ley Prov 14.107). This status is public by law — the
// public has a right to know (Art. 4, Ley CABA 4078).
//
// Intentionally minimal: no attestation block, no requirements list, no CTAs.
// Those are owner-context concerns shown only on the owner profile (PpPCard).

import { buildPppDisclaimerLine, buildPppHeadline } from "@/lib/ppp-public-badge";

interface Props {
  petName: string;
  breed: string | null;
}

export function PppPublicBadge({ petName, breed }: Props) {
  return (
    <section
      aria-label="Animal Potencialmente Peligroso"
      className="rounded-2xl border border-gob-warning bg-gob-warning/10 p-4 space-y-2  "
    >
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-gob-warning-text ">{buildPppHeadline()}</h2>
        <span className="text-[10px] font-medium uppercase tracking-wider text-gob-warning-text ">
          Ley 4078 · Prov 14.107
        </span>
      </header>
      <p className="text-xs text-gob-warning-text ">{buildPppDisclaimerLine(petName, breed)}</p>
    </section>
  );
}
