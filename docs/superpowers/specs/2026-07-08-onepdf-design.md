# OnePDF — Browser-Based PDF Manager (Design)

Date: 2026-07-08
Status: Approved for Phase 1

## Goal

A modern, fully client-side PDF tool (Smallpdf/ILovePDF class): upload, merge,
preview, reorder, and edit PDFs entirely in the browser. No server uploads.

This document specifies **Phase 1** in full and outlines **Phase 2** at a high
level. Phase 1 is a runnable, end-to-end deliverable.

## Core architectural decision: render/edit split

Two libraries with strictly separate jobs:

- **pdf.js (via `react-pdf`)** — renders pages and thumbnails to `<canvas>` for
  display only. Read-only. Never mutates a document.
- **pdf-lib** — owns the document model and every mutation (reorder, delete,
  rotate, insert blank, merge; in Phase 2, all annotations). Source of truth.

Data flow:

```
uploaded bytes → pdf-lib doc(s) [truth]
              → page-descriptor model (ordered metadata)
              → export: serialize to bytes
              → pdf.js renders bytes for view + thumbnails
```

The **page-descriptor model** is the pivot. The store never mutates PDF bytes on
each edit; it mutates a lightweight ordered array of descriptors. Bytes are only
re-copied/serialized at export (download) and, when needed, for re-rendering a
changed page. This keeps edits and undo/redo cheap.

## State (Zustand)

Single document store:

```ts
type PageDescriptor = {
  id: string;          // stable uuid, drives dnd-kit + React keys
  fileId: string;      // which source file this page came from
  sourceIndex: number; // 0-based page index within that source file
  rotation: 0|90|180|270;
  isBlank: boolean;    // inserted blank page (no source)
};

type SourceFile = {
  id: string;
  name: string;
  bytes: Uint8Array;   // original file bytes, immutable
  pageCount: number;
};

type DocState = {
  files: Record<string, SourceFile>;
  pages: PageDescriptor[];   // the ordered document
  currentPageId: string | null;
  zoom: number;              // 1 = 100%
  // history
  past: PageDescriptor[][];
  future: PageDescriptor[][];
};
```

Undo/redo = snapshot the `pages` array onto `past` before each mutation; redo
via `future`. Snapshots are metadata only (no bytes), so they are small and fast.
`SourceFile.bytes` are never copied into history.

## Modules

### `lib/pdf/` — pdf-lib operations (pure, testable)
- `loadFile(bytes) -> { bytes, pageCount }` — validate + read page count.
- `buildBlankPage()` — descriptor helper for inserted blank pages.
- `exportPdf(files, pages) -> Uint8Array` — the heart of export:
  - create new `PDFDocument`
  - for each descriptor in order: if `isBlank`, `addPage()` (Letter default);
    else `copyPages` from the source doc at `sourceIndex`, then apply rotation
    via `setRotation(degrees(...))`.
  - return serialized bytes.
- `mergeFiles(...)` is just `exportPdf` over descriptors spanning multiple files
  — merge is not a special case, it falls out of the model.

### `lib/hooks/`
- `usePdfDocument()` — wraps react-pdf loading of the current export bytes for
  the viewer.
- `useUndoRedo()` — exposes `undo/redo/canUndo/canRedo`, wired to store.
- `useKeyboardShortcuts()` — Ctrl/Cmd+Z (undo), Ctrl/Cmd+Y or Shift+Ctrl+Z
  (redo), Delete (delete current page), ArrowLeft/Right (navigate).

### `components/`
- `upload/Dropzone` — drag-and-drop + file picker (native `<input type=file>`),
  multi-file, PDF-only validation, progress via Sonner.
- `sidebar/ThumbnailList` — dnd-kit sortable list of page thumbnails. Each
  thumbnail renders **lazily** (IntersectionObserver: only render the canvas
  when scrolled into view). Reorder updates `pages`. Per-thumbnail actions:
  rotate, delete, insert-blank-after.
- `viewer/Viewer` — main canvas. Zoom (buttons + Ctrl+scroll), pan (drag when
  zoomed), page navigation. Lazy: only current page (+neighbors) rendered.
- `toolbar/Toolbar` — top bar: upload more, merge/download, zoom controls,
  undo/redo, page-op buttons, theme toggle.
- `ui/` — shadcn/ui primitives (button, dialog, tooltip, dropdown, skeleton).

### Theme
next-themes + Tailwind `dark:`; toggle in toolbar. Light + dark.

## Performance (Phase 1)
- Lazy canvas rendering for thumbnails and viewer pages via IntersectionObserver.
- Full list virtualization (windowing) is **deferred** to Phase 2 — revisit only
  if large-PDF profiling shows it's needed. Lazy rendering handles typical docs
  (tens of pages) smoothly with much less code.
- All processing in-browser; source bytes held once in the store, never re-uploaded.

## Error handling
- Non-PDF or corrupt file → Sonner error toast, file skipped, others proceed.
- Export failure → toast with message; document state unchanged.
- Empty document (all pages deleted) → disable download, show empty state.

## Testing
- Unit-test `lib/pdf/exportPdf` with assert-based checks: reorder produces
  expected page order; rotation is applied; blank page count correct; merge of
  two 1-page docs yields a 2-page doc. Runnable via a small script/`vitest`.
- Store reducer tests: undo/redo restores prior `pages` array.

## Phase 1 acceptance
Upload multiple PDFs (drag-drop + picker) → see thumbnails → reorder via drag →
rotate/delete/insert-blank pages → preview with zoom/pan/navigation → merge all →
download a correct PDF → undo/redo any op → toggle dark mode → keyboard shortcuts
work. Runs with `pnpm install && pnpm dev` (npm equivalent also works).

## Phase 2 (outline, not specified here)
Annotation engine as an overlay layer over the viewer canvas:
- Add text, freehand draw, highlight/underline, shapes (rect/circle/line),
  images + signatures, page numbers.
- Annotations stored as vector descriptors in the store; on export, drawn into
  the PDF via pdf-lib (`drawText`, `drawLine`, `drawRectangle`, `drawImage`,
  path drawing) so output stays vector/high-quality and text stays selectable.
- Right-hand properties panel appears in edit mode (color, size, font, stroke).
- Text-layer-accurate highlight/underline uses pdf.js text layer geometry.

## Tech stack (confirmed)
Next.js (App Router) · TypeScript (strict) · Tailwind CSS · shadcn/ui ·
Lucide React · dnd-kit · react-pdf (pdf.js) · pdf-lib · Zustand · Sonner ·
Framer Motion · next-themes. Package manager: **pnpm**.
