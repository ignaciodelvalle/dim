import { eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import { db, profiles } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";

import { DniVerifyForm } from "./DniVerifyForm";

// Validates `next` with the same rules as the server action wrapper.
function sanitizeNext(raw: string | undefined): string {
  if (!raw) return "/cuenta";
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/")) return "/cuenta";
  if (trimmed.includes("//") || trimmed.includes("://")) return "/cuenta";
  return trimmed;
}

export default async function VerificarDniPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { user } = await requireUserOrRedirect();
  const params = await searchParams;
  const next = sanitizeNext(params.next);

  const [profile] = await db
    .select({ dniVerified: profiles.dniVerified })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  // Already verified — redirect without re-prompting (idempotency).
  if (profile?.dniVerified) {
    redirect(next);
  }

  return (
    <main className="min-h-screen p-6 bg-white ">
      <div className="max-w-md mx-auto pt-10 space-y-8">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-gob-text ">Verificar DNI</h1>
          <p className="text-sm text-gob-text-gray ">
            Ingresá tu número de DNI para continuar. Este paso es requerido antes de enviar una
            solicitud de rol en MiMAR.
          </p>
        </header>

        <DniVerifyForm next={next} />

        <div className="pt-2">
          <Link
            href="/cuenta"
            className="text-sm text-gob-text-gray  underline underline-offset-4 hover:text-gob-text  transition-colors"
          >
            ← Volver a mi cuenta
          </Link>
        </div>
      </div>
    </main>
  );
}
