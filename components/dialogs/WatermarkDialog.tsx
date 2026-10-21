"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Droplets } from "lucide-react";
import { useDocStore } from "@/store/document";
import type { Watermark } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function WatermarkDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { watermark, setWatermark } = useDocStore();
  const [draft, setDraft] = useState<Watermark>(
    watermark ?? {
      text: "CONFIDENTIAL",
      size: 48,
      color: "#888888",
      opacity: 0.18,
      rotation: 45,
    },
  );

  const apply = () => {
    if (!draft.text.trim()) {
      toast.error("Watermark text cannot be empty");
      return;
    }
    setWatermark(draft);
    toast.success("Watermark applied to every page");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Watermark</DialogTitle>
          <DialogDescription>
            Stamp text across every page. Use it for “DRAFT”, “CONFIDENTIAL” or a
            copyright line.
          </DialogDescription>
        </DialogHeader>

        <label className="space-y-1">
          <span className="text-muted-foreground">Text</span>
          <input
            value={draft.text}
            onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-muted-foreground">Size · {draft.size}</span>
            <input
              type="range"
              min={10}
              max={140}
              value={draft.size}
              onChange={(e) => setDraft({ ...draft, size: Number(e.target.value) })}
              className="w-full"
            />
          </label>
          <label className="space-y-1">
            <span className="text-muted-foreground">Opacity · {Math.round(draft.opacity * 100)}%</span>
            <input
              type="range"
              min={5}
              max={100}
              value={Math.round(draft.opacity * 100)}
              onChange={(e) => setDraft({ ...draft, opacity: Number(e.target.value) / 100 })}
              className="w-full"
            />
          </label>
          <label className="space-y-1">
            <span className="text-muted-foreground">Rotation · {draft.rotation}°</span>
            <input
              type="range"
              min={-90}
              max={90}
              value={draft.rotation}
              onChange={(e) => setDraft({ ...draft, rotation: Number(e.target.value) })}
              className="w-full"
            />
          </label>
          <label className="space-y-1">
            <span className="text-muted-foreground">Colour</span>
            <input
              type="color"
              value={draft.color}
              onChange={(e) => setDraft({ ...draft, color: e.target.value })}
              className="h-9 w-9 cursor-pointer rounded-md border bg-transparent"
            />
          </label>
        </div>

        <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-3">
          <span className="text-xs text-muted-foreground">Preview</span>
          <span
            className="text-2xl font-bold"
            style={{
              color: draft.color,
              opacity: draft.opacity,
              transform: `rotate(${draft.rotation}deg)`,
            }}
          >
            {draft.text || "Preview"}
          </span>
        </div>

        <DialogFooter>
          {watermark && (
            <Button variant="ghost" onClick={() => { setWatermark(null); onOpenChange(false); }}>
              Remove
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={apply}>
            <Droplets className="size-4" /> Apply watermark
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
