import { exportPdf } from "@/lib/pdf/export";
import { useDocStore } from "@/store/document";

/**
 * The complete document as bytes: pages, baked-in annotations, page numbers
 * and watermark. The viewer works off a lighter export (pages only) so it can
 * render marks as a live overlay; anything that produces a real file — export,
 * compress, rasterise — must use this one or it would silently drop the marks.
 */
export async function buildDocumentBytes(): Promise<Uint8Array> {
  const s = useDocStore.getState();
  return exportPdf(s.files, s.pages, {
    annotations: s.annotations,
    pageNumbers: s.pageNumbers,
    watermark: s.watermark,
  });
}
