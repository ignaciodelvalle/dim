// ---------------------------------------------------------------------------
// DEFERRED BY DESIGN (audit-internal-roles-pages PR2/9 — 2026-05-26)
//
// This page exists but is NOT reachable from any nav or dashboard CTA. The
// underlying flow (bite reports submitted from org context) is not yet wired
// end-to-end. Keep this page intact — when the flow lands, add a nav entry
// in `components/poncho/Layout/nav-presets.ts` or a CTA on the org dashboard.
//
// Wire when org bite-reporting capability is added to the nav surface.
//
// Audited: 2026-05-26. Re-evaluate during next role audit.
// ---------------------------------------------------------------------------

import Link from "next/link";

import { reportBiteFromOrgAction } from "@/app/actions/bite";

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
    <main className="px-6 py-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <Link
          href={`/org/${orgToken}`}
          className="inline-block text-sm text-gob-text-gray underline underline-offset-4 hover:text-gob-text"
        >
          ← Volver al portal
        </Link>

        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-gob-text">
            Reportar mordedura
          </h1>
          <p className="text-sm text-gob-text-gray">
            Registrar una mordedura que presenciaste o conocés clínicamente. Inicia automáticamente
            el período de observación antirrábica de 10 días según la legislación vigente.
          </p>
        </header>

        <OrgBiteForm action={boundAction} />
      </div>
    </main>
  );
}
