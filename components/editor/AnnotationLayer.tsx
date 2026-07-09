"use client";
import { useRef, useState } from "react";
import { useDocStore } from "@/store/document";
import { uuid } from "@/lib/utils";
import type { Annotation, Tool, EditTarget } from "@/types";

type Pt = [number, number];
const CREATE_TOOLS: Tool[] = ["draw", "highlight", "underline", "rect", "circle", "line"];

// Shift every coordinate of an annotation by (dx, dy) for drag-move.
function translate(a: Annotation, dx: number, dy: number): Annotation {
  switch (a.type) {
    case "text":
    case "rect":
    case "circle":
    case "highlight":
    case "whiteout":
    case "image":
      return { ...a, x: a.x + dx, y: a.y + dy };
    case "line":
    case "underline":
      return { ...a, x1: a.x1 + dx, y1: a.y1 + dy, x2: a.x2 + dx, y2: a.y2 + dy };
    case "draw":
      return { ...a, points: a.points.map(([x, y]) => [x + dx, y + dy]) };
  }
}

// Axis-aligned bounding box (for the selection outline).
function bbox(a: Annotation): [number, number, number, number] {
  switch (a.type) {
    case "text":
      return [a.x, a.y, a.text.length * a.size * 0.5 || a.size, a.size];
    case "rect":
    case "circle":
    case "highlight":
    case "whiteout":
    case "image":
      return [a.x, a.y, a.w, a.h];
    case "line":
    case "underline":
      return [Math.min(a.x1, a.x2), Math.min(a.y1, a.y2), Math.abs(a.x2 - a.x1) || 1, Math.abs(a.y2 - a.y1) || 1];
    case "draw": {
      const xs = a.points.map((p) => p[0]);
      const ys = a.points.map((p) => p[1]);
      const x = Math.min(...xs), y = Math.min(...ys);
      return [x, y, Math.max(...xs) - x || 1, Math.max(...ys) - y || 1];
    }
  }
}

function Shape({ a }: { a: Annotation }) {
  switch (a.type) {
    case "text":
      return (
        <text x={a.x} y={a.y + a.size} fontSize={a.size} fill={a.color} style={{ fontFamily: "Helvetica, Arial, sans-serif" }}>
          {a.text}
        </text>
      );
    case "draw":
      return <polyline points={a.points.map((p) => p.join(",")).join(" ")} fill="none" stroke={a.color} strokeWidth={a.strokeWidth} strokeLinejoin="round" strokeLinecap="round" />;
    case "rect":
      return <rect x={a.x} y={a.y} width={a.w} height={a.h} fill="none" stroke={a.color} strokeWidth={a.strokeWidth} />;
    case "circle":
      return <ellipse cx={a.x + a.w / 2} cy={a.y + a.h / 2} rx={a.w / 2} ry={a.h / 2} fill="none" stroke={a.color} strokeWidth={a.strokeWidth} />;
    case "line":
    case "underline":
      return <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke={a.color} strokeWidth={a.strokeWidth} />;
    case "highlight":
      return <rect x={a.x} y={a.y} width={a.w} height={a.h} fill={a.color} opacity={0.35} />;
    case "whiteout":
      return <rect x={a.x} y={a.y} width={a.w} height={a.h} fill={a.color} />;
    case "image":
      return <image href={a.dataUrl} x={a.x} y={a.y} width={a.w} height={a.h} preserveAspectRatio="none" />;
  }
}

export function AnnotationLayer({
  pageId,
  wPts,
  hPts,
  editTargets = [],
}: {
  pageId: string;
  wPts: number;
  hPts: number;
  editTargets?: EditTarget[];
}) {
  const { annotations, tool, style, selectedId, select, addAnnotation, updateAnnotation } = useDocStore();
  const svgRef = useRef<SVGSVGElement>(null);
  const [draft, setDraft] = useState<Annotation | null>(null);
  const drag = useRef<{ id: string; last: Pt } | null>(null);
  const drawing = useRef(false);

  const mine = annotations.filter((a) => a.pageId === pageId);

  const getPt = (e: React.PointerEvent): Pt => {
    const svg = svgRef.current!;
    const p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const t = p.matrixTransform(svg.getScreenCTM()!.inverse());
    return [t.x, t.y];
  };

  // Whiteout + retype an existing text span: cover it with white, redraw text.
  // ponytail: background assumed white, font -> Helvetica, new text black.
  const editText = (t: EditTarget) => {
    const next = window.prompt("Edit text:", t.text);
    if (next === null) return;
    addAnnotation({ id: uuid(), pageId, type: "whiteout", color: "#ffffff", x: t.x, y: t.y, w: t.w, h: t.h });
    if (next.trim())
      addAnnotation({ id: uuid(), pageId, type: "text", x: t.x, y: t.y, text: next, size: t.size, color: "#000000" });
  };

  const onBackgroundDown = (e: React.PointerEvent) => {
    if (tool === "select") {
      select(null);
      return;
    }
    if (tool === "edittext" || tool === "image") return; // clicks handled elsewhere
    const [x, y] = getPt(e);
    svgRef.current?.setPointerCapture(e.pointerId);

    if (tool === "text") {
      const text = window.prompt("Text:"); // ponytail: prompt instead of an inline editor
      if (text) addAnnotation({ id: uuid(), pageId, type: "text", x, y, text, size: style.fontSize, color: style.color });
      return;
    }
    if (tool === "draw") {
      drawing.current = true;
      setDraft({ id: "draft", pageId, type: "draw", points: [[x, y]], strokeWidth: style.strokeWidth, color: style.color });
      return;
    }
    // box/line tools: start a draft anchored here
    if (tool === "line" || tool === "underline") {
      setDraft({ id: "draft", pageId, type: tool, x1: x, y1: y, x2: x, y2: y, strokeWidth: style.strokeWidth, color: style.color });
    } else if (tool === "highlight") {
      setDraft({ id: "draft", pageId, type: "highlight", x, y, w: 0, h: 0, color: style.color });
    } else {
      setDraft({ id: "draft", pageId, type: tool as "rect" | "circle", x, y, w: 0, h: 0, strokeWidth: style.strokeWidth, color: style.color });
    }
  };

  const onMove = (e: React.PointerEvent) => {
    const [x, y] = getPt(e);
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
    } else if (draft.type === "line" || draft.type === "underline") {
      setDraft({ ...draft, x2: x, y2: y });
    } else if (draft.type === "rect" || draft.type === "circle" || draft.type === "highlight") {
      setDraft({ ...draft, w: x - draft.x, h: y - draft.y });
    }
  };

  const commitDraft = () => {
    drawing.current = false;
    if (!draft) return;
    let a = draft;
    // Normalize negative-drag boxes so w/h are positive.
    if ((a.type === "rect" || a.type === "circle" || a.type === "highlight") && (a.w < 0 || a.h < 0)) {
      a = { ...a, x: Math.min(a.x, a.x + a.w), y: Math.min(a.y, a.y + a.h), w: Math.abs(a.w), h: Math.abs(a.h) };
    }
    const tiny =
      a.type === "draw" ? a.points.length < 2 : "w" in a ? Math.abs(a.w) < 2 && Math.abs(a.h) < 2 : false;
    if (!tiny) addAnnotation({ ...a, id: uuid() });
    setDraft(null);
  };

  const startDrag = (e: React.PointerEvent, id: string) => {
    if (tool !== "select") return;
    e.stopPropagation();
    select(id);
    drag.current = { id, last: getPt(e) };
    // Capture on the shape group (auto), not the root svg (none in select mode).
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const endPointer = () => {
    if (drag.current) drag.current = null;
    else commitDraft();
  };

  const cursor =
    tool === "select"
      ? "default"
      : tool === "edittext"
        ? "text"
        : CREATE_TOOLS.includes(tool) || tool === "text"
          ? "crosshair"
          : "default";

  return (
    <svg
      ref={svgRef}
      data-annotations
      className="absolute inset-0 h-full w-full"
      viewBox={`0 0 ${wPts} ${hPts}`}
      style={{ touchAction: "none", cursor, pointerEvents: tool === "select" ? "none" : "auto" }}
      onPointerDown={onBackgroundDown}
      onPointerMove={onMove}
      onPointerUp={endPointer}
    >
      {mine.map((a) => (
        <g
          key={a.id}
          style={{ pointerEvents: tool === "select" ? "auto" : "none", cursor: tool === "select" ? "move" : "inherit" }}
          onPointerDown={(e) => startDrag(e, a.id)}
        >
          <Shape a={a} />
          {selectedId === a.id &&
            (() => {
              const [x, y, w, h] = bbox(a);
              return <rect x={x - 2} y={y - 2} width={w + 4} height={h + 4} fill="none" stroke="#3b82f6" strokeWidth={1} strokeDasharray="4 3" />;
            })()}
        </g>
      ))}
      {draft && <Shape a={draft} />}

      {tool === "edittext" &&
        editTargets.map((t, i) => (
          <rect
            key={i}
            x={t.x}
            y={t.y}
            width={t.w}
            height={t.h}
            fill="#3b82f6"
            fillOpacity={0.08}
            stroke="#3b82f6"
            strokeOpacity={0.5}
            strokeWidth={0.5}
            style={{ cursor: "text" }}
            onClick={() => editText(t)}
          />
        ))}
    </svg>
  );
}
