import type { PDFPageProxy } from "pdfjs-dist";

/** A line of text discovered in the PDF content, in PDF points (top-left origin). */
export type TextLine = {
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  size: number;
  serif?: boolean;
  bold?: boolean;
};

/**
 * Accumulate pdf.js text fragments into whole lines. Fragments arrive in
 * reading order and `hasEOL` marks a line break, so one editable box per line.
 */
export async function extractLines(page: PDFPageProxy): Promise<TextLine[]> {
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const found: TextLine[] = [];

  let cur: {
    x0: number;
    x1: number;
    baseline: number;
    size: number;
    text: string;
    serif: boolean;
    bold: boolean;
  } | null = null;

  const flush = () => {
    if (!cur || !cur.text.trim()) return void (cur = null);
    found.push({
      x: cur.x0,
      y: vp.height - cur.baseline - cur.size,
      w: cur.x1 - cur.x0,
      h: cur.size,
      text: cur.text,
      size: cur.size,
      serif: cur.serif,
      bold: cur.bold,
    });
    cur = null;
  };

  for (const it of tc.items) {
    if (!("str" in it)) continue;
    const [, , , d, e, f] = it.transform;
    const size = it.height || Math.abs(d) || 12;
    const family = tc.styles?.[it.fontName]?.fontFamily ?? "";
    const serif = /serif|times|georgia|roman|garamond/i.test(family) && !/sans/i.test(family);
    const bold = /bold|black|heavy|demi|semibold/i.test(`${it.fontName ?? ""} ${family}`);
    // pdf.js marks the end of a line with an *empty* item that carries the
    // hasEOL flag. It has no text and no width, so it must not be treated as
    // a run — otherwise it would collapse the line's width to zero and the
    // line would stop being clickable.
    if (it.str) {
      if (!cur) {
        cur = { x0: e, x1: e + it.width, baseline: f, size, text: it.str, serif, bold };
      } else {
        cur.x0 = Math.min(cur.x0, e);
        cur.x1 = Math.max(cur.x1, e + it.width);
        cur.size = Math.max(cur.size, size);
        cur.text += it.str;
        cur.bold ||= bold;
      }
    }
    if (it.hasEOL) flush();
  }
  flush();
  return found;
}
