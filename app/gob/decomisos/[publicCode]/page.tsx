// Decomiso detail — redirect to the unified case detail page.
//
// Spec §6: "the case detail already exists at app/casos/[publicCode]/page.tsx —
// simplest: redirect to /casos/[publicCode]."
//
// Auth is not strictly required here: canReadCase in the casos page handles
// access control. But we keep requireDecomisoPrincipal so the URL isn't
// accessible to unauthenticated users via the /gob prefix.

import { redirect } from "next/navigation";

import { requireDecomisoPrincipal } from "@/lib/auth-guards";

interface PageProps {
  params: Promise<{ publicCode: string }>;
}

export default async function DecomisoDetailPage({ params }: PageProps) {
  const { publicCode } = await params;
  await requireDecomisoPrincipal();
  redirect(`/casos/${publicCode}`);
}
