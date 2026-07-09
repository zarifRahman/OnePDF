"use client";
import { useEffect } from "react";
import { useDocStore } from "@/store/document";

// Ctrl/Cmd+Z undo, Ctrl/Cmd+Y or Shift+Ctrl/Cmd+Z redo, Delete removes the
// current page, Arrow keys navigate. Reads fresh state via getState() so the
// handler never goes stale.
export function useKeyboardShortcuts() {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;

      const s = useDocStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && key === "z" && !e.shiftKey) {
        e.preventDefault();
        s.undo();
      } else if (mod && (key === "y" || (key === "z" && e.shiftKey))) {
        e.preventDefault();
        s.redo();
      } else if (e.key === "Delete" && s.currentPageId) {
        s.deletePage(s.currentPageId);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const idx = s.pages.findIndex((p) => p.id === s.currentPageId);
        const n = idx + (e.key === "ArrowRight" ? 1 : -1);
        if (n >= 0 && n < s.pages.length) s.setCurrent(s.pages[n].id);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
}
