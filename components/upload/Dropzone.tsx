"use client";
import { useCallback, useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useDocStore } from "@/store/document";
import { loadFile } from "@/lib/pdf/load";
import { uuid } from "@/lib/utils";

export function Dropzone({ compact = false }: { compact?: boolean }) {
  const addFile = useDocStore((s) => s.addFile);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const ingest = useCallback(
    async (fileList: FileList) => {
      for (const file of Array.from(fileList)) {
        if (file.type !== "application/pdf") {
          toast.error(`${file.name}: not a PDF`);
          continue;
        }
        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const { pageCount } = await loadFile(bytes);
          addFile({ id: uuid(), name: file.name, bytes, pageCount });
          toast.success(`Added ${file.name} (${pageCount} pages)`);
        } catch {
          toast.error(`${file.name}: could not read PDF`);
        }
      }
    },
    [addFile],
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        ingest(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors
        ${dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"}
        ${compact ? "gap-1 p-4 text-sm" : "gap-3 p-12"}`}
    >
      <UploadCloud className={compact ? "h-5 w-5" : "h-10 w-10 text-muted-foreground"} />
      <p className="font-medium">{compact ? "Add PDFs" : "Drop PDFs here or click to browse"}</p>
      {!compact && (
        <p className="text-sm text-muted-foreground">
          Multiple files supported · processed in your browser
        </p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        multiple
        hidden
        onChange={(e) => e.target.files && ingest(e.target.files)}
      />
    </motion.div>
  );
}
