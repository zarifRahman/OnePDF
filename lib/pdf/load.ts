import { PDFDocument } from "pdf-lib";

// Throws on corrupt/non-PDF input — caller shows a toast and skips the file.
export async function loadFile(
  bytes: Uint8Array,
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return { bytes, pageCount: doc.getPageCount() };
}
