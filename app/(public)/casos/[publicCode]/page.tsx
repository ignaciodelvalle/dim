// Unified case-detail page (citizen shell). Reachable from /casos/CAS-XXXX-XXXX.
//
// The role-aware body — data fetch, session resolution, canReadCase gating and
// rendering — lives in the shared CaseDetailView so the govt operator route
// (app/gob/casos/[publicCode]) can reuse the exact same content inside the
// operator shell. See that component for the full access-control notes.

import { CaseDetailView } from "@/components/casos/CaseDetailView";

// Reads auth cookies (viewer-dependent PII gating) — never statically cache.
// Cache policy: ALWAYS LIVE. force-dynamic + `Cache-Control: no-store` (stamped
// in middleware for the /casos/ subtree — see lib/infra/public-cache-policy.ts)
// so a shared/CDN cache can never cross-serve one viewer's PII-gated variant.
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ publicCode: string }>;
}

export default async function CaseDetailPage({ params }: PageProps) {
  const { publicCode } = await params;
  return <CaseDetailView publicCode={publicCode} />;
}
