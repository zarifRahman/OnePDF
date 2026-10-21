import { toast } from "sonner";
import { useDocStore } from "@/store/document";
import { loadFile } from "@/lib/pdf/load";
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
