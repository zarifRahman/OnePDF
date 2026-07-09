"use client";
import { useEffect, useMemo, useState } from "react";
import "@/lib/pdf/pdfjs";
import { useDocStore } from "@/store/document";
import { exportPdf } from "@/lib/pdf/export";
import { useKeyboardShortcuts } from "@/lib/hooks/useKeyboardShortcuts";
import { Toolbar } from "@/components/toolbar/Toolbar";
import { ThumbnailList } from "@/components/sidebar/ThumbnailList";
import { Viewer } from "@/components/viewer/Viewer";
import { Dropzone } from "@/components/upload/Dropzone";

export function Workspace() {
  useKeyboardShortcuts();
  const { files, pages } = useDocStore();
  const [docBytes, setDocBytes] = useState<Uint8Array | null>(null);

  // Re-serialize whenever the descriptor model changes so viewer + thumbnails
  // reflect the current order/rotation/blank pages. `key` collapses the
  // dependency to the parts that affect rendered output.
  const key = useMemo(
    () => pages.map((p) => `${p.fileId}:${p.sourceIndex}:${p.rotation}:${p.isBlank}`).join("|"),
    [pages],
  );

  useEffect(() => {
    let cancelled = false;
    if (!pages.length) return; // empty state renders the dropzone; docBytes unused
    exportPdf(files, pages)
      .then((b) => {
        if (!cancelled) setDocBytes(b);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div className="flex h-screen flex-col">
      <Toolbar />
      {pages.length === 0 ? (
        <div className="grid flex-1 place-items-center p-8">
          <div className="w-full max-w-lg">
            <Dropzone />
          </div>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          <aside className="w-[190px] shrink-0 overflow-y-auto border-r">
            <ThumbnailList docBytes={docBytes} />
          </aside>
          <Viewer docBytes={docBytes} />
        </div>
      )}
    </div>
  );
}
