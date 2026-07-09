"use client";
import { useTheme } from "next-themes";
import { Undo2, Redo2, ZoomIn, ZoomOut, Download, Moon, Sun, FileStack } from "lucide-react";
import { toast } from "sonner";
import { useDocStore } from "@/store/document";
import { exportPdf } from "@/lib/pdf/export";
import { downloadBytes } from "@/lib/utils";
import { Dropzone } from "@/components/upload/Dropzone";

function Btn({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title: string;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="rounded-md p-2 hover:bg-accent disabled:opacity-30"
    >
      {children}
    </button>
  );
}

export function Toolbar() {
  const { files, pages, zoom, setZoom, undo, redo, past, future } = useDocStore();
  const { theme, setTheme } = useTheme();

  const download = async () => {
    if (!pages.length) return;
    try {
      const bytes = await exportPdf(files, pages);
      downloadBytes(bytes, "onepdf-export.pdf");
      toast.success("Exported PDF");
    } catch {
      toast.error("Export failed");
    }
  };

  return (
    <header className="flex items-center gap-2 border-b bg-background px-3 py-2">
      <FileStack className="h-5 w-5 text-primary" />
      <span className="font-semibold">OnePDF</span>
      {pages.length > 0 && (
        <div className="mx-2 w-40">
          <Dropzone compact />
        </div>
      )}
      <div className="ml-auto flex items-center gap-1">
        <Btn title="Undo (Ctrl+Z)" onClick={undo} disabled={!past.length}>
          <Undo2 className="h-4 w-4" />
        </Btn>
        <Btn title="Redo (Ctrl+Y)" onClick={redo} disabled={!future.length}>
          <Redo2 className="h-4 w-4" />
        </Btn>
        <Btn title="Zoom out" onClick={() => setZoom(zoom - 0.25)}>
          <ZoomOut className="h-4 w-4" />
        </Btn>
        <span className="w-12 text-center text-sm">{Math.round(zoom * 100)}%</span>
        <Btn title="Zoom in" onClick={() => setZoom(zoom + 0.25)}>
          <ZoomIn className="h-4 w-4" />
        </Btn>
        <Btn title="Toggle theme" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          <Moon className="hidden h-4 w-4 dark:block" />
          <Sun className="h-4 w-4 dark:hidden" />
        </Btn>
        <button
          onClick={download}
          disabled={!pages.length}
          className="ml-2 flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-40"
        >
          <Download className="h-4 w-4" /> Download
        </button>
      </div>
    </header>
  );
}
