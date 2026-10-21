"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";
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
 * Signature pad: draw a signature with mouse, trackpad or finger, then drop it
 * onto the page as an image annotation. Nothing is uploaded — the stroke is
 * rasterised in the browser.
 */
export function SignaturePad({
  open,
  onClose,
  onSign,
}: {
  open: boolean;
  onClose: () => void;
  onSign: (dataUrl: string, aspect: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
    setHasInk(false);
  }, [open]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return [
      ((e.clientX - r.left) / r.width) * c.width,
      ((e.clientY - r.top) / r.height) * c.height,
    ] as const;
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = canvasRef.current!.getContext("2d")!;
    const [x, y] = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    drawing.current = true;
    canvasRef.current!.setPointerCapture(e.pointerId);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const [x, y] = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasInk(true);
  };

  const end = () => {
    drawing.current = false;
  };

  const clear = () => {
    const c = canvasRef.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setHasInk(false);
  };

  const accept = () => {
    const c = canvasRef.current!;
    const dataUrl = c.toDataURL("image/png");
    onSign(dataUrl, c.width / c.height);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Draw your signature</DialogTitle>
          <DialogDescription>
            Sign with your mouse, trackpad or finger. The signature is inserted into the
            page as an image you can move and resize.
          </DialogDescription>
        </DialogHeader>
        <canvas
          ref={canvasRef}
          width={480}
          height={170}
          className="w-full touch-none rounded-lg border border-dashed bg-white"
          style={{ cursor: "crosshair" }}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={clear} disabled={!hasInk}>
            <Eraser className="size-4" /> Clear
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={accept} disabled={!hasInk}>
            Insert signature
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
