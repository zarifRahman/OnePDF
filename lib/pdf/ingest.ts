import { toast } from "sonner";
import { useDocStore } from "@/store/document";
import { loadFile } from "@/lib/pdf/load";
import { imageToPdf } from "@/lib/pdf/imagePage";
import { uuid } from "@/lib/utils";

/**
 * Shared ingestion path for every drop target in the app: validate, read the
 * page count, add the file to the workspace.
 */
export async function ingestFiles(fileList: FileList | File[]): Promise<number> {
  const addFile = useDocStore.getState().addFile;
  let count = 0;
  for (const file of Array.from(fileList)) {
    const looksPdf =
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!looksPdf) {
      toast.error(`${file.name}: not a PDF`);
      continue;
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { pageCount } = await loadFile(bytes);
      addFile({ id: uuid(), name: file.name, bytes, pageCount });
      count++;
    } catch {
      toast.error(`${file.name}: could not read PDF`);
    }
  }
  if (count) toast.success(`Added ${count} PDF${count === 1 ? "" : "s"}`);
  return count;
}

/**
 * Merge another PDF into the open document by appending its pages.
 */
export async function mergePdf(file: File): Promise<boolean> {
  const store = useDocStore.getState();
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { pageCount } = await loadFile(bytes);
    store.insertFileAt(
      { id: uuid(), name: file.name, bytes, pageCount },
      store.pages.length,
    );
    toast.success(`Merged ${file.name} — ${pageCount} page${pageCount === 1 ? "" : "s"} added`);
    return true;
  } catch {
    toast.error(`${file.name}: could not read PDF`);
    return false;
  }
}

/**
 * Turn an image file into a page and slot it in after the current page.
 */
export async function ingestImageAsPage(file: File): Promise<boolean> {
  const store = useDocStore.getState();
  const type = file.type || "";
  if (!type.includes("png") && !type.includes("jpeg")) {
    toast.error(`${file.name}: only PNG and JPEG images are supported`);
    return false;
  }
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    const { bytes, width, height } = await imageToPdf(data, type);
    const current = store.pages.findIndex((p) => p.id === store.currentPageId);
    const index = current < 0 ? store.pages.length : current + 1;
    store.insertFileAt(
      {
        id: uuid(),
        name: file.name.replace(/\.[^.]+$/, "") + ".pdf",
        bytes,
        pageCount: 1,
      },
      index,
    );
    toast.success(
      `Added ${file.name} as a page — ${Math.round(width)} × ${Math.round(height)} pt`,
    );
    return true;
  } catch {
    toast.error(`${file.name}: could not read the image`);
    return false;
  }
}
