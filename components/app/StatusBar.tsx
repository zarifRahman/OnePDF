"use client";

import { ChevronLeft, ChevronRight, CloudOff, HardDriveDownload } from "lucide-react";
import { useDocStore } from "@/store/document";
import { formatBytes } from "@/lib/utils";

export function StatusBar({
  docBytes,
  savedAt,
  saving,
}: {
  docBytes: Uint8Array | null;
  savedAt: number | null;
  saving: boolean;
}) {
  const {
    pages,
    currentPageId,
    setCurrent,
    selectedPageIds,
    zoom,
    fit,
    viewMode,
    annotations,
  } = useDocStore();

  const idx = pages.findIndex((p) => p.id === currentPageId);
  const go = (d: number) => {
    const n = idx + d;
    if (n >= 0 && n < pages.length) setCurrent(pages[n].id);
  };

  const jump = (value: string) => {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n)) return;
    const p = pages[Math.min(Math.max(0, n - 1), pages.length - 1)];
    if (p) setCurrent(p.id);
  };

  return (
    <footer className="flex items-center gap-3 border-t bg-background px-3 py-1.5 text-xs text-muted-foreground">
      <div className="flex items-center gap-1">
        <button
          onClick={() => go(-1)}
          disabled={idx <= 0}
          aria-label="Previous page"
          className="rounded p-1 hover:bg-accent disabled:opacity-30"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <label className="flex items-center gap-1">
          <input
            value={idx >= 0 ? idx + 1 : 0}
            onChange={(e) => jump(e.target.value)}
            aria-label="Current page"
            className="h-6 w-8 rounded border border-transparent bg-transparent text-center hover:border-border focus:border-border focus:outline-none"
          />
          <span>/ {pages.length}</span>
        </label>
        <button
          onClick={() => go(1)}
          disabled={idx >= pages.length - 1}
          aria-label="Next page"
          className="rounded p-1 hover:bg-accent disabled:opacity-30"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {selectedPageIds.length > 0 && (
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
          {selectedPageIds.length} selected
        </span>
      )}

      {annotations.length > 0 && (
        <span>{annotations.length} mark{annotations.length === 1 ? "" : "s"}</span>
      )}

      <div className="ml-auto flex items-center gap-3">
        <span className="capitalize">{viewMode} view</span>
        <span>{fit !== "none" ? (fit === "width" ? "fit width" : "fit page") : `${Math.round(zoom * 100)}%`}</span>
        {docBytes && <span>{formatBytes(docBytes.length)}</span>}
        <span className="flex items-center gap-1" title="Saved in this browser only">
          {saving ? (
            <>
              <CloudOff className="h-3.5 w-3.5" /> Saving…
            </>
          ) : savedAt ? (
            <>
              <HardDriveDownload className="h-3.5 w-3.5" /> Saved locally
            </>
          ) : null}
        </span>
      </div>
    </footer>
  );
}
