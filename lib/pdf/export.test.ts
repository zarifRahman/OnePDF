import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { exportPdf } from "./export";
import type { SourceFile, PageDescriptor } from "@/types";

async function makeSource(id: string, pages: number): Promise<SourceFile> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([200, 200]);
  const bytes = await doc.save();
  return { id, name: `${id}.pdf`, bytes, pageCount: pages };
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
    const out = await exportPdf(
      { a },
      [pd],
      [
        { id: "1", pageId: pd.id, type: "text", x: 10, y: 10, text: "hi", size: 12, color: "#e11d48" },
        { id: "2", pageId: pd.id, type: "rect", x: 20, y: 20, w: 40, h: 30, strokeWidth: 2, color: "#2563eb" },
        { id: "3", pageId: pd.id, type: "draw", points: [[0, 0], [10, 10], [20, 5]], strokeWidth: 3, color: "#000000" },
        { id: "4", pageId: pd.id, type: "whiteout", x: 5, y: 5, w: 30, h: 12, color: "#ffffff" },
      ],
      true,
    );
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(1);
    expect(out.length).toBeGreaterThan(0);
  });
});
