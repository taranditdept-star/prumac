/**
 * Tiny IndexedDB buffer for GPS pings while offline.
 * Stores pings keyed by trip_id; flush sends them all and clears the store.
 */

const DB_NAME = "prumac-gps";
const DB_VERSION = 1;
const STORE = "pings";

interface BufferedPing {
  trip_id: string;
  recorded_at: string;
  lat: number;
  lng: number;
  speed_kph?: number | null;
  heading_deg?: number | null;
  accuracy_m?: number | null;
  altitude_m?: number | null;
  battery_pct?: number | null;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { autoIncrement: true });
        store.createIndex("trip", "trip_id");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function bufferPings(pings: BufferedPing[]): Promise<void> {
  if (!pings.length) return;
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  for (const p of pings) store.add(p);
  await new Promise<void>((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  db.close();
}

export async function drainBufferForTrip(tripId: string): Promise<BufferedPing[]> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  const index = store.index("trip");
  const results: BufferedPing[] = [];
  const keysToDelete: IDBValidKey[] = [];

  await new Promise<void>((res, rej) => {
    const req = index.openCursor(IDBKeyRange.only(tripId));
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        results.push(cursor.value as BufferedPing);
        keysToDelete.push(cursor.primaryKey);
        cursor.continue();
      } else {
        res();
      }
    };
    req.onerror = () => rej(req.error);
  });

  for (const k of keysToDelete) store.delete(k);
  await new Promise<void>((res) => {
    tx.oncomplete = () => res();
  });
  db.close();
  return results;
}

export async function bufferedCountForTrip(tripId: string): Promise<number> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readonly");
    const count = await new Promise<number>((res, rej) => {
      const req = tx.objectStore(STORE).index("trip").count(IDBKeyRange.only(tripId));
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    db.close();
    return count;
  } catch {
    return 0;
  }
}
