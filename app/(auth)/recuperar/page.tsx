import Link from "next/link";

import { ResetRequestForm } from "./ResetRequestForm";

// CSP × PRERENDER (external design review C3-P1 / X1-F2).
//
// The middleware mints a per-request CSP nonce and the policy carries
// `'strict-dynamic'`, which makes the browser IGNORE `'self'` for scripts and
// execute ONLY what is nonce'd. A prerendered page's HTML is written at build
// time with no nonce at all, so in production 100% of its JavaScript is
// refused: the page renders (SSR markup) and arrives dead — no hydration, no
// error boundaries, a wall of red in the console.
//
// force-dynamic takes this route out of the prerender set so Next stamps the
// request's nonce into its <script> tags. Verified against the build output:
// `.next/server/app/*.html` must stay empty.
export const dynamic = "force-dynamic";

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
          <h1 className="font-[var(--font-ln-serif)] text-3xl font-semibold tracking-[-0.02em] text-[var(--color-ln-ink)]">
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
