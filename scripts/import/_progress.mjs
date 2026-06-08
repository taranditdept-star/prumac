import { pgClient } from "./lib.mjs";
const c = await pgClient();
const total = (await c.query("SELECT count(*)::int n FROM app.trips")).rows[0].n;
const imported = (await c.query("SELECT count(*)::int n FROM import.entity_map WHERE kind='trip'")).rows[0].n;
const completed = (await c.query("SELECT count(*)::int n FROM app.trips WHERE status='completed'")).rows[0].n;
const batch = (await c.query("SELECT status FROM import.batches ORDER BY created_at DESC LIMIT 1")).rows[0];
console.log({ trips_total: total, completed, import_mapped: imported, batch_status: batch.status });
await c.end();
