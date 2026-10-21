"use client";

import { useEffect, useState } from "react";
import {
  FileStack,
  Files,
  Pencil,
  Gauge,
  Scissors,
  Droplets,
  SquareDashed,
  ShieldCheck,
  Lock,
  Keyboard,
  Sun,
  Moon,
  History,
} from "lucide-react";
import { useTheme } from "next-themes";
import { motion } from "framer-motion";
import { Dropzone } from "@/components/upload/Dropzone";
import { listDocuments, type StoredDocument } from "@/lib/db/storage";
import { useDocStore } from "@/store/document";

export type Task =
  | "organise"
  | "merge"
  | "edit"
  | "compress"
  | "split"
  | "watermark"
  | "redact";

const TASKS: {
  id: Task;
  icon: React.ReactNode;
  title: string;
  blurb: string;
}[] = [
  {
    id: "organise",
    icon: <FileStack className="h-5 w-5" />,
    title: "Organise pages",
    blurb: "Merge, reorder, rotate, duplicate and delete pages",
  },
  {
    id: "merge",
    icon: <Files className="h-5 w-5" />,
    title: "Merge PDFs",
    blurb: "Combine several PDFs into a single document",
  },
  {
    id: "edit",
    icon: <Pencil className="h-5 w-5" />,
    title: "Edit & annotate",
    blurb: "Text, highlights, shapes, images, notes and signatures",
  },
  {
    id: "compress",
    icon: <Gauge className="h-5 w-5" />,
    title: "Compress",
    blurb: "Shrink the file, optionally in greyscale",
  },
  {
    id: "split",
    icon: <Scissors className="h-5 w-5" />,
    title: "Split pages",
    blurb: "Turn page ranges into separate PDFs",
  },
  {
    id: "watermark",
    icon: <Droplets className="h-5 w-5" />,
    title: "Watermark",
    blurb: "Stamp every page with your own text",
  },
  {
    id: "redact",
    icon: <SquareDashed className="h-5 w-5" />,
    title: "Redact",
    blurb: "Burn in black boxes so the text is really gone",
  },
];

export function Welcome({
  onTask,
  onShortcuts,
}: {
  onTask: (task: Task, count: number) => void;
  onShortcuts: () => void;
}) {
  const { theme, setTheme } = useTheme();
  const loadWorkspace = useDocStore((s) => s.loadWorkspace);
  const [recents, setRecents] = useState<StoredDocument[]>([]);

  useEffect(() => {
    listDocuments()
      .then(setRecents)
      .catch(() => setRecents([]));
  }, []);

  const openRecent = (doc: StoredDocument) => {
    const files = Object.fromEntries(
      doc.data.files.map((f) => [f.id, { ...f, bytes: new Uint8Array(f.bytes) }]),
    );
    loadWorkspace({
      files,
      pages: doc.data.pages,
      annotations: doc.data.annotations,
      pageNumbers: doc.data.pageNumbers,
      watermark: doc.data.watermark,
      docTitle: doc.title,
    });
  };

  return (
    <div className="min-h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileStack className="h-6 w-6 text-primary" />
            <span className="text-lg font-semibold">OnePDF</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onShortcuts}
              aria-label="Keyboard shortcuts"
              title="Keyboard shortcuts"
              className="rounded-md p-2 hover:bg-accent"
            >
              <Keyboard className="h-4 w-4" />
            </button>
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label="Toggle theme"
              title="Toggle theme"
              className="rounded-md p-2 hover:bg-accent"
            >
              <Moon className="hidden h-4 w-4 dark:block" />
              <Sun className="h-4 w-4 dark:hidden" />
            </button>
          </div>
        </header>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 text-center"
        >
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Every PDF tool you need, in one tab
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Organise pages, edit text, annotate, sign, compress and split. Your files
            never leave the device — everything runs in your browser.
          </p>
        </motion.div>

        <div className="mb-8">
          <Dropzone onFiles={(count) => count > 0 && onTask("organise", count)} />
        </div>

        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          What do you want to do?
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TASKS.map((t) => (
            <button
              key={t.id}
              onClick={() => onTask(t.id, 0)}
              className="group flex items-start gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/60 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="rounded-lg bg-primary/10 p-2 text-primary transition-transform group-hover:scale-105">
                {t.icon}
              </span>
              <span>
                <span className="block font-medium">{t.title}</span>
                <span className="block text-sm text-muted-foreground">{t.blurb}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <div className="flex items-start gap-3 rounded-xl border bg-muted/30 p-4">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">Private by design.</strong> Files are read
              and written on this device only — there is no upload, no account and no
              server. Your work is saved locally so a reload does not lose it.
            </p>
          </div>
          <div className="flex items-start gap-3 rounded-xl border bg-muted/30 p-4">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">Real redaction.</strong> Redactions are
              burned into a rasterised copy, so the text underneath is removed from the
              file — not just covered up.
            </p>
          </div>
        </div>

        {recents.length > 0 && (
          <div className="mt-10">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <History className="h-4 w-4" /> Recent documents
            </h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {recents.map((r) => (
                <button
                  key={r.id}
                  onClick={() => openRecent(r)}
                  className="rounded-xl border bg-card p-3 text-left transition-colors hover:border-primary/60 hover:bg-accent/40"
                >
                  <span className="block truncate font-medium">{r.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {r.pageCount} page{r.pageCount === 1 ? "" : "s"} ·{" "}
                    {new Date(r.updatedAt).toLocaleString()}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
