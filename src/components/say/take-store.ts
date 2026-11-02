/**
 * Keeps a take in the browser until it has become a job, so a refused upload, an empty AI budget or
 * a reload doesn't cost the person what they said. Stored as bytes: Safari has been unreliable with
 * Blobs in IndexedDB. If storage is blocked (private mode, say) the page still holds the take.
 */
import type { JobCustomer } from "@/lib/say/types";

export interface Heard {
  transcript: string;
  mocked: boolean;
  durationSec?: number;
  audioBytes: number;
}

export interface Take {
  audio: Blob;
  customer: JobCustomer;
  /** Speech worked and the job didn't, so a retry doesn't pay to hear it twice. */
  heard?: Heard;
}

const STORE = "takes";
const KEY = "current";

/** One at a time, in order, so a late save can't bring back a take that was just cleared. */
let queue: Promise<unknown> = Promise.resolve();
const inTurn = <T,>(work: () => Promise<T>): Promise<T> => {
  const next = queue.then(work, work);
  queue = next.catch(() => undefined);
  return next;
};

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("say-voice", 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = act(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export const saveTake = ({ audio, ...rest }: Take) =>
  inTurn(async () => {
    try {
      const bytes = await audio.arrayBuffer();
      await withStore("readwrite", (store) => store.put({ ...rest, bytes, type: audio.type }, KEY));
    } catch {
      /* the page still has it */
    }
  });

export async function loadTake(): Promise<Take | null> {
  try {
    const saved = await withStore<(Omit<Take, "audio"> & { bytes: ArrayBuffer; type: string }) | undefined>("readonly", (store) => store.get(KEY));
    if (!saved) return null;
    const { bytes, type, ...rest } = saved;
    return { ...rest, audio: new Blob([bytes], { type }) };
  } catch {
    return null;
  }
}

export const clearTake = () =>
  inTurn(async () => {
    try {
      await withStore("readwrite", (store) => store.delete(KEY));
    } catch {
      /* nothing to clear */
    }
  });
