import { describe, it, expect, beforeEach } from "vitest";
import { useDocStore } from "./document";
import type { SourceFile } from "@/types";

const src: SourceFile = { id: "a", name: "a.pdf", bytes: new Uint8Array(), pageCount: 3 };

beforeEach(() => useDocStore.getState().goHome());

describe("doc store", () => {
  it("addFile appends descriptors", () => {
    useDocStore.getState().addFile(src);
    expect(useDocStore.getState().pages.length).toBe(3);
  });

  it("deletePage then undo restores, redo reapplies", () => {
    const s = useDocStore.getState();
    s.addFile(src);
    const id = useDocStore.getState().pages[0].id;
    s.deletePage(id);
    expect(useDocStore.getState().pages.length).toBe(2);
    s.undo();
    expect(useDocStore.getState().pages.length).toBe(3);
    s.redo();
    expect(useDocStore.getState().pages.length).toBe(2);
  });

  it("rotatePage cycles 0->90", () => {
    const s = useDocStore.getState();
    s.addFile(src);
    const id = useDocStore.getState().pages[0].id;
    s.rotatePage(id, 90);
    expect(useDocStore.getState().pages[0].rotation).toBe(90);
  });

  it("insertBlankAfter adds a blank page", () => {
    const s = useDocStore.getState();
    s.addFile(src);
    const id = useDocStore.getState().pages[0].id;
    s.insertBlankAfter(id);
    const pages = useDocStore.getState().pages;
    expect(pages.length).toBe(4);
    expect(pages[1].isBlank).toBe(true);
  });

  it("rotatePage wraps negative deltas into 0..359", () => {
    const s = useDocStore.getState();
    s.addFile(src);
    const id = useDocStore.getState().pages[0].id;
    s.rotatePage(id, -90);
    expect(useDocStore.getState().pages[0].rotation).toBe(270);
  });

  it("setZoom clamps to [0.25, 4]", () => {
    const s = useDocStore.getState();
    s.setZoom(99);
    expect(useDocStore.getState().zoom).toBe(4);
    s.setZoom(0.01);
    expect(useDocStore.getState().zoom).toBe(0.25);
  });

  it("deletePage drops the page's annotations", () => {
    const s = useDocStore.getState();
    s.addFile(src);
    const id = useDocStore.getState().pages[0].id;
    s.addAnnotation({ id: "x", pageId: id, type: "text", x: 0, y: 0, text: "hi", size: 12, color: "#000000" });
    s.deletePage(id);
    expect(useDocStore.getState().annotations.length).toBe(0);
  });

  it("updateAnnotation patches in place without a history entry", () => {
    const s = useDocStore.getState();
    s.addFile(src);
    const pid = useDocStore.getState().pages[0].id;
    s.addAnnotation({ id: "x", pageId: pid, type: "text", x: 0, y: 0, text: "hi", size: 12, color: "#000000" });
    const pastLen = useDocStore.getState().past.length;
    s.updateAnnotation("x", { x: 50 });
    const st = useDocStore.getState();
    expect((st.annotations[0] as { x: number }).x).toBe(50);
    expect(st.past.length).toBe(pastLen);
  });

  it("togglePageNumbers flips and undo restores", () => {
    const s = useDocStore.getState();
    expect(useDocStore.getState().pageNumbers.enabled).toBe(false);
    s.togglePageNumbers();
    expect(useDocStore.getState().pageNumbers.enabled).toBe(true);
    s.undo();
    expect(useDocStore.getState().pageNumbers.enabled).toBe(false);
  });

  it("labels history entries so the UI can say what is undone", () => {
    const s = useDocStore.getState();
    s.addFile(src);
    s.rotatePage(useDocStore.getState().pages[0].id, 90);
    const past = useDocStore.getState().past;
    expect(past[past.length - 1].label).toBe("Rotate page");
  });

  it("duplicates a page together with its annotations", () => {
    const s = useDocStore.getState();
    s.addFile(src);
    const id = useDocStore.getState().pages[0].id;
    s.addAnnotation({ id: "x", pageId: id, type: "text", x: 0, y: 0, text: "hi", size: 12, color: "#000000" });
    s.duplicatePages([id]);
    const st = useDocStore.getState();
    expect(st.pages.length).toBe(4);
    expect(st.annotations.length).toBe(2);
    expect(st.annotations[1].pageId).not.toBe(id);
  });

  it("selects a range of pages with shift-click semantics", () => {
    const s = useDocStore.getState();
    s.addFile(src);
    const [a, b, c] = useDocStore.getState().pages;
    s.togglePageSelection(a.id, "single");
    s.togglePageSelection(c.id, "range");
    expect(useDocStore.getState().selectedPageIds).toEqual([a.id, b.id, c.id]);
  });

  it("toggles a single page with cmd-click", () => {
    const s = useDocStore.getState();
    s.addFile(src);
    const [a, b] = useDocStore.getState().pages;
    s.togglePageSelection(a.id, "single");
    s.togglePageSelection(b.id, "toggle");
    expect(useDocStore.getState().selectedPageIds).toEqual([a.id, b.id]);
    s.togglePageSelection(b.id, "toggle");
    expect(useDocStore.getState().selectedPageIds).toEqual([a.id]);
  });

  it("selectAllPages selects every page", () => {
    const s = useDocStore.getState();
    s.addFile(src);
    s.selectAllPages();
    expect(useDocStore.getState().selectedPageIds.length).toBe(3);
  });

  it("applies a crop to the selected pages and undo restores it", () => {
    const s = useDocStore.getState();
    s.addFile(src);
    const id = useDocStore.getState().pages[0].id;
    s.setPageCrop([id], { top: 10, right: 10, bottom: 10, left: 10 });
    expect(useDocStore.getState().pages[0].crop).toEqual({ top: 10, right: 10, bottom: 10, left: 10 });
    s.undo();
    expect(useDocStore.getState().pages[0].crop).toBeUndefined();
  });

  it("stores a watermark and undoes it", () => {
    const s = useDocStore.getState();
    s.addFile(src);
    s.setWatermark({ text: "DRAFT", size: 40, color: "#888888", opacity: 0.2, rotation: 45 });
    expect(useDocStore.getState().watermark?.text).toBe("DRAFT");
    s.undo();
    expect(useDocStore.getState().watermark).toBeNull();
  });

  it("restores a saved workspace", () => {
    const s = useDocStore.getState();
    s.addFile(src);
    const st = useDocStore.getState();
    s.loadWorkspace({
      files: st.files,
      pages: st.pages,
      annotations: st.annotations,
      pageNumbers: st.pageNumbers,
      watermark: null,
      docTitle: "Restored",
    });
    expect(useDocStore.getState().docTitle).toBe("Restored");
    expect(useDocStore.getState().pages.length).toBe(3);
  });
});
