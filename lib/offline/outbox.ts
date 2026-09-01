"use client";

/**
 * Work a driver did with no signal, held on the phone until it can be sent.
 *
 * Follows the same shape as the GPS buffer (lib/gps/buffer.ts) — a small
 * IndexedDB store, no library. Every item carries a client_ref generated here,
 * so replaying the queue over a flaky connection updates the same record rather
 * than creating a second trip.
 */

const DB_NAME = "prumac-outbox";
const DB_VERSION = 1;
const STORE = "queue";

export type OutboxKind = "trip_start" | "trip_end" | "checklist" | "fault";

export interface OutboxItem {
  /** Doubles as the server-side idempotency key. */
  client_ref: string;
  kind: OutboxKind;
  /** When the driver actually did it — not when it reaches the server. */
  captured_at: string;
  payload: Record<string, unknown>;
  attempts: number;
  last_error?: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "client_ref" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

/** Adds work to the queue and returns its reference. */
export async function enqueue(
  kind: OutboxKind,
  payload: Record<string, unknown>,
): Promise<string> {
  const item: OutboxItem = {
    client_ref: uuid(),
    kind,
    captured_at: new Date().toISOString(),
    payload,
    attempts: 0,
  };
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put(item);
  await new Promise<void>((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  db.close();
  return item.client_ref;
}

export async function pending(): Promise<OutboxItem[]> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    const rows = await new Promise<OutboxItem[]>((res, rej) => {
      req.onsuccess = () => res(req.result as OutboxItem[]);
      req.onerror = () => rej(req.error);
    });
    db.close();
    return rows.sort((a, b) => a.captured_at.localeCompare(b.captured_at));
  } catch {
    return [];               // private mode, or storage unavailable
  }
}

async function drop(refs: string[]): Promise<void> {
  if (refs.length === 0) return;
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  for (const r of refs) store.delete(r);
  await new Promise<void>((res) => { tx.oncomplete = () => res(); });
  db.close();
}

async function recordFailure(item: OutboxItem, message: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put({ ...item, attempts: item.attempts + 1, last_error: message });
  await new Promise<void>((res) => { tx.oncomplete = () => res(); });
  db.close();
}

export interface FlushResult { sent: number; failed: number; remaining: number }

/**
 * Sends everything queued, oldest first.
 *
 * Order matters: a trip must start before it can end. One failure stops the
 * run rather than skipping ahead, so an end never lands before its start.
 */
export async function flush(): Promise<FlushResult> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    const items = await pending();
    return { sent: 0, failed: 0, remaining: items.length };
  }

  const items = await pending();
  if (items.length === 0) return { sent: 0, failed: 0, remaining: 0 };

  const done: string[] = [];
  let failed = 0;

  for (const item of items) {
    try {
      const res = await fetch("/api/offline/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      });
      if (res.ok) { done.push(item.client_ref); continue; }

      // 4xx means the server will never accept it — a stale vehicle, a trip
      // that no longer exists. Retrying forever would block everything behind
      // it, so it is dropped and reported rather than jamming the queue.
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        const body = await res.text().catch(() => "");
        await recordFailure(item, `rejected (${res.status}): ${body.slice(0, 140)}`);
        done.push(item.client_ref);
        failed++;
        continue;
      }
      break;                                   // server trouble: try again later
    } catch {
      break;                                   // signal went again mid-flush
    }
  }

  await drop(done);
  const left = await pending();
  return { sent: done.length - failed, failed, remaining: left.length };
}

/** Clears everything — used on sign-out so nothing syncs under the next driver. */
export async function clearOutbox(): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    await new Promise<void>((res) => { tx.oncomplete = () => res(); });
    db.close();
  } catch { /* nothing to clear */ }
}
