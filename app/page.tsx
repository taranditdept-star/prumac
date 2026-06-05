import { redirect } from "next/navigation";
import { getSession, roleDefaultPath } from "@/lib/auth/session";

export default async function RootPage() {
  const profile = await getSession();
  if (profile) redirect(roleDefaultPath(profile.role));
  redirect("/login");
}
