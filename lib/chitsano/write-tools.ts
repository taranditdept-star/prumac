import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import type { WriteTool } from "./tools";

/**
 * The rest of Chitsano's hands.
 *
 * It could describe the whole fleet but only *do* two things, so every actual
 * change still meant leaving the chat and finding the right screen. These cover
 * the jobs a manager does over and over.
 *
 * Same contract as the original two: propose() validates and describes in plain
 * words without touching anything, execute() runs only after the manager taps
 * confirm. Nothing here writes on its own.
 */

const service = () => createServiceClient();
const app = () => service().schema("app");
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const money = (n: number, ccy = "USD") =>
  `${ccy} ${Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function resolveSubsidiary(q: string): Promise<{ id: string; name: string }> {
  const term = q.trim();
  if (!term) throw new Error("Which customer?");
  const { data } = await app()
    .from("subsidiaries")
    .select("id, name, code")
    .or(`name.ilike.%${term}%,code.ilike.%${term}%`)
    .eq("is_active", true)
    .limit(5)
    .returns<{ id: string; name: string; code: string }[]>();
  if (!data || data.length === 0) throw new Error(`I couldn't find a customer matching "${term}".`);
  if (data.length > 1) {
    const exact = data.find((d) => d.name.toLowerCase() === term.toLowerCase());
    if (!exact) throw new Error(`Did you mean one of: ${data.map((d) => d.name).join(", ")}?`);
    return exact;
  }
  return data[0];
}

async function resolveVehicleLite(q: string): Promise<{ id: string; plate_number: string; make: string; model: string }> {
  const term = q.trim().replace(/\s+/g, " ");
  if (!term) throw new Error("Which vehicle?");
  const { data } = await app()
    .from("vehicles")
    .select("id, plate_number, make, model")
    .or(`plate_number.ilike.%${term}%,make.ilike.%${term}%,model.ilike.%${term}%`)
    .neq("status", "decommissioned")
    .limit(5)
    .returns<{ id: string; plate_number: string; make: string; model: string }[]>();
  if (!data || data.length === 0) throw new Error(`I couldn't find a vehicle matching "${term}".`);
  if (data.length > 1) {
    const exact = data.find((d) => d.plate_number.toLowerCase().replace(/\s/g, "") === term.toLowerCase().replace(/\s/g, ""));
    if (!exact) throw new Error(`Did you mean: ${data.map((d) => d.plate_number).join(", ")}?`);
    return exact;
  }
  return data[0];
}

// ── Log a transport job ──────────────────────────────────────────────────────
const logJob: WriteTool = {
  async propose(input) {
    const sub = await resolveSubsidiary(str(input.customer));
    const from = str(input.pickup);
    const to = str(input.dropoff);
    if (!from || !to) throw new Error("Tell me where it collects from and where it goes.");
    const km = Number(input.distance_km);
    const distance = Number.isFinite(km) && km > 0 ? Math.round(km * 10) / 10 : null;
    return {
      title: "Log a transport job",
      summary:
        `Log a job for ${sub.name}: ${from} → ${to}` +
        (distance ? `, about ${distance} km` : "") +
        `. It goes on the dispatch board as "requested", ready to be priced.`,
      params: { subsidiary_id: sub.id, customer: sub.name, pickup_label: from, dropoff_label: to, distance_km: distance },
    };
  },
  async execute(params, ctx) {
    const { data, error } = await app()
      .from("transport_jobs")
      .insert({
        subsidiary_id: String(params.subsidiary_id),
        pickup_label: String(params.pickup_label),
        dropoff_label: String(params.dropoff_label),
        distance_km: params.distance_km ?? null,
        requested_by: ctx.profileId,
        status: "requested",
      })
      .select("reference")
      .single<{ reference: string }>();
    if (error) return `Could not log the job: ${error.message}`;
    return `Done — ${data.reference} is on the dispatch board for ${params.customer}. Price it when you're ready.`;
  },
};

// ── Quote a job off the rate card ────────────────────────────────────────────
// A read in spirit, but it is confirm-gated because it writes the quote onto
// the job, and a quote is a number a customer will be held to.
const quoteWork: WriteTool = {
  async propose(input) {
    const sub = await resolveSubsidiary(str(input.customer));
    const veh = await resolveVehicleLite(str(input.vehicle));
    const km = Number(input.distance_km);
    if (!Number.isFinite(km) || km <= 0) throw new Error("How many kilometres is the run?");

    interface QuoteRow { rate_id: string; mode: string; unit_amount: number; amount: number; currency: string }
    const { data } = await service().schema("app").rpc("fn_quote_job", {
      p_vehicle_id: veh.id, p_subsidiary_id: sub.id, p_distance_km: km, p_load_count: 1,
    });
    const q = (data as unknown as QuoteRow[] | null)?.[0];
    if (!q) {
      throw new Error(`${veh.plate_number} has no rate on file for ${sub.name}, so I can't price it. Add a rate first.`);
    }
    return {
      title: "Quote this work",
      summary:
        `${veh.plate_number} for ${sub.name} over ${km} km at ${q.unit_amount} per km ` +
        `comes to ${money(Number(q.amount), q.currency)}. Shall I log it as a quoted job?`,
      params: {
        subsidiary_id: sub.id, customer: sub.name, vehicle_id: veh.id, plate: veh.plate_number,
        distance_km: km, rate_id: q.rate_id, mode: q.mode, unit: q.unit_amount,
        amount: q.amount, currency: q.currency,
        pickup_label: str(input.pickup) || "To be confirmed",
        dropoff_label: str(input.dropoff) || "To be confirmed",
      },
    };
  },
  async execute(params, ctx) {
    const { data, error } = await app()
      .from("transport_jobs")
      .insert({
        subsidiary_id: String(params.subsidiary_id),
        pickup_label: String(params.pickup_label),
        dropoff_label: String(params.dropoff_label),
        distance_km: params.distance_km,
        vehicle_id: String(params.vehicle_id),
        quoted_rate_id: String(params.rate_id),
        quoted_mode: String(params.mode),
        quoted_unit: params.unit,
        quoted_amount: params.amount,
        quoted_currency: String(params.currency),
        quoted_at: new Date().toISOString(),
        quoted_by: ctx.profileId,
        requested_by: ctx.profileId,
        status: "quoted",
      })
      .select("reference")
      .single<{ reference: string }>();
    if (error) return `Could not save the quote: ${error.message}`;
    return `Done — ${data.reference} is quoted at ${money(Number(params.amount), String(params.currency))} for ${params.customer}.`;
  },
};

// ── Record money received ────────────────────────────────────────────────────
const recordReceiptTool: WriteTool = {
  async propose(input) {
    const sub = await resolveSubsidiary(str(input.customer));
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("How much came in?");

    const { data: open } = await app()
      .from("invoices")
      .select("id, invoice_number, balance_outstanding")
      .eq("subsidiary_id", sub.id)
      .in("status", ["issued", "overdue"])
      .gt("balance_outstanding", 0)
      .order("due_at", { ascending: true, nullsFirst: false })
      .returns<{ id: string; invoice_number: string; balance_outstanding: number }[]>();
    if (!open || open.length === 0) throw new Error(`${sub.name} has no unpaid invoices.`);

    // Same oldest-first split the receipts screen uses, in integer cents.
    const cents = (n: number) => Math.round(n * 100);
    let remaining = cents(amount);
    const plan: { id: string; invoice_number: string; amount: number }[] = [];
    for (const inv of open) {
      if (remaining <= 0) break;
      const owed = cents(Number(inv.balance_outstanding));
      if (owed <= 0) continue;
      const take = Math.min(owed, remaining);
      plan.push({ id: inv.id, invoice_number: inv.invoice_number, amount: take / 100 });
      remaining -= take;
    }
    const unapplied = remaining / 100;
    return {
      title: "Record a receipt",
      summary:
        `Record ${money(amount)} received from ${sub.name}. It settles ` +
        plan.map((p) => `${p.invoice_number} (${money(p.amount)})`).join(", ") +
        (unapplied > 0 ? `, leaving ${money(unapplied)} unapplied — check that against the deposit slip.` : "."),
      params: { customer: sub.name, plan, paid_at: str(input.paid_at) || new Date().toISOString().slice(0, 10), method: str(input.method) || null },
    };
  },
  async execute(params, ctx) {
    const plan = params.plan as { id: string; amount: number }[];
    const { error } = await app()
      .from("invoice_payments")
      .insert(
        plan.map((p) => ({
          invoice_id: p.id, amount: p.amount,
          paid_at: String(params.paid_at),
          method: params.method ? String(params.method) : null,
          recorded_by: ctx.profileId,
        })),
      );
    if (error) return `Could not record the receipt: ${error.message}`;
    return `Done — receipt recorded against ${plan.length} invoice${plan.length === 1 ? "" : "s"} for ${params.customer}.`;
  },
};

// ── Move a fault along ───────────────────────────────────────────────────────
const setFaultStatus: WriteTool = {
  async propose(input) {
    const term = str(input.fault);
    const target = str(input.status) === "resolved" ? "resolved" : "acknowledged";
    if (!term) throw new Error("Which fault? Give me the vehicle or a few words from the title.");

    const { data } = await app()
      .from("faults")
      .select("id, title, status, vehicles(plate_number)")
      .in("status", ["reported", "acknowledged"])
      .or(`title.ilike.%${term}%`)
      .limit(5)
      .returns<{ id: string; title: string; status: string; vehicles: { plate_number: string } | null }[]>();

    let match = data?.[0];
    if (!data || data.length === 0) {
      // Try again by plate — managers usually say "the fault on AHO 3790".
      const { data: byPlate } = await app()
        .from("faults")
        .select("id, title, status, vehicles!inner(plate_number)")
        .in("status", ["reported", "acknowledged"])
        .ilike("vehicles.plate_number", `%${term}%`)
        .limit(5)
        .returns<{ id: string; title: string; status: string; vehicles: { plate_number: string } | null }[]>();
      if (!byPlate || byPlate.length === 0) throw new Error(`I couldn't find an open fault matching "${term}".`);
      if (byPlate.length > 1) {
        throw new Error(`There are ${byPlate.length} open faults on that vehicle: ${byPlate.map((f) => f.title).join("; ")}. Which one?`);
      }
      match = byPlate[0];
    } else if (data.length > 1) {
      throw new Error(`Which one? ${data.map((f) => f.title).join("; ")}`);
    }

    return {
      title: target === "resolved" ? "Resolve a fault" : "Acknowledge a fault",
      summary: `Mark "${match!.title}"${match!.vehicles ? ` on ${match!.vehicles.plate_number}` : ""} as ${target}.`,
      params: { fault_id: match!.id, title: match!.title, status: target },
    };
  },
  async execute(params, ctx) {
    const patch: Record<string, unknown> = { status: String(params.status) };
    if (params.status === "resolved") {
      patch.resolved_at = new Date().toISOString();
      patch.resolved_by = ctx.profileId;
    }
    const { error } = await app().from("faults").update(patch).eq("id", String(params.fault_id));
    if (error) return `Could not update the fault: ${error.message}`;
    return `Done — "${params.title}" is now ${params.status}.`;
  },
};

export const EXTRA_WRITE_TOOLS: Record<string, WriteTool> = {
  log_job: logJob,
  quote_work: quoteWork,
  record_receipt: recordReceiptTool,
  set_fault_status: setFaultStatus,
};
