"use client";

import { useEffect, useRef, useState } from "react";
import { useDocStore } from "@/store/document";
import { PageView } from "@/components/viewer/PageView";
import { clamp } from "@/lib/utils";
import type { SearchHit } from "@/types";

/**
 * The canvas area. Three view modes, mirroring what every other PDF tool
 * offers: a single page, a continuous scroll, and a facing (spread) layout.
 */
export function Viewer({ hits = [] }: { hits?: SearchHit[] }) {
  const { pages, currentPageId, setCurrent, fit, viewMode, tool } = useDocStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [pageSize, setPageSize] = useState<{ w: number; h: number } | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  // Track the viewport size so "fit width" / "fit page" can be recomputed.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Fit modes translate the container size into a zoom level.
  useEffect(() => {
    if (fit === "none" || !pageSize || !box.w || !box.h) return;
    const availW = box.w - 64;
    const availH = box.h - 64;
    const scale =
      fit === "width"
        ? availW / pageSize.w
        : Math.min(availW / pageSize.w, availH / pageSize.h);
    useDocStore.getState().setZoom(clamp(scale, 0.25, 4));
  }, [fit, pageSize, box]);

  // In continuous mode the page under the viewport is the current page.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || viewMode === "single") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const best = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const id = best?.target.getAttribute("data-page-id");
        if (id) setCurrent(id);
      },
      { root, threshold: [0.25, 0.6] },
    );
    root.querySelectorAll("[data-page-id]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [pages, viewMode, setCurrent]);

  const currentIndex = pages.findIndex((p) => p.id === currentPageId);
  const activeId = currentIndex >= 0 ? currentPageId : pages[0]?.id;

  // Pan only in select mode, and never when the click lands on an annotation
  // shape (those have pointer-events; empty area passes through to here).
  const canPan = (e: React.MouseEvent) =>
    tool === "select" && !(e.target as Element).closest("svg[data-annotations]");

  const hitsByPage = new Map<string, SearchHit[]>();
  for (const h of hits) {
    const id = pages[h.pageIndex]?.id;
    if (!id) continue;
    const list = hitsByPage.get(id) ?? [];
    list.push(h);
    hitsByPage.set(id, list);
  }

  const renderPage = (pageId: string, pageNumber: number) => (
    <PageView
      key={pageId}
      pageId={pageId}
      pageNumber={pageNumber}
      hits={hitsByPage.get(pageId) ?? []}
      active={pageId === activeId}
      onSize={(w, h) => {
        if (pageId === activeId) setPageSize({ w, h });
      }}
    />
  );

  return (
    <div
      ref={scrollRef}
      className="relative flex-1 overflow-auto bg-muted/30"
      style={{ cursor: dragStart ? "grabbing" : tool === "select" ? "grab" : "default" }}
      onMouseDown={(e) => canPan(e) && setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })}
      onMouseMove={(e) => dragStart && setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })}
      onMouseUp={() => setDragStart(null)}
      onMouseLeave={() => setDragStart(null)}
    >
      <div style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}>
        <div className="flex min-h-full items-center justify-center p-8">
          {viewMode === "single" ? (
            activeId ? (
              <div className="inline-block">{renderPage(activeId, currentIndex + 1)}</div>
            ) : null
          ) : viewMode === "facing" ? (
            <div className="flex flex-col items-center gap-6">
              {Array.from({ length: Math.ceil(pages.length / 2) }, (_, i) => {
                const a = pages[i * 2];
                const b = pages[i * 2 + 1];
                return (
                  <div key={a.id} className="flex gap-4">
                    {renderPage(a.id, i * 2 + 1)}
                    {b ? renderPage(b.id, i * 2 + 2) : <div className="w-1" />}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-6">
              {pages.map((p, i) => (
                <div key={p.id} data-page-id={p.id} className="inline-block">
                  {renderPage(p.id, i + 1)}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
