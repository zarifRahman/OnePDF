export type Rotation = 0 | 90 | 180 | 270;

export type PageDescriptor = {
  id: string;
  fileId: string; // "" for blank pages
  sourceIndex: number; // -1 for blank pages
  rotation: Rotation;
  isBlank: boolean;
  /** Per-page margins trimmed away, in PDF points. Empty = no trim. */
  crop?: Margins;
};

export type Margins = { top: number; right: number; bottom: number; left: number };

export type SourceFile = {
  id: string;
  name: string;
  bytes: Uint8Array;
  pageCount: number;
};

// --- Annotations ------------------------------------------------------------
// All geometry is in PDF points with a TOP-LEFT origin (SVG space). Export
// flips y to pdf-lib's bottom-left origin.

export type Tool =
  | "select"
  | "text"
  | "draw"
  | "highlight"
  | "underline"
  | "rect"
  | "circle"
  | "line"
  | "arrow"
  | "image"
  | "note"
  | "signature"
  | "whiteout"
  | "redact";

export type FontFamily = "Helvetica" | "Times" | "Courier";
export type TextAlign = "left" | "center" | "right";

type Base = {
  id: string;
  pageId: string;
  color: string;
  /** 0..1; undefined = fully opaque. */
  opacity?: number;
};

export type TextAnnotation = Base & {
  type: "text";
  x: number;
  y: number;
  text: string;
  size: number;
  fontFamily?: FontFamily;
  bold?: boolean;
  italic?: boolean;
  align?: TextAlign;
  /** Width of the text box, used for alignment and resize. */
  w?: number;
};

export type DrawAnnotation = Base & {
  type: "draw";
  points: [number, number][];
  strokeWidth: number;
};

export type RectAnnotation = Base & {
  type: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
  strokeWidth: number;
  /** Fill colour; undefined = transparent. */
  fill?: string;
};

export type CircleAnnotation = Base & {
  type: "circle";
  x: number;
  y: number;
  w: number;
  h: number;
  strokeWidth: number;
  fill?: string;
};

export type LineAnnotation = Base & {
  type: "line" | "underline" | "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  strokeWidth: number;
};

export type HighlightAnnotation = Base & {
  type: "highlight";
  x: number;
  y: number;
  w: number;
  h: number;
};

export type WhiteoutAnnotation = Base & {
  type: "whiteout";
  x: number;
  y: number;
  w: number;
  h: number;
};

/** Burn-in redaction: the page is rasterised, so the covered text is gone. */
export type RedactAnnotation = Base & {
  type: "redact";
  x: number;
  y: number;
  w: number;
  h: number;
};

export type ImageAnnotation = Base & {
  type: "image";
  x: number;
  y: number;
  w: number;
  h: number;
  dataUrl: string;
  mime: string;
};

export type NoteAnnotation = Base & {
  type: "note";
  x: number;
  y: number;
  text: string;
};

export type Annotation =
  | TextAnnotation
  | DrawAnnotation
  | RectAnnotation
  | CircleAnnotation
  | LineAnnotation
  | HighlightAnnotation
  | WhiteoutAnnotation
  | RedactAnnotation
  | ImageAnnotation
  | NoteAnnotation;

/** A clickable existing-text line discovered via pdf.js, in PDF points (top-left). */
export type EditTarget = {
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  size: number;
  serif?: boolean;
  bold?: boolean;
};

/** One occurrence of a search term, in PDF points (top-left origin). */
export type SearchHit = {
  /** Index of the page inside the document (0-based). */
  pageIndex: number;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
};

export type Style = {
  color: string;
  strokeWidth: number;
  fontSize: number;
  fontFamily: FontFamily;
  bold: boolean;
  italic: boolean;
  align: TextAlign;
  opacity: number;
  fill: string | null;
};

// --- Document-level settings ------------------------------------------------

export type Watermark = {
  text: string;
  size: number;
  color: string;
  opacity: number;
  /** Degrees, counter-clockwise. */
  rotation: number;
};

export type PageNumberPosition = "bottom-center" | "bottom-right" | "top-center" | "top-right";

export type PageNumberOptions = {
  enabled: boolean;
  position: PageNumberPosition;
  /** "1" · "1 / 10" · "Page 1 of 10" */
  format: "n" | "n-of-m" | "page-n-of-m";
  startAt: number;
};

export type ViewMode = "single" | "continuous" | "facing";
export type FitMode = "none" | "width" | "page";
