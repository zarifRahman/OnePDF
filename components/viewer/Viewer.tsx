"use client";
import { useMemo, useState } from "react";
import { Document, Page } from "react-pdf";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useDocStore } from "@/store/document";
import { Skeleton } from "@/components/ui/skeleton";

export function Viewer({ docBytes }: { docBytes: Uint8Array | null }) {
  const { pages, currentPageId, setCurrent, zoom } = useDocStore();
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);

  const idx = pages.findIndex((p) => p.id === currentPageId);
  const pageNumber = idx >= 0 ? idx + 1 : 1;
  const go = (d: number) => {
    const n = idx + d;
    if (n >= 0 && n < pages.length) setCurrent(pages[n].id);
  };

  // Own copy: pdf.js detaches the buffer it receives (see ThumbnailItem).
  // Memoized file object so react-pdf doesn't reload every render.
  const file = useMemo(() => (docBytes ? { data: docBytes.slice(0) } : null), [docBytes]);

  // Gate <Page> on the loaded doc's count — docBytes lags the pages array.
  const [numPages, setNumPages] = useState(0);

  if (!file)
    return (
      <div className="grid flex-1 place-items-center text-muted-foreground">No page selected</div>
    );

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden bg-muted/30">
      <div
        className="flex flex-1 items-center justify-center overflow-auto p-8"
        style={{ cursor: dragStart ? "grabbing" : "grab" }}
        onMouseDown={(e) => setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })}
        onMouseMove={(e) => dragStart && setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })}
        onMouseUp={() => setDragStart(null)}
        onMouseLeave={() => setDragStart(null)}
      >
        <div style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}>
          <Document
            file={file}
            loading={<Skeleton className="h-[600px] w-[450px]" />}
            onLoadSuccess={({ numPages: n }) => setNumPages(n)}
          >
            {pageNumber <= numPages ? (
              <Page
                pageNumber={pageNumber}
                scale={zoom}
                renderTextLayer
                renderAnnotationLayer={false}
                loading={<Skeleton className="h-[600px] w-[450px]" />}
                className="shadow-lg"
              />
            ) : (
              <Skeleton className="h-[600px] w-[450px]" />
            )}
          </Document>
        </div>
      </div>
      <div className="flex items-center justify-center gap-4 border-t bg-background/80 py-2 backdrop-blur">
        <button onClick={() => go(-1)} disabled={idx <= 0} className="disabled:opacity-30">
          <ChevronLeft />
        </button>
        <span className="text-sm">
          {pageNumber} / {pages.length}
        </span>
        <button onClick={() => go(1)} disabled={idx >= pages.length - 1} className="disabled:opacity-30">
          <ChevronRight />
        </button>
      </div>
    </div>
  );
}
