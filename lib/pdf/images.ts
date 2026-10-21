import {
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFArray,
  PDFDict,
  PDFRef,
  PDFNumber,
  PDFStream,
  decodePDFRawStream,
  type PDFPage,
} from "pdf-lib";
import { walkContent, mul, apply, IDENTITY, type Mat } from "./contentStream";

/**
 * Finding and removing the image objects that a PDF page draws.
 *
 * The page content is scanned for the operators that paint images
 * (`/Name Do` for an image XObject, `BI … ID … EI` for an inline image).
 * Removing an image means deleting the operator *and* dropping the image
 * object itself, so the pixels leave the file instead of being covered up.
 */

/** An image placed on a page, in PDF points with a top-left origin. */
export type ImageRegion = { x: number; y: number; w: number; h: number };

/** The images on a page, and the page they sit on. */
export type PageImages = {
  /** The displayed page size, in points. */
  width: number;
  height: number;
  /** Where each image is drawn, in page space. */
  regions: ImageRegion[];
};

/** How deep to follow form XObjects that wrap an image. */
const MAX_FORM_DEPTH = 4;

type StreamRec = {
  /** Indirect reference, when the stream is an indirect object. */
  ref: PDFRef | null;
  /** Decoded content bytes. */
  bytes: Uint8Array;
  /** The stream object itself, used to build the replacement. */
  stream: PDFStream;
};

type Draw = {
  /** The XObject name, or null for an inline image. */
  name: string | null;
  /** The transform in force when the image was painted. */
  ctm: Mat;
  /** Which content stream the image lives in. */
  streamKey: string;
  /** Byte range to excise from that stream. */
  start: number;
  end: number;
  /** The resources dict the XObject name is looked up in. */
  resources: PDFDict | undefined;
  /** The indirect reference of the image object, when it has one. */
  imageRef: PDFRef | null;
};

function decodeStreamBytes(stream: PDFStream): Uint8Array {
  try {
    // The public helper takes the raw stream and returns it inflated.
    return decodePDFRawStream(stream as PDFRawStream).decode();
  } catch {
    // An unsupported filter means we cannot read this stream; treat it as
    // empty rather than failing the whole operation.
    return new Uint8Array(0);
  }
}

function subtypeOf(stream: PDFStream): string | null {
  const subtype = stream.dict.lookupMaybe(PDFName.of("Subtype"), PDFName);
  return subtype ? subtype.toString() : null;
}

function xObjectDict(resources: PDFDict | undefined): PDFDict | undefined {
  return resources?.lookupMaybe(PDFName.of("XObject"), PDFDict);
}

function readMatrix(stream: PDFStream): Mat {
  const array = stream.dict.lookupMaybe(PDFName.of("Matrix"), PDFArray);
  if (!array) return IDENTITY;
  const nums = array.asArray().map((n) => (n instanceof PDFNumber ? n.asNumber() : 0));
  if (nums.length !== 6) return IDENTITY;
  return nums as Mat;
}

/** The content streams of a page, in order. */
function collectPageStreams(page: PDFPage): StreamRec[] {
  const context = page.doc.context;
  const contents = page.node.Contents();
  const out: StreamRec[] = [];
  const push = (obj: unknown, ref: PDFRef | null, index: number) => {
    const stream =
      obj instanceof PDFStream ? obj : ref ? context.lookup(ref) : undefined;
    if (!(stream instanceof PDFStream)) return;
    out.push({
      ref,
      bytes: decodeStreamBytes(stream),
      stream,
    });
    void index;
  };
  if (contents instanceof PDFArray) {
    contents.asArray().forEach((entry, i) => {
      const ref = entry instanceof PDFRef ? entry : null;
      push(ref ? context.lookup(ref) : entry, ref, i);
    });
  } else if (contents instanceof PDFStream) {
    push(contents, null, 0);
  }
  return out;
}

/**
 * Scan a page for the images it draws.
 *
 * `streams` collects every content stream that was read, keyed by the
 * indirect reference, so a removal knows which bytes to rewrite.
 */
function scanPage(
  doc: PDFDocument,
  page: PDFPage,
): { draws: Draw[]; streams: Map<string, StreamRec> } {
  const context = doc.context;
  const streams = new Map<string, StreamRec>();
  const draws: Draw[] = [];

  const pageStreams = collectPageStreams(page);
  pageStreams.forEach((s, i) => {
    streams.set(s.ref ? s.ref.toString() : `page-${i}`, s);
  });

  const pageResources = page.node.Resources();

  const visit = (
    content: Uint8Array,
    streamKey: string,
    resources: PDFDict | undefined,
    ctm: Mat,
    depth: number,
    visitedForms: Set<string>,
  ) => {
    const stack: Mat[] = [];
    let current = ctm;

    const handleXObject = (
      name: string,
      nameStart: number,
      opEnd: number,
    ) => {
      const xobjects = xObjectDict(resources);
      if (!xobjects) return;
      const entry = xobjects.get(PDFName.of(name));
      if (!entry) return;
      const ref = entry instanceof PDFRef ? entry : null;
      const obj = ref ? context.lookup(ref) : entry;
      if (!(obj instanceof PDFStream)) return;

      const subtype = subtypeOf(obj);
      if (subtype === "/Image") {
        draws.push({
          name,
          ctm: current,
          streamKey,
          start: nameStart,
          end: opEnd,
          resources,
          imageRef: ref,
        });
        return;
      }
      if (subtype !== "/Form") return;
      if (depth >= MAX_FORM_DEPTH) return;

      const key = ref ? ref.toString() : null;
      if (key) {
        if (visitedForms.has(key)) return;
        visitedForms.add(key);
      }

      const formBytes = decodeStreamBytes(obj);
      const formKey = key ?? `form-${streams.size}`;
      streams.set(formKey, { ref, bytes: formBytes, stream: obj });

      const formResources =
        obj.dict.lookupMaybe(PDFName.of("Resources"), PDFDict) ?? resources;
      visit(
        formBytes,
        formKey,
        formResources,
        mul(current, readMatrix(obj)),
        depth + 1,
        visitedForms,
      );
    };

    walkContent(content, (hit) => {
      switch (hit.op) {
        case "q":
          stack.push(current);
          break;
        case "Q": {
          const prev = stack.pop();
          if (prev) current = prev;
          break;
        }
        case "cm": {
          const nums = hit.operands
            .filter((o) => o.kind === "num")
            .map((o) => (o as { value: number }).value);
          if (nums.length === 6) current = mul(current, nums as Mat);
          break;
        }
        case "Do": {
          const nameOp = hit.operands.find((o) => o.kind === "name");
          if (!nameOp || nameOp.kind !== "name") break;
          handleXObject(nameOp.value, nameOp.start, hit.end);
          break;
        }
        case "BI":
          // An inline image lives entirely inside the content stream, so
          // removing the block removes the pixels with it.
          draws.push({
            name: null,
            ctm: current,
            streamKey,
            start: hit.blockStart,
            end: hit.blockEnd,
            resources,
            imageRef: null,
          });
          break;
      }
    });
  };

  pageStreams.forEach((s, i) => {
    visit(
      s.bytes,
      s.ref ? s.ref.toString() : `page-${i}`,
      pageResources,
      IDENTITY,
      0,
      new Set(),
    );
  });

  return { draws, streams };
}

/**
 * The transform from PDF user space to the app's page space: points with a
 * top-left origin, matching how pdf.js renders the page.
 */
export function viewportTransform(
  view: [number, number, number, number],
  rotation: number,
): Mat {
  const [x0, y0, x1, y1] = view;
  const centerX = (x1 + x0) / 2;
  const centerY = (y1 + y0) / 2;
  let a: number, b: number, c: number, d: number;
  switch (((rotation % 360) + 360) % 360) {
    case 180:
      a = -1;
      b = 0;
      c = 0;
      d = 1;
      break;
    case 90:
      a = 0;
      b = 1;
      c = 1;
      d = 0;
      break;
    case 270:
      a = 0;
      b = -1;
      c = -1;
      d = 0;
      break;
    default:
      a = 1;
      b = 0;
      c = 0;
      d = -1;
  }
  let offsetX: number;
  let offsetY: number;
  if (a === 0) {
    offsetX = Math.abs(centerY - y0);
    offsetY = Math.abs(centerX - x0);
  } else {
    offsetX = Math.abs(centerX - x0);
    offsetY = Math.abs(centerY - y0);
  }
  return [
    a,
    b,
    c,
    d,
    offsetX - a * centerX - c * centerY,
    offsetY - b * centerX - d * centerY,
  ];
}

function pageView(page: PDFPage): [number, number, number, number] {
  const crop = page.node.CropBox();
  const media = page.node.MediaBox();
  const pick = (arr: PDFArray | undefined) => {
    if (!arr) return null;
    const nums = arr
      .asArray()
      .map((n) => (n instanceof PDFNumber ? n.asNumber() : 0));
    if (nums.length !== 4) return null;
    return nums as [number, number, number, number];
  };
  return pick(crop) ?? pick(media) ?? [0, 0, 612, 792];
}

function pageRotation(page: PDFPage): number {
  const rotate = page.node.Rotate();
  return rotate ? rotate.asNumber() : 0;
}

/** The bounding box of a painted image, in page space. */
function regionOf(draw: Draw, viewport: Mat): ImageRegion {
  const corners = [
    apply(draw.ctm, 0, 0),
    apply(draw.ctm, 1, 0),
    apply(draw.ctm, 1, 1),
    apply(draw.ctm, 0, 1),
  ].map(([u, v]) => apply(viewport, u, v));
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    w: Math.max(...xs) - x,
    h: Math.max(...ys) - y,
  };
}

/**
 * Find the images drawn on a page, in page space (points, top-left origin).
 */
export async function findPageImages(
  bytes: Uint8Array,
  pageIndex: number,
): Promise<PageImages> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const page = doc.getPage(pageIndex);
  const { draws } = scanPage(doc, page);
  const view = pageView(page);
  const viewport = viewportTransform(view, pageRotation(page));
  const rotated = Math.abs(pageRotation(page)) % 180 === 90;
  return {
    width: rotated ? view[3] - view[1] : view[2] - view[0],
    height: rotated ? view[2] - view[0] : view[3] - view[1],
    regions: draws.map((d) => regionOf(d, viewport)),
  };
}

/** Remove the given byte ranges from a buffer. */
function excise(
  bytes: Uint8Array,
  ranges: { start: number; end: number }[],
): Uint8Array {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  let removed = 0;
  for (const r of sorted) removed += r.end - r.start;
  const out = new Uint8Array(Math.max(0, bytes.length - removed));
  let pos = 0;
  let o = 0;
  for (const r of sorted) {
    if (r.start > pos) {
      out.set(bytes.subarray(pos, r.start), o);
      o += r.start - pos;
    }
    pos = Math.max(pos, r.end);
  }
  if (pos < bytes.length) out.set(bytes.subarray(pos), o);
  return out;
}

/** True when any other page still points at the same image object. */
function referencedElsewhere(
  doc: PDFDocument,
  skipPageIndex: number,
  imageRef: PDFRef,
): boolean {
  for (let i = 0; i < doc.getPageCount(); i++) {
    if (i === skipPageIndex) continue;
    const page = doc.getPage(i);
    const xobjects = xObjectDict(page.node.Resources());
    if (!xobjects) continue;
    for (const entry of xobjects.asMap().values()) {
      if (entry instanceof PDFRef && entry.toString() === imageRef.toString()) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Remove every image drawn on a page.
 *
 * The image operators are cut out of the content stream, the image objects
 * are dropped from the page's resources, and objects nothing else points at
 * are deleted from the file — so the pixels are gone, not covered up. The
 * text layer, vectors and the rest of the page are left untouched.
 */
export async function removePageImages(
  bytes: Uint8Array,
  pageIndex: number,
): Promise<{ bytes: Uint8Array; removed: number }> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const page = doc.getPage(pageIndex);
  const { draws, streams } = scanPage(doc, page);
  if (!draws.length) return { bytes, removed: 0 };

  // Group the byte ranges to cut by the stream they live in.
  const byStream = new Map<string, { start: number; end: number }[]>();
  for (const d of draws) {
    const list = byStream.get(d.streamKey) ?? [];
    list.push({ start: d.start, end: d.end });
    byStream.set(d.streamKey, list);
  }

  // Rewrite each affected content stream without the image operators.
  for (const [key, ranges] of byStream) {
    const rec = streams.get(key);
    if (!rec) continue;
    const patched = excise(rec.bytes, ranges);
    const dict = rec.stream.dict.clone(doc.context);
    dict.delete(PDFName.of("Filter"));
    dict.delete(PDFName.of("DecodeParms"));
    dict.delete(PDFName.of("Length"));
    const replacement = PDFRawStream.of(dict, patched);
    if (rec.ref) {
      doc.context.assign(rec.ref, replacement);
    } else {
      // A direct (non-indirect) stream can only be replaced by rewriting
      // the owner's /Contents entry.
      const contents = page.node.Contents();
      if (contents instanceof PDFStream) {
        page.node.set(PDFName.of("Contents"), replacement);
      }
    }
  }

  // Drop the image entries from the resources that referenced them, and
  // delete the image objects when nothing else in the file uses them.
  const touched = new Map<PDFDict, Set<string>>();
  const imageRefs = new Set<PDFRef>();
  for (const d of draws) {
    if (!d.name || !d.resources) continue;
    const names = touched.get(d.resources) ?? new Set<string>();
    names.add(d.name);
    touched.set(d.resources, names);
    if (d.imageRef) imageRefs.add(d.imageRef);
  }

  for (const [resources, names] of touched) {
    const xobjects = xObjectDict(resources);
    if (!xobjects) continue;
    // Clone so a resources dict shared with other pages is left alone.
    const newXObjects = xobjects.clone(doc.context);
    for (const name of names) newXObjects.delete(PDFName.of(name));
    const newResources = resources.clone(doc.context);
    newResources.set(PDFName.of("XObject"), newXObjects);
    // Write the clone back to whoever owns these resources.
    if (resources === page.node.Resources()) {
      page.node.set(PDFName.of("Resources"), newResources);
    } else {
      for (const rec of streams.values()) {
        const owned = rec.stream.dict.lookupMaybe(PDFName.of("Resources"), PDFDict);
        if (owned === resources) {
          rec.stream.dict.set(PDFName.of("Resources"), newResources);
          break;
        }
      }
    }
  }

  for (const ref of imageRefs) {
    if (!referencedElsewhere(doc, pageIndex, ref)) doc.context.delete(ref);
  }

  return { bytes: await doc.save(), removed: draws.length };
}
