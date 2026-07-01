// Govt decomiso -- nuevo caso.
//
// Spec: docs/superpowers/specs/2026-05-19-decomiso-welfare-authority-design.md section 6.
//
// RSC shell -- loads the verified shelter/rescue_network orgs as a static list
// for the receiver combobox, then renders the client DecomisoForm component.
// Auth is enforced by requireDecomisoPrincipal (govt | admin).

import { and, eq, inArray } from "drizzle-orm";
import Link from "next/link";

import { db, organizations } from "@/db";
import { requireDecomisoPrincipal } from "@/lib/infra/auth-guards";

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
    <div className="max-w-2xl space-y-6">
      <header className="space-y-1">
        <nav className="text-sm text-ln-op-mute mb-4" aria-label="Breadcrumb">
          <Link
            href="/gob/decomisos"
            className="hover:text-ln-op-ink transition-colors no-underline text-ln-op-mute"
          >
            Decomisos
          </Link>
          <span className="mx-2 text-ln-op-line">{"›"}</span>
          <span className="text-ln-op-ink">Nuevo decomiso</span>
        </nav>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Ejecutar decomiso</h1>
        <p className="text-[13px] text-ln-op-mute">
          {"Ley 14.346 — incautacion de animal por autoridad sanitaria. Requiere minimo 2 adjuntos"}
          {" (foto del animal + acta administrativa)."}
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
