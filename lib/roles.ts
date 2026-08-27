import type { UserRole } from "@/types/next-auth";

// The first screen each role lands on right after signing in.
// Middleware uses the same mapping to bounce a role off a forbidden
// route and send them to their own area instead of back to /login.
export const ROLE_HOME: Record<UserRole, string> = {
  OWNER: "/owner",
  COLLECTOR: "/collector/fabric-intake",
  OPERATOR: "/operator/work-order",
};

// Human-friendly labels, used for the role badge on dashboards.
export const ROLE_LABELS: Record<UserRole, string> = {
  OWNER: "Owner",
  COLLECTOR: "Collector",
  OPERATOR: "Operator",
};