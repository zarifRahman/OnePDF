import { describe, it, expect, beforeEach } from "vitest";
import { useDocStore } from "./document";
import type { SourceFile } from "@/types";

const src: SourceFile = { id: "a", name: "a.pdf", bytes: new Uint8Array(), pageCount: 2 };

beforeEach(() => useDocStore.getState().reset());

describe("doc store", () => {
  it("addFile appends descriptors", () => {
    useDocStore.getState().addFile(src);
    expect(useDocStore.getState().pages.length).toBe(2);
  });

  it("deletePage then undo restores, redo reapplies", () => {
    const s = useDocStore.getState();
    s.addFile(src);
    const id = useDocStore.getState().pages[0].id;
    s.deletePage(id);
    expect(useDocStore.getState().pages.length).toBe(1);
    s.undo();
    expect(useDocStore.getState().pages.length).toBe(2);
    s.redo();
    expect(useDocStore.getState().pages.length).toBe(1);
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
    expect(pages.length).toBe(3);
    expect(pages[1].isBlank).toBe(true);
  });
});
