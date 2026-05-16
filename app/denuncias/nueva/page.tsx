import { createWelfareReportAction } from "@/app/actions/welfare";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { WelfareReportForm } from "./WelfareReportForm";

export default async function NuevaDenunciaPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const params = await searchParams;
  const submitted = params.ok === "1";

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-xl mx-auto pt-10 space-y-8">
        <header className="space-y-1">
          <Link
            href={user ? "/mis-mascotas" : "/"}
            className="text-sm text-neutral-500 dark:text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-50 transition-colors"
          >
            ← {user ? "Mis mascotas" : "Inicio"}
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Denunciar maltrato animal
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Tu denuncia es importante. Podés enviarla con tu sesión o de forma anónima.
          </p>
        </header>

        {submitted && (
          <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 px-4 py-3">
            <p className="text-sm text-green-800 dark:text-green-200 font-medium">
              Recibimos tu denuncia. Gracias por animarte a denunciar.
            </p>
          </div>
        )}

        <WelfareReportForm action={createWelfareReportAction} isAnonymous={!user} />

        <div className="text-center">
          <Link
            href="/denuncias/buscar"
            className="text-sm text-neutral-500 dark:text-neutral-500 underline underline-offset-4 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
          >
            ¿Ya hiciste una denuncia? Buscala con tu código →
          </Link>
        </div>

        <footer className="pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <p className="text-xs text-neutral-400 dark:text-neutral-600">
            Ley Nacional 14.346 (1954) — Malos tratos y actos de crueldad contra animales.
          </p>
        </footer>
      </div>
    </main>
  );
}
