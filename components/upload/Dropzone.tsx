"use client";

import { useCallback, useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { motion } from "framer-motion";
import { ingestFiles } from "@/lib/pdf/ingest";

export function Dropzone({
  compact = false,
  onFiles,
}: {
  compact?: boolean;
  onFiles?: (count: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const ingest = useCallback(
    async (fileList: FileList) => {
      const count = await ingestFiles(fileList);
      onFiles?.(count);
    },
    [onFiles],
  );

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-label="Add PDF files: drop here, or activate to browse"
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
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
        ${dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"}
        ${compact ? "gap-0.5 p-2 text-xs" : "gap-3 p-12"}`}
    >
      <UploadCloud className={compact ? "h-4 w-4" : "h-10 w-10 text-muted-foreground"} />
      <p className={compact ? "whitespace-nowrap font-medium" : "font-medium"}>
        {compact ? "Add PDFs" : "Drop PDFs here or click to browse"}
      </p>
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
        onChange={(e) => {
          if (e.target.files) ingest(e.target.files);
          e.target.value = "";
        }}
      />
    </motion.div>
  );
}
