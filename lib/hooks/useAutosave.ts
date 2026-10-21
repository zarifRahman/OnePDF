"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useDocStore } from "@/store/document";
import {
  saveDocument,
  loadDocument,
  getWorkspaceId,
  type StoredDocument,
} from "@/lib/db/storage";

const MAX_AGE = 24 * 60 * 60 * 1000; // a day

export async function saveWorkspaceNow(): Promise<void> {
  const s = useDocStore.getState();
  if (!s.pages.length) return;
  await saveDocument({
    id: getWorkspaceId(),
    title: s.docTitle,
    updatedAt: Date.now(),
    pageCount: s.pages.length,
    data: {
      pages: s.pages,
      annotations: s.annotations,
      pageNumbers: s.pageNumbers,
      watermark: s.watermark,
      files: Object.values(s.files).map((f) => ({
        id: f.id,
        name: f.name,
        bytes: f.bytes,
        pageCount: f.pageCount,
      })),
    },
  });
}

/**
 * Keep the workspace in IndexedDB so a reload (or a crash) never loses the
 * user's work. Nothing leaves the device.
 */
export function useAutosave() {
  const { files, pages, annotations, pageNumbers, watermark, docTitle } = useDocStore();
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!pages.length) return;
    const t = setTimeout(async () => {
      setSaving(true);
      try {
        await saveWorkspaceNow();
        setSavedAt(Date.now());
      } catch {
        /* storage unavailable (private mode) — keep working in memory */
      } finally {
        setSaving(false);
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [files, pages, annotations, pageNumbers, watermark, docTitle]);

  return { saving, savedAt };
}

/** Re-open the last session if it was saved recently enough to be relevant. */
export function useRestoreSession() {
  useEffect(() => {
    let cancelled = false;
    loadDocument(getWorkspaceId())
      .then((doc: StoredDocument | undefined) => {
        if (cancelled || !doc) return;
        if (!doc.data?.pages?.length) return;
        if (Date.now() - doc.updatedAt > MAX_AGE) return;
        if (useDocStore.getState().pages.length) return;
        useDocStore.getState().loadWorkspace({
          files: Object.fromEntries(
            doc.data.files.map((f) => [
              f.id,
              { id: f.id, name: f.name, bytes: new Uint8Array(f.bytes), pageCount: f.pageCount },
            ]),
          ),
          pages: doc.data.pages,
          annotations: doc.data.annotations ?? [],
          pageNumbers: doc.data.pageNumbers ?? {
            enabled: false,
            position: "bottom-center",
            format: "n",
            startAt: 1,
          },
          watermark: doc.data.watermark ?? null,
          docTitle: doc.title,
        });
        toast.success("Restored your last session");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
}
