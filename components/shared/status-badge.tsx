import { Badge } from "@/components/ui/badge";

// One color mapping for every status shown across the app (Batch List,
// Phase Board, Sales report...) so a status never looks different on two
// screens. Add new statuses here as features grow.
const statusStyles: Record<string, string> = {
  // Fabric batch lifecycle
  PENDING: "bg-muted text-muted-foreground border-border",
  IN_PRODUCTION: "bg-gold text-charcoal border-gold",
  READY:
    "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-900",
  SOLD: "bg-rust text-cream border-rust",

  // Phase progress (future screens)
  IN_PROGRESS: "bg-gold text-charcoal border-gold",
  COMPLETED:
    "bg-green-100 text-green-800 border-green-200",

  // Payments (future screens)
  DUE: "bg-rust text-cream border-rust",
  PAID: "bg-green-100 text-green-800 border-green-200",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={statusStyles[status] ?? ""}>
      <span className="capitalize">{status.replace(/_/g, " ").toLowerCase()}</span>
    </Badge>
  );
}
