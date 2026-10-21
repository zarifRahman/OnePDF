"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useDocStore } from "@/store/document";
import { findPageImages, removePageImages, type PageImages } from "@/lib/pdf/images";

/**
 * Delete the images a page draws.
 *
 * Unlike the whiteout and redact tools, this edits the page's content
 * stream: the image operators are cut out and the image objects are dropped
 * from the file, so the pixels are really gone. Text and vector artwork on
 * the page are left alone.
 */
export function RemoveImagesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const files = useDocStore((s) => s.files);
  const pages = useDocStore((s) => s.pages);
  const currentPageId = useDocStore((s) => s.currentPageId);
  const replaceSourceBytes = useDocStore((s) => s.replaceSourceBytes);

  // The scan result is keyed by the page it belongs to, so switching pages
  // invalidates it without needing to clear it from an effect.
  const [result, setResult] = useState<{ key: string; data: PageImages } | null>(null);
  const [busy, setBusy] = useState(false);

  const page = pages.find((p) => p.id === currentPageId) ?? null;
  const file = page && !page.isBlank ? files[page.fileId] : undefined;
  const pageNumber = page ? pages.findIndex((p) => p.id === page.id) + 1 : 0;
  const scanKey = file && page ? `${file.id}:${page.sourceIndex}` : null;

  useEffect(() => {
    if (!open || !file || !page || !scanKey) return;
    let cancelled = false;
    findPageImages(file.bytes, page.sourceIndex)
      .then((data) => {
        if (!cancelled) setResult({ key: scanKey, data });
      })
      .catch(() => {
        if (!cancelled)
          setResult({ key: scanKey, data: { width: 0, height: 0, regions: [] } });
      });
    return () => {
      cancelled = true;
    };
  }, [open, file, page, scanKey]);

  const found = scanKey && result?.key === scanKey ? result.data : null;
  const scanning = open && !!scanKey && !found;

  const apply = async () => {
    if (!file || !page) return;
    setBusy(true);
    try {
      const { bytes, removed } = await removePageImages(
        file.bytes,
        page.sourceIndex,
      );
      if (!removed) {
        toast.info("No images to remove on this page");
        onOpenChange(false);
        return;
      }
      replaceSourceBytes(file.id, bytes);
      toast.success(
        `Removed ${removed} image${removed === 1 ? "" : "s"} from page ${pageNumber}`,
      );
      onOpenChange(false);
    } catch {
      toast.error("Could not remove the images from this page");
    } finally {
      setBusy(false);
    }
  };

  const regions = found?.regions ?? [];
  const count = regions.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Remove images from page {pageNumber || "—"}</DialogTitle>
          <DialogDescription>
            The images are deleted from the file, not covered up — the text and
            the vector artwork on the page are left as they are.
          </DialogDescription>
        </DialogHeader>

        {scanning ? (
          <p className="text-sm text-muted-foreground">Scanning the page…</p>
        ) : count > 0 && found ? (
          <div className="space-y-3">
            {/* A mini page with the image areas picked out. */}
            <svg
              viewBox={`0 0 ${found.width} ${found.height}`}
              className="mx-auto max-h-64 w-auto rounded border bg-white shadow-sm"
              style={{ aspectRatio: `${found.width} / ${found.height}` }}
              role="img"
              aria-label={`${count} image${count === 1 ? "" : "s"} on this page`}
            >
              {regions.map((r, i) => (
                <rect
                  key={i}
                  x={r.x}
                  y={r.y}
                  width={r.w}
                  height={r.h}
                  fill="#e11d48"
                  fillOpacity={0.35}
                  stroke="#e11d48"
                  strokeWidth={2}
                />
              ))}
            </svg>
            <p className="text-sm text-muted-foreground">
              {count} image{count === 1 ? "" : "s"} will be removed from this
              page.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            This page has no images to remove.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {count > 0 ? "Cancel" : "Close"}
          </Button>
          {count > 0 && (
            <Button onClick={() => void apply()} disabled={busy}>
              {busy ? "Removing…" : `Remove ${count} image${count === 1 ? "" : "s"}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
