import { pdfjs } from "react-pdf";
import type { SearchHit } from "@/types";

export type { SearchHit };

/**
 * Find every occurrence of `query` in the document text.
 * Coordinates are PDF points with a top-left origin so hits can be drawn on
 * the annotation overlay.
 */
export async function searchDocument(
  bytes: Uint8Array,
  query: string,
): Promise<SearchHit[]> {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const doc = await pdfjs.getDocument({ data: bytes.slice(0) }).promise;
  const hits: SearchHit[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    for (const it of tc.items) {
      if (!("str" in it)) continue;
      const str = it.str;
      if (!str) continue;
      const hay = str.toLowerCase();
      let from = 0;
      for (;;) {
        const at = hay.indexOf(needle, from);
        if (at === -1) break;
        const [, , , d, e, f] = it.transform;
        const size = it.height || Math.abs(d) || 12;
        // Approximate the hit position by character ratio within the fragment.
        const ratio = str.length ? at / str.length : 0;
        const x = e + it.width * ratio;
        const w = it.width * (needle.length / Math.max(1, str.length));
        hits.push({
          pageIndex: i - 1,
          x,
          y: vp.height - f - size,
          w: Math.max(2, w),
          h: size,
          text: str.slice(at, at + needle.length),
        });
        from = at + needle.length;
      }
    }
  }
  return hits;
}
