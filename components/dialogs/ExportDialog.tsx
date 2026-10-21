"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { useDocStore } from "@/store/document";
import { exportPdf } from "@/lib/pdf/export";
import { parseRanges } from "@/lib/pdf/ranges";
import { rasterizeToImages } from "@/lib/pdf/raster";
import { buildDocumentBytes } from "@/lib/pdf/document";
import { makeZip } from "@/lib/pdf/zip";
import { downloadBytes, baseName } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Scope = "all" | "current" | "selected" | "range";

export function ExportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { files, pages, annotations, pageNumbers, watermark, docTitle, currentPageId, selectedPageIds } =
    useDocStore();
  const [scope, setScope] = useState<Scope>("all");
  const [range, setRange] = useState("");
  const [format, setFormat] = useState<"pdf" | "png" | "jpg">("pdf");
  const [name, setName] = useState(docTitle);
  const [busy, setBusy] = useState(false);

  const chosen = useMemo(() => {
    if (scope === "all") return pages.map((_, i) => i);
    if (scope === "current") {
      const i = pages.findIndex((p) => p.id === currentPageId);
      return i >= 0 ? [i] : [];
    }
    if (scope === "selected")
      return pages.map((p, i) => (selectedPageIds.includes(p.id) ? i : -1)).filter((i) => i >= 0);
    return parseRanges(range, pages.length);
  }, [scope, range, pages, currentPageId, selectedPageIds]);

  const run = async () => {
    setBusy(true);
    try {
      if (format === "pdf") {
        const subset = chosen.map((i) => pages[i]);
        const keep = new Set(subset.map((p) => p.id));
        const bytes = await exportPdf(files, subset, {
          annotations: annotations.filter((a) => keep.has(a.pageId)),
          pageNumbers,
          watermark,
        });
        downloadBytes(bytes, `${baseName(name)}.pdf`);
        toast.success(`Exported ${subset.length} page${subset.length === 1 ? "" : "s"}`);
      } else {
        const images = await rasterizeToImages(
          await buildDocumentBytes(),
          format === "png" ? "image/png" : "image/jpeg",
        );
        const zip = makeZip(images);
        downloadBytes(zip, `${baseName(name)}-${format}s.zip`, "application/zip");
        toast.success(`Exported ${images.length} images`);
      }
      onOpenChange(false);
    } catch {
      toast.error("Export failed");
    } finally {
      setBusy(false);
    }
  };

  const scopes: { id: Scope; label: string }[] = [
    { id: "all", label: "Whole document" },
    { id: "current", label: "Current page" },
    { id: "selected", label: `Selected (${selectedPageIds.length})` },
    { id: "range", label: "Custom range" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export</DialogTitle>
          <DialogDescription>
            Download the document as a PDF, or export every page as an image.
          </DialogDescription>
        </DialogHeader>

        <label className="space-y-1">
          <span className="text-muted-foreground">File name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          />
        </label>

        <div className="space-y-1">
          <span className="text-muted-foreground">Pages</span>
          <div className="grid grid-cols-2 gap-2">
            {scopes.map((s) => (
              <button
                key={s.id}
                onClick={() => setScope(s.id)}
                className={`rounded-lg border px-3 py-2 text-left text-sm ${
                  scope === s.id ? "border-primary bg-primary/5" : ""
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {scope === "range" && (
          <label className="space-y-1">
            <span className="text-muted-foreground">Page ranges</span>
            <input
              value={range}
              onChange={(e) => setRange(e.target.value)}
              placeholder="1-3, 5"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            />
          </label>
        )}

        <div className="space-y-1">
          <span className="text-muted-foreground">Format</span>
          <div className="grid grid-cols-3 gap-2">
            {([
              { id: "pdf", label: "PDF" },
              { id: "png", label: "PNG images" },
              { id: "jpg", label: "JPG images" },
            ] as const).map((f) => (
              <button
                key={f.id}
                onClick={() => setFormat(f.id)}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  format === f.id ? "border-primary bg-primary/5" : ""
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {chosen.length} page{chosen.length === 1 ? "" : "s"} selected
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={run} disabled={busy || !chosen.length}>
            <Download className="size-4" /> {busy ? "Exporting…" : "Export"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
