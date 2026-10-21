# OnePDF

A modern, fully client-side PDF manager. Organise, merge, edit, annotate, sign,
compress, split and export PDFs entirely in your browser — no files ever leave
your machine.

> **Status:** v2 — task-first onboarding, page management, a full annotation
> editor, document tools (watermark / compress / redact / split), in-document
> search and local autosave. All client-side.

## Features

**Start**
- **Task-first home screen** — pick what you want to do (organise, edit,
  compress, split, watermark, redact) and drop a PDF in; the app opens
  straight into that tool
- **Drag-and-drop or file picker**, multiple files at once
- **Recent documents** — the last session is restored automatically, everything
  is kept in IndexedDB on your device
- **Privacy stated up front** — no upload, no account, no server

**Organise pages**
- **Multi-select** (click, ⇧-click for a range, ⌘-click to toggle) with a
  batch bar: rotate, duplicate, export selection, delete
- **Merge** any number of PDFs into one, **reorder** by drag-and-drop
- **Rotate**, **duplicate**, **delete**, **insert blank pages**
- **Split** page ranges into separate PDFs (downloaded as one ZIP)
- **Crop margins** off a page (Acrobat-style trim)
- **Page numbers** with position, format (`1`, `1 / 10`, `Page 1 of 10`) and
  start value
- **Watermark** — text, size, colour, opacity and angle across every page

**Edit / annotate**
- **Text** anywhere, plus **edit existing text** in the PDF (click a line)
- **Freehand draw**, **highlight**, **underline**, **line**, **arrow**
- **Shapes** (rectangle, circle) with stroke *and* fill
- **Images**, **sticky notes**, and a **signature pad** (draw it, drop it on the page)
- **Redaction** — black boxes that are burned into the file, so the text
  underneath is really gone
- **Move and resize** any mark with grab handles
- **Font family, size, bold/italic, alignment, opacity, colour**

**View & find**
- **Single page**, **continuous scroll** and **facing pages** views
- **Fit width / fit page / zoom**, pan by dragging
- **Search the document** (`⌘F`) with highlighted matches and next/previous
- **Status bar** with page, selection, mark count, file size and save state

**Output**
- **Export** the whole document, the current page, the selection or a range
- **Export pages as PNG/JPG** (one ZIP)
- **Compress** the document in the browser, optionally in greyscale, and see
  the size saved before you download

**Everywhere**
- **Undo / redo** for every edit, with the action named ("Undid: Rotate page")
- **Light / dark** mode
- **Keyboard shortcuts** for every tool (`?` shows the list)
- 100% in-browser — nothing is uploaded to any server

## Getting started

Prerequisites: **Node 20.9+** and **pnpm** (npm also works).

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000.

With npm instead:

```bash
npm install
npm run dev
```

### Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Start the dev server |
| `pnpm build` | Production build |
| `pnpm start` | Serve the production build |
| `pnpm test` | Run the unit tests (Vitest) |
| `pnpm lint` | Lint |

> `postinstall` copies the pdf.js worker into `public/` so it is served
> locally (offline, no CDN).

## Architecture

The one decision everything else follows: **render and edit are separate.**

- **pdf.js (via `react-pdf`)** renders pages/thumbnails to canvas. Read-only —
  it never mutates a document.
- **pdf-lib** owns the document model and every mutation. Source of truth.

State is a lightweight **page-descriptor model** (Zustand): an ordered array of
`{ id, fileId, sourceIndex, rotation, isBlank, crop }`. Edits mutate this
metadata, not PDF bytes — so reorder/rotate/delete and undo/redo are cheap
(undo just snapshots the array). Bytes are only re-serialized for the preview
and for download. **Merge falls out for free**: descriptors simply span
multiple source files.

```
uploaded bytes → pdf-lib docs [truth]
              → page-descriptor model (ordered metadata, in Zustand)
              → exportPdf() serializes to bytes
              → react-pdf renders bytes for viewer + thumbnails
```

One `react-pdf <Document>` is mounted for the whole app, so the sidebar
thumbnails and the viewer share a single copy of the bytes and a single pdf.js
instance.

### Project layout

```
app/                 App Router: layout (theme + toaster), page (loads Workspace)
components/
  Workspace.tsx      client-only shell (react-pdf loaded with ssr:false)
  app/               welcome screen, status bar, search bar, shortcuts dialog
  upload/            drag-drop dropzone
  sidebar/           sortable thumbnail list, batch bar
  viewer/            page views: single / continuous / facing
  editor/            annotation overlay, properties panel, signature pad
  dialogs/           split, watermark, compress, export, margins, page numbers
  ui/                shadcn/ui primitives
lib/
  pdf/               exportPdf, rasterise (compress/redact/images), search,
                     text extraction, page ranges, zip writer
  db/                IndexedDB persistence (autosave + recents)
  hooks/             keyboard shortcuts, autosave/restore
  utils.ts           cn(), uuid, downloadBytes, formatBytes
store/               zustand document store (+ undo/redo with action labels)
types/               PageDescriptor, SourceFile, Annotation, document settings
```

### Notes

- The whole workspace is loaded with `next/dynamic({ ssr: false })` because
  pdf.js touches browser-only globals (`DOMMatrix`) at module evaluation.
- Thumbnails and viewer pages render **lazily** (IntersectionObserver).
- The viewer renders pages from a *pages-only* export, while annotations are
  drawn live as an SVG overlay. Anything that produces a real file (export,
  compress, rasterise) uses `buildDocumentBytes()`, which bakes the marks in —
  so nothing is silently dropped.

### Annotation model

Annotations are a second descriptor array in the store (`Annotation[]`), keyed
by page id, with geometry in **PDF points, top-left origin**. They render live
as an **SVG overlay** on the current page (`viewBox` in points, so it scales
with zoom for free) and are **baked into the PDF only on download** via pdf-lib
(`drawText`/`drawLine`/`drawRectangle`/`drawEllipse`/`drawImage`, y-flipped to
pdf-lib's bottom-left origin) — the preview stays pages-only, so no double-draw.
Undo/redo snapshots pages + annotations + page numbers + watermark together.

### Raster pipeline

`lib/pdf/raster.ts` renders pages to bitmaps with pdf.js and rebuilds the PDF
from those bitmaps. It powers Compress, greyscale, secure redaction and image
export. A rasterised page has no text layer, which is what makes redaction
genuine rather than cosmetic.

Known simplifications (`ponytail:` in code):
- Highlight/underline are drawn boxes/lines, not bound to the text layer.
- Annotations assume the page is at rotation 0.
- Redaction is applied to the rasterised copy; the in-editor view shows the box.

## Competitive analysis

`docs/research/competitive-ux-analysis.md` records the REA evidence (capture
ids included) behind this feature set and the reasoning behind each decision.

## Testing

- Unit-test `lib/pdf/exportPdf` with assert-based checks: reorder produces
  expected page order; rotation is applied; blank page count correct; merge of
  two 1-page docs yields a 2-page doc; annotations, watermarks and crop boxes
  are really present in the output.
- Store reducer tests: undo/redo restores prior `pages` array, multi-select
  ranges, duplication, crop, history labels.
- Page-range and ZIP writer tests.
- Runnable via `vitest` (`pnpm test`).
