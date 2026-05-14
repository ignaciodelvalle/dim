import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Logged-in users skip the landing and go straight to their pet list.
  if (user) {
    redirect("/mis-mascotas");
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-white dark:bg-neutral-950">
      <div className="max-w-2xl text-center space-y-6">
        <h1 className="text-6xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
          DIM
        </h1>
        <p className="text-xl text-neutral-600 dark:text-neutral-400">
          Documento de Identificación para Mascotas
        </p>
        <p className="text-base text-neutral-500 dark:text-neutral-500 max-w-md mx-auto leading-relaxed">
          La credencial digital de salud para tu mascota. Para encontrarse, para cuidarse, para
          ayudarnos a cuidar a todas.
        </p>

        <div className="flex gap-3 justify-center pt-4">
          <Link
            href="/signup"
            className="px-5 py-3 rounded-lg bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
          >
            Crear cuenta
          </Link>
          <Link
            href="/login"
            className="px-5 py-3 rounded-lg border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-neutral-50 font-medium hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors"
          >
            Iniciar sesión
          </Link>
        </div>

        <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-12 tracking-widest uppercase">
          v0.1.0 · scaffolding · más por venir
        </p>
      </div>
    </main>
  );
}
