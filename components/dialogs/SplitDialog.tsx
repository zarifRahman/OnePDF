"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Scissors } from "lucide-react";
import { useDocStore } from "@/store/document";
import { exportPdf } from "@/lib/pdf/export";
import { parseRangeGroups, describeSelection } from "@/lib/pdf/ranges";
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

/**
 * Split PDF: turn page ranges into separate PDF files, delivered as one ZIP.
 * Everything is produced in the browser.
 */
export function SplitDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { files, pages, annotations, docTitle } = useDocStore();
  const [spec, setSpec] = useState("1-2");
  const [busy, setBusy] = useState(false);

  const groups = useMemo(() => parseRangeGroups(spec, pages.length), [spec, pages.length]);

  const run = async () => {
    if (!groups.length) {
      toast.error("Enter at least one valid page range");
      return;
    }
    setBusy(true);
    try {
      const entries: { name: string; data: Uint8Array }[] = [];
      for (const g of groups) {
        const subset = g.map((i) => pages[i]);
        const bytes = await exportPdf(files, subset, { annotations });
        const name = `${baseName(docTitle)}-part-${entries.length + 1}.pdf`;
        entries.push({ name, data: bytes });
      }
      const zip = makeZip(entries);
      downloadBytes(zip, `${baseName(docTitle)}-split.zip`, "application/zip");
      toast.success(`Split into ${entries.length} file${entries.length === 1 ? "" : "s"}`);
      onOpenChange(false);
    } catch {
      toast.error("Could not split the document");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Split PDF</DialogTitle>
          <DialogDescription>
            Separate the document into multiple files. Each comma-separated range becomes
            its own PDF; the files are downloaded together in a ZIP.
          </DialogDescription>
        </DialogHeader>
        <label className="space-y-1">
          <span className="text-muted-foreground">Page ranges</span>
          <input
            value={spec}
            onChange={(e) => setSpec(e.target.value)}
            placeholder="1-3, 5, 8-"
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          />
        </label>
        <p className="text-xs text-muted-foreground">
          {groups.length
            ? `${groups.length} file${groups.length === 1 ? "" : "s"} · ${groups
                .map((g) => describeSelection(g))
                .join(" · ")}`
            : "No valid ranges yet."}
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={run} disabled={busy || !groups.length}>
            <Scissors className="size-4" /> {busy ? "Splitting…" : "Split & download"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
