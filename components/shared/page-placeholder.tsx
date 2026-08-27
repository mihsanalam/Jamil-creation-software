import { Construction } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PagePlaceholderProps {
  /** Screen title, e.g. "Phase Templates" */
  title: string;
  /** One-line summary of what this screen will do */
  description: string;
}

/**
 * Temporary stand-in for screens that haven't been built yet.
 * It makes every role's area navigable right now (no more 500 on an
 * empty page.tsx) until each feature is implemented in its own folder.
 */
export function PagePlaceholder({ title, description }: PagePlaceholderProps) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <Card className="bg-white">
        <CardHeader className="items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-gold/20 text-charcoal">
            <Construction className="size-6" aria-hidden />
          </div>
          <CardTitle className="text-lg text-charcoal">{title}</CardTitle>
          <Badge variant="secondary">Coming soon</Badge>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground">
          {description}
        </CardContent>
      </Card>
    </div>
  );
}