import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ROLE_HOME } from "@/lib/roles";

// Landing screen: any logged-in user goes straight to their role's home.
export default async function Home() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  redirect(ROLE_HOME[session.user.role] ?? "/login");
}
