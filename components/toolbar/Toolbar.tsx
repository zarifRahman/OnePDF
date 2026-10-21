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
  Pencil,
  Highlighter,
  Underline,
  Square,
  Circle,
  Minus,
  MoveRight,
  Image as ImageIcon,
  Hash,
  StickyNote,
  PenTool,
  SquareDashed,
  Search,
  Keyboard,
  Crop,
  Scissors,
  Droplets,
  Gauge,
  ChevronDown,
  Columns2,
  Rows3,
  SquareStack,
  Trash2,
  FilePlus,
} from "lucide-react";
import { toast } from "sonner";
import { useDocStore } from "@/store/document";
import { uuid } from "@/lib/utils";
import { deleteDocument, getWorkspaceId } from "@/lib/db/storage";
import { Dropzone } from "@/components/upload/Dropzone";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Tool, ViewMode } from "@/types";

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
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md p-2 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30 ${
        active ? "bg-accent text-primary" : ""
      }`}
    >
      {children}
    </button>
  );
}

const TOOLS: { tool: Tool; icon: React.ReactNode; label: string }[] = [
  { tool: "select", icon: <MousePointer2 className="h-4 w-4" />, label: "Select / move  (V)" },
  { tool: "text", icon: <Type className="h-4 w-4" />, label: "Text — click existing text to edit  (T)" },
  { tool: "draw", icon: <Pencil className="h-4 w-4" />, label: "Freehand draw  (P)" },
  { tool: "highlight", icon: <Highlighter className="h-4 w-4" />, label: "Highlight  (H)" },
  { tool: "underline", icon: <Underline className="h-4 w-4" />, label: "Underline  (U)" },
  { tool: "rect", icon: <Square className="h-4 w-4" />, label: "Rectangle  (R)" },
  { tool: "circle", icon: <Circle className="h-4 w-4" />, label: "Circle  (C)" },
  { tool: "line", icon: <Minus className="h-4 w-4" />, label: "Line  (L)" },
  { tool: "arrow", icon: <MoveRight className="h-4 w-4" />, label: "Arrow  (A)" },
  { tool: "note", icon: <StickyNote className="h-4 w-4" />, label: "Sticky note  (N)" },
  { tool: "redact", icon: <SquareDashed className="h-4 w-4" />, label: "Redact — burns in on export  (D)" },
  { tool: "image", icon: <ImageIcon className="h-4 w-4" />, label: "Insert image  (I)" },
  { tool: "signature", icon: <PenTool className="h-4 w-4" />, label: "Insert signature  (S)" },
];

const VIEW_MODES: { id: ViewMode; icon: React.ReactNode; label: string }[] = [
  { id: "single", icon: <SquareStack className="h-4 w-4" />, label: "Single page" },
  { id: "continuous", icon: <Rows3 className="h-4 w-4" />, label: "Continuous" },
  { id: "facing", icon: <Columns2 className="h-4 w-4" />, label: "Facing pages" },
];

export type DialogId =
  | "split"
  | "pagenumbers"
  | "watermark"
  | "compress"
  | "export"
  | "margins"
  | "shortcuts";

export function Toolbar({
  onToggleSearch,
  onOpenDialog,
}: {
  onToggleSearch?: () => void;
  onOpenDialog: (id: DialogId) => void;
}) {
  const {
    pages,
    pageNumbers,
    zoom,
    fit,
    viewMode,
    tool,
    currentPageId,
    setZoom,
    setFit,
    setViewMode,
    setTool,
    addAnnotation,
    setPageNumbers,
    past,
    future,
    docTitle,
    setDocTitle,
  } = useDocStore();
  const { theme, setTheme } = useTheme();
  const imgInput = useRef<HTMLInputElement>(null);
  const hasDoc = pages.length > 0;

  // Image / signature insert: read file, size to 200pt wide keeping aspect,  // drop onto the current page. Move/resize afterwards with the select tool.
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

  const undoWithToast = () => {
    const s = useDocStore.getState();
    const label = s.past[s.past.length - 1]?.label;
    s.undo();
    if (label) toast(`Undid: ${label}`);
  };

  const redoWithToast = () => {
    const s = useDocStore.getState();
    const label = s.future[0]?.label;
    s.redo();
    if (label) toast(`Redid: ${label}`);
  };

  const zoomStep = (d: number) => {
    setFit("none");
    setZoom(zoom + d);
  };

  return (
    <header className="flex items-center gap-2 border-b bg-background px-3 py-2">
      <FileStack className="h-5 w-5 shrink-0 text-primary" />
      <span className="hidden shrink-0 font-semibold sm:inline">OnePDF</span>

      {hasDoc && (
        <input
          value={docTitle}
          onChange={(e) => setDocTitle(e.target.value)}
          aria-label="Document name"
          className="hidden max-w-40 truncate rounded-md border border-transparent bg-transparent px-2 py-1 text-sm hover:border-border focus:border-border focus:outline-none md:block"
        />
      )}

      {hasDoc && (
        <div className="w-[104px] shrink-0">
          <Dropzone compact />
        </div>
      )}

      {hasDoc && (
        <div className="flex items-center gap-0.5 overflow-x-auto rounded-md border px-1">
          {TOOLS.map((t) => (
            <Btn
              key={t.tool}
              title={t.label}
              active={tool === t.tool}
              onClick={() => setTool(t.tool)}
            >
              {t.icon}
            </Btn>
          ))}
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
        {hasDoc && (
          <>
            <Btn title="Search the document  (Ctrl+F)" onClick={() => onToggleSearch?.()}>
              <Search className="h-4 w-4" />
            </Btn>
            <Btn
              title="Page view options"
              onClick={() => setViewMode(viewMode === "single" ? "continuous" : viewMode === "continuous" ? "facing" : "single")}
            >
              {VIEW_MODES.find((v) => v.id === viewMode)?.icon}
            </Btn>
            <Btn title="Zoom out" onClick={() => zoomStep(-0.25)}>
              <ZoomOut className="h-4 w-4" />
            </Btn>
            <button
              title="Zoom presets"
              onClick={() => setFit(fit === "width" ? "page" : fit === "page" ? "none" : "width")}
              className="w-14 rounded-md px-1 text-center text-sm hover:bg-accent"
            >
              {fit !== "none" ? (fit === "width" ? "Fit W" : "Fit P") : `${Math.round(zoom * 100)}%`}
            </button>
            <Btn title="Zoom in" onClick={() => zoomStep(0.25)}>
              <ZoomIn className="h-4 w-4" />
            </Btn>
            <Btn title="Undo (Ctrl+Z)" onClick={undoWithToast} disabled={!past.length}>
              <Undo2 className="h-4 w-4" />
            </Btn>
            <Btn title="Redo (Ctrl+Y)" onClick={redoWithToast} disabled={!future.length}>
              <Redo2 className="h-4 w-4" />
            </Btn>
            <Btn title="Keyboard shortcuts  (?)" onClick={() => onOpenDialog("shortcuts")}>
              <Keyboard className="h-4 w-4" />
            </Btn>
            <Btn title="Toggle theme" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
              <Moon className="hidden h-4 w-4 dark:block" />
              <Sun className="h-4 w-4 dark:hidden" />
            </Btn>
            <button
              onClick={() => onOpenDialog("export")}
              className="ml-1 flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Download className="h-4 w-4" /> Export
            </button>
          </>
        )}
      </div>

      {hasDoc && (
        <div className="flex items-center gap-1 border-l pl-2">
          <MenuButton label="Pages" icon={<ChevronDown className="h-4 w-4" />}>
            <MenuItem onClick={() => onOpenDialog("split")} icon={<Scissors className="h-4 w-4" />}>
              Split into separate files…
            </MenuItem>
            <MenuItem onClick={() => onOpenDialog("margins")} icon={<Crop className="h-4 w-4" />}>
              Crop margins…
            </MenuItem>
            <MenuItem
              onClick={() => setPageNumbers({ enabled: !pageNumbers.enabled })}
              icon={<Hash className="h-4 w-4" />}
            >
              {pageNumbers.enabled ? "Hide page numbers" : "Show page numbers"}
            </MenuItem>
          </MenuButton>
          <MenuButton label="Document" icon={<ChevronDown className="h-4 w-4" />}>
            <MenuItem onClick={() => onOpenDialog("watermark")} icon={<Droplets className="h-4 w-4" />}>
              Watermark…
            </MenuItem>
            <MenuItem onClick={() => onOpenDialog("compress")} icon={<Gauge className="h-4 w-4" />}>
              Compress / grayscale / redact…
            </MenuItem>
            <MenuItem
              onClick={() => {
                const n = pages.filter((p) => p.isBlank).length;
                if (!n) return toast.info("No blank pages to remove");
                useDocStore.getState().deletePages(pages.filter((p) => p.isBlank).map((p) => p.id));
              }}
              icon={<Trash2 className="h-4 w-4" />}
            >
              Remove blank pages
            </MenuItem>
            <MenuItem
              onClick={() => {
                useDocStore.getState().reset();
                void deleteDocument(getWorkspaceId());
                toast.success("Started a new document");
              }}
              icon={<FilePlus className="h-4 w-4" />}
            >
              Start a new document
            </MenuItem>
          </MenuButton>
        </div>
      )}

    </header>
  );
}

// --- Small menu primitives (kept local so the toolbar stays one file) -------

function MenuButton({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button className="flex items-center gap-1 rounded-md border px-2 py-1.5 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {label}
            {icon}
          </button>
        }
      />
      <DropdownMenuContent align="start">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}

function MenuItem({
  onClick,
  icon,
  children,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenuItem onClick={onClick}>
      {icon}
      {children}
    </DropdownMenuItem>
  );
}
