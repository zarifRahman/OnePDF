import { create } from "zustand";
import { uuid } from "@/lib/utils";
import type { PageDescriptor, SourceFile, Rotation } from "@/types";

type State = {
  files: Record<string, SourceFile>;
  pages: PageDescriptor[];
  currentPageId: string | null;
  zoom: number;
  past: PageDescriptor[][];
  future: PageDescriptor[][];
};

type Actions = {
  addFile: (f: SourceFile) => void;
  reorder: (pages: PageDescriptor[]) => void;
  deletePage: (id: string) => void;
  rotatePage: (id: string, delta: number) => void;
  insertBlankAfter: (id: string | null) => void;
  setCurrent: (id: string) => void;
  setZoom: (z: number) => void;
  undo: () => void;
  redo: () => void;
  reset: () => void;
};

const init: State = {
  files: {},
  pages: [],
  currentPageId: null,
  zoom: 1,
  past: [],
  future: [],
};

export const useDocStore = create<State & Actions>((set, get) => {
  // Snapshot current pages onto `past` before a mutation; clears `future`.
  const commit = (next: PageDescriptor[]) =>
    set((s) => ({ pages: next, past: [...s.past, s.pages], future: [] }));

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
        past: [...s.past, s.pages],
        future: [],
        currentPageId: s.currentPageId ?? descriptors[0]?.id ?? null,
      }));
    },

    reorder: (pages) => commit(pages),

    deletePage: (id) => {
      const next = get().pages.filter((p) => p.id !== id);
      commit(next);
      if (get().currentPageId === id) set({ currentPageId: next[0]?.id ?? null });
    },

    rotatePage: (id, delta) =>
      commit(
        get().pages.map((p) =>
          p.id === id
            ? { ...p, rotation: ((((p.rotation + delta) % 360) + 360) % 360) as Rotation }
            : p,
        ),
      ),

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
      commit(pages);
    },

    setCurrent: (id) => set({ currentPageId: id }),

    setZoom: (z) => set({ zoom: Math.min(4, Math.max(0.25, z)) }),

    undo: () =>
      set((s) => {
        if (!s.past.length) return s;
        const prev = s.past[s.past.length - 1];
        return { pages: prev, past: s.past.slice(0, -1), future: [s.pages, ...s.future] };
      }),

    redo: () =>
      set((s) => {
        if (!s.future.length) return s;
        const next = s.future[0];
        return { pages: next, past: [...s.past, s.pages], future: s.future.slice(1) };
      }),

    reset: () => set({ ...init }),
  };
});
