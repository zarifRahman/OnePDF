import { describe, it, expect } from "vitest";
import { deflateSync } from "node:zlib";
import { PDFDocument, PDFArray, PDFName, PDFDict, PDFRef, PDFStream, StandardFonts, rgb } from "pdf-lib";
import { findPageImages, removePageImages } from "./images";

/** A 1x1 opaque PNG. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/** Build an RGB PNG of the given size, with noisy pixels so it does not compress away. */
function makePng(size: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  const raw = Buffer.alloc(size * (size * 3 + 1));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      raw[o++] = (x * 7 + y * 13) & 0xff;
      raw[o++] = (x * 31 + y * 17) & 0xff;
      raw[o++] = (x * 5 + y * 11) & 0xff;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// A small CRC-32 table so the PNG chunks are valid.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const PAGE_W = 595.28;
const PAGE_H = 841.89;

type Built = { bytes: Uint8Array; images: { x: number; y: number; w: number; h: number }[] };

/**
 * Build a page with some text and the given images, so we can assert that
 * removing an image leaves everything else alone.
 */
async function buildPdf(
  images: { x: number; y: number; w: number; h: number }[],
  text = "Hello OnePDF",
): Promise<Built> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(text, { x: 40, y: 780, size: 14, font, color: rgb(0, 0, 0) });
  const png = await doc.embedPng(PNG);
  for (const im of images) {
    page.drawImage(png, { x: im.x, y: im.y, width: im.w, height: im.h });
  }
  return { bytes: await doc.save(), images };
}

/** The decoded content stream of a page, as text. */
async function pageContent(bytes: Uint8Array, index = 0): Promise<string> {
  const doc = await PDFDocument.load(bytes);
  const page = doc.getPage(index);
  const contents = page.node.get(PDFName.of("Contents"));
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  let text = "";
  for (const ref of refs) {
    const stream = doc.context.lookup(ref) as unknown as {
      getContentsString?: () => string;
      contents?: Uint8Array;
    };
    if (typeof stream?.getContentsString === "function") {
      text += stream.getContentsString();
    }
  }
  return text;
}

/** The names of the image XObjects a page still references. */
async function imageXObjectNames(bytes: Uint8Array, index = 0): Promise<string[]> {
  const doc = await PDFDocument.load(bytes);
  const page = doc.getPage(index);
  const resources = page.node.Resources();
  const xobjects = resources?.lookupMaybe(PDFName.of("XObject"), PDFDict);
  if (!xobjects) return [];
  const names: string[] = [];
  for (const [key, value] of xobjects.asMap()) {
    const obj = value instanceof PDFRef ? doc.context.lookup(value) : value;
    const subtype = (obj as PDFStream).dict?.lookupMaybe(PDFName.of("Subtype"), PDFName);
    if (subtype?.toString() === "/Image") names.push(key.toString());
  }
  return names;
}

describe("findPageImages", () => {
  it("finds an image and reports it in page space", async () => {
    const { bytes } = await buildPdf([{ x: 60, y: 500, w: 120, h: 120 }]);
    const { regions, width, height } = await findPageImages(bytes, 0);

    expect(regions).toHaveLength(1);
    const r = regions[0];
    expect(r.x).toBeCloseTo(60, 1);
    expect(r.w).toBeCloseTo(120, 1);
    expect(r.h).toBeCloseTo(120, 1);
    // Page space has a top-left origin, so the image sits below the top edge.
    expect(r.y).toBeCloseTo(PAGE_H - 620, 1);
    expect(width).toBeCloseTo(PAGE_W, 1);
    expect(height).toBeCloseTo(PAGE_H, 1);
  });

  it("finds every image on the page", async () => {
    const { bytes } = await buildPdf([
      { x: 40, y: 700, w: 50, h: 50 },
      { x: 200, y: 300, w: 80, h: 40 },
    ]);
    const { regions } = await findPageImages(bytes, 0);
    expect(regions).toHaveLength(2);
  });

  it("returns nothing for a page with no images", async () => {
    const { bytes } = await buildPdf([]);
    expect((await findPageImages(bytes, 0)).regions).toHaveLength(0);
  });
});

describe("removePageImages", () => {
  it("removes the image from the page and leaves the text", async () => {
    const { bytes } = await buildPdf([{ x: 60, y: 500, w: 120, h: 120 }]);
    const { bytes: out, removed } = await removePageImages(bytes, 0);

    expect(removed).toBe(1);
    // The image operator is gone from the content stream.
    const content = await pageContent(out, 0);
    expect(content).not.toMatch(/\bDo\b/);
    // The text is still there (pdf-lib writes it as a hex string).
    expect(content).toContain(
      Buffer.from("Hello OnePDF", "latin1").toString("hex").toUpperCase(),
    );
    // And the page no longer references an image object.
    expect(await imageXObjectNames(out, 0)).toHaveLength(0);
  });

  it("removes every image on the page", async () => {
    const { bytes } = await buildPdf([
      { x: 40, y: 700, w: 50, h: 50 },
      { x: 200, y: 300, w: 80, h: 40 },
    ]);
    const { bytes: out, removed } = await removePageImages(bytes, 0);
    expect(removed).toBe(2);
    expect(await imageXObjectNames(out, 0)).toHaveLength(0);
  });

  it("is a no-op on a page with no images", async () => {
    const { bytes } = await buildPdf([]);
    const { removed } = await removePageImages(bytes, 0);
    expect(removed).toBe(0);
  });

  it("keeps the document loadable and the page count intact", async () => {
    const { bytes } = await buildPdf([{ x: 60, y: 500, w: 120, h: 120 }]);
    const { bytes: out } = await removePageImages(bytes, 0);
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPage(0).getSize().width).toBeCloseTo(PAGE_W, 2);
  });

  it("takes the image data out of the file, not just off the page", async () => {
    // A big noisy image so the byte difference is unmistakable.
    const doc = await PDFDocument.create();
    const page = doc.addPage([PAGE_W, PAGE_H]);
    const png = await doc.embedPng(makePng(160));
    page.drawImage(png, { x: 60, y: 400, width: 200, height: 200 });
    const bytes = await doc.save();

    const { bytes: out, removed } = await removePageImages(bytes, 0);
    expect(removed).toBe(1);
    expect(out.length).toBeLessThan(bytes.length * 0.6);
    // Nothing in the saved file still points at an image object.
    const after = await PDFDocument.load(out);
    const xobjects = after
      .getPage(0)
      .node.Resources()
      ?.lookupMaybe(PDFName.of("XObject"), PDFDict);
    expect(xobjects?.asMap().size ?? 0).toBe(0);
  });
});
