// Verificar DNI — Libreta Nacional redesign.
// DniVerifyForm (client component) unchanged.

import { eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import { db, profiles } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";

import { DniVerifyForm } from "./DniVerifyForm";

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

  if (profile?.dniVerified) {
    redirect(next);
  }

  return (
    <div className="mx-auto max-w-md px-[32px] py-[28px] pb-[48px]">
      {/* Back */}
      <Link
        href="/cuenta"
        className="mb-[20px] inline-block font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline hover:underline"
      >
        ← Mi cuenta
      </Link>

      {/* Header */}
      <div className="mb-[28px]">
        <h1 className="m-0 font-[var(--font-ln-serif)] text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ln-ink)]">
          Verificar DNI
        </h1>
        <p className="mt-[5px] text-[14px] text-[var(--color-ln-mute)]">
          Ingresá tu número de DNI para continuar. Este paso es requerido antes de enviar una
          solicitud de rol en MiMAR.
        </p>
      </div>

      <DniVerifyForm next={next} />
    </div>
  );
}
