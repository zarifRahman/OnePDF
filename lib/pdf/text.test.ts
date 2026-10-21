import { describe, it, expect } from "vitest";
import type { PDFPageProxy } from "pdfjs-dist";
import { extractLines } from "./text";

const PAGE_H = 841.89;

/** A text item shaped like the ones pdf.js returns. */
function item(str: string, width: number, size: number, x: number, y: number, hasEOL: boolean) {
  return {
    str,
    width,
    height: size,
    hasEOL,
    fontName: "F1",
    transform: [size, 0, 0, size, x, y],
  };
}

/** A page whose text content is the given items. */
function fakePage(items: unknown[]): PDFPageProxy {
  return {
    getViewport: () => ({ width: 595.28, height: PAGE_H }),
    getTextContent: async () => ({ items, styles: {} }),
  } as unknown as PDFPageProxy;
}

describe("extractLines", () => {
  it("keeps the width of a line that pdf.js closes with an empty marker", async () => {
    // pdf.js emits an empty hasEOL item *before* the line it belongs to.
    // Treating that marker as a run used to collapse the width to zero,
    // which made the line unclickable.
    const lines = await extractLines(
      fakePage([
        item("First line of alpha.", 94.704, 12, 60, 700, false),
        item("", 0, 0, 60, 700, true),
        item("Second line of alpha.", 112.068, 12, 60, 680, false),
        item("", 0, 0, 60, 680, true),
      ]),
    );

    expect(lines).toHaveLength(2);
    expect(lines[0].w).toBeCloseTo(94.704, 2);
    expect(lines[0].x).toBe(60);
    expect(lines[0].y).toBeCloseTo(PAGE_H - 700 - 12, 2);
    expect(lines[0].text).toBe("First line of alpha.");
    expect(lines[1].w).toBeCloseTo(112.068, 2);
    expect(lines[1].text).toBe("Second line of alpha.");
  });

  it("groups the runs of one line and adds up their widths", async () => {
    const lines = await extractLines(
      fakePage([
        item("Hello ", 30, 12, 60, 700, false),
        item("world", 28, 12, 90, 700, false),
        item("", 0, 0, 60, 700, true),
      ]),
    );

    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe("Hello world");
    expect(lines[0].x).toBe(60);
    expect(lines[0].w).toBeCloseTo(58, 2); // 90 + 28 - 60
  });

  it("handles a line that ends on its own hasEOL flag", async () => {
    const lines = await extractLines(
      fakePage([item("Only line", 50, 12, 60, 700, true)]),
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].w).toBeCloseTo(50, 2);
  });

  it("ignores blank lines", async () => {
    const lines = await extractLines(
      fakePage([
        item("", 0, 0, 60, 700, true),
        item("Real text", 42, 12, 60, 680, false),
        item("", 0, 0, 60, 680, true),
      ]),
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe("Real text");
  });

  it("flushes a trailing line that has no closing marker", async () => {
    const lines = await extractLines(fakePage([item("Last line", 33, 12, 60, 700, false)]));
    expect(lines).toHaveLength(1);
    expect(lines[0].w).toBeCloseTo(33, 2);
  });
});
