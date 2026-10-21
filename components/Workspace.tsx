"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Document } from "react-pdf";
import "@/lib/pdf/pdfjs";
import { useDocStore } from "@/store/document";
import { exportPdf } from "@/lib/pdf/export";
import { searchDocument, type SearchHit } from "@/lib/pdf/search";
import { useKeyboardShortcuts, onShortcut } from "@/lib/hooks/useKeyboardShortcuts";
import { useAutosave, useRestoreSession } from "@/lib/hooks/useAutosave";
import { Toolbar, type DialogId } from "@/components/toolbar/Toolbar";
import { PagePanel } from "@/components/sidebar/PagePanel";
import { Viewer } from "@/components/viewer/Viewer";
import { PropertiesPanel } from "@/components/editor/PropertiesPanel";
import { StatusBar } from "@/components/app/StatusBar";
import { SearchPanel } from "@/components/app/SearchPanel";
import { Welcome, type Task } from "@/components/app/Welcome";
import { ShortcutsDialog } from "@/components/app/ShortcutsDialog";
import { SplitDialog } from "@/components/dialogs/SplitDialog";
import { WatermarkDialog } from "@/components/dialogs/WatermarkDialog";
import { CompressDialog } from "@/components/dialogs/CompressDialog";
import { ExportDialog } from "@/components/dialogs/ExportDialog";
import { MarginsDialog } from "@/components/dialogs/MarginsDialog";
import { PageNumbersDialog } from "@/components/dialogs/PageNumbersDialog";
import { RemoveImagesDialog } from "@/components/dialogs/RemoveImagesDialog";
import { ingestFiles } from "@/lib/pdf/ingest";
import { Skeleton } from "@/components/ui/skeleton";

export function Workspace() {
  useKeyboardShortcuts();
  const { files, pages, pageNumbers, watermark, tool, selectedId, filesRev } = useDocStore();
  const [docBytes, setDocBytes] = useState<Uint8Array | null>(null);
  const [dialog, setDialog] = useState<DialogId | null>(null);
  const [pendingTask, setPendingTask] = useState<Task | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [hitIndex, setHitIndex] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  // pdf.js detaches the buffer it is given, so hand it a private copy.
  const file = useMemo(() => (docBytes ? { data: docBytes.slice(0) } : null), [docBytes]);

  const { saving, savedAt } = useAutosave();
  useRestoreSession();

  // Global shortcuts (⌘F, ?) reach the shell through the shortcut bus.
  useEffect(() => onShortcut("search", () => setSearchOpen((v) => !v)), []);
  useEffect(() => onShortcut("shortcuts", () => setDialog("shortcuts")), []);

  // Where a chosen task takes the user once the files are in.
  const afterIngest = useCallback((task: Task | null, count: number) => {
    if (task === "compress") setDialog("compress");
    else if (task === "split") setDialog("split");
    else if (task === "watermark") setDialog("watermark");
    else if (task === "redact") useDocStore.getState().setTool("redact");
    else if (task === "merge")
      toast.success(
        `Merged ${count} PDF${count === 1 ? "" : "s"} into one document`,
      );
  }, []);

  // Re-serialize whenever the page model changes so viewer + thumbnails
  // reflect the current order/rotation/blank pages/crops. Annotations render
  // live as an SVG overlay, so they are deliberately not part of this key.
  // `filesRev` covers the edits that rewrite a source file in place, which
  // leave the page list untouched.
  const key = useMemo(
    () =>
      pages
        .map(
          (p) =>
            `${p.fileId}:${p.sourceIndex}:${p.rotation}:${p.isBlank}:${
              p.crop ? `${p.crop.top},${p.crop.right},${p.crop.bottom},${p.crop.left}` : ""
            }`,
        )
        .join("|") +
      `#${filesRev}` +
      `#${watermark ? `${watermark.text}${watermark.size}${watermark.opacity}${watermark.rotation}${watermark.color}` : ""}` +
      `#${pageNumbers.enabled}${pageNumbers.position}${pageNumbers.format}${pageNumbers.startAt}`,
    [pages, filesRev, watermark, pageNumbers],
  );

  useEffect(() => {
    let cancelled = false;
    if (!pages.length) return;
    const t = setTimeout(() => {
      exportPdf(files, pages, { pageNumbers, watermark })
        .then((b) => {
          if (!cancelled) setDocBytes(b);
        })
        .catch(() => {});
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Search: run against the exported bytes, debounced.
  useEffect(() => {
    if (!searchOpen || !query.trim() || !docBytes) return;
    let cancelled = false;
    const t = setTimeout(() => {
      searchDocument(docBytes, query)
        .then((h) => {
          if (cancelled) return;
          setHits(h);
          setHitIndex(0);
          if (h.length) {
            const p = useDocStore.getState().pages[h[0].pageIndex];
            if (p) useDocStore.getState().setCurrent(p.id);
          }
        })
        .catch(() => setHits([]));
    }, 320);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, searchOpen, docBytes]);

  const navigateHits = useCallback(
    (next: number) => {
      if (!hits.length) return;
      const i = (next + hits.length) % hits.length;
      setHitIndex(i);
      const p = useDocStore.getState().pages[hits[i].pageIndex];
      if (p) useDocStore.getState().setCurrent(p.id);
    },
    [hits],
  );

  // A task card on the welcome screen: pick a file, then jump into the tool.
  const runTask = useCallback(
    async (task: Task, count: number) => {
      if (count > 0) {
        setPendingTask(null);
        afterIngest(task, count);
        return;
      }
      setPendingTask(task);
      fileInput.current?.click();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const onPicked = async (files: FileList | null) => {
    if (!files) return;
    const count = await ingestFiles(files);
    const task = pendingTask;
    setPendingTask(null);
    if (count > 0) afterIngest(task, count);
  };

  const activeBytes = pages.length ? docBytes : null;

  if (pages.length === 0) {
    return (
      <div className="flex h-screen flex-col">
        <Welcome
          onTask={runTask}
          onShortcuts={() => setDialog("shortcuts")}
        />
        <input
          id="task-file-input"
          ref={fileInput}
          type="file"
          accept="application/pdf"
          multiple
          hidden
          onChange={(e) => {
            void onPicked(e.target.files);
            e.target.value = "";
          }}
        />
        <ShortcutsDialog
          open={dialog === "shortcuts"}
          onOpenChange={(v) => setDialog(v ? "shortcuts" : null)}
        />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <Toolbar onToggleSearch={() => setSearchOpen((v) => !v)} onOpenDialog={setDialog} />
      {/* One react-pdf document for the whole app: the sidebar thumbnails and
          the viewer share a single copy of the bytes and a single pdf.js
          instance instead of one per thumbnail. */}
      <Document
        file={file}
        className="flex flex-1 overflow-hidden"
        loading={<Skeleton className="m-8 h-[600px] w-[450px]" />}
      >
        <PagePanel onExportSelection={() => setDialog("export")} />
        <div className="relative flex flex-1 overflow-hidden">
          <Viewer hits={hits} />
          <SearchPanel
            open={searchOpen}
            query={query}
            hits={hits}
            index={hitIndex}
            onQuery={(q) => {
              setQuery(q);
              if (!q.trim()) setHits([]);
            }}
            onNavigate={navigateHits}
            onClose={() => {
              setSearchOpen(false);
              setQuery("");
              setHits([]);
            }}
          />
        </div>
        {(tool !== "select" || selectedId != null) && <PropertiesPanel />}
      </Document>
      <StatusBar docBytes={activeBytes} savedAt={savedAt} saving={saving} />

      <SplitDialog open={dialog === "split"} onOpenChange={(v) => setDialog(v ? "split" : null)} />
      <WatermarkDialog
        open={dialog === "watermark"}
        onOpenChange={(v) => setDialog(v ? "watermark" : null)}
      />
      <CompressDialog
        open={dialog === "compress"}
        onOpenChange={(v) => setDialog(v ? "compress" : null)}
      />
      <ExportDialog
        open={dialog === "export"}
        onOpenChange={(v) => setDialog(v ? "export" : null)}
      />
      <MarginsDialog
        open={dialog === "margins"}
        onOpenChange={(v) => setDialog(v ? "margins" : null)}
      />
      <PageNumbersDialog
        open={dialog === "pagenumbers"}
        onOpenChange={(v) => setDialog(v ? "pagenumbers" : null)}
      />
      <RemoveImagesDialog
        open={dialog === "removeimages"}
        onOpenChange={(v) => setDialog(v ? "removeimages" : null)}
      />
      <ShortcutsDialog
        open={dialog === "shortcuts"}
        onOpenChange={(v) => setDialog(v ? "shortcuts" : null)}
      />
    </div>
  );
}
