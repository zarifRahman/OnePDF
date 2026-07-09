import { create } from "zustand";
import { uuid } from "@/lib/utils";
import type { PageDescriptor, SourceFile, Rotation, Annotation, Tool, Style } from "@/types";

// A history snapshot captures everything an edit can change.
type Snap = { pages: PageDescriptor[]; annotations: Annotation[]; pageNumbers: boolean };

type State = {
  files: Record<string, SourceFile>;
  pages: PageDescriptor[];
  annotations: Annotation[];
  pageNumbers: boolean;
  currentPageId: string | null;
  zoom: number;
  // editor
  tool: Tool;
  style: Style;
  selectedId: string | null;
  // history
  past: Snap[];
  future: Snap[];
};

type Actions = {
  addFile: (f: SourceFile) => void;
  reorder: (pages: PageDescriptor[]) => void;
  deletePage: (id: string) => void;
  rotatePage: (id: string, delta: number) => void;
  insertBlankAfter: (id: string | null) => void;
  setCurrent: (id: string) => void;
  setZoom: (z: number) => void;
  // editor
  setTool: (t: Tool) => void;
  setStyle: (p: Partial<Style>) => void;
  select: (id: string | null) => void;
  addAnnotation: (a: Annotation) => void;
  updateAnnotation: (id: string, patch: Partial<Annotation>) => void;
  deleteAnnotation: (id: string) => void;
  togglePageNumbers: () => void;
  // history
  undo: () => void;
  redo: () => void;
  reset: () => void;
};

const init: State = {
  files: {},
  pages: [],
  annotations: [],
  pageNumbers: false,
  currentPageId: null,
  zoom: 1,
  tool: "select",
  style: { color: "#e11d48", strokeWidth: 2, fontSize: 16 },
  selectedId: null,
  past: [],
  future: [],
};

export const useDocStore = create<State & Actions>((set, get) => {
  const snap = (): Snap => {
    const s = get();
    return { pages: s.pages, annotations: s.annotations, pageNumbers: s.pageNumbers };
  };
  // Push current snapshot onto `past`, apply changes, clear `future`.
  const commit = (changes: Partial<State>) =>
    set((s) => ({ ...changes, past: [...s.past, snap()], future: [] }));

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
        pages: [...s.pages, ...descriptors],
        past: [...s.past, snap()],
        future: [],
        currentPageId: s.currentPageId ?? descriptors[0]?.id ?? null,
      }));
    },

    reorder: (pages) => commit({ pages }),

    deletePage: (id) => {
      const next = get().pages.filter((p) => p.id !== id);
      commit({
        pages: next,
        annotations: get().annotations.filter((a) => a.pageId !== id),
      });
      if (get().currentPageId === id) set({ currentPageId: next[0]?.id ?? null });
    },

    rotatePage: (id, delta) =>
      commit({
        pages: get().pages.map((p) =>
          p.id === id
            ? { ...p, rotation: ((((p.rotation + delta) % 360) + 360) % 360) as Rotation }
            : p,
        ),
      }),

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
      commit({ pages });
    },

    setCurrent: (id) => set({ currentPageId: id, selectedId: null }),
    setZoom: (z) => set({ zoom: Math.min(4, Math.max(0.25, z)) }),

    setTool: (tool) => set({ tool, selectedId: null }),
    setStyle: (p) => {
      set((s) => ({ style: { ...s.style, ...p } }));
      // Live-apply style to the selected annotation.
      const id = get().selectedId;
      if (id) get().updateAnnotation(id, p as Partial<Annotation>);
    },
    select: (id) => set({ selectedId: id }),

    addAnnotation: (a) => commit({ annotations: [...get().annotations, a], selectedId: a.id }),

    updateAnnotation: (id, patch) =>
      // Position/size drags call this rapidly; keep it out of history (the
      // preceding add/select already pushed a snapshot). ponytail: no
      // intermediate undo steps for a single drag.
      set((s) => ({
        annotations: s.annotations.map((a) => (a.id === id ? ({ ...a, ...patch } as Annotation) : a)),
      })),

    deleteAnnotation: (id) =>
      commit({
        annotations: get().annotations.filter((a) => a.id !== id),
        selectedId: null,
      }),

    togglePageNumbers: () => commit({ pageNumbers: !get().pageNumbers }),

    undo: () =>
      set((s) => {
        if (!s.past.length) return s;
        const prev = s.past[s.past.length - 1];
        return {
          ...prev,
          past: s.past.slice(0, -1),
          future: [snap(), ...s.future],
          selectedId: null,
        };
      }),

    redo: () =>
      set((s) => {
        if (!s.future.length) return s;
        const next = s.future[0];
        return {
          ...next,
          past: [...s.past, snap()],
          future: s.future.slice(1),
          selectedId: null,
        };
      }),

    reset: () => set({ ...init }),
  };
});
