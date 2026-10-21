"use client";

import { toast } from "sonner";
import { Hash } from "lucide-react";
import { useDocStore } from "@/store/document";
import type { PageNumberOptions, PageNumberPosition } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const POSITIONS: { id: PageNumberPosition; label: string }[] = [
  { id: "bottom-center", label: "Bottom centre" },
  { id: "bottom-right", label: "Bottom right" },
  { id: "top-center", label: "Top centre" },
  { id: "top-right", label: "Top right" },
];

const FORMATS: { id: PageNumberOptions["format"]; label: string; sample: string }[] = [
  { id: "n", label: "1", sample: "1" },
  { id: "n-of-m", label: "1 / 10", sample: "1 / 10" },
  { id: "page-n-of-m", label: "Page 1 of 10", sample: "Page 1 of 10" },
];

export function PageNumbersDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { pageNumbers, setPageNumbers, pages } = useDocStore();

  const apply = () => {
    setPageNumbers({ enabled: true });
    toast.success("Page numbers added");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Page numbers</DialogTitle>
          <DialogDescription>
            Number the {pages.length} page{pages.length === 1 ? "" : "s"} in this
            document. Numbers are drawn on export.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          <span className="text-muted-foreground">Position</span>
          <div className="grid grid-cols-2 gap-2">
            {POSITIONS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPageNumbers({ position: p.id })}
                className={`rounded-lg border px-3 py-2 text-left text-sm ${
                  pageNumbers.position === p.id ? "border-primary bg-primary/5" : ""
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <span className="text-muted-foreground">Format</span>
          <div className="grid grid-cols-3 gap-2">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                onClick={() => setPageNumbers({ format: f.id })}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  pageNumbers.format === f.id ? "border-primary bg-primary/5" : ""
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center justify-between text-sm">
          <span>Start numbering at</span>
          <input
            type="number"
            min={0}
            max={9999}
            value={pageNumbers.startAt}
            onChange={(e) =>
              setPageNumbers({ startAt: Math.max(0, Number(e.target.value) || 0) })
            }
            className="h-8 w-20 rounded-md border bg-background px-2 text-sm"
          />
        </label>

        <DialogFooter>
          {pageNumbers.enabled && (
            <Button
              variant="ghost"
              onClick={() => {
                setPageNumbers({ enabled: false });
                onOpenChange(false);
              }}
            >
              Remove
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={apply}>
            <Hash className="size-4" /> Add numbers
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
