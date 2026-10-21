import { pdfjs } from "react-pdf";
import { PDFDocument } from "pdf-lib";

/**
 * Raster pipeline: renders pages to bitmaps and rebuilds the document from
 * those bitmaps. This is what makes Compress, Grayscale, secure Redaction and
 * image export possible in a browser — a rasterised page has no text layer, so
 * anything painted over it is genuinely gone.
 */

export type RasterRect = { x: number; y: number; w: number; h: number }; // PDF points, top-left origin

export type RasterOptions = {
  /** JPEG quality 0..1 (ignored for PNG output). */
  quality?: number;
  /** Render scale; <1 downsamples (smaller file, softer text). */
  scale?: number;
  grayscale?: boolean;
  /** Black boxes painted over the page, in PDF points. */
  redact?: { pageIndex: number; rect: RasterRect }[];
};

export type RasterResult = {
  bytes: Uint8Array;
  sizeBefore: number;
  sizeAfter: number;
};

async function loadPdf(bytes: Uint8Array) {
  // pdf.js detaches the buffer it is given, so hand it a copy.
  const task = pdfjs.getDocument({ data: bytes.slice(0) });
  return task.promise;
}

async function renderPage(
  page: import("pdfjs-dist").PDFPageProxy,
  scale: number,
  grayscale: boolean,
  redactions: RasterRect[],
): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (grayscale) ctx.filter = "grayscale(1)";
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  ctx.filter = "none";

  for (const r of redactions) {
    ctx.fillStyle = "#000000";
    ctx.fillRect(r.x * scale, r.y * scale, r.w * scale, r.h * scale);
  }
  return canvas;
}

function toBytes(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error("Canvas encoding failed"));
        blob.arrayBuffer().then((b) => resolve(new Uint8Array(b)), reject);
      },
      mime,
      quality,
    );
  });
}

/**
 * Rebuild `bytes` as a rasterised PDF. Returns the new bytes plus the size
 * before/after so the UI can show the saving.
 */
export async function rasterizePdf(
  bytes: Uint8Array,
  options: RasterOptions = {},
): Promise<RasterResult> {
  const { quality = 0.7, scale = 1, grayscale = false, redact = [] } = options;
  const doc = await loadPdf(bytes);
  const out = await PDFDocument.create();

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const boxes = redact.filter((r) => r.pageIndex === i - 1).map((r) => r.rect);
    const canvas = await renderPage(page, scale, grayscale, boxes);
    const jpeg = await toBytes(canvas, "image/jpeg", quality);
    const img = await out.embedJpg(jpeg);
    const p = out.addPage([canvas.width / scale, canvas.height / scale]);
    p.drawImage(img, { x: 0, y: 0, width: canvas.width / scale, height: canvas.height / scale });
  }

  const saved = await out.save();
  return { bytes: saved, sizeBefore: bytes.length, sizeAfter: saved.length };
}

/** Export every page as an image. Returns the image bytes per page. */
export async function rasterizeToImages(
  bytes: Uint8Array,
  format: "image/png" | "image/jpeg" = "image/png",
  quality = 0.9,
): Promise<{ name: string; data: Uint8Array }[]> {
  const doc = await loadPdf(bytes);
  const out: { name: string; data: Uint8Array }[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const canvas = await renderPage(page, 2, false, []);
    const data = await toBytes(canvas, format, quality);
    out.push({ name: `page-${String(i).padStart(3, "0")}.${format === "image/png" ? "png" : "jpg"}`, data });
  }
  return out;
}
