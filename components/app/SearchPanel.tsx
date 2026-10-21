"use client";

import { useEffect, useRef } from "react";
import { ChevronUp, ChevronDown, X, Search } from "lucide-react";
import type { SearchHit } from "@/types";

/**
 * Floating search bar. The owner (Workspace) runs the query and passes the
 * hits; this component is only the chrome.
 */
export function SearchPanel({
  open,
  query,
  hits,
  index,
  onQuery,
  onNavigate,
  onClose,
}: {
  open: boolean;
  query: string;
  hits: SearchHit[];
  index: number;
  onQuery: (q: string) => void;
  onNavigate: (i: number) => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-1 rounded-lg border bg-background/95 p-1 shadow-lg backdrop-blur">
      <Search className="ml-1 h-4 w-4 text-muted-foreground" />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Enter") onNavigate(e.shiftKey ? index - 1 : index + 1);
        }}
        placeholder="Find in document"
        className="w-52 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
      />
      <span className="whitespace-nowrap px-1 text-xs text-muted-foreground">
        {query ? (hits.length ? `${index + 1} of ${hits.length}` : "No matches") : ""}
      </span>
      <button
        aria-label="Previous match"
        disabled={!hits.length}
        onClick={() => onNavigate(index - 1)}
        className="rounded p-1 hover:bg-accent disabled:opacity-30"
      >
        <ChevronUp className="h-4 w-4" />
      </button>
      <button
        aria-label="Next match"
        disabled={!hits.length}
        onClick={() => onNavigate(index + 1)}
        className="rounded p-1 hover:bg-accent disabled:opacity-30"
      >
        <ChevronDown className="h-4 w-4" />
      </button>
      <button aria-label="Close search" onClick={onClose} className="rounded p-1 hover:bg-accent">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
