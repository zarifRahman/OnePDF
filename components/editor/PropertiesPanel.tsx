"use client";
import { useDocStore } from "@/store/document";

// Right-hand panel shown while editing. Native inputs keep it tiny; setStyle
// live-applies to the selected annotation.
export function PropertiesPanel() {
  const { style, setStyle, tool, selectedId } = useDocStore();
  const showText = tool === "text" || selectedId != null;

  return (
    <aside className="w-56 shrink-0 space-y-4 border-l bg-background p-4 text-sm">
      <p className="font-medium">Properties</p>

      <label className="flex items-center justify-between">
        <span className="text-muted-foreground">Color</span>
        <input
          type="color"
          value={style.color}
          onChange={(e) => setStyle({ color: e.target.value })}
          className="h-7 w-10 cursor-pointer rounded border bg-transparent"
        />
      </label>

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

      {showText && (
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
      )}

      <p className="pt-2 text-xs text-muted-foreground">
        Tip: pick a tool, draw on the page. Use Select to move a mark or delete it with the Delete key.
      </p>
    </aside>
  );
}
