import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/service";
import { getLoginActivity } from "@/lib/ops/login-activity";
import { getOverview, resolvePeriod } from "@/lib/finance/reports";

// ── Tool contracts ───────────────────────────────────────────────────────────
export interface ReadTool {
  def: Anthropic.Tool;
  run: (input: Record<string, unknown>) => Promise<string>;
}
export interface WriteExecContext {
  profileId: string;
}
export interface WriteTool {
  def: Anthropic.Tool;
  // Validate + describe the action WITHOUT performing it. Throw a friendly
  // message if the reference is ambiguous or missing (the model relays it).
  propose: (
    input: Record<string, unknown>,
  ) => Promise<{ title: string; summary: string; params: Record<string, unknown> }>;
  // Perform the confirmed action. Only ever called from actions/chitsano.ts
  // after the user approves and after re-checking the role.
  execute: (params: Record<string, unknown>, ctx: WriteExecContext) => Promise<string>;
}

const sb = () => createServiceClient();
const app = () => sb().schema("app");
const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function harareToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Harare" });
}
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Shared lookups ───────────────────────────────────────────────────────────
interface VehLite {
  id: string;
  plate_number: string;
  make: string;
  model: string;
  status: string;
  is_pool: boolean;
  home_branch: string | null;
  default_subsidiary_id: string | null;
  current_odometer_km: number;
}

async function activeVehicles(): Promise<VehLite[]> {
  const { data } = await app()
    .from("vehicles")
    .select("id, plate_number, make, model, status, is_pool, home_branch, default_subsidiary_id, current_odometer_km")
    .neq("status", "decommissioned")
    .order("make")
    .returns<VehLite[]>();
  return data ?? [];
}

async function driverNameMap(): Promise<Map<string, { name: string; emp: string | null; active: boolean }>> {
  const { data } = await app()
    .from("drivers")
    .select("id, employee_number, is_active, profiles(full_name)")
    .returns<{ id: string; employee_number: string | null; is_active: boolean; profiles: { full_name: string | null } | null }[]>();
  const m = new Map<string, { name: string; emp: string | null; active: boolean }>();
  for (const d of data ?? []) {
    m.set(d.id, { name: d.profiles?.full_name ?? "Unnamed", emp: d.employee_number, active: d.is_active });
  }
  return m;
}

async function activeAssignments(): Promise<{ byVehicle: Map<string, string>; byDriver: Map<string, string> }> {
  const { data } = await app()
    .from("vehicle_assignments")
    .select("vehicle_id, driver_id")
    .is("ended_at", null)
    .returns<{ vehicle_id: string; driver_id: string }[]>();
  const byVehicle = new Map<string, string>();
  const byDriver = new Map<string, string>();
  for (const a of data ?? []) {
    byVehicle.set(a.vehicle_id, a.driver_id);
    byDriver.set(a.driver_id, a.vehicle_id);
  }
  return { byVehicle, byDriver };
}

async function subsidiaryMap(): Promise<Map<string, string>> {
  const { data } = await app().from("subsidiaries").select("id, name").returns<{ id: string; name: string }[]>();
  return new Map((data ?? []).map((s) => [s.id, s.name]));
}

// ── Resolution (for write tools) ─────────────────────────────────────────────
async function resolveVehicle(q: string): Promise<VehLite> {
  const needle = q.trim().toLowerCase();
  if (!needle) throw new Error("Which vehicle? Give me a plate number or make & model.");
  const all = await activeVehicles();
  const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  // Prefer an exact plate match, then a plate/make/model contains match.
  let hits = all.filter((v) => norm(v.plate_number) === norm(needle));
  if (hits.length === 0) {
    hits = all.filter(
      (v) => `${v.plate_number} ${v.make} ${v.model}`.toLowerCase().includes(needle) || norm(v.plate_number).includes(norm(needle)),
    );
  }
  if (hits.length === 0) throw new Error(`No active vehicle matches "${q}".`);
  if (hits.length > 1) {
    const list = hits.slice(0, 8).map((v) => `${v.plate_number} (${v.make} ${v.model})`).join(", ");
    throw new Error(`Several vehicles match "${q}": ${list}. Please name the exact plate.`);
  }
  return hits[0];
}

async function resolveDriver(q: string): Promise<{ id: string; name: string; emp: string | null }> {
  const needle = q.trim().toLowerCase();
  if (!needle) throw new Error("Which driver? Give me a name or Driver ID (e.g. PMD012).");
  const names = await driverNameMap();
  const hits = [...names.entries()]
    .filter(([, d]) => d.active)
    .filter(([, d]) => d.name.toLowerCase().includes(needle) || (d.emp ?? "").toLowerCase() === needle)
    .map(([id, d]) => ({ id, name: d.name, emp: d.emp }));
  if (hits.length === 0) throw new Error(`No active driver matches "${q}".`);
  if (hits.length > 1) {
    const list = hits.slice(0, 8).map((d) => `${d.name}${d.emp ? ` (${d.emp})` : ""}`).join(", ");
    throw new Error(`Several drivers match "${q}": ${list}. Please be more specific.`);
  }
  return hits[0];
}

// ── READ TOOLS ───────────────────────────────────────────────────────────────
const listVehicles: ReadTool = {
  def: {
    name: "list_vehicles",
    description:
      "List fleet vehicles with their status, home branch, current driver and whether they're a pool/shared vehicle. Use for questions about vehicles, availability, who drives what, or pool cars.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Optional filter by plate, make or model." },
        status: {
          type: "string",
          enum: ["available", "on_trip", "maintenance", "workshop"],
          description: "Optional status filter.",
        },
        pool_only: { type: "boolean", description: "If true, only pool/shared vehicles." },
      },
    },
  },
  async run(input) {
    const [vehicles, names, assigns, subs] = await Promise.all([
      activeVehicles(),
      driverNameMap(),
      activeAssignments(),
      subsidiaryMap(),
    ]);
    const q = str(input.query).toLowerCase();
    const status = str(input.status);
    let rows = vehicles;
    if (q) rows = rows.filter((v) => `${v.plate_number} ${v.make} ${v.model}`.toLowerCase().includes(q));
    if (status) rows = rows.filter((v) => v.status === status);
    if (input.pool_only === true) rows = rows.filter((v) => v.is_pool);
    if (rows.length === 0) return "No vehicles match that.";
    const lines = rows.slice(0, 60).map((v) => {
      const drvId = assigns.byVehicle.get(v.id);
      const drv = drvId ? names.get(drvId)?.name ?? "assigned" : v.is_pool ? "pool — any driver" : "no regular driver";
      const sub = v.default_subsidiary_id ? subs.get(v.default_subsidiary_id) : null;
      return `• ${v.plate_number} — ${v.make} ${v.model} — ${v.status}${v.is_pool ? " (pool)" : ""} — driver: ${drv}${v.home_branch ? ` — ${v.home_branch}` : ""}${sub ? ` — dept: ${sub}` : ""} — ${v.current_odometer_km.toLocaleString()} km`;
    });
    return `${rows.length} vehicle(s):\n${lines.join("\n")}`;
  },
};

const listDrivers: ReadTool = {
  def: {
    name: "list_drivers",
    description:
      "List drivers with their Driver ID, active status and the vehicle they are currently assigned to. Use for questions about drivers, who is assigned a vehicle, or who is free.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Optional filter by name or Driver ID." },
        unassigned_only: { type: "boolean", description: "If true, only drivers with no current vehicle." },
      },
    },
  },
  async run(input) {
    const [names, assigns, vehicles] = await Promise.all([driverNameMap(), activeAssignments(), activeVehicles()]);
    const vById = new Map(vehicles.map((v) => [v.id, v]));
    const q = str(input.query).toLowerCase();
    let rows = [...names.entries()].map(([id, d]) => ({ id, ...d }));
    rows = rows.filter((d) => d.active);
    if (q) rows = rows.filter((d) => d.name.toLowerCase().includes(q) || (d.emp ?? "").toLowerCase().includes(q));
    if (input.unassigned_only === true) rows = rows.filter((d) => !assigns.byDriver.get(d.id));
    rows.sort((a, b) => a.name.localeCompare(b.name));
    if (rows.length === 0) return "No drivers match that.";
    const lines = rows.slice(0, 80).map((d) => {
      const vId = assigns.byDriver.get(d.id);
      const veh = vId ? vById.get(vId) : null;
      const vehTxt = veh ? `${veh.plate_number} (${veh.make} ${veh.model})` : "no vehicle";
      return `• ${d.name}${d.emp ? ` [${d.emp}]` : ""} — ${vehTxt}`;
    });
    return `${rows.length} active driver(s):\n${lines.join("\n")}`;
  },
};

const listAccidents: ReadTool = {
  def: {
    name: "list_accidents",
    description:
      "List recent recorded accidents/incidents with severity, status, the vehicle, the reporting driver and location. Use for safety questions or 'any recent accidents'.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["reported", "investigating", "closed"], description: "Optional status filter." },
        limit: { type: "integer", description: "Max rows (default 15)." },
      },
    },
  },
  async run(input) {
    const limit = Math.min(Math.max(Number(input.limit) || 15, 1), 40);
    let q = app()
      .from("accidents")
      .select("occurred_at, severity, status, location_description, description, vehicle_id, reported_by")
      .order("occurred_at", { ascending: false })
      .limit(limit);
    const status = str(input.status);
    if (status) q = q.eq("status", status);
    const { data } = await q.returns<
      { occurred_at: string; severity: string; status: string; location_description: string; description: string; vehicle_id: string; reported_by: string }[]
    >();
    if (!data || data.length === 0) return status ? `No ${status} accidents on record.` : "No accidents on record.";
    const [vehicles, names] = await Promise.all([activeVehicles(), driverNameMap()]);
    const plateById = new Map(vehicles.map((v) => [v.id, v.plate_number]));
    const lines = data.map((a) => {
      const plate = plateById.get(a.vehicle_id) ?? "vehicle";
      const drv = names.get(a.reported_by)?.name ?? "driver";
      const desc = a.description.length > 90 ? `${a.description.slice(0, 90)}…` : a.description;
      return `• ${fmtDate(a.occurred_at)} — ${a.severity.toUpperCase()} — ${a.status} — ${plate} — reported by ${drv} — ${a.location_description}: "${desc}"`;
    });
    return `${data.length} accident(s):\n${lines.join("\n")}`;
  },
};

const listTrips: ReadTool = {
  def: {
    name: "list_recent_trips",
    description: "List recent trips with date, vehicle, driver, distance and purpose. Use for trip/mileage questions.",
    input_schema: {
      type: "object",
      properties: {
        vehicle: { type: "string", description: "Optional plate/make/model to filter to one vehicle." },
        limit: { type: "integer", description: "Max rows (default 15)." },
      },
    },
  },
  async run(input) {
    const limit = Math.min(Math.max(Number(input.limit) || 15, 1), 40);
    let vehicleId: string | null = null;
    const vehRef = str(input.vehicle);
    if (vehRef) {
      try {
        vehicleId = (await resolveVehicle(vehRef)).id;
      } catch (e) {
        return e instanceof Error ? e.message : "Could not find that vehicle.";
      }
    }
    let q = app()
      .from("trips")
      .select("started_at, purpose, status, start_odometer_km, end_odometer_km, vehicle_id, driver_id, subsidiary_id")
      .order("started_at", { ascending: false })
      .limit(limit);
    if (vehicleId) q = q.eq("vehicle_id", vehicleId);
    const { data } = await q.returns<
      { started_at: string | null; purpose: string; status: string; start_odometer_km: number | null; end_odometer_km: number | null; vehicle_id: string; driver_id: string; subsidiary_id: string }[]
    >();
    if (!data || data.length === 0) return "No trips match that.";
    const [vehicles, names, subs] = await Promise.all([activeVehicles(), driverNameMap(), subsidiaryMap()]);
    const plateById = new Map(vehicles.map((v) => [v.id, v.plate_number]));
    const lines = data.map((t) => {
      const plate = plateById.get(t.vehicle_id) ?? "vehicle";
      const drv = names.get(t.driver_id)?.name ?? "driver";
      const km = t.start_odometer_km != null && t.end_odometer_km != null ? `${(t.end_odometer_km - t.start_odometer_km).toLocaleString()} km` : "—";
      return `• ${fmtDate(t.started_at)} — ${plate} — ${drv} — ${km} — ${t.purpose} — ${t.status} — ${subs.get(t.subsidiary_id) ?? ""}`;
    });
    return `${data.length} trip(s):\n${lines.join("\n")}`;
  },
};

const attendanceToday: ReadTool = {
  def: {
    name: "get_attendance_today",
    description: "Today's staff attendance — who has marked in and who hasn't yet. Use for attendance questions.",
    input_schema: { type: "object", properties: {} },
  },
  async run() {
    const date = harareToday();
    const [{ data: profiles }, { data: marks }] = await Promise.all([
      app().from("profiles").select("id, full_name, role").neq("role", "subsidiary_billing").eq("is_active", true).order("full_name").returns<{ id: string; full_name: string | null; role: string }[]>(),
      app().from("attendance").select("profile_id").eq("attendance_date", date).returns<{ profile_id: string }[]>(),
    ]);
    const marked = new Set((marks ?? []).map((m) => m.profile_id));
    const people = profiles ?? [];
    const inList = people.filter((p) => marked.has(p.id));
    const outList = people.filter((p) => !marked.has(p.id));
    const notIn = outList.slice(0, 40).map((p) => `• ${p.full_name ?? "Unnamed"} (${p.role})`).join("\n");
    return `Attendance for ${date}: ${inList.length} of ${people.length} checked in.\nNot yet in (${outList.length}):\n${notIn || "everyone is in"}`;
  },
};

const loginActivity: ReadTool = {
  def: {
    name: "get_login_activity",
    description:
      "Who is actually signing in to the app vs. who isn't. Returns counts and the dormant / never-logged-in accounts. Use for 'who isn't logging in' questions.",
    input_schema: { type: "object", properties: {} },
  },
  async run() {
    const a = await getLoginActivity();
    const flag = a.rows
      .filter((r) => r.status === "never" || r.status === "dormant")
      .slice(0, 40)
      .map((r) => `• ${r.name} (${r.role}${r.loginId ? `, ${r.loginId}` : ""}) — ${r.status === "never" ? "never logged in" : `${r.daysSince}d ago`}`)
      .join("\n");
    return `Login activity — active(≤7d): ${a.summary.active}, idle(8–30d): ${a.summary.idle}, dormant(30d+): ${a.summary.dormant}, never: ${a.summary.never}, of ${a.summary.total} accounts.\nNeeds attention:\n${flag || "everyone is signing in regularly"}`;
  },
};

const financeSummary: ReadTool = {
  def: {
    name: "get_finance_summary",
    description:
      "Headline finance figures over the last 12 months: revenue, expenses, net profit, margin, receivables (money owed), overdue and top debtors. All in USD. Use for money/finance questions.",
    input_schema: { type: "object", properties: {} },
  },
  async run() {
    const service = createServiceClient();
    const period = resolvePeriod({});
    const o = await getOverview(service as unknown as Parameters<typeof getOverview>[0], period);
    const debtors = o.topDebtors.map((d) => `• ${d.name}: ${money(d.amount)}`).join("\n");
    return [
      `Finance summary (${period.label}, USD):`,
      `Revenue: ${money(o.revenue)}`,
      `Expenses: ${money(o.expenses)}`,
      `Net profit: ${money(o.netProfit)} (margin ${o.margin.toFixed(1)}%)`,
      `Receivables (owed to us): ${money(o.receivables)}, of which overdue ${money(o.overdue)}`,
      `Cash received: ${money(o.cashReceipts)}`,
      `Top debtors:\n${debtors || "none"}`,
    ].join("\n");
  },
};

// ── WRITE TOOLS (propose → confirm → execute) ────────────────────────────────
const assignVehicle: WriteTool = {
  def: {
    name: "assign_vehicle",
    description:
      "Assign a vehicle to a driver as their current vehicle. This is a change that the manager must confirm before it happens. Identify the vehicle by plate and the driver by name or Driver ID.",
    input_schema: {
      type: "object",
      properties: {
        vehicle: { type: "string", description: "Vehicle plate number (or make & model)." },
        driver: { type: "string", description: "Driver name or Driver ID (e.g. PMD012)." },
      },
      required: ["vehicle", "driver"],
    },
  },
  async propose(input) {
    const veh = await resolveVehicle(str(input.vehicle));
    const drv = await resolveDriver(str(input.driver));
    return {
      title: "Assign vehicle",
      summary: `Assign ${veh.plate_number} (${veh.make} ${veh.model}) to ${drv.name}${drv.emp ? ` [${drv.emp}]` : ""}. This ends any current assignment on that vehicle and on that driver.`,
      params: { vehicle_id: veh.id, driver_id: drv.id, plate: veh.plate_number, driverName: drv.name },
    };
  },
  async execute(params, ctx) {
    const service = createServiceClient();
    const vehicle_id = String(params.vehicle_id);
    const driver_id = String(params.driver_id);
    const now = new Date().toISOString();
    // Close any open assignment on the vehicle and on the driver first.
    await service.schema("app").from("vehicle_assignments").update({ ended_at: now }).eq("vehicle_id", vehicle_id).is("ended_at", null);
    await service.schema("app").from("vehicle_assignments").update({ ended_at: now }).eq("driver_id", driver_id).is("ended_at", null);
    const { error } = await service.schema("app").from("vehicle_assignments").insert({ vehicle_id, driver_id, assigned_by: ctx.profileId });
    if (error) {
      if (error.code === "23P01" || error.code === "23505") return "That vehicle was just assigned to someone else — please try again.";
      return `Could not assign the vehicle: ${error.message}`;
    }
    return `Done — ${params.plate} is now assigned to ${params.driverName}.`;
  },
};

const setVehiclePool: WriteTool = {
  def: {
    name: "set_vehicle_pool",
    description:
      "Mark a vehicle as a pool/shared vehicle (any driver can use it, driver chosen per trip) or unmark it. The manager must confirm before it happens.",
    input_schema: {
      type: "object",
      properties: {
        vehicle: { type: "string", description: "Vehicle plate number (or make & model)." },
        is_pool: { type: "boolean", description: "true = make it a pool/shared vehicle; false = normal assigned vehicle." },
      },
      required: ["vehicle", "is_pool"],
    },
  },
  async propose(input) {
    const veh = await resolveVehicle(str(input.vehicle));
    const isPool = input.is_pool === true || input.is_pool === "true";
    return {
      title: isPool ? "Mark as pool vehicle" : "Unmark pool vehicle",
      summary: isPool
        ? `Mark ${veh.plate_number} (${veh.make} ${veh.model}) as a shared / pool vehicle — any driver can use it and the driver is picked per trip.`
        : `Mark ${veh.plate_number} (${veh.make} ${veh.model}) as a normally-assigned vehicle (not pool).`,
      params: { vehicle_id: veh.id, plate: veh.plate_number, is_pool: isPool },
    };
  },
  async execute(params) {
    const service = createServiceClient();
    const { error } = await service.schema("app").from("vehicles").update({ is_pool: params.is_pool === true }).eq("id", String(params.vehicle_id));
    if (error) return `Could not update the vehicle: ${error.message}`;
    return `Done — ${params.plate} is now ${params.is_pool === true ? "a pool / shared vehicle" : "a normally-assigned vehicle"}.`;
  },
};

// ── Registries ───────────────────────────────────────────────────────────────
export const READ_TOOLS: Record<string, ReadTool> = {
  list_vehicles: listVehicles,
  list_drivers: listDrivers,
  list_accidents: listAccidents,
  list_recent_trips: listTrips,
  get_attendance_today: attendanceToday,
  get_login_activity: loginActivity,
  get_finance_summary: financeSummary,
};

export const WRITE_TOOLS: Record<string, WriteTool> = {
  assign_vehicle: assignVehicle,
  set_vehicle_pool: setVehiclePool,
};

export const ALL_TOOL_DEFS: Anthropic.Tool[] = [
  ...Object.values(READ_TOOLS).map((t) => t.def),
  ...Object.values(WRITE_TOOLS).map((t) => t.def),
];

export function buildSystemPrompt(): string {
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Harare" });
  return `You are Chitsano, the AI assistant built into PRUMAC Connect — a fleet-management system for Ensign Holdings, operating in Zimbabwe and South Africa. You are talking to a fleet manager or admin. Today is ${today} (Africa/Harare). All money is in US dollars.

What you can do:
- Answer questions about the fleet from live data using your tools: vehicles, drivers, accidents, trips, attendance, who is (and isn't) logging in, and finance headlines.
- Perform two actions, each of which the manager MUST confirm before it happens: assign a vehicle to a driver, and mark a vehicle as pool/shared (or not). When you call one of those tools, the manager sees a confirmation card — so state plainly what you intend to do.

How to work:
- When a question needs current data, call the relevant tool rather than guessing. Use one tool at a time.
- Keep answers short, plain and friendly — these are busy, non-technical operators. Prefer a sentence or a small bullet list over big tables. Lead with the answer.
- If a vehicle or driver reference is ambiguous, ask which one rather than guessing.
- If a tool returns nothing, say so honestly. Never invent vehicles, drivers, numbers or accidents.
- You can only assign vehicles and set pool status. For anything else (deleting records, editing finance, reporting an accident, changing settings), explain that you can't do it here yet and point them to the right screen.`;
}
