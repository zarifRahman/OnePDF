"use client";

import { useMemo } from "react";
import { Copy, Trash2 } from "lucide-react";
import { useDocStore } from "@/store/document";

const SWATCHES = [
  "#e11d48",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#0ea5e9",
  "#2563eb",
  "#7c3aed",
  "#111827",
  "#ffffff",
];

export function PropertiesPanel() {
  const {
    style,
    setStyle,
    tool,
    selectedId,
    annotations,
    pages,
    deleteAnnotation,
    duplicateAnnotation,
  } = useDocStore();

  const selected = useMemo(
    () => annotations.find((a) => a.id === selectedId) ?? null,
    [annotations, selectedId],
  );

  const isText = tool === "text" || selected?.type === "text";
  const isShape = selected?.type === "rect" || selected?.type === "circle";
  const isDraw = selected?.type === "draw" || selected?.type === "line" || selected?.type === "underline" || selected?.type === "arrow";
  const showStroke = isDraw || isShape || selected?.type === "highlight";

  return (
    <aside className="w-60 shrink-0 space-y-5 overflow-y-auto border-l bg-background p-4 text-sm">
      <div>
        <p className="font-medium">
          {selected ? "Annotation" : "Properties"}
        </p>
        <p className="text-xs capitalize text-muted-foreground">
          {selected
            ? `${selected.type} · page ${Math.max(1, pages.findIndex((p) => p.id === selected.pageId) + 1)}`
            : tool === "select"
              ? "Select a mark to edit it"
              : `New ${tool}`}
        </p>
      </div>

      <div className="space-y-2">
        <span className="text-muted-foreground">Colour</span>
        <div className="flex flex-wrap gap-1.5">
          {SWATCHES.map((c) => (
            <button
              key={c}
              title={c}
              aria-label={`Colour ${c}`}
              onClick={() => setStyle({ color: c })}
              className={`h-6 w-6 rounded-md border transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                style.color.toLowerCase() === c ? "ring-2 ring-ring ring-offset-1" : "border-border"
              }`}
              style={{ background: c }}
            />
          ))}
          <input
            type="color"
            value={style.color}
            onChange={(e) => setStyle({ color: e.target.value })}
            aria-label="Custom colour"
            className="h-6 w-6 cursor-pointer rounded-md border border-border bg-transparent p-0"
          />
        </div>
      </div>

      {showStroke && (
        <label className="block space-y-1">
          <span className="text-muted-foreground">Stroke width · {style.strokeWidth}</span>
          <input
            type="range"
            min={1}
            max={20}
            value={style.strokeWidth}
            onChange={(e) => setStyle({ strokeWidth: Number(e.target.value) })}
            className="w-full"
          />
        </label>
      )}

      {isShape && (
        <label className="flex items-center justify-between">
          <span className="text-muted-foreground">Fill</span>
          <div className="flex items-center gap-1">
            <input
              type="color"
              value={style.fill ?? "#ffffff"}
              onChange={(e) => setStyle({ fill: e.target.value })}
              aria-label="Fill colour"
              className="h-7 w-9 cursor-pointer rounded border bg-transparent"
            />
            <button
              className="rounded border px-1.5 py-1 text-xs"
              onClick={() => setStyle({ fill: style.fill ? null : "#fde68a" })}
            >
              {style.fill ? "None" : "On"}
            </button>
          </div>
        </label>
      )}

      {isText && (
        <>
          <label className="block space-y-1">
            <span className="text-muted-foreground">Font size · {style.fontSize}</span>
            <input
              type="range"
              min={8}
              max={72}
              value={style.fontSize}
              onChange={(e) => setStyle({ fontSize: Number(e.target.value) })}
              className="w-full"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-muted-foreground">Typeface</span>
            <select
              value={style.fontFamily}
              onChange={(e) => setStyle({ fontFamily: e.target.value as typeof style.fontFamily })}
              className="h-8 w-full rounded-md border bg-background px-2 text-sm"
            >
              <option value="Helvetica">Helvetica</option>
              <option value="Times">Times</option>
              <option value="Courier">Courier</option>
            </select>
          </label>
          <div className="flex gap-1">
            <button
              onClick={() => setStyle({ bold: !style.bold })}
              className={`h-7 w-9 rounded-md border text-xs font-bold ${
                style.bold ? "border-primary bg-primary/10" : ""
              }`}
            >
              B
            </button>
            <button
              onClick={() => setStyle({ italic: !style.italic })}
              className={`h-7 w-9 rounded-md border text-xs italic ${
                style.italic ? "border-primary bg-primary/10" : ""
              }`}
            >
              I
            </button>
            <button
              onClick={() => setStyle({ align: "left" })}
              className={`h-7 flex-1 rounded-md border text-xs ${
                style.align === "left" ? "border-primary bg-primary/10" : ""
              }`}
            >
              ⇤
            </button>
            <button
              onClick={() => setStyle({ align: "center" })}
              className={`h-7 flex-1 rounded-md border text-xs ${
                style.align === "center" ? "border-primary bg-primary/10" : ""
              }`}
            >
              ↔
            </button>
            <button
              onClick={() => setStyle({ align: "right" })}
              className={`h-7 flex-1 rounded-md border text-xs ${
                style.align === "right" ? "border-primary bg-primary/10" : ""
              }`}
            >
              ⇥
            </button>
          </div>
        </>
      )}

      <label className="block space-y-1">
        <span className="text-muted-foreground">Opacity · {Math.round(style.opacity * 100)}%</span>
        <input
          type="range"
          min={10}
          max={100}
          value={Math.round(style.opacity * 100)}
          onChange={(e) => setStyle({ opacity: Number(e.target.value) / 100 })}
          className="w-full"
        />
      </label>

      {selected && (
        <div className="flex gap-2 border-t pt-3">
          <button
            onClick={() => duplicateAnnotation(selected.id)}
            className="flex flex-1 items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-xs hover:bg-accent"
          >
            <Copy className="h-3.5 w-3.5" /> Duplicate
          </button>
          <button
            onClick={() => deleteAnnotation(selected.id)}
            className="flex flex-1 items-center justify-center gap-1 rounded-md border border-destructive/40 px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </div>
      )}

      <p className="border-t pt-3 text-xs text-muted-foreground">
        {tool === "select"
          ? "Drag a mark to move it, or grab a handle to resize it."
          : "Draw on the page. Every change can be undone with ⌘Z."}
      </p>
    </aside>
  );
}
