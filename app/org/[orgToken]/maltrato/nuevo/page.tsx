// Org-side welfare denuncia entry point.
//
// A member of a verified org with role in {admin, coordinator, member,
// vet_individual} submits a welfare denuncia attributed to the org.
// The server action (createOrgWelfareReportAction):
//   - forces severity='critical' (OA2)
//   - notifies govt + admin urgently (OA4)
//   - skips moderation auto-flag (OA7)
//   - emits multi-source escalation when ≥2 orgs report the same subject (OA9)
//
// Volunteer + foster roles do NOT have welfare.report capability (OA11)
// and will see a friendly explainer instead of the form.

// ---------------------------------------------------------------------------
// DEFERRED BY DESIGN (audit-internal-roles-pages PR2/9 — 2026-05-26)
//
// This page exists but is NOT reachable from any nav or dashboard CTA. The
// underlying flow (new welfare report submitted by an org) is not yet wired
// end-to-end. Keep this page intact — when the flow lands, add a nav entry
// in `components/poncho/Layout/nav-presets.ts` or a CTA on the org dashboard.
//
// Wire when org capability-gating for welfare reporting is complete.
//
// Audited: 2026-05-26. Re-evaluate during next role audit.
// ---------------------------------------------------------------------------

import { and, eq, isNull } from "drizzle-orm";
import Link from "next/link";

import { createOrgWelfareReportAction } from "@/app/actions/welfare";
import { WelfareReportForm } from "@/app/denuncias/nueva/WelfareReportForm";
import { db, organizationMemberships, organizations, profiles } from "@/db";
import { requireOrgAccessByToken } from "@/lib/auth-guards";

const ALLOWED_ROLES = new Set(["admin", "coordinator", "member", "vet_individual"]);

export default async function OrgNuevaDenunciaPage({
  params,
}: {
  params: Promise<{ orgToken: string }>;
}) {
  const { orgToken } = await params;
  const { user, organization } = await requireOrgAccessByToken(orgToken);

  const [membership] = await db
    .select({ role: organizationMemberships.role })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, organization.id),
        eq(organizationMemberships.userId, user.id),
        isNull(organizationMemberships.leftAt),
      ),
    )
    .limit(1);

  const isAllowed = !!membership && ALLOWED_ROLES.has(membership.role) && organization.verified;

  if (!isAllowed) {
    return (
      <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
        <div className="max-w-2xl mx-auto pt-10 space-y-6">
          <Link
            href={`/org/${orgToken}`}
            className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-50"
          >
            ← Volver al panel
          </Link>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
            Reporte de maltrato — solo para roles institucionales
          </h1>
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4 text-sm text-amber-900 dark:text-amber-100 space-y-2">
            {!organization.verified ? (
              <p>
                <strong>{organization.displayName}</strong> todavía no fue verificada por MiMAR. El
                canal profesional de reporte se habilita una vez que la verificación esté aprobada.
              </p>
            ) : (
              <p>
                Tu rol actual dentro de la organización (<strong>{membership?.role ?? "—"}</strong>)
                no habilita este canal. Pediselo a un coordinador o admin de la organización para
                que lo emita en tu nombre.
              </p>
            )}
            <p className="pt-2">
              Mientras tanto, podés usar el{" "}
              <Link
                href="/denuncias/nueva"
                className="underline underline-offset-4 hover:text-amber-950 dark:hover:text-amber-50"
              >
                canal público de denuncias
              </Link>
              .
            </p>
          </div>
        </div>
      </main>
    );
  }

  // Resolve the reporter's display name for the banner.
  const [reporterProfile] = await db
    .select({ displayName: profiles.displayName })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  // Bind orgToken so the form can use the standard FormAction signature.
  const boundAction = createOrgWelfareReportAction.bind(null, orgToken);

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-xl mx-auto pt-10 space-y-8">
        <header className="space-y-2">
          <Link
            href={`/org/${orgToken}`}
            className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-50"
          >
            ← Volver al panel
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Nueva investigación de maltrato
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Canal profesional: tu reporte se procesa con prioridad crítica y notifica inmediatamente
            a las autoridades de la jurisdicción.
          </p>
        </header>

        <section className="rounded-lg border border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30 p-3 text-sm text-emerald-900 dark:text-emerald-100">
          <p>
            <span className="font-medium">Reportando como:</span>{" "}
            <strong>{organization.displayName}</strong> ·{" "}
            <span className="text-emerald-800 dark:text-emerald-200">
              {reporterProfile?.displayName ?? "vos"} ({membership?.role})
            </span>
          </p>
        </section>

        <section className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-3 text-xs text-amber-900 dark:text-amber-100 space-y-1">
          <p className="font-medium">Algunas particularidades del canal profesional:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Severidad <strong>crítica automática</strong> — tu rol profesional eleva la prioridad
              sin importar lo que selecciones abajo.
            </li>
            <li>
              <strong>Mínimo 1 archivo de evidencia</strong> y descripción de al menos 100
              caracteres — la accountability institucional exige sustento.
            </li>
            <li>
              No pasa por moderación previa: vos sos responsable institucionalmente del reporte.
            </li>
          </ul>
        </section>

        <WelfareReportForm action={boundAction} isAnonymous={false} />

        <footer className="pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <p className="text-xs text-neutral-400 dark:text-neutral-600">
            Ley Nacional 14.346 (1954) — Malos tratos y actos de crueldad contra animales.
          </p>
        </footer>
      </div>
    </main>
  );
}
