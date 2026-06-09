import { safeReturnTo } from "@/lib/role-landing";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignupForm } from "./SignupForm";

// `intent=apply` + `returnTo=/adoptar/{token}/postular` come from the
// adoption listing's startApplyIntentAction. When that intent is present
// we swap the headline copy, skip the first-pet step after signup, and
// drop the visitor onto the postular page.

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string; returnTo?: string }>;
}) {
  const sp = await searchParams;
  const intent = sp.intent === "apply" ? "apply" : null;
  const returnTo = safeReturnTo(sp.returnTo);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect(returnTo ?? "/mis-mascotas");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-[var(--color-ln-paper)]">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <h1 className="font-[var(--font-ln-serif)] text-[28px] font-semibold tracking-[-0.02em] text-[var(--color-ln-ink)]">
            Crear cuenta
          </h1>
          <p className="text-sm text-[var(--color-ln-ink-2)]">
            {intent === "apply"
              ? "Para postularte a adoptar necesitás una cuenta en MiMAR. Es gratis y toma un minuto."
              : "Empezá la libreta digital de tu mascota"}
          </p>
        </div>
        <SignupForm intent={intent} returnTo={returnTo} />
        <p className="text-center text-sm text-[var(--color-ln-ink-2)]">
          ¿Ya tenés cuenta?{" "}
          <Link
            href={
              intent === "apply" && returnTo
                ? `/login?intent=apply&returnTo=${encodeURIComponent(returnTo)}`
                : "/login"
            }
            className="font-medium text-[var(--color-ln-ink)] underline underline-offset-4"
          >
            Iniciar sesión
          </Link>
        </p>
      </div>
    </main>
  );
}
