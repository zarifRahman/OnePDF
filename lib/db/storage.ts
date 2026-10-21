import type { Annotation, PageDescriptor, PageNumberOptions, Watermark } from "@/types";

/**
 * Local persistence. Everything the workspace needs is stored in IndexedDB so
 * a reload (or a crash) does not throw away the user's work, and so the
 * welcome screen can offer recent documents. No file ever leaves the device.
 */

const DB_NAME = "onepdf";
const DB_VERSION = 1;
const STORE = "documents";

export type StoredDocument = {
  id: string;
  title: string;
  updatedAt: number;
  pageCount: number;
  /** First page rendered as a small JPEG data URL for the recents list. */
  thumbnail?: string;
  data: {
    pages: PageDescriptor[];
    annotations: Annotation[];
    pageNumbers: PageNumberOptions;
    watermark: Watermark | null;
    files: { id: string; name: string; bytes: Uint8Array; pageCount: number }[];
  };
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
  });
}

export async function saveDocument(doc: StoredDocument): Promise<void> {
  await tx("readwrite", (s) => s.put(doc) as IDBRequest<IDBValidKey>);
}

export async function loadDocument(id: string): Promise<StoredDocument | undefined> {
  return tx<StoredDocument | undefined>("readonly", (s) => s.get(id) as IDBRequest<StoredDocument | undefined>);
}

export async function listDocuments(): Promise<StoredDocument[]> {
  const all = await tx<StoredDocument[]>("readonly", (s) => s.getAll() as IDBRequest<StoredDocument[]>);
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteDocument(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id) as IDBRequest<undefined>);
}

/** The id of the workspace currently open in this tab. */
export const WORKSPACE_KEY = "onepdf:workspace";

export function getWorkspaceId(): string {
  if (typeof localStorage === "undefined") return "workspace";
  let id = localStorage.getItem(WORKSPACE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(WORKSPACE_KEY, id);
  }
  return id;
}
