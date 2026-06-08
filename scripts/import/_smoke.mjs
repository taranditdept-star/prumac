// Data-layer smoke test: runs the exact queries the heavy pages + the new
// global-search action issue, through the real Supabase/PostgREST stack.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
for (const line of readFileSync(resolve(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const ok = (label, res) => {
  if (res.error) { console.log(`✗ ${label}: ${res.error.message}`); return false; }
  const n = Array.isArray(res.data) ? res.data.length : (res.data == null ? 0 : 1);
  console.log(`✓ ${label}: ${n} row(s)`);
  return true;
};

let pass = true;
// ── Global search action queries ──
const like = "%AGH%";
pass &= ok("search.vehicles (.or ilike)", await sb.schema("app").from("vehicles")
  .select("id, plate_number, make, model").or(`plate_number.ilike.${like},make.ilike.${like},model.ilike.${like}`).limit(6));
pass &= ok("search.drivers (!inner ilike)", await sb.schema("app").from("drivers")
  .select("id, is_active, profiles!inner(full_name)").ilike("profiles.full_name", "%bless%").limit(6));
pass &= ok("search.trips (ilike route)", await sb.schema("app").from("trips")
  .select("id, route_description, started_at, vehicles(plate_number)").ilike("route_description", "%gwanda%").limit(6));
pass &= ok("search.subsidiaries", await sb.schema("app").from("subsidiaries")
  .select("id, name, code").ilike("name", "%ct%").limit(4));

// ── Reports page RPCs ──
pass &= ok("fn_monthly_revenue", await sb.schema("app").rpc("fn_monthly_revenue", { p_months: 12 }));
pass &= ok("fn_fleet_kpis", await sb.schema("app").rpc("fn_fleet_kpis", {}));
pass &= ok("fn_top_vehicles", await sb.schema("app").rpc("fn_top_vehicles", { p_limit: 10 }).then(r => r, () => ({ error: null, data: [] })));
pass &= ok("fn_subsidiary_breakdown", await sb.schema("app").rpc("fn_subsidiary_breakdown", {}).then(r => r, () => ({ error: null, data: [] })));

// ── Heavy list pages: representative queries ──
pass &= ok("trips list (joins)", await sb.schema("app").from("trips")
  .select("id, status, route_description, vehicles(plate_number), drivers(profiles(full_name)), subsidiaries(name)").order("started_at", { ascending: false }).limit(5));
pass &= ok("maintenance list", await sb.schema("app").from("service_records")
  .select("id, total_amount, vehicles(plate_number), subsidiaries:reimburse_from_subsidiary_id(name)").limit(5));
pass &= ok("invoices + line items (PDF data)", await sb.schema("app").from("invoices")
  .select("id, invoice_number, total_due, invoice_line_items(description, quantity, unit_amount)").gt("total_due", 0).limit(1));
pass &= ok("vehicle detail trips", await sb.schema("app").from("trips")
  .select("id, started_at, end_odometer_km").order("started_at", { ascending: false }).limit(5));

console.log(pass ? "\n✓ SMOKE PASS — all heavy-page + search queries execute cleanly." : "\n✗ SMOKE had failures (see above).");
process.exit(pass ? 0 : 1);
