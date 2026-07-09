"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Document, Page } from "react-pdf";
import { RotateCw, Trash2, FilePlus } from "lucide-react";
import { useDocStore } from "@/store/document";
import type { PageDescriptor } from "@/types";

const Skel = () => <div className="h-[180px] w-[140px] animate-pulse rounded bg-muted" />;

function IconBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  title: string;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="rounded bg-background/90 p-1 hover:bg-accent"
    >
      {children}
    </button>
  );
}

// docBytes: exported bytes of the whole document; pageNumber is 1-based within it.
export function ThumbnailItem({
  page,
  pageNumber,
  docBytes,
}: {
  page: PageDescriptor;
  pageNumber: number;
  docBytes: Uint8Array | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id,
  });
  const { currentPageId, setCurrent, rotatePage, deletePage, insertBlankAfter } = useDocStore();
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), {
      rootMargin: "200px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const active = currentPageId === page.id;

  // pdf.js transfers (detaches) the buffer to its worker. Give this Document its
  // own copy so it doesn't neuter the shared docBytes used by other Documents.
  // Memoize the whole file object so react-pdf doesn't reload every render.
  const file = useMemo(() => (docBytes ? { data: docBytes.slice(0) } : null), [docBytes]);

  // docBytes re-export lags the pages array by a tick, so pageNumber can briefly
  // exceed the loaded doc. Gate <Page> on the actually-loaded page count.
  const [numPages, setNumPages] = useState(0);

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      <div
        ref={ref}
        onClick={() => setCurrent(page.id)}
        className={`group relative rounded-lg border p-1 ${
          active ? "border-primary ring-1 ring-primary" : "border-border"
        }`}
      >
        <div {...attributes} {...listeners} className="flex cursor-grab justify-center">
          {visible && file ? (
            <Document
              file={file}
              loading={<Skel />}
              onLoadSuccess={({ numPages: n }) => setNumPages(n)}
            >
              {pageNumber <= numPages ? (
                <Page
                  pageNumber={pageNumber}
                  width={140}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  loading={<Skel />}
                />
              ) : (
                <Skel />
              )}
            </Document>
          ) : (
            <Skel />
          )}
        </div>
        <span className="absolute bottom-1 left-1 rounded bg-background/80 px-1 text-xs">
          {pageNumber}
        </span>
        <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <IconBtn
            title="Rotate"
            onClick={(e) => {
              e.stopPropagation();
              rotatePage(page.id, 90);
            }}
          >
            <RotateCw className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn
            title="Insert blank page after"
            onClick={(e) => {
              e.stopPropagation();
              insertBlankAfter(page.id);
            }}
          >
            <FilePlus className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn
            title="Delete page"
            onClick={(e) => {
              e.stopPropagation();
              deletePage(page.id);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </IconBtn>
        </div>
      </div>
    </div>
  );
}
