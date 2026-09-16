import Image from "next/image";
import { ImagePlus } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Small garment-photo thumbnail shared by the POS screens, the invoice and
 * the owner traceability report. Renders a placeholder icon when the lot has
 * no photo yet so rows keep a stable height.
 */
export function ProductPhotoThumb({
  imageUrl,
  alt,
  size = 40,
  className,
}: {
  imageUrl: string | null;
  alt: string;
  size?: number;
  className?: string;
}) {
  const dimension = { width: size, height: size };

  if (!imageUrl) {
    return (
      <span
        style={dimension}
        aria-hidden
        className={cn(
          "grid shrink-0 place-items-center rounded-lg border border-dashed border-border bg-muted/40 text-muted-foreground",
          className
        )}
      >
        <ImagePlus className="size-4" />
      </span>
    );
  }

  return (
    <Image
      src={imageUrl}
      alt={alt}
      width={size}
      height={size}
      style={dimension}
      className={cn(
        "shrink-0 rounded-lg border border-border object-cover",
        className
      )}
    />
  );
}
