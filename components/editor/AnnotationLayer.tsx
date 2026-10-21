"use client";

import { useRef, useState } from "react";
import { useDocStore } from "@/store/document";
import { uuid } from "@/lib/utils";
import { SignaturePad } from "@/components/editor/SignaturePad";
import { emitShortcut } from "@/lib/hooks/useKeyboardShortcuts";
import type {
  Annotation,
  Tool,
  EditTarget,
  TextAnnotation,
  NoteAnnotation,
  SearchHit,
} from "@/types";

type Pt = [number, number];
const CREATE_TOOLS: Tool[] = [
  "draw",
  "highlight",
  "underline",
  "rect",
  "circle",
  "line",
  "arrow",
  "redact",
];

type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

const FONT_STACK: Record<string, string> = {
  Helvetica: "Helvetica, Arial, sans-serif",
  Times: "Georgia, 'Times New Roman', serif",
  Courier: "'Courier New', Courier, monospace",
};

// Shift every coordinate of an annotation by (dx, dy) for drag-move.
function translate(a: Annotation, dx: number, dy: number): Annotation {
  switch (a.type) {
    case "text":
    case "rect":
    case "circle":
    case "highlight":
    case "whiteout":
    case "redact":
    case "image":
    case "note":
      return { ...a, x: a.x + dx, y: a.y + dy };
    case "line":
    case "underline":
    case "arrow":
      return { ...a, x1: a.x1 + dx, y1: a.y1 + dy, x2: a.x2 + dx, y2: a.y2 + dy };
    case "draw":
      return { ...a, points: a.points.map(([x, y]) => [x + dx, y + dy]) };
  }
}

// Axis-aligned bounding box (for the selection outline).
function bbox(a: Annotation): [number, number, number, number] {
  switch (a.type) {
    case "text":
      return [a.x, a.y, a.w ?? (a.text.length * a.size * 0.5 || a.size), a.size];
    case "note":
      return [a.x, a.y, 120, 40];
    case "rect":
    case "circle":
    case "highlight":
    case "whiteout":
    case "redact":
    case "image":
      return [a.x, a.y, a.w, a.h];
    case "line":
    case "underline":
    case "arrow":
      return [
        Math.min(a.x1, a.x2),
        Math.min(a.y1, a.y2),
        Math.abs(a.x2 - a.x1) || 1,
        Math.abs(a.y2 - a.y1) || 1,
      ];
    case "draw": {
      const xs = a.points.map((p) => p[0]);
      const ys = a.points.map((p) => p[1]);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return [x, y, Math.max(...xs) - x || 1, Math.max(...ys) - y || 1];
    }
  }
}

/** Resize a box-like annotation from one of its eight handles. */
function resize(a: Annotation, handle: Handle, dx: number, dy: number): Annotation {
  const boxTypes = ["rect", "circle", "highlight", "whiteout", "redact", "image"] as const;
  if (boxTypes.includes(a.type as (typeof boxTypes)[number])) {
    const b = a as Extract<Annotation, { x: number; y: number; w: number; h: number }>;
    let { x, y, w, h } = b;
    if (handle.includes("w")) {
      x += dx;
      w -= dx;
    }
    if (handle.includes("e")) w += dx;
    if (handle.includes("n")) {
      y += dy;
      h -= dy;
    }
    if (handle.includes("s")) h += dy;
    if (w < 4) {
      w = 4;
      x = Math.min(x, b.x + b.w - 4);
    }
    if (h < 4) {
      h = 4;
      y = Math.min(y, b.y + b.h - 4);
    }
    return { ...b, x, y, w, h };
  }
  if (a.type === "text") {
    const t = a as TextAnnotation;
    const w = t.w ?? (t.text.length * t.size * 0.5 || t.size);
    if (handle === "e") return { ...t, w: Math.max(8, w + dx) };
    if (handle === "w") return { ...t, x: t.x + dx, w: Math.max(8, w - dx) };
    // Vertical handles scale the glyph size.
    const scale = handle === "n" ? 1 - dy / Math.max(1, t.size) : 1 + dy / Math.max(1, t.size);
    const size = Math.max(4, Math.min(200, t.size * scale));
    return { ...t, size };
  }
  if (a.type === "note") {
    const n = a as NoteAnnotation;
    return { ...n, x: n.x + (handle.includes("w") ? dx : 0), y: n.y + (handle.includes("n") ? dy : 0) };
  }
  return a;
}

function handlePoints(box: [number, number, number, number]): Record<Handle, Pt> {
  const [x, y, w, h] = box;
  return {
    nw: [x, y],
    n: [x + w / 2, y],
    ne: [x + w, y],
    e: [x + w, y + h / 2],
    se: [x + w, y + h],
    s: [x + w / 2, y + h],
    sw: [x, y + h],
    w: [x, y + h / 2],
  };
}

function Shape({ a }: { a: Annotation }) {
  const op = a.opacity ?? 1;
  switch (a.type) {
    case "text": {
      const family = FONT_STACK[a.fontFamily ?? "Helvetica"];
      const w = a.w;
      const anchor = a.align === "center" ? "middle" : a.align === "right" ? "end" : "start";
      const x = a.align === "center" && w ? a.x + w / 2 : a.align === "right" && w ? a.x + w : a.x;
      return (
        <text
          x={x}
          y={a.y + a.size}
          fontSize={a.size}
          fill={a.color}
          opacity={op}
          textAnchor={anchor}
          fontFamily={family}
          fontWeight={a.bold ? 700 : 400}
          fontStyle={a.italic ? "italic" : "normal"}
          style={{ whiteSpace: "pre" }}
        >
          {a.text}
        </text>
      );
    }
    case "draw":
      return (
        <polyline
          points={a.points.map((p) => p.join(",")).join(" ")}
          fill="none"
          stroke={a.color}
          strokeWidth={a.strokeWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity={op}
        />
      );
    case "rect":
      return (
        <rect
          x={a.x}
          y={a.y}
          width={a.w}
          height={a.h}
          fill={a.fill ?? "none"}
          fillOpacity={a.fill ? op : 0}
          stroke={a.color}
          strokeWidth={a.strokeWidth}
          opacity={op}
        />
      );
    case "circle":
      return (
        <ellipse
          cx={a.x + a.w / 2}
          cy={a.y + a.h / 2}
          rx={a.w / 2}
          ry={a.h / 2}
          fill={a.fill ?? "none"}
          fillOpacity={a.fill ? op : 0}
          stroke={a.color}
          strokeWidth={a.strokeWidth}
          opacity={op}
        />
      );
    case "line":
    case "underline":
      return (
        <line
          x1={a.x1}
          y1={a.y1}
          x2={a.x2}
          y2={a.y2}
          stroke={a.color}
          strokeWidth={a.strokeWidth}
          opacity={op}
        />
      );
    case "arrow": {
      const ang = Math.atan2(a.y2 - a.y1, a.x2 - a.x1);
      const len = Math.max(6, a.strokeWidth * 3.5);
      const head = (sign: number): Pt => [
        a.x2 + Math.cos(ang + Math.PI + sign * 0.42) * len,
        a.y2 + Math.sin(ang + Math.PI + sign * 0.42) * len,
      ];
      return (
        <g opacity={op}>
          <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke={a.color} strokeWidth={a.strokeWidth} />
          <line x1={a.x2} y1={a.y2} x2={head(1)[0]} y2={head(1)[1]} stroke={a.color} strokeWidth={a.strokeWidth} />
          <line x1={a.x2} y1={a.y2} x2={head(-1)[0]} y2={head(-1)[1]} stroke={a.color} strokeWidth={a.strokeWidth} />
        </g>
      );
    }
    case "highlight":
      return <rect x={a.x} y={a.y} width={a.w} height={a.h} fill={a.color} opacity={op * 0.35} />;
    case "whiteout":
      return <rect x={a.x} y={a.y} width={a.w} height={a.h} fill={a.color} opacity={op} />;
    case "redact":
      return <rect x={a.x} y={a.y} width={a.w} height={a.h} fill={a.color} opacity={op} />;
    case "image":
      return (
        <image
          href={a.dataUrl}
          x={a.x}
          y={a.y}
          width={a.w}
          height={a.h}
          preserveAspectRatio="none"
          opacity={op}
        />
      );
    case "note":
      return (
        <g opacity={op}>
          <rect x={a.x} y={a.y} width={120} height={40} rx={3} fill="#fef3c7" stroke="#eab308" />
          <text x={a.x + 8} y={a.y + 18} fontSize={11} fill="#1f2937" fontFamily="Helvetica, Arial, sans-serif">
            {a.text.slice(0, 22)}
          </text>
          {a.text.length > 22 && (
            <text x={a.x + 8} y={a.y + 32} fontSize={11} fill="#1f2937" fontFamily="Helvetica, Arial, sans-serif">
              {a.text.slice(22, 44)}
            </text>
          )}
        </g>
      );
  }
}

export function AnnotationLayer({
  pageId,
  wPts,
  hPts,
  editTargets = [],
  hits = [],
}: {
  pageId: string;
  wPts: number;
  hPts: number;
  editTargets?: EditTarget[];
  hits?: SearchHit[];
}) {
  const {
    annotations,
    tool,
    style,
    selectedId,
    select,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
    pushHistory,
  } = useDocStore();
  const svgRef = useRef<SVGSVGElement>(null);
  const [draft, setDraft] = useState<Annotation | null>(null);
  const drag = useRef<{ id: string; last: Pt } | null>(null);
  const resizeDrag = useRef<{ id: string; handle: Handle; start: Pt } | null>(null);
  const drawing = useRef(false);
  const [signing, setSigning] = useState(false);

  const mine = annotations.filter((a) => a.pageId === pageId);

  const getPt = (e: React.PointerEvent | React.MouseEvent): Pt => {
    const svg = svgRef.current!;
    const p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const t = p.matrixTransform(svg.getScreenCTM()!.inverse());
    return [t.x, t.y];
  };

  // In-place editing under the single "text" tool: an <input> is placed exactly
  // where you click. Clicking an existing line edits it (cover original with a
  // white box + redraw the new text on export); clicking empty space types new
  // text there.
  const [edit, setEdit] = useState<
    | ({ kind: "existing" } & EditTarget)
    | { kind: "new"; x: number; y: number; size: number }
    | { kind: "annotation"; id: string; x: number; y: number; size: number; w: number }
    | { kind: "note"; id: string; x: number; y: number; size: number }
    | null
  >(null);
  const [editValue, setEditValue] = useState("");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const beginEdit = (t: EditTarget) => {
    setEdit({ kind: "existing", ...t });
    setEditValue(t.text);
  };
  const beginNew = (x: number, y: number) => {
    setEdit({ kind: "new", x, y: y - style.fontSize, size: style.fontSize });
    setEditValue("");
  };
  // Re-edit one of our own text annotations in place (click it with the text
  // tool) instead of stacking a new box on top of it.
  const beginEditAnnotation = (a: TextAnnotation) => {
    setEdit({
      kind: "annotation",
      id: a.id,
      x: a.x,
      y: a.y,
      size: a.size,
      w: a.w ?? (a.text.length * a.size * 0.5 || a.size),
    });
    setEditValue(a.text);
  };
  const beginEditNote = (a: NoteAnnotation) => {
    setEdit({ kind: "note", id: a.id, x: a.x, y: a.y, size: 11 });
    setEditValue(a.text);
  };
  const commitEdit = () => {
    const e = edit;
    if (!e) return;
    setEdit(null);
    if (e.kind === "new") {
      if (editValue.trim())
        addAnnotation({
          id: uuid(),
          pageId,
          type: "text",
          x: e.x,
          y: e.y,
          text: editValue,
          size: e.size,
          color: style.color,
          opacity: style.opacity,
          fontFamily: style.fontFamily,
          bold: style.bold,
          italic: style.italic,
          align: style.align,
        });
      return;
    }
    if (e.kind === "annotation") {
      if (!editValue.trim()) deleteAnnotation(e.id);
      else updateAnnotation(e.id, { text: editValue } as Partial<Annotation>);
      return;
    }
    if (e.kind === "note") {
      if (!editValue.trim()) deleteAnnotation(e.id);
      else updateAnnotation(e.id, { text: editValue } as Partial<Annotation>);
      return;
    }
    if (editValue === e.text) return; // unchanged: leave original untouched
    addAnnotation({
      id: uuid(),
      pageId,
      type: "whiteout",
      color: "#ffffff",
      x: e.x - 1,
      y: e.y - 1,
      w: e.w + 2,
      h: e.h + 2,
    });
    if (editValue.trim())
      addAnnotation({
        id: uuid(),
        pageId,
        type: "text",
        x: e.x,
        y: e.y,
        text: editValue,
        size: e.size,
        color: "#000000",
        fontFamily: e.serif ? "Times" : "Helvetica",
        bold: e.bold,
      });
  };

  const onBackgroundDown = (e: React.PointerEvent) => {
    if (tool === "select") {
      select(null);
      return;
    }
    if (tool === "image") {
      // The toolbar owns the file picker, so ask it to open one.
      emitShortcut("insert-image");
      return;
    }
    if (tool === "signature") {
      setSigning(true);
      return;
    }
    if (tool === "note") {
      const [x, y] = getPt(e);
      const id = uuid();
      const a: NoteAnnotation = { id, pageId, type: "note", x, y, text: "", color: "#facc15" };
      addAnnotation(a);
      setEdit({ kind: "note", id, x, y, size: 11 });
      setEditValue("");
      return;
    }
    // Text add is handled on click (below), not pointerdown: mounting the input
    // on pointerdown lets this gesture's pointerup blur+commit it before you can
    // type. Existing-line edits use each rect's own onClick.
    if (tool === "text") return;
    const [x, y] = getPt(e);
    svgRef.current?.setPointerCapture(e.pointerId);

    if (tool === "draw") {
      drawing.current = true;
      setDraft({
        id: "draft",
        pageId,
        type: "draw",
        points: [[x, y]],
        strokeWidth: style.strokeWidth,
        color: style.color,
        opacity: style.opacity,
      });
      return;
    }
    // box/line tools: start a draft anchored here
    if (tool === "line" || tool === "underline" || tool === "arrow") {
      setDraft({
        id: "draft",
        pageId,
        type: tool,
        x1: x,
        y1: y,
        x2: x,
        y2: y,
        strokeWidth: style.strokeWidth,
        color: style.color,
        opacity: style.opacity,
      });
    } else if (tool === "highlight") {
      setDraft({
        id: "draft",
        pageId,
        type: "highlight",
        x,
        y,
        w: 0,
        h: 0,
        color: style.color,
        opacity: style.opacity,
      });
    } else {
      setDraft({
        id: "draft",
        pageId,
        type: tool as "rect" | "circle" | "redact",
        x,
        y,
        w: 0,
        h: 0,
        strokeWidth: style.strokeWidth,
        color: tool === "redact" ? "#000000" : style.color,
        fill: tool === "redact" ? "#000000" : (style.fill ?? undefined),
        opacity: style.opacity,
      });
    }
  };

  const onMove = (e: React.PointerEvent) => {
    const [x, y] = getPt(e);
    if (resizeDrag.current) {
      const { id, handle, start } = resizeDrag.current;
      const a = annotations.find((n) => n.id === id);
      if (a) updateAnnotation(id, resize(a, handle, x - start[0], y - start[1]));
      return;
    }
    if (drag.current) {
      const { id, last } = drag.current;
      const a = annotations.find((n) => n.id === id);
      if (a) updateAnnotation(id, translate(a, x - last[0], y - last[1]));
      drag.current.last = [x, y];
      return;
    }
    if (!draft) return;
    if (draft.type === "draw" && drawing.current) {
      setDraft({ ...draft, points: [...draft.points, [x, y]] });
    } else if (draft.type === "line" || draft.type === "underline" || draft.type === "arrow") {
      setDraft({ ...draft, x2: x, y2: y });
    } else if (
      draft.type === "rect" ||
      draft.type === "circle" ||
      draft.type === "highlight" ||
      draft.type === "redact"
    ) {
      setDraft({ ...draft, w: x - draft.x, h: y - draft.y });
    }
  };

  const commitDraft = () => {
    drawing.current = false;
    if (!draft) return;
    let a = draft;
    // Normalize negative-drag boxes so w/h are positive.
    if (
      (a.type === "rect" || a.type === "circle" || a.type === "highlight" || a.type === "redact") &&
      (a.w < 0 || a.h < 0)
    ) {
      a = {
        ...a,
        x: Math.min(a.x, a.x + a.w),
        y: Math.min(a.y, a.y + a.h),
        w: Math.abs(a.w),
        h: Math.abs(a.h),
      };
    }
    const box = a as { w?: number; h?: number };
    const tiny =
      a.type === "draw"
        ? a.points.length < 2
        : box.w !== undefined && box.h !== undefined
          ? Math.abs(box.w) < 2 && Math.abs(box.h) < 2
          : false;
    if (!tiny) addAnnotation({ ...a, id: uuid() });
    setDraft(null);
  };

  const startDrag = (e: React.PointerEvent, id: string) => {
    if (tool !== "select") return;
    e.stopPropagation();
    select(id);
    pushHistory("Move annotation");
    drag.current = { id, last: getPt(e) };
    // Capture on the shape group (auto), not the root svg (none in select mode).
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const startResize = (e: React.PointerEvent, id: string, handle: Handle) => {
    e.stopPropagation();
    pushHistory("Resize annotation");
    resizeDrag.current = { id, handle, start: getPt(e) };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const endPointer = () => {
    if (drag.current) drag.current = null;
    else if (resizeDrag.current) resizeDrag.current = null;
    else commitDraft();
  };

  const cursor =
    tool === "select"
      ? "default"
      : tool === "text"
        ? "text"
        : CREATE_TOOLS.includes(tool)
          ? "crosshair"
          : "default";

  const selected = mine.find((a) => a.id === selectedId) ?? null;

  return (
    <>
      <svg
        ref={svgRef}
        data-annotations
        className="absolute inset-0 h-full w-full"
        viewBox={`0 0 ${wPts} ${hPts}`}
        style={{ touchAction: "none", cursor, pointerEvents: tool === "select" ? "none" : "auto" }}
        onPointerDown={onBackgroundDown}
        onPointerMove={onMove}
        onPointerUp={endPointer}
        onClick={(e) => {
          // Empty-space click (target is the svg itself, not a line rect) starts a
          // new in-place text box. Fires after the full down->up gesture so the
          // input mounts and keeps focus.
          if (tool === "text" && !edit && e.target === svgRef.current) {
            const [x, y] = getPt(e);
            beginNew(x, y);
          }
        }}
      >
        {mine.map((a) => {
          if (edit?.kind === "annotation" && edit.id === a.id) return null; // hidden while editing
          // Text tool: our own text is clickable so a click edits it rather than
          // stacking a new box on top.
          const editable = tool === "text" && a.type === "text";
          const noteEditable = tool === "text" && a.type === "note";
          return (
            <g
              key={a.id}
              style={{
                pointerEvents: tool === "select" || editable || noteEditable ? "auto" : "none",
                cursor: tool === "select" ? "move" : editable || noteEditable ? "text" : "inherit",
              }}
              onPointerDown={(e) => startDrag(e, a.id)}
              onClick={(e) => {
                if (editable) {
                  e.stopPropagation();
                  beginEditAnnotation(a as TextAnnotation);
                } else if (noteEditable) {
                  e.stopPropagation();
                  beginEditNote(a as NoteAnnotation);
                }
              }}
            >
              <Shape a={a} />
            {/* Generous hit area: thin glyphs and lines are hard to click. */}
            {a.type === "text" &&
              (() => {
                const [x, y, w, h] = bbox(a);
                return (
                  <rect
                    x={x - 2}
                    y={y - 3}
                    width={Math.max(w, a.size) + 4}
                    height={Math.max(h, a.size) + 6}
                    fill="transparent"
                    pointerEvents="all"
                  />
                );
              })()}
            {(a.type === "line" || a.type === "underline" || a.type === "arrow") && (
              <line
                x1={a.x1}
                y1={a.y1}
                x2={a.x2}
                y2={a.y2}
                stroke="transparent"
                strokeWidth={Math.max(12, a.strokeWidth + 8)}
                pointerEvents="all"
              />
            )}
            </g>
          );
        })}
        {draft && <Shape a={draft} />}

        {/* Search hits, drawn under the selection UI. */}
        {hits.map((h, i) => (
          <rect
            key={`hit-${i}`}
            x={h.x}
            y={h.y}
            width={h.w}
            height={h.h}
            fill="#facc15"
            fillOpacity={0.55}
            stroke="#ca8a04"
            strokeWidth={0.4}
            pointerEvents="none"
          />
        ))}

        {/* Hover outlines over existing lines so it's clear what's clickable to edit. */}
        {tool === "text" &&
          !edit &&
          editTargets.map((t, i) => (
            <rect
              key={i}
              x={t.x}
              y={t.y}
              width={t.w}
              height={t.h}
              fill="#3b82f6"
              fillOpacity={hoverIdx === i ? 0.12 : 0}
              stroke="#3b82f6"
              strokeOpacity={hoverIdx === i ? 0.6 : 0}
              strokeWidth={0.5}
              style={{ cursor: "text" }}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx((h) => (h === i ? null : h))}
              onClick={() => beginEdit(t)}
            />
          ))}

        {selected && tool === "select" && (
          <g pointerEvents="auto">
            {(() => {
              const [x, y, w, h] = bbox(selected);
              const pts = handlePoints([x, y, w, h]);
              return (
                <>
                  <rect
                    x={x - 2}
                    y={y - 2}
                    width={w + 4}
                    height={h + 4}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth={1}
                    strokeDasharray="4 3"
                    pointerEvents="none"
                  />
                  {HANDLES.map((handle) => (
                    <g key={handle}>
                      {/* Invisible, generous grab area around each handle. */}
                      <rect
                        x={pts[handle][0] - 8}
                        y={pts[handle][1] - 8}
                        width={16}
                        height={16}
                        fill="transparent"
                        pointerEvents="all"
                        style={{ cursor: `${handle}-resize` }}
                        onPointerDown={(e) => startResize(e, selected.id, handle)}
                      />
                      <rect
                        x={pts[handle][0] - 3.5}
                        y={pts[handle][1] - 3.5}
                        width={7}
                        height={7}
                        fill="#ffffff"
                        stroke="#3b82f6"
                        strokeWidth={1}
                        pointerEvents="none"
                      />
                    </g>
                  ))}
                </>
              );
            })()}
          </g>
        )}

        {edit && (
          <foreignObject
            x={edit.x}
            y={edit.y - edit.size * 0.2}
            width={("w" in edit ? Math.max(edit.w, 24) : 200) + 8}
            height={edit.kind === "note" ? 90 : edit.size * 1.5}
          >
            {edit.kind === "note" ? (
              <textarea
                autoFocus
                placeholder="Note…"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setEdit(null);
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commitEdit();
                }}
                onBlur={commitEdit}
                style={{
                  width: "100%",
                  height: "100%",
                  margin: 0,
                  padding: 4,
                  border: "1px solid #3b82f6",
                  borderRadius: 4,
                  background: "#fffef5",
                  color: "#111",
                  fontFamily: "Helvetica, Arial, sans-serif",
                  fontSize: 11,
                  outline: "none",
                  resize: "none",
                }}
              />
            ) : (
              <input
                autoFocus
                placeholder={edit.kind === "new" ? "Type text…" : undefined}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitEdit();
                  } else if (e.key === "Escape") {
                    setEdit(null);
                  }
                }}
                onBlur={commitEdit}
                style={{
                  width: "100%",
                  height: "100%",
                  margin: 0,
                  padding: 0,
                  border: "1px solid #3b82f6",
                  background: "#fff",
                  color: "#000",
                  fontFamily:
                    edit.kind === "existing" && edit.serif
                      ? "Georgia, 'Times New Roman', serif"
                      : "Helvetica, Arial, sans-serif",
                  fontSize: edit.size,
                  fontWeight: edit.kind === "existing" && edit.bold ? 700 : 400,
                  lineHeight: 1.1,
                  outline: "none",
                }}
              />
            )}
          </foreignObject>
        )}
      </svg>

      <SignaturePad
        open={signing}
        onClose={() => setSigning(false)}
        onSign={(dataUrl, aspect) => {
          setSigning(false);
          const w = 160;
          addAnnotation({
            id: uuid(),
            pageId,
            type: "image",
            color: "#000000",
            x: 40,
            y: 40,
            w,
            h: w / aspect,
            dataUrl,
            mime: "image/png",
          });
        }}
      />
    </>
  );
}
