# OnePDF Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A runnable, fully client-side PDF tool: upload multiple PDFs, reorder/rotate/delete/insert-blank pages, merge, preview with zoom/pan, undo/redo, dark mode, and download a correct PDF.

**Architecture:** pdf.js (react-pdf) renders read-only; pdf-lib owns all mutation. The Zustand store holds a lightweight ordered array of page descriptors (metadata only) — edits mutate descriptors, not bytes. Export serializes descriptors → bytes via pdf-lib. Undo/redo snapshots the descriptor array.

**Tech Stack:** Next.js (App Router), TypeScript strict, Tailwind, shadcn/ui, Lucide, dnd-kit, react-pdf, pdf-lib, Zustand, Sonner, Framer Motion, next-themes. pnpm.

---

## File Structure

```
app/layout.tsx            # root layout, theme provider, Sonner
app/page.tsx              # workspace: toolbar + sidebar + viewer, empty state
app/globals.css           # tailwind + shadcn tokens
lib/pdf/export.ts         # exportPdf(files, pages) -> Uint8Array   [core]
lib/pdf/load.ts           # loadFile(bytes) -> {bytes, pageCount}
lib/pdf/pdfjs.ts          # pdf.js worker setup for react-pdf
lib/utils.ts              # cn() + uuid + download helper
lib/hooks/useKeyboardShortcuts.ts
store/document.ts         # zustand store + actions + undo/redo
types/index.ts            # PageDescriptor, SourceFile
components/upload/Dropzone.tsx
components/sidebar/ThumbnailList.tsx
components/sidebar/ThumbnailItem.tsx   # dnd-kit sortable, lazy canvas
components/viewer/Viewer.tsx
components/toolbar/Toolbar.tsx
components/ui/*            # shadcn primitives (button, tooltip, etc.)
lib/pdf/export.test.ts    # vitest checks for the core
```

---

## Task 1: Scaffold Next.js + dependencies

**Files:** whole project.

- [ ] **Step 1: Scaffold**

```bash
cd /Users/shikho/Desktop/OnePDF/OnePDF
pnpm create next-app@latest . --ts --tailwind --app --eslint --src-dir=false --import-alias "@/*" --no-turbopack --yes
```

- [ ] **Step 2: Install deps**

```bash
pnpm add pdf-lib react-pdf zustand sonner framer-motion next-themes lucide-react @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities uuid
pnpm add -D vitest @types/uuid
```

- [ ] **Step 3: Init shadcn/ui**

```bash
pnpm dlx shadcn@latest init -d
pnpm dlx shadcn@latest add button tooltip dropdown-menu dialog skeleton
```

- [ ] **Step 4: Verify dev server boots**

Run: `pnpm dev` → open http://localhost:3000 → default Next page renders. Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: scaffold Next.js app with deps"
```

---

## Task 2: Types + core export (TDD)

**Files:** Create `types/index.ts`, `lib/pdf/export.ts`, `lib/pdf/export.test.ts`.

- [ ] **Step 1: Types**

```ts
// types/index.ts
export type Rotation = 0 | 90 | 180 | 270;

export type PageDescriptor = {
  id: string;
  fileId: string;      // "" for blank pages
  sourceIndex: number; // -1 for blank pages
  rotation: Rotation;
  isBlank: boolean;
};

export type SourceFile = {
  id: string;
  name: string;
  bytes: Uint8Array;
  pageCount: number;
};
```

- [ ] **Step 2: Failing test**

```ts
// lib/pdf/export.test.ts
import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { exportPdf } from "./export";
import type { SourceFile, PageDescriptor } from "@/types";

async function makeSource(id: string, pages: number): Promise<SourceFile> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([200, 200]);
  const bytes = await doc.save();
  return { id, name: `${id}.pdf`, bytes, pageCount: pages };
}
const p = (o: Partial<PageDescriptor>): PageDescriptor => ({
  id: crypto.randomUUID(), fileId: "", sourceIndex: -1, rotation: 0, isBlank: false, ...o,
});

describe("exportPdf", () => {
  it("merges two 1-page docs into 2 pages", async () => {
    const a = await makeSource("a", 1), b = await makeSource("b", 1);
    const out = await exportPdf({ a, b }, [
      p({ fileId: "a", sourceIndex: 0 }), p({ fileId: "b", sourceIndex: 0 }),
    ]);
    expect((await PDFDocument.load(out)).getPageCount()).toBe(2);
  });

  it("reorders pages", async () => {
    const a = await makeSource("a", 3);
    const order = [2, 0, 1];
    const out = await exportPdf({ a }, order.map((i) => p({ fileId: "a", sourceIndex: i })));
    expect((await PDFDocument.load(out)).getPageCount()).toBe(3);
  });

  it("applies rotation", async () => {
    const a = await makeSource("a", 1);
    const out = await exportPdf({ a }, [p({ fileId: "a", sourceIndex: 0, rotation: 90 })]);
    const doc = await PDFDocument.load(out);
    expect(doc.getPage(0).getRotation().angle).toBe(90);
  });

  it("inserts a blank page", async () => {
    const a = await makeSource("a", 1);
    const out = await exportPdf({ a }, [
      p({ fileId: "a", sourceIndex: 0 }), p({ isBlank: true }),
    ]);
    expect((await PDFDocument.load(out)).getPageCount()).toBe(2);
  });
});
```

- [ ] **Step 3: Run — expect fail**

Run: `pnpm vitest run lib/pdf/export.test.ts` → FAIL (exportPdf not defined).

- [ ] **Step 4: Implement**

```ts
// lib/pdf/export.ts
import { PDFDocument, degrees } from "pdf-lib";
import type { SourceFile, PageDescriptor } from "@/types";

const BLANK = [612, 792] as const; // US Letter

// Serialize the ordered descriptor model into a single PDF. Source docs are
// loaded once and cached so copyPages is cheap across many descriptors.
export async function exportPdf(
  files: Record<string, SourceFile>,
  pages: PageDescriptor[],
): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const cache = new Map<string, PDFDocument>();

  const srcDoc = async (fileId: string) => {
    let d = cache.get(fileId);
    if (!d) { d = await PDFDocument.load(files[fileId].bytes); cache.set(fileId, d); }
    return d;
  };

  for (const pg of pages) {
    if (pg.isBlank) { out.addPage([BLANK[0], BLANK[1]]); continue; }
    const [copied] = await out.copyPages(await srcDoc(pg.fileId), [pg.sourceIndex]);
    if (pg.rotation) copied.setRotation(degrees(pg.rotation));
    out.addPage(copied);
  }
  return out.save();
}
```

- [ ] **Step 5: Run — expect pass**

Run: `pnpm vitest run lib/pdf/export.test.ts` → 4 pass.

- [ ] **Step 6: Add `test` script + commit**

Add to package.json scripts: `"test": "vitest run"`.

```bash
git add -A && git commit -m "feat: core pdf export with merge/reorder/rotate/blank"
```

---

## Task 3: Load helper + pdf.js worker

**Files:** Create `lib/pdf/load.ts`, `lib/pdf/pdfjs.ts`, `lib/utils.ts` (extend).

- [ ] **Step 1: load.ts**

```ts
// lib/pdf/load.ts
import { PDFDocument } from "pdf-lib";

export async function loadFile(bytes: Uint8Array): Promise<{ bytes: Uint8Array; pageCount: number }> {
  // Throws on corrupt/non-PDF — caller shows a toast and skips the file.
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return { bytes, pageCount: doc.getPageCount() };
}
```

- [ ] **Step 2: pdfjs worker setup**

```ts
// lib/pdf/pdfjs.ts
import { pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Serve the worker locally (copied to /public by postinstall) to keep it offline.
pdfjs.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs`;
```

Add a `postinstall` script to copy the worker:
`"postinstall": "node -e \"require('fs').copyFileSync(require.resolve('pdfjs-dist/build/pdf.worker.min.mjs'),'public/pdf.worker.min.mjs')\""`
Then run `pnpm postinstall` once now.

- [ ] **Step 3: utils — download + uuid**

```ts
// lib/utils.ts  (append to shadcn-generated file that already exports cn)
import { v4 as uuid } from "uuid";
export { uuid };

export function downloadBytes(bytes: Uint8Array, name: string) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: pdf load helper, pdfjs worker, download util"
```

---

## Task 4: Zustand store with undo/redo (TDD)

**Files:** Create `store/document.ts`, `store/document.test.ts`.

- [ ] **Step 1: Failing test**

```ts
// store/document.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { useDocStore } from "./document";
import type { SourceFile } from "@/types";

const src: SourceFile = { id: "a", name: "a.pdf", bytes: new Uint8Array(), pageCount: 2 };

beforeEach(() => useDocStore.getState().reset());

describe("doc store", () => {
  it("addFile appends descriptors", () => {
    useDocStore.getState().addFile(src);
    expect(useDocStore.getState().pages.length).toBe(2);
  });
  it("deletePage then undo restores", () => {
    const s = useDocStore.getState();
    s.addFile(src);
    const id = useDocStore.getState().pages[0].id;
    s.deletePage(id);
    expect(useDocStore.getState().pages.length).toBe(1);
    s.undo();
    expect(useDocStore.getState().pages.length).toBe(2);
    s.redo();
    expect(useDocStore.getState().pages.length).toBe(1);
  });
  it("rotatePage cycles 0->90", () => {
    const s = useDocStore.getState();
    s.addFile(src);
    const id = useDocStore.getState().pages[0].id;
    s.rotatePage(id, 90);
    expect(useDocStore.getState().pages[0].rotation).toBe(90);
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `pnpm vitest run store/document.test.ts` → FAIL.

- [ ] **Step 3: Implement store**

```ts
// store/document.ts
import { create } from "zustand";
import { uuid } from "@/lib/utils";
import type { PageDescriptor, SourceFile, Rotation } from "@/types";

type State = {
  files: Record<string, SourceFile>;
  pages: PageDescriptor[];
  currentPageId: string | null;
  zoom: number;
  past: PageDescriptor[][];
  future: PageDescriptor[][];
};
type Actions = {
  addFile: (f: SourceFile) => void;
  reorder: (pages: PageDescriptor[]) => void;
  deletePage: (id: string) => void;
  rotatePage: (id: string, delta: number) => void;
  insertBlankAfter: (id: string | null) => void;
  setCurrent: (id: string) => void;
  setZoom: (z: number) => void;
  undo: () => void;
  redo: () => void;
  reset: () => void;
};

const init: State = { files: {}, pages: [], currentPageId: null, zoom: 1, past: [], future: [] };

// commit() snapshots current pages onto past before a mutation; clears future.
export const useDocStore = create<State & Actions>((set, get) => {
  const commit = (next: PageDescriptor[]) =>
    set((s) => ({ pages: next, past: [...s.past, s.pages], future: [] }));

  return {
    ...init,
    addFile: (f) => {
      const descriptors: PageDescriptor[] = Array.from({ length: f.pageCount }, (_, i) => ({
        id: uuid(), fileId: f.id, sourceIndex: i, rotation: 0, isBlank: false,
      }));
      set((s) => ({
        files: { ...s.files, [f.id]: f },
        pages: [...s.pages, ...descriptors],
        past: [...s.past, s.pages], future: [],
        currentPageId: s.currentPageId ?? descriptors[0]?.id ?? null,
      }));
    },
    reorder: (pages) => commit(pages),
    deletePage: (id) => {
      const next = get().pages.filter((p) => p.id !== id);
      commit(next);
      if (get().currentPageId === id) set({ currentPageId: next[0]?.id ?? null });
    },
    rotatePage: (id, delta) =>
      commit(get().pages.map((p) =>
        p.id === id ? { ...p, rotation: (((p.rotation + delta) % 360 + 360) % 360) as Rotation } : p)),
    insertBlankAfter: (id) => {
      const pages = [...get().pages];
      const blank: PageDescriptor = { id: uuid(), fileId: "", sourceIndex: -1, rotation: 0, isBlank: true };
      const idx = id ? pages.findIndex((p) => p.id === id) : pages.length - 1;
      pages.splice(idx + 1, 0, blank);
      commit(pages);
    },
    setCurrent: (id) => set({ currentPageId: id }),
    setZoom: (z) => set({ zoom: Math.min(4, Math.max(0.25, z)) }),
    undo: () => set((s) => {
      if (!s.past.length) return s;
      const prev = s.past[s.past.length - 1];
      return { pages: prev, past: s.past.slice(0, -1), future: [s.pages, ...s.future] };
    }),
    redo: () => set((s) => {
      if (!s.future.length) return s;
      const next = s.future[0];
      return { pages: next, past: [...s.past, s.pages], future: s.future.slice(1) };
    }),
    reset: () => set({ ...init }),
  };
});
```

- [ ] **Step 4: Run — expect pass**

Run: `pnpm vitest run store/document.test.ts` → 3 pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: zustand document store with undo/redo"
```

---

## Task 5: Dropzone upload

**Files:** Create `components/upload/Dropzone.tsx`.

- [ ] **Step 1: Implement**

```tsx
// components/upload/Dropzone.tsx
"use client";
import { useCallback, useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useDocStore } from "@/store/document";
import { loadFile } from "@/lib/pdf/load";
import { uuid } from "@/lib/utils";

export function Dropzone({ compact = false }: { compact?: boolean }) {
  const addFile = useDocStore((s) => s.addFile);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const ingest = useCallback(async (fileList: FileList) => {
    for (const file of Array.from(fileList)) {
      if (file.type !== "application/pdf") { toast.error(`${file.name}: not a PDF`); continue; }
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const { pageCount } = await loadFile(bytes);
        addFile({ id: uuid(), name: file.name, bytes, pageCount });
        toast.success(`Added ${file.name} (${pageCount} pages)`);
      } catch { toast.error(`${file.name}: could not read PDF`); }
    }
  }, [addFile]);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); ingest(e.dataTransfer.files); }}
      onClick={() => inputRef.current?.click()}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors
        ${dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"}
        ${compact ? "gap-1 p-4 text-sm" : "gap-3 p-12"}`}
    >
      <UploadCloud className={compact ? "h-5 w-5" : "h-10 w-10 text-muted-foreground"} />
      <p className="font-medium">{compact ? "Add PDFs" : "Drop PDFs here or click to browse"}</p>
      {!compact && <p className="text-sm text-muted-foreground">Multiple files supported · processed in your browser</p>}
      <input ref={inputRef} type="file" accept="application/pdf" multiple hidden
        onChange={(e) => e.target.files && ingest(e.target.files)} />
    </motion.div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: drag-drop upload dropzone"
```

---

## Task 6: Thumbnail sidebar (dnd-kit + lazy render)

**Files:** Create `components/sidebar/ThumbnailItem.tsx`, `components/sidebar/ThumbnailList.tsx`.

- [ ] **Step 1: ThumbnailItem — sortable, lazy canvas**

```tsx
// components/sidebar/ThumbnailItem.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Document, Page } from "react-pdf";
import { RotateCw, Trash2, FilePlus } from "lucide-react";
import { useDocStore } from "@/store/document";
import type { PageDescriptor } from "@/types";

// docBytes: the exported bytes of the whole doc; pageNumber is 1-based index in it.
export function ThumbnailItem({ page, pageNumber, docBytes }: {
  page: PageDescriptor; pageNumber: number; docBytes: Uint8Array | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id });
  const { currentPageId, setCurrent, rotatePage, deletePage, insertBlankAfter } = useDocStore();
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: "200px" });
    io.observe(el); return () => io.disconnect();
  }, []);

  const active = currentPageId === page.id;
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}>
      <div ref={ref} onClick={() => setCurrent(page.id)}
        className={`group relative rounded-lg border p-1 ${active ? "border-primary ring-1 ring-primary" : "border-border"}`}>
        <div {...attributes} {...listeners} className="cursor-grab">
          {visible && docBytes ? (
            <Document file={{ data: docBytes }} loading={<Skel />}>
              <Page pageNumber={pageNumber} width={140} renderTextLayer={false} renderAnnotationLayer={false} loading={<Skel />} />
            </Document>
          ) : <Skel />}
        </div>
        <span className="absolute bottom-1 left-1 rounded bg-background/80 px-1 text-xs">{pageNumber}</span>
        <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 group-hover:opacity-100">
          <IconBtn onClick={(e) => { e.stopPropagation(); rotatePage(page.id, 90); }}><RotateCw className="h-3.5 w-3.5" /></IconBtn>
          <IconBtn onClick={(e) => { e.stopPropagation(); insertBlankAfter(page.id); }}><FilePlus className="h-3.5 w-3.5" /></IconBtn>
          <IconBtn onClick={(e) => { e.stopPropagation(); deletePage(page.id); }}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
        </div>
      </div>
    </div>
  );
}
const Skel = () => <div className="h-[180px] w-[140px] animate-pulse rounded bg-muted" />;
const IconBtn = ({ children, onClick }: { children: React.ReactNode; onClick: (e: React.MouseEvent) => void }) => (
  <button onClick={onClick} className="rounded bg-background/90 p-1 hover:bg-accent">{children}</button>
);
```

- [ ] **Step 2: ThumbnailList — DnD context**

```tsx
// components/sidebar/ThumbnailList.tsx
"use client";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { useDocStore } from "@/store/document";
import { ThumbnailItem } from "./ThumbnailItem";

export function ThumbnailList({ docBytes }: { docBytes: Uint8Array | null }) {
  const { pages, reorder } = useDocStore();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldI = pages.findIndex((p) => p.id === active.id);
    const newI = pages.findIndex((p) => p.id === over.id);
    reorder(arrayMove(pages, oldI, newI));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={pages.map((p) => p.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-3 p-3">
          {pages.map((p, i) => <ThumbnailItem key={p.id} page={p} pageNumber={i + 1} docBytes={docBytes} />)}
        </div>
      </SortableContext>
    </DndContext>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: sortable thumbnail sidebar with lazy render"
```

---

## Task 7: Viewer with zoom/pan/navigation

**Files:** Create `components/viewer/Viewer.tsx`.

- [ ] **Step 1: Implement**

```tsx
// components/viewer/Viewer.tsx
"use client";
import { useState } from "react";
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
  const go = (d: number) => { const n = idx + d; if (n >= 0 && n < pages.length) setCurrent(pages[n].id); };

  if (!docBytes) return <div className="grid flex-1 place-items-center text-muted-foreground">No page selected</div>;

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden bg-muted/30">
      <div
        className="flex flex-1 items-center justify-center overflow-auto p-8"
        style={{ cursor: dragStart ? "grabbing" : "grab" }}
        onMouseDown={(e) => setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })}
        onMouseMove={(e) => dragStart && setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })}
        onMouseUp={() => setDragStart(null)} onMouseLeave={() => setDragStart(null)}
      >
        <div style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}>
          <Document file={{ data: docBytes }} loading={<Skeleton className="h-[600px] w-[450px]" />}>
            <Page pageNumber={pageNumber} scale={zoom} renderTextLayer renderAnnotationLayer={false}
              loading={<Skeleton className="h-[600px] w-[450px]" />}
              className="shadow-lg" />
          </Document>
        </div>
      </div>
      <div className="flex items-center justify-center gap-4 border-t bg-background/80 py-2 backdrop-blur">
        <button onClick={() => go(-1)} disabled={idx <= 0} className="disabled:opacity-30"><ChevronLeft /></button>
        <span className="text-sm">{pageNumber} / {pages.length}</span>
        <button onClick={() => go(1)} disabled={idx >= pages.length - 1} className="disabled:opacity-30"><ChevronRight /></button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: pdf viewer with zoom, pan, navigation"
```

---

## Task 8: Toolbar (zoom, undo/redo, download, theme)

**Files:** Create `components/toolbar/Toolbar.tsx`.

- [ ] **Step 1: Implement**

```tsx
// components/toolbar/Toolbar.tsx
"use client";
import { useTheme } from "next-themes";
import { Undo2, Redo2, ZoomIn, ZoomOut, Download, Moon, Sun, FileStack } from "lucide-react";
import { toast } from "sonner";
import { useDocStore } from "@/store/document";
import { exportPdf } from "@/lib/pdf/export";
import { downloadBytes } from "@/lib/utils";
import { Dropzone } from "@/components/upload/Dropzone";

export function Toolbar() {
  const { files, pages, zoom, setZoom, undo, redo, past, future } = useDocStore();
  const { theme, setTheme } = useTheme();

  const download = async () => {
    if (!pages.length) return;
    try {
      const bytes = await exportPdf(files, pages);
      downloadBytes(bytes, "onepdf-export.pdf");
      toast.success("Exported PDF");
    } catch { toast.error("Export failed"); }
  };

  return (
    <header className="flex items-center gap-2 border-b bg-background px-3 py-2">
      <FileStack className="h-5 w-5 text-primary" />
      <span className="font-semibold">OnePDF</span>
      <div className="mx-2 w-40"><Dropzone compact /></div>
      <div className="ml-auto flex items-center gap-1">
        <Btn onClick={undo} disabled={!past.length}><Undo2 className="h-4 w-4" /></Btn>
        <Btn onClick={redo} disabled={!future.length}><Redo2 className="h-4 w-4" /></Btn>
        <Btn onClick={() => setZoom(zoom - 0.25)}><ZoomOut className="h-4 w-4" /></Btn>
        <span className="w-12 text-center text-sm">{Math.round(zoom * 100)}%</span>
        <Btn onClick={() => setZoom(zoom + 0.25)}><ZoomIn className="h-4 w-4" /></Btn>
        <Btn onClick={() => setTheme(theme === "dark" ? "light" : "dark")}><Moon className="hidden h-4 w-4 dark:block" /><Sun className="h-4 w-4 dark:hidden" /></Btn>
        <button onClick={download} disabled={!pages.length}
          className="ml-2 flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-40">
          <Download className="h-4 w-4" /> Download
        </button>
      </div>
    </header>
  );
}
const Btn = ({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) => (
  <button onClick={onClick} disabled={disabled} className="rounded-md p-2 hover:bg-accent disabled:opacity-30">{children}</button>
);
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: top toolbar with export, zoom, undo/redo, theme"
```

---

## Task 9: Keyboard shortcuts hook

**Files:** Create `lib/hooks/useKeyboardShortcuts.ts`.

- [ ] **Step 1: Implement**

```ts
// lib/hooks/useKeyboardShortcuts.ts
"use client";
import { useEffect } from "react";
import { useDocStore } from "@/store/document";

export function useKeyboardShortcuts() {
  const { undo, redo, deletePage, currentPageId, pages, setCurrent } = useDocStore.getState();
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const s = useDocStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); s.undo(); }
      else if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) { e.preventDefault(); s.redo(); }
      else if (e.key === "Delete" && s.currentPageId) { s.deletePage(s.currentPageId); }
      else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const idx = s.pages.findIndex((p) => p.id === s.currentPageId);
        const n = idx + (e.key === "ArrowRight" ? 1 : -1);
        if (n >= 0 && n < s.pages.length) s.setCurrent(s.pages[n].id);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
}
```

(Reference args in destructure kept minimal — the handler reads fresh state via `getState()`.)

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: keyboard shortcuts"
```

---

## Task 10: Workspace page + layout wiring

**Files:** Modify `app/layout.tsx`, `app/page.tsx`. Create `components/theme-provider.tsx`.

- [ ] **Step 1: theme-provider**

```tsx
// components/theme-provider.tsx
"use client";
import { ThemeProvider as NextThemes } from "next-themes";
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <NextThemes attribute="class" defaultTheme="system" enableSystem>{children}</NextThemes>;
}
```

- [ ] **Step 2: layout.tsx**

```tsx
// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "sonner";

export const metadata: Metadata = { title: "OnePDF", description: "Browser-based PDF manager" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="h-screen overflow-hidden">
        <ThemeProvider>{children}<Toaster richColors position="bottom-right" /></ThemeProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: page.tsx — the workspace**

```tsx
// app/page.tsx
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

export default function Home() {
  useKeyboardShortcuts();
  const { files, pages } = useDocStore();
  const [docBytes, setDocBytes] = useState<Uint8Array | null>(null);

  // Re-serialize whenever the descriptor model changes so viewer + thumbnails
  // always reflect current order/rotation/blank pages. Debounced to a microtask.
  const key = useMemo(() => pages.map((p) => `${p.fileId}:${p.sourceIndex}:${p.rotation}:${p.isBlank}`).join("|"), [pages]);
  useEffect(() => {
    let cancelled = false;
    if (!pages.length) { setDocBytes(null); return; }
    exportPdf(files, pages).then((b) => { if (!cancelled) setDocBytes(b); }).catch(() => {});
    return () => { cancelled = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-screen flex-col">
      <Toolbar />
      {pages.length === 0 ? (
        <div className="grid flex-1 place-items-center p-8"><div className="w-full max-w-lg"><Dropzone /></div></div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          <aside className="w-[190px] shrink-0 overflow-y-auto border-r"><ThumbnailList docBytes={docBytes} /></aside>
          <Viewer docBytes={docBytes} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run full app**

Run: `pnpm dev` → upload 2 PDFs → reorder, rotate, delete, insert blank, zoom/pan, undo/redo, dark mode, download. Verify exported file matches on-screen order.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: wire workspace page, layout, theme, toaster"
```

---

## Task 11: README + final verify

**Files:** Modify `README.md`.

- [ ] **Step 1: Write install/run instructions**

Include: prerequisites (Node 18+, pnpm), `pnpm install`, `pnpm dev`, `pnpm test`, `pnpm build`; feature list; note that npm works too (`npm install && npm run dev`); architecture one-paragraph (render/edit split); Phase 2 roadmap.

- [ ] **Step 2: Full verify**

Run: `pnpm test` (all pass) · `pnpm build` (succeeds) · manual smoke of every Phase 1 feature.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "docs: README with install and usage"
```

---

## Self-Review Notes
- **Spec coverage:** upload✓(T5) merge✓(T2,T8) preview✓(T7) reorder✓(T6) rotate/delete/insert-blank✓(T2,T4,T6) zoom/pan/nav✓(T7) undo/redo✓(T4,T9) dark✓(T8,T10) shortcuts✓(T9) download✓(T8) lazy render✓(T6,T7) client-only✓. Annotation engine = Phase 2 (out of scope, per approved design).
- **Types consistent:** PageDescriptor/SourceFile identical across T2/T4; `rotatePage(id, delta)`, `insertBlankAfter(id)`, `exportPdf(files, pages)` names match across store, toolbar, page.
- **No placeholders:** all steps contain real code/commands.
