import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

interface MetricCardProps {
  /** Short label under the title, e.g. "Batches in production" */
  label: string;
  /** The big number shown as the headline */
  value: string | number;
  /** Optional one-line caption under the value */
  description?: string;
  /** Lucide icon rendered on the left */
  icon: LucideIcon;
}

/**
 * Project-specific metric card: "label + big number + icon", used on the
 * Owner dashboard (and the Sales & Dues report). Built on top of shadcn's
 * Card so every screen shows the same stat styling.
 */
export function MetricCard({
  label,
  value,
  description,
  icon: Icon,
}: MetricCardProps) {
  return (
    <Card className="bg-white">
      <CardContent className="flex items-center gap-4 py-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gold/20 text-charcoal">
          <Icon className="size-5" />
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm text-muted-foreground">{label}</span>
          <span className="font-heading text-2xl font-semibold text-charcoal">
            {value}
          </span>
          {description && (
            <span className="truncate text-xs text-muted-foreground">
              {description}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
