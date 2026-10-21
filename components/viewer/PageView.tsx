"use client";

import { useEffect, useRef, useState } from "react";
import { Page } from "react-pdf";
import { useDocStore } from "@/store/document";
import { Skeleton } from "@/components/ui/skeleton";
import { AnnotationLayer } from "@/components/editor/AnnotationLayer";
import { extractLines, type TextLine } from "@/lib/pdf/text";
import type { SearchHit } from "@/types";

/**
 * One rendered page: the pdf.js canvas plus the SVG annotation overlay.
 * Must be rendered inside a react-pdf <Document> (it supplies the shared
 * document so pages are loaded once, not once per page).
 */
export function PageView({
  pageNumber,
  pageId,
  hits,
  active,
  onSize,
}: {
  pageNumber: number;
  pageId: string;
  hits: SearchHit[];
  /** The page the user is working on — only this one extracts text targets. */
  active: boolean;
  onSize?: (w: number, h: number) => void;
}) {
  const { tool, zoom } = useDocStore();
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [targets, setTargets] = useState<TextLine[]>([]);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  const loadPage = async (p: import("pdfjs-dist").PDFPageProxy) => {
    const vp = p.getViewport({ scale: 1 });
    setDims({ w: vp.width, h: vp.height });
    onSize?.(vp.width, vp.height);
    if (!active) return;
    try {
      const lines = await extractLines(p);
      if (!cancelled.current) setTargets(lines);
    } catch {
      setTargets([]);
    }
  };

  return (
    <div className="relative inline-block shadow-lg ring-1 ring-black/5">
      <Page
        pageNumber={pageNumber}
        scale={zoom}
        renderTextLayer={false}
        renderAnnotationLayer={false}
        loading={<Skeleton className="h-[600px] w-[450px]" />}
        onLoadSuccess={loadPage}
      />
      {dims && (
        <AnnotationLayer
          pageId={pageId}
          wPts={dims.w}
          hPts={dims.h}
          editTargets={tool === "text" ? targets : []}
          hits={hits}
        />
      )}
    </div>
  );
}
