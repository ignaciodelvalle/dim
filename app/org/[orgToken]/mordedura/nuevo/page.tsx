// ---------------------------------------------------------------------------
// WIRED (sprint 4 PR-045 — 2026-05-27)
//
// Form is now a 4-step wizard with SuccessScreen on submit (10-day
// observation reminder). Org dashboard surfacing remains pending — when a
// "Mordeduras" CTA lands, add a nav entry in
// `components/layout/nav-presets.ts`.
// ---------------------------------------------------------------------------

import Link from "next/link";

import { OpCrumbs } from "@/components/ui/dashboard";
import { reportBiteFromOrgAction } from "@/src/modules/surveillance/actions";

import { OrgBiteForm } from "./OrgBiteForm";

// Org-side bite reporting. Capability `bite.report` is enforced inside the
// action — if the caller lacks it the form submit returns an error message
// rather than failing silently.
export default async function NewOrgBitePage({
  params,
}: {
  params: Promise<{ orgToken: string }>;
}) {
  const { orgToken } = await params;
  const boundAction = reportBiteFromOrgAction.bind(null, orgToken);

  return (
    <div className="max-w-2xl space-y-6">
      <OpCrumbs
        items={[{ label: "Panel", href: `/org/${orgToken}` }, { label: "Reportar mordedura" }]}
      />

      <header className="space-y-2">
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Reportar mordedura</h1>
        <p className="text-[13px] text-ln-op-mute">
          Registrar una mordedura que presenciaste o conocés clínicamente. Inicia automáticamente el
          período de observación antirrábica de 10 días según la legislación vigente.
        </p>
      </header>

      <OrgBiteForm action={boundAction} orgToken={orgToken} />
    </div>
  );
}
