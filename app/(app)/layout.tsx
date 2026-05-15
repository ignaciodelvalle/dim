// Authenticated-only layout. Any page rendered under this route group
// (`app/(app)/...`) requires the user to be logged in — otherwise we bounce
// them to /login before the page ever renders.

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <>{children}</>;
}
