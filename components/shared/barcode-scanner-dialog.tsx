"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLanguage } from "@/lib/i18n";

interface BarcodeScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the decoded barcode text every time a code is read. */
  onDetected: (barcode: string) => void;
}

/**
 * Phone-camera barcode scanner, used where a USB scanner is not attached
 * (e.g. taking orders from a phone). Opens the rear camera and continuously
 * decodes product barcodes (Code 128 / Code 39 / EAN / UPC / ITF / QR…),
 * reporting each hit to `onDetected` so the parent can run its normal
 * lookup-and-add pipeline.
 *
 * - ZXing is dynamically imported inside the effect so it never lands in the
 *   main JS bundle; it is only downloaded when the scanner is actually opened.
 * - getUserMedia only works in a secure context, so the app must be served
 *   over HTTPS (or localhost) for camera scanning to be available.
 * - The dialog stays open for continuous scanning; the parent decides what
 *   each scan does (add to cart etc.) and shows its own feedback.
 */
export function BarcodeScannerDialog({
  open,
  onOpenChange,
  onDetected,
}: BarcodeScannerDialogProps) {
  const { t } = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);
  // Refs keep the camera effect from restarting when callbacks/translations
  // change identity across renders — only `open` may start/stop the camera.
  const onDetectedRef = useRef(onDetected);
  const tRef = useRef(t);
  const [phase, setPhase] = useState<"starting" | "ready" | "error">("starting");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    onDetectedRef.current = onDetected;
    tRef.current = t;
  }, [onDetected, t]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    // IScannerControls from @zxing/browser — stops the stream + decoding.
    let controls: { stop: () => void } | null = null;

    async function start() {
      setPhase("starting");
      setErrorMessage("");
      try {
        if (!window.isSecureContext) {
          throw new Error(
            tRef.current("Camera scanning needs a secure (HTTPS) connection.")
          );
        }
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error(
            tRef.current("This browser does not support camera scanning.")
          );
        }

        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] =
          await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
        if (cancelled) return;

        // Restrict formats to the ones product labels use — faster + fewer
        // false positives than letting ZXing try every known symbology.
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.ITF,
          BarcodeFormat.CODABAR,
          BarcodeFormat.QR_CODE,
        ]);
        const reader = new BrowserMultiFormatReader(hints, {
          delayBetweenScanAttempts: 150,
          // Ignore immediate re-reads of the same tag while it is still in
          // front of the camera; the operator moves on to the next item.
          delayBetweenScanSuccess: 1500,
        });

        const video = videoRef.current;
        if (!video) return;

        // decodeFromConstraints acquires the rear camera, pipes it into the
        // <video> and returns controls that stop everything on cleanup.
        const scannerControls = await reader.decodeFromConstraints(
          { video: { facingMode: "environment" } },
          video,
          (result) => {
            const text = result?.getText();
            if (text) onDetectedRef.current(text);
          }
        );
        if (cancelled) {
          scannerControls.stop();
          return;
        }
        controls = scannerControls;
        setPhase("ready");
      } catch (error) {
        if (cancelled) return;
        setPhase("error");
        const name = (error as DOMException)?.name;
        if (name === "NotAllowedError") {
          setErrorMessage(
            tRef.current(
              "Camera permission was denied. Allow camera access and try again."
            )
          );
        } else if (name === "NotFoundError" || name === "OverconstrainedError") {
          setErrorMessage(tRef.current("No camera was found on this device."));
        } else if (error instanceof Error && error.message) {
          setErrorMessage(error.message);
        } else {
          setErrorMessage(tRef.current("Could not start the camera."));
        }
      }
    }

    void start();

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Scan barcode")}</DialogTitle>
          <DialogDescription>
            {t("Point the camera at a product barcode (e.g. JC-0001).")}
          </DialogDescription>
        </DialogHeader>

        {/* Viewfinder — the video always stays mounted (display:none would
            pause frame delivery on some browsers), status overlays on top. */}
        <div className="relative aspect-video overflow-hidden rounded-lg bg-charcoal">
          <video
            ref={videoRef}
            className="size-full object-cover"
            muted
            playsInline
            autoPlay
          />

          {phase === "ready" && (
            <div
              className="pointer-events-none absolute inset-8 rounded-lg border-2 border-gold/80"
              aria-hidden
            />
          )}
          {phase !== "ready" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-sm text-cream">
              {phase === "starting" ? (
                <>
                  <Loader2 className="size-6 animate-spin" aria-hidden />
                  <p>{t("Starting camera…")}</p>
                </>
              ) : (
                <p>{errorMessage}</p>
              )}
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          {t(
            "Each scan is added straight to the cart — keep scanning, then close this window when you are done."
          )}
        </p>
      </DialogContent>
    </Dialog>
  );
}