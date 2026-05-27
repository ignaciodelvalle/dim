// ---------------------------------------------------------------------------
// WIRED (sprint 4 PR-045 — 2026-05-27)
//
// Form is now a 4-step Poncho wizard with SuccessScreen on submit (10-day
// observation reminder). Org dashboard surfacing remains pending — when a
// "Mordeduras" CTA lands, add a nav entry in
// `components/poncho/Layout/nav-presets.ts`.
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
          className="inline-block text-sm text-neutral-600 dark:text-neutral-400 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50"
        >
          ← Volver al portal
        </Link>

        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Reportar mordedura
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Registrar una mordedura que presenciaste o conocés clínicamente. Inicia automáticamente
            el período de observación antirrábica de 10 días según la legislación vigente.
          </p>
        </header>

        <OrgBiteForm action={boundAction} orgToken={orgToken} />
      </div>
    </main>
  );
}
