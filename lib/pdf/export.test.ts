import { describe, it, expect } from "vitest";
import { PDFDocument, PDFArray, PDFName, decodePDFRawStream } from "pdf-lib";
import { exportPdf } from "./export";
import type { SourceFile, PageDescriptor, Annotation } from "@/types";

async function makeSource(id: string, pages: number): Promise<SourceFile> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([200, 200]);
  const bytes = await doc.save();
  return { id, name: `${id}.pdf`, bytes, pageCount: pages };
}
/** Decoded text operators of a page — used to assert what was baked in. */
async function pageOperators(bytes: Uint8Array, index = 0): Promise<string> {
  const doc = await PDFDocument.load(bytes);
  const page = doc.getPage(index);
  const contents = page.node.get(PDFName.of("Contents"));
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  let text = "";
  for (const ref of refs) {
    const stream = (await doc.context.lookup(ref)) as {
      contents?: Uint8Array;
      getContentsString?: () => string;
    };
    if (stream?.contents)
      text += Buffer.from(decodePDFRawStream(stream as never).decode()).toString("latin1");
    else if (typeof stream?.getContentsString === "function") text += stream.getContentsString();
  }
  return text;
}

/** Pull the shown text out of content-stream operators (hex or literal strings). */
function textFromOperators(ops: string): string {
  let out = "";
  const re = /<([0-9A-Fa-f\s]+)>\s*Tj|\(((?:\\.|[^\\)])*)\)\s*Tj/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(ops))) {
    if (m[1]) {
      const hex = m[1].replace(/\s+/g, "");
      for (let i = 0; i + 1 < hex.length; i += 2)
        out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
    } else if (m[2]) {
      out += m[2].replace(/\\(.)/g, "$1");
    }
  }
  return out;
}

const p = (o: Partial<PageDescriptor>): PageDescriptor => ({
  id: crypto.randomUUID(),
  fileId: "",
  sourceIndex: -1,
  rotation: 0,
  isBlank: false,
  ...o,
});

describe("exportPdf", () => {
  it("merges two 1-page docs into 2 pages", async () => {
    const a = await makeSource("a", 1),
      b = await makeSource("b", 1);
    const out = await exportPdf({ a, b }, [
      p({ fileId: "a", sourceIndex: 0 }),
      p({ fileId: "b", sourceIndex: 0 }),
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
      p({ fileId: "a", sourceIndex: 0 }),
      p({ isBlank: true }),
    ]);
    expect((await PDFDocument.load(out)).getPageCount()).toBe(2);
  });

  it("bakes text/shape annotations + page numbers without corrupting the doc", async () => {
    const a = await makeSource("a", 1);
    const pd = p({ fileId: "a", sourceIndex: 0 });
    const annotations: Annotation[] = [
      { id: "1", pageId: pd.id, type: "text", x: 10, y: 10, text: "hi", size: 12, color: "#e11d48" },
      { id: "2", pageId: pd.id, type: "rect", x: 20, y: 20, w: 40, h: 30, strokeWidth: 2, color: "#2563eb" },
      { id: "3", pageId: pd.id, type: "draw", points: [[0, 0], [10, 10], [20, 5]], strokeWidth: 3, color: "#000000" },
      { id: "4", pageId: pd.id, type: "whiteout", x: 5, y: 5, w: 30, h: 12, color: "#ffffff" },
    ];
    const out = await exportPdf(
      { a },
      [pd],
      { annotations, pageNumbers: { enabled: true, position: "bottom-center", format: "n-of-m", startAt: 1 } },
    );
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(1);
    expect(out.length).toBeGreaterThan(0);
  });

  it("applies a per-page crop box", async () => {
    const a = await makeSource("a", 1);
    const out = await exportPdf(
      { a },
      [p({ fileId: "a", sourceIndex: 0, crop: { top: 10, right: 20, bottom: 30, left: 40 } })],
    );
    const doc = await PDFDocument.load(out);
    const box = doc.getPage(0).getCropBox();
    expect(box.x).toBe(40);
    expect(box.y).toBe(30);
    expect(box.width).toBe(200 - 40 - 20);
    expect(box.height).toBe(200 - 30 - 10);
  });

  it("draws a watermark on every page", async () => {
    const a = await makeSource("a", 2);
    const out = await exportPdf(
      { a },
      [p({ fileId: "a", sourceIndex: 0 }), p({ fileId: "a", sourceIndex: 1 })],
      { watermark: { text: "CONFIDENTIAL", size: 40, color: "#888888", opacity: 0.2, rotation: 45 } },
    );
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(2);
    expect(out.length).toBeGreaterThan(0);
    // The watermark text is written into the page content stream.
    expect(textFromOperators(await pageOperators(out))).toContain("CONFIDENTIAL");
  });

  it("writes annotation text into the page content stream", async () => {
    const a = await makeSource("a", 1);
    const pd = p({ fileId: "a", sourceIndex: 0 });
    const out = await exportPdf(
      { a },
      [pd],
      {
        annotations: [
          { id: "1", pageId: pd.id, type: "text", x: 10, y: 10, text: "Marker", size: 12, color: "#000000" },
        ],
      },
    );
    expect(textFromOperators(await pageOperators(out))).toContain("Marker");
  });

  it("bakes an arrow with a head", async () => {
    const a = await makeSource("a", 1);
    const pd = p({ fileId: "a", sourceIndex: 0 });
    const out = await exportPdf(
      { a },
      [pd],
      {
        annotations: [
          { id: "1", pageId: pd.id, type: "arrow", x1: 10, y1: 10, x2: 100, y2: 100, strokeWidth: 2, color: "#000000" },
        ],
      },
    );
    expect((await PDFDocument.load(out)).getPageCount()).toBe(1);
  });
});
