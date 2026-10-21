"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Gauge, ShieldCheck } from "lucide-react";
import { useDocStore } from "@/store/document";
import { rasterizePdf } from "@/lib/pdf/raster";
import { buildDocumentBytes } from "@/lib/pdf/document";
import { downloadBytes, baseName, formatBytes, uuid } from "@/lib/utils";
import type { SourceFile } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const PRESETS = [
  { id: "strong", label: "Strong", quality: 0.35, scale: 0.7, hint: "Smallest file" },
  { id: "balanced", label: "Balanced", quality: 0.6, scale: 0.85, hint: "Recommended" },
  { id: "high", label: "High", quality: 0.85, scale: 1, hint: "Best quality" },
] as const;

/**
 * Compress / grayscale / secure redaction. All three need a raster pass, which
 * is the one operation that can rebuild the whole document in the browser.
 */
export function CompressDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { annotations, docTitle, replaceDocument, pages } = useDocStore();
  const [preset, setPreset] = useState<(typeof PRESETS)[number]["id"]>("balanced");
  const [grayscale, setGrayscale] = useState(false);
  const [burn, setBurn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ before: number; after: number; bytes: Uint8Array } | null>(
    null,
  );

  const redactions = annotations.filter((a) => a.type === "redact");
  const redactBoxes = redactions.map((a) => {
    const page = pages.find((p) => p.id === a.pageId);
    return {
      pageIndex: page ? pages.indexOf(page) : 0,
      rect: { x: a.x, y: a.y, w: a.w, h: a.h },
    };
  });

  const run = async () => {
    setBusy(true);
    try {
      const p = PRESETS.find((x) => x.id === preset)!;
      // Build the full document first so annotations, page numbers and the
      // watermark are part of what gets rasterised.
      const bytes = await buildDocumentBytes();
      const out = await rasterizePdf(bytes, {
        quality: p.quality,
        scale: p.scale,
        grayscale,
        redact: burn ? redactBoxes : [],
      });
      setResult({ before: out.sizeBefore, after: out.sizeAfter, bytes: out.bytes });
    } catch {
      toast.error("Could not rebuild the document");
    } finally {
      setBusy(false);
    }
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) setResult(null);
    onOpenChange(v);
  };

  const download = () => {
    if (!result) return;
    downloadBytes(result.bytes, `${baseName(docTitle)}-compressed.pdf`);
    toast.success("Compressed PDF downloaded");
  };

  const replace = () => {
    if (!result) return;
    const file: SourceFile = {
      id: uuid(),
      name: `${baseName(docTitle)}-compressed.pdf`,
      bytes: result.bytes,
      pageCount: pages.length,
    };
    replaceDocument(file);
    toast.success("Document replaced with the compressed version");
    onOpenChange(false);
  };

  const saving = result ? Math.max(0, 1 - result.after / Math.max(1, result.before)) : 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Compress & secure</DialogTitle>
          <DialogDescription>
            Rebuild the document from page images. Smaller files, optional greyscale,
            and redactions that actually remove the text underneath.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setPreset(p.id);
                setResult(null);
              }}
              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${
                preset === p.id ? "border-primary bg-primary/5" : ""
              }`}
            >
              <span className="font-medium">{p.label}</span>
              <span className="text-xs text-muted-foreground">{p.hint}</span>
            </button>
          ))}
        </div>

        <label className="flex items-center justify-between text-sm">
          <span>Convert to greyscale</span>
          <input
            type="checkbox"
            checked={grayscale}
            onChange={(e) => {
              setGrayscale(e.target.checked);
              setResult(null);
            }}
            className="size-4"
          />
        </label>

        {redactions.length > 0 && (
          <label className="flex items-start justify-between gap-3 text-sm">
            <span>
              Burn in {redactions.length} redaction{redactions.length === 1 ? "" : "s"}
              <span className="block text-xs text-muted-foreground">
                Rasterising removes the hidden text from the file for good.
              </span>
            </span>
            <input
              type="checkbox"
              checked={burn}
              onChange={(e) => {
                setBurn(e.target.checked);
                setResult(null);
              }}
              className="size-4"
            />
          </label>
        )}

        {result && (
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Size</span>
              <span>
                {formatBytes(result.before)} → <strong>{formatBytes(result.after)}</strong>
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-muted-foreground">Saved</span>
              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                {Math.round(saving * 100)}%
              </span>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={run} disabled={busy}>
            <Gauge className="size-4" /> {busy ? "Working…" : "Calculate"}
          </Button>
          <Button variant="outline" onClick={download} disabled={!result}>
            Download
          </Button>
          <Button onClick={replace} disabled={!result}>
            <ShieldCheck className="size-4" /> Use in editor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
