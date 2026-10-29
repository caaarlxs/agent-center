// The files picked in a session's reply box (pasted images most of all),
// kept in this browser while they wait, as the typed draft is: back after a
// reload or a restart, for as long as the draft lasts. In IndexedDB, which
// holds files; localStorage holds only text. Anything that fails here (a
// private window, a full disk) only means the files are not kept.
import type { FileUIPart } from "ai"

const DB = "agent-center"
const STORE = "draft-files"
type Kept = { at: number; files: { name: string; type: string; blob: Blob }[] }

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function using<T>(mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const conn = await db()
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = act(conn.transaction(STORE, mode).objectStore(STORE))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  } finally {
    conn.close()
  }
}

// Keeps what the box holds now (nothing: forgets them).
export async function keepDraftFiles(id: string, files: FileUIPart[]) {
  try {
    if (!files.length) return void (await using("readwrite", s => s.delete(id)))
    const kept: Kept = { at: Date.now(), files: await Promise.all(files.map(async f => ({ name: f.filename ?? "file", type: f.mediaType, blob: await (await fetch(f.url)).blob() }))) }
    await using("readwrite", s => s.put(kept, id))
  } catch {}
}

// What was kept for this session, if it is younger than `maxAgeMs`.
export async function keptDraftFiles(id: string, maxAgeMs: number): Promise<File[]> {
  try {
    const kept = (await using<Kept | undefined>("readonly", s => s.get(id))) ?? null
    if (!kept || Date.now() - kept.at > maxAgeMs) return []
    return kept.files.map(f => new File([f.blob], f.name, { type: f.type }))
  } catch {
    return []
  }
}
