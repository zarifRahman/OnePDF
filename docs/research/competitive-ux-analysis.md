# Competitive UX analysis (REA evidence)

Method: REA `capture-browser-scenario` (Playwright, owned Chrome process) on each
competitor's public site. Accessibility tree + DOM captured at the end of the
scenario; no credentials, no uploads, no interaction with private data.

| Site | REA evidence id |
| --- | --- |
| iLovePDF home | `ev_4371abcf82161e1d04c274f72387049059d1ba5fe78b7f0bdd8c4c2f24ef5e1d` |
| iLovePDF editor | `ev_82cc63136d704f3a33b18ef9b9220961a736196355e1ca51c0654f12f51f8bbf` |
| iLovePDF features | `ev_8bb852a6d64ec93e2181daf73d4fbe3b920d7996a8d851b5eb0eef9c1d8a430b` |
| Smallpdf home | `ev_cb67f61ee385e000c04344629ffb79a84d47757d96c24db5c581c3d1d4a837c4` |
| Smallpdf editor | `ev_15aa1f598129a8b0c00cb92b0262a00fa9385f67a461a16e975152d2cb1c84e2` |
| Smallpdf all tools | `ev_3d5fea483ca47427b0cbf90faa3b83ef82f8598c6c38a2c75a144842621f2ae2` |
| Xodo home | `ev_fd33c1d25d95095758fec075a70abac1735a4a44405a8d80529233fb356d6873` |

## 1. The tool catalog every competitor converges on

Captured from the iLovePDF home page (35 tools) and the Smallpdf all-tools page
(48 tools). Overlap between the two, and how OnePDF covers it:

| Capability | iLovePDF | Smallpdf | OnePDF v1 | OnePDF v2 (this change) |
| --- | --- | --- | --- | --- |
| Merge | yes | yes | yes | yes |
| Organize / reorder | yes | yes | yes | yes + multi-select |
| Split | yes | yes | — | **yes** (ranges → ZIP) |
| Extract pages | yes | yes | — | **yes** (extract to new doc) |
| Delete pages | yes | yes | yes | yes + batch |
| Rotate | yes | yes | yes | yes + batch |
| Duplicate | — | — | — | **yes** |
| Number pages | yes | yes | toggle only | **yes** (position + "n of m") |
| Crop | yes | yes | — | **yes** (margins/crop box) |
| Flatten | — | yes | implicit | implicit |
| Watermark | yes | yes | — | **yes** |
| Redact | yes | yes | — | **yes** (burn-in, rasterised) |
| Compress | yes | yes | — | **yes** (client-side JPEG) |
| Protect / unlock | yes | yes | — | no (pdf-lib cannot encrypt) |
| Convert PDF→Word/Excel | yes | yes | — | no (needs a converter backend) |
| OCR / AI | yes | yes | — | no (needs a model) |
| Add text | yes | yes | yes | yes + font family/align |
| Edit existing text | yes | Pro | yes | yes |
| Highlight | yes | yes | yes | yes |
| Draw | yes | yes | yes | yes |
| Shapes | yes | yes | rect/circle/line | + arrow, fill colour |
| Images | yes | yes | yes | yes + resize |
| Sticky notes | comments | notes | — | **yes** (note) |
| Sign / e-sign | yes | yes | image only | **yes** (signature pad) |
| Fill forms | yes | yes | — | out of scope (AcroForm copy) |

## 2. Interaction patterns worth copying

Observed directly in the captured accessibility trees:

- **Task-first landing.** Both sites open with a task grid ("Every tool you need
  to work with PDFs in one place", "Most Popular PDF Tools") and a single
  drop target that routes the file to the chosen task. OnePDF v1 showed a bare
  dropzone — no sense of what the app can do.
- **Two-mode editor.** Smallpdf's editor is explicitly split into an *edit* mode
  (text/shapes/markup on canvas) and an *organize* mode (page grid,
  rearrange/merge/extract/split). OnePDF mixed both in one surface.
- **Top tool rail + thumbnail rail + contextual right panel + status bar.**
  The left rail is a page grid; the right panel only appears when something is
  selected. OnePDF v1 had a properties panel that only appeared for the
  annotation tools, and no status bar at all.
- **Export is a first-class step** with format options (PDF, Word, Excel,
  PPT, JPG), not a bare "Download" button in the corner.
- **No onboarding.** "Zero training… no setup or onboarding required": tools
  are directly usable, discoverable by icon + tooltip.
- **Privacy is a headline claim.** Both sites lead with where the file goes.
  OnePDF should state it once, prominently, on the landing screen.
- **Multiple export paths**: "save to device", "share", "save to Dropbox".

## 3. Gaps in OnePDF v1 that the competitor set exposes

1. No task framing — the empty screen never says what the app does.
2. Page management is single-selection only; no batch ops, no duplicate, no
   extract, no split.
3. Annotations cannot be resized; text has one font; no fill colour, no
   opacity, no alignment.
4. No watermark, no compress, no crop, no redaction, no page-number styling.
5. No text search inside the document.
6. Single-page view only — no continuous scroll, no fit-width.
7. Work is lost on reload; no recents.
8. Undo history has no labels, so the user cannot tell what they are undoing.
9. No keyboard-shortcut reference, no status bar, no file-name control.

## 4. Feature decisions for OnePDF v2

Implemented (client-side only, no server):

- Task-first welcome screen with quick actions and recents.
- Multi-select pages with batch rotate / delete / duplicate / extract.
- Duplicate page, extract to new document, split by ranges → ZIP download.
- Watermark, page-number styling, crop/margins, compress, grayscale,
  redaction (burn-in), export pages as images.
- Annotation resize handles, font family, alignment, fill colour, opacity,
  duplicate, sticky note, signature pad.
- In-document text search with match navigation.
- Single / continuous / facing page views, fit-width and fit-page zoom.
- Undo/redo with action labels, status bar, shortcut reference dialog.
- Local autosave (IndexedDB) so a reload does not lose work.

Deliberately out of scope (needs a backend or a model, breaks the "everything
stays in your browser" promise): PDF→Word/Excel, OCR, AI summary, password
protection, cloud sharing.
