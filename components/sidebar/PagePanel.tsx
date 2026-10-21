"use client";

import { useState } from "react";
import { RotateCcw, RotateCw, Copy, Trash2, X, Download, Layers } from "lucide-react";
import { useDocStore } from "@/store/document";
import { ThumbnailList } from "./ThumbnailList";

function BarBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      className="rounded p-1.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </button>
  );
}

/** Left rail: the page grid plus the batch actions for multi-selected pages. */
export function PagePanel({ onExportSelection }: { onExportSelection: () => void }) {
  const {
    pages,
    selectedPageIds,
    rotatePages,
    duplicatePages,
    deletePages,
    clearPageSelection,
    selectAllPages,
  } = useDocStore();
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <aside className="flex w-10 shrink-0 flex-col items-center gap-2 border-r py-2">
        <BarBtn title="Show pages" onClick={() => setCollapsed(false)}>
          <Layers className="h-4 w-4" />
        </BarBtn>
        <span className="text-xs text-muted-foreground [writing-mode:vertical-rl]">
          {pages.length} pages
        </span>
      </aside>
    );
  }

  return (
    <aside className="flex w-[210px] shrink-0 flex-col border-r">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-sm font-medium">
          Pages <span className="text-muted-foreground">({pages.length})</span>
        </span>
        <div className="flex items-center gap-0.5">
          <BarBtn title="Select all pages" onClick={selectAllPages}>
            <Layers className="h-4 w-4" />
          </BarBtn>
          <BarBtn title="Hide page panel" onClick={() => setCollapsed(true)}>
            <X className="h-4 w-4" />
          </BarBtn>
        </div>
      </div>

      {selectedPageIds.length > 0 && (
        <div className="flex items-center gap-0.5 border-b bg-primary/5 px-2 py-1.5">
          <span className="mr-1 whitespace-nowrap text-xs text-primary">
            {selectedPageIds.length} sel.
          </span>
          <BarBtn title="Rotate left" onClick={() => rotatePages(selectedPageIds, -90)}>
            <RotateCcw className="h-4 w-4" />
          </BarBtn>
          <BarBtn title="Rotate right" onClick={() => rotatePages(selectedPageIds, 90)}>
            <RotateCw className="h-4 w-4" />
          </BarBtn>
          <BarBtn title="Duplicate" onClick={() => duplicatePages(selectedPageIds)}>
            <Copy className="h-4 w-4" />
          </BarBtn>
          <BarBtn title="Export selection" onClick={onExportSelection}>
            <Download className="h-4 w-4" />
          </BarBtn>
          <BarBtn title="Delete pages" onClick={() => deletePages(selectedPageIds)}>
            <Trash2 className="h-4 w-4" />
          </BarBtn>
          <BarBtn title="Clear selection" onClick={clearPageSelection}>
            <X className="h-4 w-4" />
          </BarBtn>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <ThumbnailList />
      </div>
    </aside>
  );
}
