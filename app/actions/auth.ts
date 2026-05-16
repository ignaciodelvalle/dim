"use server";

// Auth server actions. Called from the signup and login forms via the
// `useActionState` hook (React 19 / Next 15). Each action either redirects
// on success or returns an error state so the form can re-render with it.

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export type AuthFormState = {
  error: string | null;
  // Set by signupAction so the multi-step signup form knows to advance to
  // the first-pet step. loginAction never sets it.
  ok?: boolean;
};

export async function signupAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();

  if (!email || !password || !displayName) {
    return { error: "Faltan datos. Completá todos los campos." };
  }
  if (password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // display_name is read by the handle_new_user trigger to populate
      // public.profiles.display_name. See db/triggers.sql.
      data: { display_name: displayName },
    },
  });

  if (error) {
    const lower = error.message.toLowerCase();
    if (lower.includes("already") || lower.includes("registered")) {
      return { error: "Ya existe una cuenta con ese correo." };
    }
    return { error: `No se pudo crear la cuenta: ${error.message}` };
  }

  // Do NOT redirect. The inline signup flow uses this success signal to
  // transition the same page to the first-pet step (AGENTS.md → v1 screens
  // §Signup: "*immediately* collects first pet profile in same flow").
  return { error: null, ok: true };
}

export async function loginAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Faltan datos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Correo o contraseña incorrectos." };
  }

  redirect("/mis-mascotas");
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
