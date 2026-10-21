"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: "Tools",
    items: [
      ["V", "Select / move"],
      ["T", "Text"],
      ["P", "Freehand draw"],
      ["H", "Highlight"],
      ["U", "Underline"],
      ["R", "Rectangle"],
      ["C", "Circle"],
      ["L", "Line"],
      ["A", "Arrow"],
      ["N", "Sticky note"],
      ["D", "Redact"],
      ["I", "Insert image"],
      ["S", "Signature"],
    ],
  },
  {
    title: "Pages",
    items: [
      ["← / →", "Previous / next page"],
      ["⌘A", "Select all pages"],
      ["Esc", "Clear selection"],
      ["⌘⌫", "Delete selected pages or mark"],
    ],
  },
  {
    title: "Document",
    items: [
      ["⌘Z", "Undo"],
      ["⌘⇧Z / ⌘Y", "Redo"],
      ["⌘F", "Search the document"],
      ["⌘D", "Duplicate the selected mark"],
      ["?", "This dialog"],
    ],
  },
  {
    title: "Zoom & view",
    items: [
      ["⌘+ / ⌘−", "Zoom in / out"],
      ["⌘0", "Fit to width"],
      ["⌘1", "Actual size (100%)"],
    ],
  },
];

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Everything in OnePDF can be done from the keyboard — no mouse required.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 sm:grid-cols-2">
          {GROUPS.map((g) => (
            <section key={g.title}>
              <h3 className="mb-2 text-sm font-semibold">{g.title}</h3>
              <ul className="space-y-1">
                {g.items.map(([key, label]) => (
                  <li key={key} className="flex items-center justify-between gap-4 text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">
                      {key}
                    </kbd>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
