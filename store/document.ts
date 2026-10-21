import { create } from "zustand";
import { uuid } from "@/lib/utils";
import type {
  PageDescriptor,
  SourceFile,
  Rotation,
  Annotation,
  Tool,
  Style,
  PageNumberOptions,
  Watermark,
  ViewMode,
  FitMode,
  Margins,
} from "@/types";

// A history snapshot captures everything an edit can change. The source files
// are part of it: operations that rewrite a file (compress, remove images)
// change the bytes behind a page, so undo has to restore them too. The
// revision counter rides along so the viewer knows to re-serialise.
type Snap = {
  files: Record<string, SourceFile>;
  filesRev: number;
  pages: PageDescriptor[];
  annotations: Annotation[];
  pageNumbers: PageNumberOptions;
  watermark: Watermark | null;
};

/** A history entry keeps the name of the action so the UI can say what it undoes. */
export type HistoryEntry = { label: string; snap: Snap };

type State = {
  files: Record<string, SourceFile>;
  /** Bumped whenever the source files change, so the viewer re-serialises. */
  filesRev: number;
  pages: PageDescriptor[];
  annotations: Annotation[];
  pageNumbers: PageNumberOptions;
  watermark: Watermark | null;
  docTitle: string;
  currentPageId: string | null;
  zoom: number;
  fit: FitMode;
  viewMode: ViewMode;
  // editor
  tool: Tool;
  style: Style;
  selectedId: string | null;
  // page selection
  selectedPageIds: string[];
  selectionAnchor: string | null;
  // history
  past: HistoryEntry[];
  future: HistoryEntry[];
};

type Actions = {
  addFile: (f: SourceFile) => void;
  insertFileAt: (f: SourceFile, index: number) => void;
  replaceSourceBytes: (fileId: string, bytes: Uint8Array) => void;
  replaceDocument: (f: SourceFile) => void;
  loadWorkspace: (w: {
    files: Record<string, SourceFile>;
    pages: PageDescriptor[];
    annotations: Annotation[];
    pageNumbers: PageNumberOptions;
    watermark: Watermark | null;
    docTitle: string;
  }) => void;
  reorder: (pages: PageDescriptor[]) => void;
  deletePages: (ids: string[]) => void;
  deletePage: (id: string) => void;
  rotatePages: (ids: string[], delta: number) => void;
  rotatePage: (id: string, delta: number) => void;
  setPageCrop: (ids: string[], crop: Margins | undefined) => void;
  duplicatePages: (ids: string[]) => void;
  insertBlankAfter: (id: string | null) => void;
  setCurrent: (id: string) => void;
  setZoom: (z: number) => void;
  setFit: (f: FitMode) => void;
  setViewMode: (m: ViewMode) => void;
  // editor
  setTool: (t: Tool) => void;
  setStyle: (p: Partial<Style>) => void;
  select: (id: string | null) => void;
  setSelectedPages: (ids: string[]) => void;
  togglePageSelection: (id: string, mode: "single" | "toggle" | "range") => void;
  selectAllPages: () => void;
  clearPageSelection: () => void;
  addAnnotation: (a: Annotation) => void;
  updateAnnotation: (id: string, patch: Partial<Annotation>) => void;
  deleteAnnotation: (id: string) => void;
  duplicateAnnotation: (id: string) => void;
  // document settings
  setPageNumbers: (patch: Partial<PageNumberOptions>) => void;
  togglePageNumbers: () => void;
  setWatermark: (w: Watermark | null) => void;
  setDocTitle: (t: string) => void;
  // history
  pushHistory: (label: string) => void;
  undo: () => void;
  redo: () => void;
  /** Clear the workspace and go back to the home screen. */
  goHome: () => void;
};

const defaultPageNumbers: PageNumberOptions = {
  enabled: false,
  position: "bottom-center",
  format: "n",
  startAt: 1,
};

const init: State = {
  files: {},
  filesRev: 0,
  pages: [],
  annotations: [],
  pageNumbers: defaultPageNumbers,
  watermark: null,
  docTitle: "Untitled document",
  currentPageId: null,
  zoom: 1,
  fit: "none",
  viewMode: "single",
  tool: "select",
  style: {
    color: "#e11d48",
    strokeWidth: 2,
    fontSize: 16,
    fontFamily: "Helvetica",
    bold: false,
    italic: false,
    align: "left",
    opacity: 1,
    fill: null,
  },
  selectedId: null,
  selectedPageIds: [],
  selectionAnchor: null,
  past: [],
  future: [],
};

export const useDocStore = create<State & Actions>((set, get) => {
  const snap = (): Snap => {
    const s = get();
    return {
      files: s.files,
      filesRev: s.filesRev,
      pages: s.pages,
      annotations: s.annotations,
      pageNumbers: s.pageNumbers,
      watermark: s.watermark,
    };
  };
  // Push current snapshot onto `past`, apply changes, clear `future`.
  const commit = (label: string, changes: Partial<State>) =>
    set((s) => ({ ...changes, past: [...s.past, { label, snap: snap() }], future: [] }));

  const rotate = (r: number, delta: number) =>
    ((((r + delta) % 360) + 360) % 360) as Rotation;

  return {
    ...init,

    addFile: (f) => {
      const descriptors: PageDescriptor[] = Array.from({ length: f.pageCount }, (_, i) => ({
        id: uuid(),
        fileId: f.id,
        sourceIndex: i,
        rotation: 0,
        isBlank: false,
      }));
      set((s) => ({
        files: { ...s.files, [f.id]: f },
        filesRev: s.filesRev + 1,
        pages: [...s.pages, ...descriptors],
        past: [...s.past, { label: `Add ${f.name}`, snap: snap() }],
        future: [],
        currentPageId: s.currentPageId ?? descriptors[0]?.id ?? null,
        docTitle: s.docTitle === "Untitled document" ? f.name.replace(/\.pdf$/i, "") : s.docTitle,
        selectedPageIds: [],
      }));
    },

    insertFileAt: (f, index) => {
      // Slot a whole source file into the page list at `index`. Used by
      // merge and by inserting an image as a new page.
      const descriptors: PageDescriptor[] = Array.from({ length: f.pageCount }, (_, i) => ({
        id: uuid(),
        fileId: f.id,
        sourceIndex: i,
        rotation: 0,
        isBlank: false,
      }));
      const pages = [...get().pages];
      const at = Math.max(0, Math.min(index, pages.length));
      pages.splice(at, 0, ...descriptors);
      commit(`Add ${f.name}`, {
        files: { ...get().files, [f.id]: f },
        filesRev: get().filesRev + 1,
        pages,
        currentPageId: descriptors[0]?.id ?? get().currentPageId,
        selectedPageIds: [],
      });
    },

    replaceSourceBytes: (fileId, bytes) => {
      // Swap the bytes of a source file in place. Page descriptors keep
      // pointing at the same file and page index, so the page order and
      // every annotation stay valid.
      const file = get().files[fileId];
      if (!file) return;
      commit("Edit source file", {
        files: { ...get().files, [fileId]: { ...file, bytes } },
        filesRev: get().filesRev + 1,
      });
    },

    replaceDocument: (f) => {
      // Swap the whole workspace for a single new source file (used after a
      // rasterising pass such as compress or secure redaction).
      const descriptors: PageDescriptor[] = Array.from({ length: f.pageCount }, (_, i) => ({
        id: uuid(),
        fileId: f.id,
        sourceIndex: i,
        rotation: 0,
        isBlank: false,
      }));
      commit("Replace document", {
        files: { [f.id]: f },
        filesRev: get().filesRev + 1,
        pages: descriptors,
        annotations: [],
        currentPageId: descriptors[0]?.id ?? null,
        selectedPageIds: [],
        selectedId: null,
      });
    },

    loadWorkspace: (w) =>
      set((s) => ({
        ...w,
        filesRev: s.filesRev + 1,
        currentPageId: w.pages[0]?.id ?? null,
        selectedId: null,
        selectedPageIds: [],
        past: [...s.past, { label: "Open document", snap: snap() }],
        future: [],
      })),

    reorder: (pages) => commit("Reorder pages", { pages }),
    deletePages: (ids) => {
      if (!ids.length) return;
      const set0 = new Set(ids);
      const next = get().pages.filter((p) => !set0.has(p.id));
      const current = get().currentPageId;
      const stillThere = current && next.some((p) => p.id === current);
      commit(ids.length > 1 ? `Delete ${ids.length} pages` : "Delete page", {
        pages: next,
        annotations: get().annotations.filter((a) => !set0.has(a.pageId)),
        selectedPageIds: [],
        currentPageId: stillThere ? current : (next[0]?.id ?? null),
      });
    },

    deletePage: (id) => get().deletePages([id]),

    rotatePage: (id, delta) => get().rotatePages([id], delta),

    togglePageNumbers: () =>
      get().setPageNumbers({ enabled: !get().pageNumbers.enabled }),

    rotatePages: (ids, delta) => {
      if (!ids.length) return;
      const set0 = new Set(ids);
      commit(ids.length > 1 ? `Rotate ${ids.length} pages` : "Rotate page", {
        pages: get().pages.map((p) => (set0.has(p.id) ? { ...p, rotation: rotate(p.rotation, delta) } : p)),
      });
    },

    setPageCrop: (ids, crop) => {
      if (!ids.length) return;
      const set0 = new Set(ids);
      commit(crop ? "Crop pages" : "Reset crop", {
        pages: get().pages.map((p) => (set0.has(p.id) ? { ...p, crop } : p)),
      });
    },

    duplicatePages: (ids) => {
      if (!ids.length) return;
      const pages = get().pages;
      const set0 = new Set(ids);
      const copyOf = new Map<string, PageDescriptor>();
      const pagesOut: PageDescriptor[] = [];
      for (const p of pages) {
        pagesOut.push(p);
        if (set0.has(p.id)) {
          const copy: PageDescriptor = { ...p, id: uuid(), crop: p.crop ? { ...p.crop } : undefined };
          copyOf.set(p.id, copy);
          pagesOut.push(copy);
        }
      }
      // Copies keep their annotations, re-pointed at the new page id.
      const annotations = [...get().annotations];
      for (const [origId, copy] of copyOf) {
        for (const a of get().annotations.filter((a) => a.pageId === origId)) {
          annotations.push({ ...a, id: uuid(), pageId: copy.id } as Annotation);
        }
      }
      commit(ids.length > 1 ? `Duplicate ${ids.length} pages` : "Duplicate page", {
        pages: pagesOut,
        annotations,
        selectedPageIds: [...copyOf.values()].map((c) => c.id),
      });
    },

    insertBlankAfter: (id) => {
      const pages = [...get().pages];
      const blank: PageDescriptor = {
        id: uuid(),
        fileId: "",
        sourceIndex: -1,
        rotation: 0,
        isBlank: true,
      };
      const idx = id ? pages.findIndex((p) => p.id === id) : pages.length - 1;
      pages.splice(idx + 1, 0, blank);
      commit("Insert blank page", { pages, selectedPageIds: [blank.id] });
    },

    setCurrent: (id) => set({ currentPageId: id, selectedId: null }),
    // Note: setting a zoom level explicitly leaves `fit` alone; the UI calls
    // setFit("none") when the user takes manual control.
    setZoom: (z) => set({ zoom: Math.min(4, Math.max(0.25, z)) }),
    setFit: (f) => set({ fit: f }),
    setViewMode: (m) => set({ viewMode: m }),

    setTool: (tool) => set({ tool, selectedId: null }),
    setStyle: (p) => {
      set((s) => ({ style: { ...s.style, ...p } }));
      // Live-apply style to the selected annotation.
      const id = get().selectedId;
      if (id) get().updateAnnotation(id, p as Partial<Annotation>);
    },
    select: (id) => set({ selectedId: id }),

    setSelectedPages: (ids) => set({ selectedPageIds: ids }),

    togglePageSelection: (id, mode) => {
      const { pages, selectedPageIds, selectionAnchor } = get();
      if (mode === "single") {
        set({ selectedPageIds: [id], selectionAnchor: id });
        return;
      }
      if (mode === "toggle") {
        const next = selectedPageIds.includes(id)
          ? selectedPageIds.filter((x) => x !== id)
          : [...selectedPageIds, id];
        set({ selectedPageIds: next, selectionAnchor: id });
        return;
      }
      // range: from the anchor to the clicked page
      const anchor = selectionAnchor && pages.some((p) => p.id === selectionAnchor) ? selectionAnchor : id;
      const a = pages.findIndex((p) => p.id === anchor);
      const b = pages.findIndex((p) => p.id === id);
      if (a === -1 || b === -1) return;
      const [lo, hi] = a < b ? [a, b] : [b, a];
      set({ selectedPageIds: pages.slice(lo, hi + 1).map((p) => p.id), selectionAnchor: anchor });
    },

    selectAllPages: () => set({ selectedPageIds: get().pages.map((p) => p.id) }),
    clearPageSelection: () => set({ selectedPageIds: [], selectionAnchor: null }),

    addAnnotation: (a) =>
      commit("Add annotation", { annotations: [...get().annotations, a], selectedId: a.id }),

    updateAnnotation: (id, patch) =>
      // Position/size drags call this rapidly; keep it out of history (the
      // gesture pushes one snapshot with pushHistory before it starts).
      set((s) => ({
        annotations: s.annotations.map((a) => (a.id === id ? ({ ...a, ...patch } as Annotation) : a)),
      })),

    deleteAnnotation: (id) =>
      commit("Delete annotation", {
        annotations: get().annotations.filter((a) => a.id !== id),
        selectedId: null,
      }),

    duplicateAnnotation: (id) => {
      const a = get().annotations.find((x) => x.id === id);
      if (!a) return;
      const copy = { ...a, id: uuid() } as Annotation;
      if ("x" in copy && typeof copy.x === "number") {
        (copy as { x: number; y: number }).x += 10;
        (copy as { x: number; y: number }).y += 10;
      }
      commit("Duplicate annotation", { annotations: [...get().annotations, copy], selectedId: copy.id });
    },

    setPageNumbers: (patch) =>
      commit("Page numbers", { pageNumbers: { ...get().pageNumbers, ...patch } }),
    setWatermark: (w) => commit(w ? "Watermark" : "Remove watermark", { watermark: w }),
    setDocTitle: (t) => set({ docTitle: t }),

    pushHistory: (label) => set((s) => ({ past: [...s.past, { label, snap: snap() }], future: [] })),

    undo: () =>
      set((s) => {
        if (!s.past.length) return s;
        const prev = s.past[s.past.length - 1];
        return {
          ...prev.snap,
          past: s.past.slice(0, -1),
          future: [{ label: prev.label, snap: snap() }, ...s.future],
          selectedId: null,
        };
      }),

    redo: () =>
      set((s) => {
        if (!s.future.length) return s;
        const next = s.future[0];
        return {
          ...next.snap,
          past: [...s.past, { label: next.label, snap: snap() }],
          future: s.future.slice(1),
          selectedId: null,
        };
      }),

    // Clear the workspace. The document stays in the local store, so the
    // home screen can offer it again under recent documents.
    goHome: () => set({ ...init }),
  };
});
