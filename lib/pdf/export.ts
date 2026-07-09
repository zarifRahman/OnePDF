import { PDFDocument, degrees, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import type { SourceFile, PageDescriptor, Annotation } from "@/types";

const BLANK = [612, 792] as const; // US Letter

// "#rrggbb" -> pdf-lib rgb (0..1). Falls back to black on bad input.
function hex(color: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(color);
  if (!m) return rgb(0, 0, 0);
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

// Draw one annotation onto an output page. `H` is the page height in points;
// stored y is top-left origin so we flip to pdf-lib's bottom-left.
async function drawAnnotation(
  out: PDFDocument,
  page: PDFPage,
  font: PDFFont,
  H: number,
  a: Annotation,
) {
  const color = hex(a.color);
  switch (a.type) {
    case "text":
      page.drawText(a.text, { x: a.x, y: H - a.y - a.size, size: a.size, font, color });
      break;
    case "draw":
      for (let i = 1; i < a.points.length; i++) {
        const [x1, y1] = a.points[i - 1];
        const [x2, y2] = a.points[i];
        page.drawLine({ start: { x: x1, y: H - y1 }, end: { x: x2, y: H - y2 }, thickness: a.strokeWidth, color });
      }
      break;
    case "rect":
      page.drawRectangle({ x: a.x, y: H - a.y - a.h, width: a.w, height: a.h, borderColor: color, borderWidth: a.strokeWidth });
      break;
    case "circle":
      page.drawEllipse({ x: a.x + a.w / 2, y: H - (a.y + a.h / 2), xScale: a.w / 2, yScale: a.h / 2, borderColor: color, borderWidth: a.strokeWidth });
      break;
    case "line":
    case "underline":
      page.drawLine({ start: { x: a.x1, y: H - a.y1 }, end: { x: a.x2, y: H - a.y2 }, thickness: a.strokeWidth, color });
      break;
    case "highlight":
      page.drawRectangle({ x: a.x, y: H - a.y - a.h, width: a.w, height: a.h, color, opacity: 0.35 });
      break;
    case "image": {
      const bytes = Uint8Array.from(atob(a.dataUrl.split(",")[1]), (c) => c.charCodeAt(0));
      const img = a.mime.includes("png") ? await out.embedPng(bytes) : await out.embedJpg(bytes);
      page.drawImage(img, { x: a.x, y: H - a.y - a.h, width: a.w, height: a.h });
      break;
    }
  }
}

// Serialize the ordered descriptor model into a single PDF. Source docs are
// loaded once and cached so copyPages is cheap across many descriptors.
// Annotations (Phase 2) are baked in on export only.
export async function exportPdf(
  files: Record<string, SourceFile>,
  pages: PageDescriptor[],
  annotations: Annotation[] = [],
  pageNumbers = false,
): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);
  const cache = new Map<string, PDFDocument>();

  const srcDoc = async (fileId: string) => {
    let d = cache.get(fileId);
    if (!d) {
      d = await PDFDocument.load(files[fileId].bytes, { ignoreEncryption: true });
      cache.set(fileId, d);
    }
    return d;
  };

  let n = 0;
  for (const pg of pages) {
    let page: PDFPage;
    if (pg.isBlank) {
      page = out.addPage([BLANK[0], BLANK[1]]);
    } else {
      const [copied] = await out.copyPages(await srcDoc(pg.fileId), [pg.sourceIndex]);
      if (pg.rotation) copied.setRotation(degrees(pg.rotation));
      page = out.addPage(copied);
    }
    n++;

    const H = page.getSize().height;
    for (const a of annotations) {
      if (a.pageId === pg.id) await drawAnnotation(out, page, font, H, a);
    }
    if (pageNumbers) {
      const label = String(n);
      const w = font.widthOfTextAtSize(label, 10);
      page.drawText(label, { x: page.getSize().width / 2 - w / 2, y: 24, size: 10, font, color: rgb(0, 0, 0) });
    }
  }
  return out.save();
}
