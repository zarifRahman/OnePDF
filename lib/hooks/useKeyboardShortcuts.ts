"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { useDocStore } from "@/store/document";
import type { Tool } from "@/types";

// A tiny event bus so global shortcuts can reach the shell (search, help)
// without prop-drilling.
const bus = new EventTarget();

export type ShortcutEvent = "search" | "shortcuts" | "new";

export function emitShortcut(type: ShortcutEvent) {
  bus.dispatchEvent(new Event(type));
}

export function onShortcut(type: ShortcutEvent, cb: () => void) {
  const handler = () => cb();
  bus.addEventListener(type, handler);
  return () => bus.removeEventListener(type, handler);
}

const TOOL_KEYS: Record<string, Tool> = {
  v: "select",
  t: "text",
  p: "draw",
  h: "highlight",
  u: "underline",
  r: "rect",
  c: "circle",
  l: "line",
  a: "arrow",
  n: "note",
  d: "redact",
  i: "image",
  s: "signature",
};

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable === true
  );
}

// Global shortcuts: undo/redo, delete, navigation, tool switching, zoom.
export function useKeyboardShortcuts() {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;

      const s = useDocStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && key === "z" && !e.shiftKey) {
        e.preventDefault();
        const label = s.past[s.past.length - 1]?.label;
        s.undo();
        if (label) toast(`Undid: ${label}`);
      } else if (mod && (key === "y" || (key === "z" && e.shiftKey))) {
        e.preventDefault();
        const label = s.future[0]?.label;
        s.redo();
        if (label) toast(`Redid: ${label}`);
      } else if (mod && key === "f") {
        e.preventDefault();
        emitShortcut("search");
      } else if (mod && key === "a") {
        e.preventDefault();
        s.selectAllPages();
      } else if (mod && key === "d") {
        if (s.selectedId) {
          e.preventDefault();
          s.duplicateAnnotation(s.selectedId);
        }
      } else if (mod && (key === "=" || key === "+")) {
        e.preventDefault();
        s.setFit("none");
        s.setZoom(s.zoom + 0.25);
      } else if (mod && key === "-") {
        e.preventDefault();
        s.setFit("none");
        s.setZoom(s.zoom - 0.25);
      } else if (mod && key === "0") {
        e.preventDefault();
        s.setFit("width");
      } else if (mod && key === "1") {
        e.preventDefault();
        s.setFit("none");
        s.setZoom(1);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        // Prefer removing a selected annotation; only delete the page if nothing
        // is selected (and never while typing, handled by the guard above).
        if (s.selectedId) {
          e.preventDefault();
          s.deleteAnnotation(s.selectedId);
        } else if (s.selectedPageIds.length) {
          e.preventDefault();
          s.deletePages(s.selectedPageIds);
        } else if (e.key === "Delete" && s.currentPageId) {
          s.deletePage(s.currentPageId);
        }
      } else if (e.key === "Escape") {
        if (s.selectedId) s.select(null);
        else if (s.selectedPageIds.length) s.clearPageSelection();
        else s.setTool("select");
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const idx = s.pages.findIndex((p) => p.id === s.currentPageId);
        const n = idx + (e.key === "ArrowRight" ? 1 : -1);
        if (n >= 0 && n < s.pages.length) s.setCurrent(s.pages[n].id);
      } else if (e.key === "?" && !mod) {
        emitShortcut("shortcuts");
      } else if (!mod && !e.altKey && TOOL_KEYS[key]) {
        s.setTool(TOOL_KEYS[key]);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
}
