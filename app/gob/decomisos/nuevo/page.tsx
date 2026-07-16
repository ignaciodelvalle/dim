// Govt decomiso -- nuevo caso.
//
// Spec: docs/superpowers/specs/2026-05-19-decomiso-welfare-authority-design.md section 6.
//
// RSC shell -- loads the verified shelter/rescue_network orgs as a static list
// for the receiver combobox, then renders the client DecomisoForm component.
// Auth is enforced by requireDecomisoPrincipal (govt | admin).

import { and, eq, inArray, or } from "drizzle-orm";
import Link from "next/link";

import { db, organizations } from "@/db";
import { requireDecomisoPrincipal } from "@/lib/infra/auth-guards";

import { DecomisoForm } from "./_components/DecomisoForm";

interface PageProps {
  searchParams: Promise<{ welfareReportId?: string; pet?: string }>;
}

export default async function NuevoDecomisoPage({ searchParams }: PageProps) {
  const { welfareReportId, pet } = await searchParams;

  const { profile, jurisdictions } = await requireDecomisoPrincipal();

  // Receiver combobox scope (DC6): a govt agent only sees verified shelters /
  // rescue_networks inside their assigned (province, locality) jurisdiction
  // pairs — never the nationwide roster. Admin has universal scope (empty
  // jurisdictions ⇒ no jurisdiction predicate). A govt with zero active
  // assignments sees no orgs (cannot leak the nationwide list).
  const jurisdictionPredicate =
    profile.role === "govt"
      ? or(
          ...jurisdictions.map((j) =>
            and(
              eq(organizations.jurisdictionProvince, j.province),
              eq(organizations.jurisdictionLocality, j.locality),
            ),
          ),
        )
      : undefined;

  const receiverOrgs =
    profile.role === "govt" && jurisdictions.length === 0
      ? []
      : await db
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
              ...(jurisdictionPredicate ? [jurisdictionPredicate] : []),
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
        <h1 className="text-[var(--text-title)] font-semibold text-ln-op-ink">Ejecutar decomiso</h1>
        <p className="text-[13px] text-ln-op-mute">
          {"Ley 14.346 — incautación de animal por autoridad sanitaria. Requiere mínimo 2 adjuntos"}
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
