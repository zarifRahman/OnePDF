export type Rotation = 0 | 90 | 180 | 270;

export type PageDescriptor = {
  id: string;
  fileId: string; // "" for blank pages
  sourceIndex: number; // -1 for blank pages
  rotation: Rotation;
  isBlank: boolean;
};

export type SourceFile = {
  id: string;
  name: string;
  bytes: Uint8Array;
  pageCount: number;
};

// --- Phase 2: annotations ---------------------------------------------------
// All geometry is in PDF points with a TOP-LEFT origin (SVG space). Export
// flips y to pdf-lib's bottom-left origin. ponytail: annotations assume the
// page is at rotation 0; annotate before rotating.

export type Tool =
  | "select"
  | "text"
  | "draw"
  | "highlight"
  | "underline"
  | "rect"
  | "circle"
  | "line"
  | "image";

type Base = { id: string; pageId: string; color: string };

export type TextAnnotation = Base & { type: "text"; x: number; y: number; text: string; size: number };
export type DrawAnnotation = Base & { type: "draw"; points: [number, number][]; strokeWidth: number };
export type RectAnnotation = Base & { type: "rect"; x: number; y: number; w: number; h: number; strokeWidth: number };
export type CircleAnnotation = Base & { type: "circle"; x: number; y: number; w: number; h: number; strokeWidth: number };
export type LineAnnotation = Base & { type: "line" | "underline"; x1: number; y1: number; x2: number; y2: number; strokeWidth: number };
export type HighlightAnnotation = Base & { type: "highlight"; x: number; y: number; w: number; h: number };
export type ImageAnnotation = Base & { type: "image"; x: number; y: number; w: number; h: number; dataUrl: string; mime: string };

export type Annotation =
  | TextAnnotation
  | DrawAnnotation
  | RectAnnotation
  | CircleAnnotation
  | LineAnnotation
  | HighlightAnnotation
  | ImageAnnotation;

export type Style = { color: string; strokeWidth: number; fontSize: number };
