import Link from "next/link";

import { ResetRequestForm } from "./ResetRequestForm";

export default function RecuperarPage() {
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
          <h1 className="font-[var(--font-ln-serif)] text-[28px] font-semibold tracking-[-0.02em] text-[var(--color-ln-ink)]">
            Recuperar contraseña
          </h1>
          <p className="text-sm text-[var(--color-ln-ink-2)]">
            Ingresá tu correo y te enviamos un enlace para crear una nueva contraseña.
          </p>
        </div>
        <ResetRequestForm />
      </div>
    </main>
  );
}
