// Govt decomiso — nuevo caso.
//
// Spec: docs/superpowers/specs/2026-05-19-decomiso-welfare-authority-design.md §6.
//
// RSC shell — loads the verified shelter/rescue_network orgs as a static list
// for the receiver combobox, then renders the client DecomisoForm component.
// Auth is enforced by requireDecomisoPrincipal (govt | admin).

import { and, eq, inArray } from "drizzle-orm";

import { db, organizations } from "@/db";
import { requireDecomisoPrincipal } from "@/lib/auth-guards";

import { DecomisoForm } from "./_components/DecomisoForm";

interface PageProps {
  searchParams: Promise<{ welfareReportId?: string; pet?: string }>;
}

export default async function NuevoDecomisoPage({ searchParams }: PageProps) {
  const { welfareReportId, pet } = await searchParams;

  await requireDecomisoPrincipal();

  // Load verified shelters + rescue_networks for the receiver combobox (DC6).
  const receiverOrgs = await db
    .select({
      id: organizations.id,
      displayName: organizations.displayName,
      orgType: organizations.orgType,
      jurisdictionProvince: organizations.jurisdictionProvince,
      jurisdictionLocality: organizations.jurisdictionLocality,
    })
    .from(organizations)
    .where(
      and(
        inArray(organizations.orgType, ["shelter", "rescue_network"]),
        eq(organizations.verified, true),
        eq(organizations.status, "active"),
      ),
    )
    .orderBy(organizations.displayName);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-8 space-y-1">
        <nav className="text-xs text-gob-text-muted mb-4">
          <a href="/gob/decomisos" className="hover:text-gob-text transition-colors">
            Decomisos
          </a>
          <span className="mx-2 text-gob-border-strong">›</span>
          <span className="text-gob-text">Nuevo decomiso</span>
        </nav>
        <h1 className="text-2xl font-bold text-gob-text">Ejecutar decomiso</h1>
        <p className="text-sm text-gob-text-gray">
          Ley 14.346 — incautación de animal por autoridad sanitaria. Requiere mínimo 2 adjuntos
          (foto del animal + acta administrativa).
        </p>
      </header>

      <DecomisoForm
        receiverOrgs={receiverOrgs}
        prefillWelfareReportId={welfareReportId ?? null}
        prefillPetToken={pet ?? null}
      />
    </div>
  );
}

export const dynamic = "force-dynamic";
