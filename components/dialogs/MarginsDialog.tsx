"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Crop } from "lucide-react";
import { useDocStore } from "@/store/document";
import type { Margins } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const FIELDS: { key: keyof Margins; label: string }[] = [
  { key: "top", label: "Top" },
  { key: "right", label: "Right" },
  { key: "bottom", label: "Bottom" },
  { key: "left", label: "Left" },
];

/** Trim a margin from the page box — the same idea as Acrobat's crop tool. */
export function MarginsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { pages, selectedPageIds, setPageCrop } = useDocStore();
  const [margins, setMargins] = useState<Margins>({ top: 0, right: 0, bottom: 0, left: 0 });
  const targets = selectedPageIds.length ? selectedPageIds : pages.map((p) => p.id);

  const apply = () => {
    const empty = margins.top + margins.right + margins.bottom + margins.left === 0;
    setPageCrop(targets, empty ? undefined : margins);
    toast.success(
      empty
        ? "Crop removed"
        : `Trimmed ${targets.length} page${targets.length === 1 ? "" : "s"}`,
    );
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Crop margins</DialogTitle>
          <DialogDescription>
            Trim blank edges from {selectedPageIds.length ? "the selected pages" : "every page"}.
            Values are in PDF points (72 pt = 1 inch).
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map((f) => (
            <label key={f.key} className="space-y-1">
              <span className="text-muted-foreground">{f.label} (pt)</span>
              <input
                type="number"
                min={0}
                max={200}
                value={margins[f.key]}
                onChange={(e) =>
                  setMargins({ ...margins, [f.key]: Math.max(0, Number(e.target.value) || 0) })
                }
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              />
            </label>
          ))}
        </div>

        <div className="flex gap-2">
          {[10, 20, 36].map((v) => (
            <button
              key={v}
              onClick={() => setMargins({ top: v, right: v, bottom: v, left: v })}
              className="rounded-md border px-2.5 py-1 text-xs"
            >
              {v} pt
            </button>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={apply}>
            <Crop className="size-4" /> Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
