// Authenticated owner-portal layout. Any page rendered under this route group
// (`app/(app)/...`) requires the user to be (a) logged in and (b) a
// personal-account role (owner or vet). Institutional accounts (admin, govt)
// don't own pets or have appointments, so the whole owner portal is a no-op
// for them — bounce them to the portal their role does belong in. A future
// spec will give them dedicated cross-pet surfaces (e.g. /admin/mascotas,
// /gob/mascotas) with filters.

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db, profiles } from "@/db";
import { createClient } from "@/lib/supabase/server";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [profile] = await db
    .select({ role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);
  if (profile?.role === "admin") redirect("/admin");
  if (profile?.role === "govt") redirect("/gob");

  return <>{children}</>;
}
