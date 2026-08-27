import { redirect } from "next/navigation";

// /owner isn't a real screen — send visitors straight to the dashboard.
// ROLE_HOME also points here after login, so this is just a safety net.
export default function OwnerIndexPage() {
  redirect("/owner/dashboard");
}
