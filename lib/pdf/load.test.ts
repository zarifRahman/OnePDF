import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { loadFile } from "./load";

describe("loadFile", () => {
  it("returns pageCount for a valid PDF", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    doc.addPage([200, 200]);
    const bytes = await doc.save();
    const res = await loadFile(bytes);
    expect(res.pageCount).toBe(2);
    expect(res.bytes).toBe(bytes);
  });

  it("throws on non-PDF input", async () => {
    await expect(loadFile(new TextEncoder().encode("not a pdf"))).rejects.toThrow();
  });
});
