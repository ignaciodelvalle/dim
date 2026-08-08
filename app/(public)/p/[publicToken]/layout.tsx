// Public credential landing layout — the PII-sensitive token-landing surface
// (spec D13), migrated onto the unified AppShell variant=landing (Item 7,
// Phase C2, the deferred slice of Phase C). A `/p/[publicToken]` QR is scanned
// by a stranger who found a pet: it gets the minimal trust chrome (brand +
// Argentina stripe + "Credencial registrada en miMAR"), NOT the public browse
// chrome. The (public) layout above renders a transparent passthrough for these
// token-landing paths, so this layout owns the single `#main-content`.
//
// resolveShellNav is the single decision: a token-landing path always yields
// the `landing` variant regardless of auth, with a discreet "back to my app"
// return only when there is a session to return to (a logged-in owner scanning
// their own pet's QR still gets a quiet way home).
//
// This layout wraps the credential page AND its finder sub-actions (/encontre,
// /sighting). Each of those pages drops its own full-screen `<main>` — this
// landing shell now owns `#main-content` + min-height (D11). No page content,
// disclosure/Tier gating, rate-limit, data fetching, or PII rendering changes.

import Link from "next/link";
import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { DemoModeBanner } from "@/components/ui/DemoModeBanner";
import { shouldShowDemoBanner } from "@/lib/domain/demo-mode";
import { getProfileCached } from "@/lib/infra/request-cache";
import { createClient } from "@/lib/supabase/server";
import { resolveShellNav } from "@/lib/ui/shell-nav";

export default async function PublicCredentialLandingLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;

  // Read session purely for the discreet "back to my app" affordance (D13).
  // This is NOT an auth gate — the credential page renders correctly logged-out.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const profile = user ? await getProfileCached(user.id) : null;

  const shell = resolveShellNav({
    pathname: `/p/${publicToken}`,
    session: profile ? { role: profile.role, displayName: profile.displayName } : null,
  });

  const returnSlot =
    shell.showReturn && shell.returnHref ? (
      <Link
        href={shell.returnHref}
        className="whitespace-nowrap text-xs font-medium text-ln-azul no-underline hover:underline"
      >
        ← Volver a mi app
      </Link>
    ) : undefined;

  return (
    <AppShell
      variant="landing"
      returnSlot={returnSlot}
      banner={<DemoModeBanner enabled={shouldShowDemoBanner(process.env.NEXT_PUBLIC_DEMO_MODE)} />}
    >
      {children}
    </AppShell>
  );
}
