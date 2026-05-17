import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/mis-mascotas");

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-white dark:bg-neutral-950">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Iniciar sesión
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Bienvenido de vuelta a MiMAR
          </p>
        </div>
        <LoginForm />
        <p className="text-center text-sm text-neutral-600 dark:text-neutral-400">
          ¿No tenés cuenta?{" "}
          <Link
            href="/signup"
            className="font-medium text-neutral-900 dark:text-neutral-50 underline underline-offset-4"
          >
            Crear cuenta
          </Link>
        </p>
      </div>
    </main>
  );
}
