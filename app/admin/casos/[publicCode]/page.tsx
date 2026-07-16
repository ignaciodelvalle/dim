// Admin operator case-detail. Renders the SAME role-aware case-detail content
// as the public /casos/[publicCode] route, but under the /admin layout so a
// national operator opening a case from /admin/casos KEEPS the operator rail
// and topbar instead of being dropped into the citizen chrome.
//
// This is the admin half of the shell-loss class fixed for govt in task #47.
// Only the govt half was done then: /gob got its in-shell detail route while
// admin kept linking at the public /casos/[publicCode], so the national
// operator still lost the shell (QA ronda 5, 2026-07-16 — the tester opened a
// denuncia from /admin/casos, landed on the citizen chrome with "Adoptar ·
// Refugios · ← Volver a mi app", and could not act on the case).
//
// Access is NOT widened by this route: the /admin layout already gates the
// segment, CaseDetailView re-runs canReadCase (admin = universal scope), and
// the explicit guard below mirrors app/admin/casos/page.tsx so the URL is never
// reachable unauthenticated and a govt viewer is bounced to their own shell
// rather than borrowing the admin one.

import { redirect } from "next/navigation";

import { CaseDetailView } from "@/components/casos/CaseDetailView";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";

// Reads auth cookies (viewer-dependent PII gating) — never statically cache.
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ publicCode: string }>;
}

export default async function AdminCaseDetailPage({ params }: PageProps) {
  const { publicCode } = await params;
  const session = await requireAdminOrGovtOrRedirect();
  if (session.profile.role !== "admin") redirect(`/gob/casos/${publicCode}`);
  return <CaseDetailView publicCode={publicCode} casosHref="/admin/casos" />;
}
