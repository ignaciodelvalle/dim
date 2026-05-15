import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignupForm } from "./SignupForm";

export default async function SignupPage() {
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
            Crear cuenta
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Empezá la libreta digital de tu mascota
          </p>
        </div>
        <SignupForm />
        <p className="text-center text-sm text-neutral-600 dark:text-neutral-400">
          ¿Ya tenés cuenta?{" "}
          <Link
            href="/login"
            className="font-medium text-neutral-900 dark:text-neutral-50 underline underline-offset-4"
          >
            Iniciar sesión
          </Link>
        </p>
      </div>
    </main>
  );
}
