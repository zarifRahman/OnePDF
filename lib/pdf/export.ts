import { PDFDocument, degrees } from "pdf-lib";
import type { SourceFile, PageDescriptor } from "@/types";

const BLANK = [612, 792] as const; // US Letter

// Serialize the ordered descriptor model into a single PDF. Source docs are
// loaded once and cached so copyPages is cheap across many descriptors.
export async function exportPdf(
  files: Record<string, SourceFile>,
  pages: PageDescriptor[],
): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const cache = new Map<string, PDFDocument>();

  const srcDoc = async (fileId: string) => {
    let d = cache.get(fileId);
    if (!d) {
      d = await PDFDocument.load(files[fileId].bytes, { ignoreEncryption: true });
      cache.set(fileId, d);
    }
    return d;
  };

  for (const pg of pages) {
    if (pg.isBlank) {
      out.addPage([BLANK[0], BLANK[1]]);
      continue;
    }
    const [copied] = await out.copyPages(await srcDoc(pg.fileId), [pg.sourceIndex]);
    if (pg.rotation) copied.setRotation(degrees(pg.rotation));
    out.addPage(copied);
  }
  return out.save();
}
