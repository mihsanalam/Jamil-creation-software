"use client";

import { useState, type ChangeEvent } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { ImagePlus, Trash2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { useLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Minimal product shape — collector + owner screens both pass this.
export interface PhotoManagedProduct {
  id: string;
  barcode: string;
  productType: string;
  batchNumber: string;
  quantityRemaining: number;
  storageLocation: string;
  imageUrl: string | null;
  status: string;
}

interface FinishedProductPhotoDialogProps {
  product: PhotoManagedProduct | null;
  onClose: () => void;
  onUpdated?: (updated: { id: string; imageUrl: string | null }) => void;
}

const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Garment-photo manager — the finished-goods twin of BatchDetailDialog's
 * fabric-photo block. How lots recorded before photos existed get their
 * image. Collector + owner can manage (PATCH /api/finished-products/[id]).
 */
export function FinishedProductPhotoDialog({
  product,
  onClose,
  onUpdated,
}: FinishedProductPhotoDialogProps) {
  const { t } = useLanguage();
  const [isUploading, setIsUploading] = useState(false);

  async function savePhoto(productId: string, imageUrl: string | null) {
    const response = await fetch(`/api/finished-products/${productId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      toast.error(data?.message ?? t("Could not update the product photo."));
      return;
    }
    const data = await response.json().catch(() => null);
    onUpdated?.({ id: productId, imageUrl: data?.imageUrl ?? imageUrl });
    toast.success(
      imageUrl ? t("Garment photo saved.") : t("Garment photo removed.")
    );
  }

  async function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !product) return;
    if (file.size > PHOTO_MAX_BYTES) {
      toast.error(t("Image is too large — the limit is 5 MB."));
      return;
    }
    setIsUploading(true);
    try {
      const uploadForm = new FormData();
      uploadForm.append("file", file);
      uploadForm.append("folder", "finished");
      const uploadResponse = await fetch("/api/uploads", {
        method: "POST",
        body: uploadForm,
      });
      if (!uploadResponse.ok) {
        const data = await uploadResponse.json().catch(() => null);
        toast.error(data?.message ?? t("Could not upload the image."));
        return;
      }
      const uploadData = await uploadResponse.json().catch(() => null);
      const imageUrl =
        typeof uploadData?.path === "string" ? uploadData.path : null;
      if (!imageUrl) {
        toast.error(t("Could not upload the image."));
        return;
      }
      await savePhoto(product.id, imageUrl);
    } finally {
      setIsUploading(false);
    }
  }

  async function handlePhotoRemove() {
    if (!product) return;
    setIsUploading(true);
    try {
      await savePhoto(product.id, null);
    } finally {
      setIsUploading(false);
    }
  }

  if (!product) {
    return (
      <Dialog open={false} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="w-full max-w-lg gap-0 rounded-xl p-0 ring-border" />
      </Dialog>
    );
  }

  return (
    <Dialog open={product !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-full max-w-lg gap-0 overflow-hidden rounded-xl p-0 ring-border">
        <DialogHeader className="border-b border-border bg-cream/60 px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="font-mono text-base font-bold tracking-widest text-charcoal">
              {product.barcode}
            </span>
            <StatusBadge status={product.status} />
          </div>
          <DialogTitle className="sr-only">
            {t("Garment photo of")} {product.barcode}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {product.productType} ·{" "}
            <span className="font-mono">{product.batchNumber}</span> ·{" "}
            {product.quantityRemaining} {t("pcs")} · {product.storageLocation}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-6 py-5">
          <div className="flex items-start gap-4">
            {product.imageUrl ? (
              <Image
                src={product.imageUrl}
                alt={`Garment photo for ${product.barcode}`}
                width={192}
                height={192}
                className="size-48 shrink-0 rounded-xl border border-border object-cover"
              />
            ) : (
              <span className="grid size-48 shrink-0 place-items-center rounded-xl border border-dashed border-border bg-muted/40 text-muted-foreground">
                <ImagePlus className="size-8" aria-hidden />
              </span>
            )}
            <div className="flex flex-col gap-1.5 pt-1">
              <p className="text-sm font-semibold text-charcoal">
                {t("Garment photo")}
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t("Shown in the POS so clients can see what they are buying.")}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <label
                  className={cn(
                    "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-xs font-semibold text-charcoal transition-colors hover:border-gold",
                    isUploading && "pointer-events-none opacity-60"
                  )}
                >
                  {product.imageUrl ? t("Change photo") : t("Add photo")}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={handlePhotoChange}
                    disabled={isUploading}
                  />
                </label>
                {product.imageUrl ? (
                  <button
                    type="button"
                    onClick={handlePhotoRemove}
                    disabled={isUploading}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-xs font-semibold text-muted-foreground transition-colors hover:border-rust hover:text-rust disabled:opacity-60"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                    {t("Remove")}
                  </button>
                ) : null}
                {isUploading ? (
                  <span className="text-xs text-muted-foreground">
                    {t("Saving…")}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
