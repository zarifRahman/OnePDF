# OnePDF

A modern, fully client-side PDF manager. Upload, merge, reorder, rotate, and
preview PDFs entirely in your browser — no files ever leave your machine.

> **Status:** Phase 1 (foundation). The annotation/editing engine (text, draw,
> shapes, images, signatures, page numbers) is planned for Phase 2 — see
> [Roadmap](#roadmap).

## Features (Phase 1)

- **Upload** multiple PDFs via drag-and-drop or file picker
- **Reorder** pages across files by drag-and-drop (dnd-kit)
- **Merge** any number of PDFs into one
- **Page ops:** rotate, delete, insert blank page
- **Preview** with zoom, pan, and page navigation
- **Undo / redo** for every edit
- **Download** the result as a fresh PDF
- **Light / dark** mode
- **Keyboard shortcuts:** `Ctrl/Cmd+Z` undo · `Ctrl/Cmd+Y` (or `Shift+Ctrl+Z`)
  redo · `Delete` remove current page · `←/→` navigate
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

- **pdf.js** (via `react-pdf`) renders pages/thumbnails to canvas. Read-only —
  it never mutates a document.
- **pdf-lib** owns the document model and every mutation. Source of truth.

State is a lightweight **page-descriptor model** (Zustand): an ordered array of
`{ id, fileId, sourceIndex, rotation, isBlank }`. Edits mutate this metadata, not
PDF bytes — so reorder/rotate/delete and undo/redo are cheap (undo just snapshots
the array). Bytes are only re-serialized (via `exportPdf`) for the preview and
for download. **Merge falls out for free**: descriptors simply span multiple
source files.

```
uploaded bytes → pdf-lib docs [truth]
              → page-descriptor model (ordered metadata, in Zustand)
              → exportPdf() serializes to bytes
              → react-pdf renders bytes for viewer + thumbnails
```

### Project layout

```
app/                 App Router: layout (theme + toaster), page (loads Workspace)
components/
  Workspace.tsx      client-only shell (react-pdf loaded with ssr:false)
  upload/            drag-drop dropzone
  sidebar/           sortable thumbnail list, lazy-rendered items
  viewer/            canvas viewer with zoom/pan/nav
  toolbar/           top toolbar
  ui/                shadcn/ui primitives
lib/
  pdf/               exportPdf (core), load, pdf.js worker setup
  hooks/             keyboard shortcuts
  utils.ts           cn(), uuid, downloadBytes
store/               zustand document store (+ undo/redo)
types/               PageDescriptor, SourceFile
```

### Notes

- The whole workspace is loaded with `next/dynamic({ ssr: false })` because
  pdf.js touches browser-only globals (`DOMMatrix`) at module evaluation.
- Thumbnails and viewer pages render **lazily** (IntersectionObserver). Full list
  virtualization is deferred to Phase 2 — revisit if large-PDF profiling needs it.

## Tech stack

Next.js (App Router) · TypeScript · Tailwind CSS · shadcn/ui · Lucide · dnd-kit ·
react-pdf (pdf.js) · pdf-lib · Zustand · Sonner · Framer Motion · next-themes.

## Roadmap

**Phase 2 — annotation engine** (overlay layer + pdf-lib draw-on-export):
add text, freehand draw, highlight/underline, shapes (rect/circle/line),
images + signatures, page numbers, and a right-hand properties panel. Output
stays vector so text remains selectable and quality is preserved.
