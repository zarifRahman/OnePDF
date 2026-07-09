"use client";
import { useRef } from "react";
import { useTheme } from "next-themes";
import {
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Download,
  Moon,
  Sun,
  FileStack,
  MousePointer2,
  Type,
  TextCursorInput,
  Pencil,
  Highlighter,
  Underline,
  Square,
  Circle,
  Minus,
  Image as ImageIcon,
  Hash,
} from "lucide-react";
import { toast } from "sonner";
import { useDocStore } from "@/store/document";
import { exportPdf } from "@/lib/pdf/export";
import { downloadBytes, uuid } from "@/lib/utils";
import { Dropzone } from "@/components/upload/Dropzone";
import type { Tool } from "@/types";

function Btn({
  children,
  onClick,
  disabled,
  active,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  title: string;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md p-2 hover:bg-accent disabled:opacity-30 ${active ? "bg-accent text-primary" : ""}`}
    >
      {children}
    </button>
  );
}

const TOOLS: { tool: Tool; icon: React.ReactNode; label: string }[] = [
  { tool: "select", icon: <MousePointer2 className="h-4 w-4" />, label: "Select / move" },
  { tool: "text", icon: <Type className="h-4 w-4" />, label: "Add text" },
  { tool: "edittext", icon: <TextCursorInput className="h-4 w-4" />, label: "Edit existing text" },
  { tool: "draw", icon: <Pencil className="h-4 w-4" />, label: "Freehand draw" },
  { tool: "highlight", icon: <Highlighter className="h-4 w-4" />, label: "Highlight" },
  { tool: "underline", icon: <Underline className="h-4 w-4" />, label: "Underline" },
  { tool: "rect", icon: <Square className="h-4 w-4" />, label: "Rectangle" },
  { tool: "circle", icon: <Circle className="h-4 w-4" />, label: "Circle" },
  { tool: "line", icon: <Minus className="h-4 w-4" />, label: "Line" },
];

export function Toolbar() {
  const {
    files,
    pages,
    annotations,
    pageNumbers,
    zoom,
    tool,
    currentPageId,
    setZoom,
    setTool,
    addAnnotation,
    togglePageNumbers,
    undo,
    redo,
    past,
    future,
  } = useDocStore();
  const { theme, setTheme } = useTheme();
  const imgInput = useRef<HTMLInputElement>(null);
  const hasDoc = pages.length > 0;

  const download = async () => {
    if (!hasDoc) return;
    try {
      const bytes = await exportPdf(files, pages, annotations, pageNumbers);
      downloadBytes(bytes, "onepdf-export.pdf");
      toast.success("Exported PDF");
    } catch {
      toast.error("Export failed");
    }
  };

  // Image / signature insert: read file, size to 200pt wide keeping aspect,
  // drop onto the current page. Move/resize afterwards with the select tool.
  const insertImage = async (file: File) => {
    if (!currentPageId) return;
    const dataUrl = await new Promise<string>((res) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.readAsDataURL(file);
    });
    const aspect = await new Promise<number>((res) => {
      const im = new window.Image();
      im.onload = () => res(im.width / im.height || 1);
      im.src = dataUrl;
    });
    const w = 200;
    addAnnotation({
      id: uuid(),
      pageId: currentPageId,
      type: "image",
      color: "#000000",
      x: 40,
      y: 40,
      w,
      h: w / aspect,
      dataUrl,
      mime: file.type,
    });
    toast.success("Image inserted");
  };

  return (
    <header className="flex items-center gap-2 border-b bg-background px-3 py-2">
      <FileStack className="h-5 w-5 text-primary" />
      <span className="font-semibold">OnePDF</span>
      {hasDoc && (
        <div className="mx-2 w-36">
          <Dropzone compact />
        </div>
      )}

      {hasDoc && (
        <div className="flex items-center gap-0.5 rounded-md border px-1">
          {TOOLS.map((t) => (
            <Btn key={t.tool} title={t.label} active={tool === t.tool} onClick={() => setTool(t.tool)}>
              {t.icon}
            </Btn>
          ))}
          <Btn title="Insert image / signature" active={tool === "image"} onClick={() => imgInput.current?.click()}>
            <ImageIcon className="h-4 w-4" />
          </Btn>
          <Btn title="Toggle page numbers" active={pageNumbers} onClick={togglePageNumbers}>
            <Hash className="h-4 w-4" />
          </Btn>
          <input
            ref={imgInput}
            type="file"
            accept="image/png,image/jpeg"
            hidden
            onChange={(e) => e.target.files?.[0] && insertImage(e.target.files[0])}
          />
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
          disabled={!hasDoc}
          className="ml-2 flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-40"
        >
          <Download className="h-4 w-4" /> Download
        </button>
      </div>
    </header>
  );
}
