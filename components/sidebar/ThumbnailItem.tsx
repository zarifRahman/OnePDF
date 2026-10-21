"use client";

import { useEffect, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Page } from "react-pdf";
import { RotateCw, Trash2, FilePlus, Copy } from "lucide-react";
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
      aria-label={title}
      onClick={onClick}
      className="rounded bg-background/90 p-1 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </button>
  );
}

export function ThumbnailItem({
  page,
  pageNumber,
}: {
  page: PageDescriptor;
  pageNumber: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id,
  });
  const { currentPageId, setCurrent, rotatePages, deletePages, insertBlankAfter, duplicatePages, selectedPageIds, togglePageSelection } =
    useDocStore();
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
  const selected = selectedPageIds.includes(page.id);

  // The shell owns a single react-pdf <Document>, so the thumbnail is just a
  // <Page> inside it — one copy of the bytes and one pdf.js instance for the
  // whole app instead of one per thumbnail.
  const onSelect = (e: React.MouseEvent) => {
    if (e.shiftKey) {
      e.preventDefault();
      togglePageSelection(page.id, "range");
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      togglePageSelection(page.id, "toggle");
      return;
    }
    setCurrent(page.id);
    togglePageSelection(page.id, "single");
  };

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
        onClick={onSelect}
        className={`group relative rounded-lg border p-1 ${
          selected
            ? "border-primary ring-2 ring-primary/60"
            : active
              ? "border-primary ring-1 ring-primary"
              : "border-border"
        }`}
      >
        <div {...attributes} {...listeners} className="flex cursor-grab justify-center">
          {visible ? (
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
        </div>
        <span className="absolute bottom-1 left-1 rounded bg-background/80 px-1 text-xs">
          {pageNumber}
        </span>
        {page.rotation !== 0 && (
          <span className="absolute bottom-1 right-1 rounded bg-background/80 px-1 text-[10px] text-muted-foreground">
            {page.rotation}°
          </span>
        )}
        <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <IconBtn
            title="Rotate right"
            onClick={(e) => {
              e.stopPropagation();
              rotatePages([page.id], 90);
            }}
          >
            <RotateCw className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn
            title="Duplicate page"
            onClick={(e) => {
              e.stopPropagation();
              duplicatePages([page.id]);
            }}
          >
            <Copy className="h-3.5 w-3.5" />
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
              deletePages([page.id]);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </IconBtn>
        </div>
      </div>
    </div>
  );
}
