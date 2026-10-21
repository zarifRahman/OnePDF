import { PDFDocument } from "pdf-lib";

/** The PDF spec allows pages up to 200 inches (14400 points) on a side. */
const MAX_PAGE_POINTS = 14400;

/** CSS reference density — 96 pixels per inch, as browsers assume. */
const CSS_DPI = 96;

/**
 * The page size for an image, in points.
 *
 * An image becomes a page sized to its own proportions, so a photo keeps its
 * shape and a scan keeps its layout. Very large images are scaled down to the
 * largest page a PDF reader will accept.
 */
export function imagePageSize(px: { width: number; height: number }) {
  const scale = 72 / CSS_DPI;
  let width = px.width * scale;
  let height = px.height * scale;
  const longest = Math.max(width, height);
  if (longest > MAX_PAGE_POINTS) {
    const k = MAX_PAGE_POINTS / longest;
    width *= k;
    height *= k;
  }
  return { width, height };
}

export type ImagePdf = {
  bytes: Uint8Array;
  /** The page size, in points. */
  width: number;
  height: number;
};

/**
 * Wrap an image as a one-page PDF.
 *
 * Only PNG and JPEG are supported because those are the two formats pdf-lib
 * can embed; progressive JPEGs are rejected by the encoder, which is
 * reported to the caller as an error.
 */
export async function imageToPdf(
  data: Uint8Array,
  mime: string,
): Promise<ImagePdf> {
  const doc = await PDFDocument.create();
  const isPng = mime.includes("png");
  const image = isPng ? await doc.embedPng(data) : await doc.embedJpg(data);
  const size = imagePageSize({ width: image.width, height: image.height });
  const page = doc.addPage([size.width, size.height]);
  page.drawImage(image, {
    x: 0,
    y: 0,
    width: size.width,
    height: size.height,
  });
  return { bytes: await doc.save(), width: size.width, height: size.height };
}
