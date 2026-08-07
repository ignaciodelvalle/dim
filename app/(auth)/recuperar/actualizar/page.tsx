import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { UpdatePasswordForm } from "./UpdatePasswordForm";

// The recovery link in the email routes through /auth/callback?next=/recuperar/actualizar,
// which calls exchangeCodeForSession and establishes a recovery session. By the time
// the user lands here, they are authenticated via the PASSWORD_RECOVERY flow.
//
// Security: we verify that a valid session exists (getUser) before rendering the form.
// Without this check, anyone could GET this URL and see an update-password form that
// would then fail server-side — the page-level check gives the user a clear error
// instead of a confusing form experience.
export default async function ActualizarPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // No valid session — redirect to the request page with an informative flag.
    redirect("/recuperar?expired=1");
  }

  return (
    <main
      id="main-content"
      className="flex min-h-screen flex-col items-center justify-center p-6 bg-[var(--color-ln-paper)]"
    >
      <div className="w-full max-w-sm mb-2">
        <Link
          href="/login"
          className="inline-flex items-center gap-1 text-sm text-[var(--color-ln-ink-2)] no-underline hover:text-[var(--color-ln-azul)]"
        >
          ← Volver al inicio de sesión
        </Link>
      </div>
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <h1 className="font-ln-serif text-3xl font-semibold tracking-[-0.02em] text-[var(--color-ln-ink)]">
            Crear nueva contraseña
          </h1>
          <p className="text-sm text-[var(--color-ln-ink-2)]">
            Elegí una contraseña segura para tu cuenta.
          </p>
        </div>
        <UpdatePasswordForm />
      </div>
    </main>
  );
}
