import {
  PDFDocument,
  degrees,
  rgb,
  StandardFonts,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type {
  SourceFile,
  PageDescriptor,
  Annotation,
  FontFamily,
  Watermark,
  PageNumberOptions,
} from "@/types";

export const BLANK_SIZE = { letter: [612, 792], a4: [595.28, 841.89] } as const;
export type BlankSize = keyof typeof BLANK_SIZE;

const DEFAULT_PAGE_NUMBERS: PageNumberOptions = {
  enabled: false,
  position: "bottom-center",
  format: "n",
  startAt: 1,
};

export type ExportOptions = {
  annotations?: Annotation[];
  pageNumbers?: PageNumberOptions;
  watermark?: Watermark | null;
};

// "#rrggbb" -> pdf-lib rgb (0..1). Falls back to black on bad input.
function hex(color: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(color);
  if (!m) return rgb(0, 0, 0);
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/**
 * Flatten a colour towards white by `alpha` (0..1). pdf-lib can express
 * opacity for fills and text but not for strokes, so translucent strokes are
 * approximated by pre-blending against the page background.
 */
function blend(color: string, alpha: number | undefined) {
  const a = alpha === undefined ? 1 : Math.max(0, Math.min(1, alpha));
  const m = /^#?([0-9a-f]{6})$/i.exec(color);
  if (!m) return rgb(0, 0, 0);
  const n = parseInt(m[1], 16);
  const mix = (c: number) => c * a + 255 * (1 - a);
  return rgb(
    mix(((n >> 16) & 255)) / 255,
    mix(((n >> 8) & 255)) / 255,
    mix((n & 255)) / 255,
  );
}

function fontFor(
  fonts: Record<string, PDFFont>,
  family: FontFamily | undefined,
  bold: boolean | undefined,
  italic: boolean | undefined,
) {
  const fam = family ?? "Helvetica";
  const suffix = `${bold ? "-Bold" : ""}${italic ? "-Italic" : ""}`;
  if (fam === "Times") {
    return fonts[`Times${suffix}`] ?? fonts.Times;
  }
  if (fam === "Courier") {
    return fonts[`Courier${suffix}`] ?? fonts.Courier;
  }
  return fonts[`Helvetica${suffix}`] ?? fonts.Helvetica;
}

type FontSet = Record<string, PDFFont>;

// Draw one annotation onto an output page. `H` is the page height in points;
// stored y is top-left origin so we flip to pdf-lib's bottom-left.
async function drawAnnotation(
  out: PDFDocument,
  page: PDFPage,
  fonts: FontSet,
  H: number,
  a: Annotation,
) {
  const color = hex(a.color);
  const stroke = blend(a.color, a.opacity);
  switch (a.type) {
    case "text": {
      const font = fontFor(fonts, a.fontFamily, a.bold, a.italic);
      const width = a.w ?? font.widthOfTextAtSize(a.text, a.size);
      let x = a.x;
      if (a.align === "center") x = a.x + (width - font.widthOfTextAtSize(a.text, a.size)) / 2;
      else if (a.align === "right") x = a.x + width - font.widthOfTextAtSize(a.text, a.size);
      page.drawText(a.text, {
        x,
        y: H - a.y - a.size,
        size: a.size,
        font,
        color,
        opacity: a.opacity ?? 1,
      });
      break;
    }
    case "draw":
      for (let i = 1; i < a.points.length; i++) {
        const [x1, y1] = a.points[i - 1];
        const [x2, y2] = a.points[i];
        page.drawLine({
          start: { x: x1, y: H - y1 },
          end: { x: x2, y: H - y2 },
          thickness: a.strokeWidth,
          color: stroke,
        });
      }
      break;
    case "rect":
      page.drawRectangle({
        x: a.x,
        y: H - a.y - a.h,
        width: a.w,
        height: a.h,
        borderColor: stroke,
        borderWidth: a.strokeWidth,
        color: a.fill ? blend(a.fill, a.opacity) : undefined,
        opacity: a.fill ? (a.opacity ?? 1) : 0,
        borderOpacity: a.opacity ?? 1,
      });
      break;
    case "circle":
      page.drawEllipse({
        x: a.x + a.w / 2,
        y: H - (a.y + a.h / 2),
        xScale: a.w / 2,
        yScale: a.h / 2,
        borderColor: stroke,
        borderWidth: a.strokeWidth,
        color: a.fill ? blend(a.fill, a.opacity) : undefined,
        opacity: a.fill ? (a.opacity ?? 1) : 0,
        borderOpacity: a.opacity ?? 1,
      });
      break;
    case "line":
    case "underline":
      page.drawLine({
        start: { x: a.x1, y: H - a.y1 },
        end: { x: a.x2, y: H - a.y2 },
        thickness: a.strokeWidth,
        color: stroke,
      });
      break;
    case "arrow": {
      page.drawLine({
        start: { x: a.x1, y: H - a.y1 },
        end: { x: a.x2, y: H - a.y2 },
        thickness: a.strokeWidth,
        color: stroke,
      });
      // Arrow head: two short strokes at the tip.
      const angle = Math.atan2(a.y2 - a.y1, a.x2 - a.x1);
      const len = Math.max(6, a.strokeWidth * 3.5);
      for (const sign of [1, -1]) {
        const ang = angle + Math.PI + sign * 0.42;
        page.drawLine({
          start: { x: a.x2, y: H - a.y2 },
          end: { x: a.x2 + Math.cos(ang) * len, y: H - (a.y2 + Math.sin(ang) * len) },
          thickness: a.strokeWidth,
          color: stroke,
        });
      }
      break;
    }
    case "highlight":
      page.drawRectangle({
        x: a.x,
        y: H - a.y - a.h,
        width: a.w,
        height: a.h,
        color,
        opacity: a.opacity ?? 0.35,
      });
      break;
    case "whiteout":
      page.drawRectangle({
        x: a.x,
        y: H - a.y - a.h,
        width: a.w,
        height: a.h,
        color,
        opacity: a.opacity ?? 1,
      });
      break;
    case "redact":
      // Burned in by the raster pipeline; drawn here only so the on-screen
      // preview matches the exported page.
      page.drawRectangle({
        x: a.x,
        y: H - a.y - a.h,
        width: a.w,
        height: a.h,
        color,
        opacity: a.opacity ?? 1,
      });
      break;
    case "note": {
      const size = 11;
      const font = fonts.Helvetica;
      const lines = a.text.split("\n");
      const w = Math.max(60, ...lines.map((l) => font.widthOfTextAtSize(l, size))) + 16;
      const h = lines.length * (size * 1.3) + 12;
      page.drawRectangle({
        x: a.x,
        y: H - a.y - h,
        width: w,
        height: h,
        color: rgb(1, 0.96, 0.6),
        opacity: a.opacity ?? 1,
        borderColor: blend("#eab308", a.opacity),
        borderWidth: 1,
      });
      lines.forEach((l, i) => {
        page.drawText(l, {
          x: a.x + 8,
          y: H - a.y - 14 - i * size * 1.3,
          size,
          font,
          color: rgb(0.1, 0.1, 0.1),
          opacity: a.opacity ?? 1,
        });
      });
      break;
    }
    case "image": {
      const bytes = Uint8Array.from(atob(a.dataUrl.split(",")[1]), (c) => c.charCodeAt(0));
      const img = a.mime.includes("png")
        ? await out.embedPng(bytes)
        : await out.embedJpg(bytes);
      page.drawImage(img, {
        x: a.x,
        y: H - a.y - a.h,
        width: a.w,
        height: a.h,
        opacity: a.opacity ?? 1,
      });
      break;
    }
  }
}

function watermarkOn(
  page: PDFPage,
  fonts: FontSet,
  wm: Watermark,
) {
  const { width: W, height: H } = page.getSize();
  const font = fonts["Helvetica-Bold"];
  const textW = font.widthOfTextAtSize(wm.text, wm.size);
  page.drawText(wm.text, {
    x: (W - textW) / 2,
    y: H / 2 - wm.size / 2,
    size: wm.size,
    font,
    color: blend(wm.color, wm.opacity),
    rotate: degrees(wm.rotation),
  });
}

function pageNumberLabel(
  n: number,
  total: number,
  format: PageNumberOptions["format"],
) {
  if (format === "n-of-m") return `${n} / ${total}`;
  if (format === "page-n-of-m") return `Page ${n} of ${total}`;
  return String(n);
}

// Serialize the ordered descriptor model into a single PDF. Source docs are
// loaded once and cached so copyPages is cheap across many descriptors.
// Annotations and document settings are baked in on export only.
export async function exportPdf(
  files: Record<string, SourceFile>,
  pages: PageDescriptor[],
  options: ExportOptions = {},
): Promise<Uint8Array> {
  const { annotations = [], pageNumbers, watermark = null } = options;
  const pn: PageNumberOptions = { ...DEFAULT_PAGE_NUMBERS, ...(pageNumbers ?? {}) };

  const out = await PDFDocument.create();
  const fonts: FontSet = {
    Helvetica: await out.embedFont(StandardFonts.Helvetica),
    "Helvetica-Bold": await out.embedFont(StandardFonts.HelveticaBold),
    "Helvetica-Italic": await out.embedFont(StandardFonts.HelveticaOblique),
    "Helvetica-Bold-Italic": await out.embedFont(StandardFonts.HelveticaBoldOblique),
    Times: await out.embedFont(StandardFonts.TimesRoman),
    "Times-Bold": await out.embedFont(StandardFonts.TimesRomanBold),
    "Times-Italic": await out.embedFont(StandardFonts.TimesRomanItalic),
    "Times-Bold-Italic": await out.embedFont(StandardFonts.TimesRomanBoldItalic),
    Courier: await out.embedFont(StandardFonts.Courier),
    "Courier-Bold": await out.embedFont(StandardFonts.CourierBold),
    "Courier-Italic": await out.embedFont(StandardFonts.CourierOblique),
    "Courier-Bold-Italic": await out.embedFont(StandardFonts.CourierBoldOblique),
  };
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
      page = out.addPage([BLANK_SIZE.letter[0], BLANK_SIZE.letter[1]]);
    } else {
      const [copied] = await out.copyPages(await srcDoc(pg.fileId), [pg.sourceIndex]);
      if (pg.rotation) copied.setRotation(degrees(pg.rotation));
      page = out.addPage(copied);
    }
    n++;

    const size = page.getSize();
    const H = size.height;

    if (pg.crop) {
      const { top, right, bottom, left } = pg.crop;
      const w = Math.max(1, size.width - left - right);
      const h = Math.max(1, H - top - bottom);
      page.setCropBox(left, bottom, w, h);
    }

    for (const a of annotations) {
      if (a.pageId === pg.id) await drawAnnotation(out, page, fonts, H, a);
    }
    if (watermark?.text.trim()) watermarkOn(page, fonts, watermark);

    if (pn.enabled) {
      const label = pageNumberLabel(pn.startAt + n - 1, pn.startAt + pages.length - 1, pn.format);
      const w = fonts.Helvetica.widthOfTextAtSize(label, 10);
      const top = pn.position.startsWith("top");
      const right = pn.position.endsWith("right");
      const x = right ? size.width - w - 24 : (size.width - w) / 2;
      const y = top ? H - 28 : 24;
      page.drawText(label, { x, y, size: 10, font: fonts.Helvetica, color: rgb(0, 0, 0) });
    }
  }
  return out.save();
}
