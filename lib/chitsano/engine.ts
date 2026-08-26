import "server-only";
import { READ_TOOLS, WRITE_TOOLS, CAPABILITIES } from "./tools";
import { EXTRA_WRITE_TOOLS } from "./write-tools";
import type { Reply } from "./shared";

// Chitsano's brain — a free, built-in rules engine. It reads the manager's
// message, works out intent from keywords, and either answers from live data
// (read tools) or proposes one of the two confirm-gated actions. No external AI
// service, no API key, no cost. It's deliberately simple: it understands plain
// phrases about the fleet, not open-ended conversation.

const msg = (text: string): Reply => ({ type: "message", text });
const err = (e: unknown): string => (e instanceof Error ? e.message : "Sorry, I couldn't do that.");

const FALLBACK =
  "I didn't quite catch that. I can help with vehicles, drivers, accidents, trips, attendance, logins and finance — or assign a vehicle. Try \"who isn't logging in?\" or type \"help\".";

/** Strip framing words from a captured phrase so only the entity remains. */
function clean(s: string): string {
  return s
    .replace(/\b(the|a|an|please|to|our|my|vehicle|car|truck|driver)\b/gi, " ")
    .replace(/[?.!,]+$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPoolVehicle(text: string): string {
  return text
    .replace(/\b(make|mark|set|turn|unmark|remove|please|the|a|an|as|into|from|not|no|longer|stop|being|to|be|is|isn'?t)\b/gi, " ")
    .replace(/\bpool\b/gi, " ")
    .replace(/\b(car|vehicle|truck|lorry|bakkie|tanker|shared)\b/gi, " ")
    .replace(/[?.!,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Drop a trailing time qualifier ("this week", "today", …) from a captured phrase. */
function stripTail(s: string): string {
  const cut = s
    .replace(/\b(this|last|past|recent(ly)?|today|yesterday|so far|lately|please)\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return cut || s.trim();
}

/**
 * Every plate in the fleet is three letters and four digits — "AFQ 3770".
 * Allowing three digits made ordinary phrases look like plates: "for 150" in
 * "price a run for Flora Gas for 150 km" matched as a vehicle.
 */
const PLATE_RE = /\b([a-z]{3}\s?\d{4})\b/i;
function plateIn(text: string): string {
  return (text.match(PLATE_RE) ?? [])[1] ?? "";
}

export async function ask(raw: string, opts?: { allowFinance?: boolean }): Promise<Reply> {
  const text = (raw ?? "").trim();
  const t = text.toLowerCase();
  if (!t) return msg("Ask me something about the fleet — try \"who isn't logging in?\"");

  // Greeting → friendly capabilities intro. A bare "help" / "what can you do"
  // is handled at the very end, so "help me assign X to Y" still runs the action.
  if (/^(hi|hie|hey|hello|yo|greetings|good (morning|afternoon|evening))\b/.test(t)) {
    return msg(CAPABILITIES);
  }

  // ── ACTIONS (checked before reads; they contain fleet nouns) ───────────────
  // Assign a vehicle to a driver.
  const assign = t.match(/(?:assign|allocate|give)\s+(.+?)\s+to\s+(.+)/i);
  if (assign) {
    const vehicle = clean(assign[1]);
    const driver = clean(assign[2]);
    try {
      const p = await WRITE_TOOLS.assign_vehicle.propose({ vehicle, driver });
      return { type: "proposal", text: "", proposal: { action: "assign_vehicle", ...p } };
    } catch (e) {
      return msg(err(e));
    }
  }

  // Record money in — "Flora Gas paid 12,000 today by transfer".
  const paid = t.match(
    /(.+?)\s+(?:paid|has paid|settled|sent|deposited|transferred)\s+(?:us\s+)?\$?\s*([\d,]+(?:\.\d{1,2})?)/i,
  );
  // "how much did X pay us?" is a question about money, not a receipt.
  if (paid && !/\bhow much\b/.test(t)) {
    const customer = clean(stripTail(paid[1]));
    const amount = Number(paid[2].replace(/,/g, ""));
    const method = /\b(transfer|eft|bank)\b/.test(t) ? "bank_transfer"
      : /\bcash\b/.test(t) ? "cash"
      : /\b(ecocash|mobile money)\b/.test(t) ? "ecocash"
      : /\b(cheque|check)\b/.test(t) ? "cheque" : null;
    try {
      const p = await EXTRA_WRITE_TOOLS.record_receipt.propose({ customer, amount, method });
      return { type: "proposal", text: "", proposal: { action: "record_receipt", ...p } };
    } catch (e) { return msg(err(e)); }
  }

  // Price a run. Both "charge CT Mining for 420km in AGH 5221" and "price a run
  // for Flora Gas for 150 km with AFQ 3770" put the customer before the distance.
  const quote = t.match(
    /(?:quote|charge|price|cost)\b(?:\s+(?:a\s+)?(?:run|job|trip))?\s+(?:for\s+)?(.+?)\s+(?:for\s+)?\d+(?:\.\d+)?\s*(?:km|kilomet)/i,
  );
  if (quote) {
    const km = Number((t.match(/(\d+(?:\.\d+)?)\s*(?:km|kilomet)/) ?? [])[1]);
    const customer = clean(stripTail(quote[1]))
      .replace(/\b(for|in|with|using|on|run|job|trip)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    try {
      const p = await EXTRA_WRITE_TOOLS.quote_work.propose({
        customer, vehicle: plateIn(text), distance_km: km,
      });
      return { type: "proposal", text: "", proposal: { action: "quote_work", ...p } };
    } catch (e) { return msg(err(e)); }
  }

  // Log a job — "log a job for CT Mining from Harare to Gwanda, 420km".
  const job = t.match(
    /(?:log|book|create|add|new)\s+(?:a\s+)?(?:transport\s+)?job\b(?:\s+for\s+(.+?))?(?:\s+from\s+(.+?))?(?:\s+to\s+(.+?))?$/i,
  );
  if (job) {
    const km = Number((t.match(/(\d+(?:\.\d+)?)\s*(?:km|kilomet)/) ?? [])[1]);
    const trimKm = (v: string) => clean(v.replace(/\b\d+(?:\.\d+)?\s*km\b.*$/i, ""));
    try {
      const p = await EXTRA_WRITE_TOOLS.log_job.propose({
        customer: clean(stripTail(job[1] ?? "")),
        pickup: trimKm(job[2] ?? ""),
        dropoff: trimKm(job[3] ?? ""),
        distance_km: Number.isFinite(km) ? km : undefined,
      });
      return { type: "proposal", text: "", proposal: { action: "log_job", ...p } };
    } catch (e) { return msg(err(e)); }
  }

  // Move a fault along — "resolve the fault on AHO 3790".
  if (/\bfault\b/.test(t) && /\b(resolve[d]?|fix(ed)?|close[d]?|acknowledge[d]?|ack)\b/.test(t)) {
    const status = /\b(resolve[d]?|fixed|close[d]?|sorted|repaired)\b/.test(t) ? "resolved" : "acknowledged";
    const subject = clean(
      text.replace(/\b(resolve[d]?|fix(ed)?|close[d]?|acknowledge[d]?|ack|the|fault|on|please)\b/gi, " "),
    );
    try {
      const p = await EXTRA_WRITE_TOOLS.set_fault_status.propose({ fault: subject, status });
      return { type: "proposal", text: "", proposal: { action: "set_fault_status", ...p } };
    } catch (e) { return msg(err(e)); }
  }
  // Mark / unmark a pool vehicle (needs an action verb + the word "pool").
  if (/\bpool\b/.test(t) && /\b(make|mark|set|turn|unmark|remove|change)\b/.test(t)) {
    const isPool = !/\b(not|un ?mark|unmark|remove|stop|no longer|out of)\b/.test(t);
    const vehicle = extractPoolVehicle(text);
    try {
      const p = await WRITE_TOOLS.set_vehicle_pool.propose({ vehicle, is_pool: isPool });
      return { type: "proposal", text: "", proposal: { action: "set_vehicle_pool", ...p } };
    } catch (e) {
      return msg(err(e));
    }
  }

  // ── READS ──────────────────────────────────────────────────────────────────
  if (/\b(log ?ins?|logging in|logged in|sign ?in|signing in|signed in|dormant|inactive|not using|who.*(using|online))\b/.test(t)) {
    return msg(await READ_TOOLS.get_login_activity.run({}));
  }

  if (/\b(accidents?|crash(es)?|incidents?|collisions?|bump(ed)?)\b/.test(t)) {
    const status = /\b(open|reported|new)\b/.test(t)
      ? "reported"
      : /\binvestigat/.test(t)
        ? "investigating"
        : /\b(closed|resolved|settled)\b/.test(t)
          ? "closed"
          : undefined;
    return msg(await READ_TOOLS.list_accidents.run({ status }));
  }

  if (/\b(faults?|defects?|breakdowns?|broke\s?down|snags?|what.?s? broken)\b/.test(t)) {
    const status = /\b(fixed|resolved|repaired|sorted|done)\b/.test(t) ? "resolved" : undefined;
    const plate = text.match(PLATE_RE);
    const params: Record<string, string> = {};
    if (status) params.status = status;
    if (plate) params.vehicle = plate[1].trim();
    return msg(await READ_TOOLS.list_faults.run(params));
  }

  if (/\b(attendance|checked ?in|check ?in|clock(ed)? in|present today|here today|absent|at work|came? in|come in|who.?s? in today|who is in today)\b/.test(t)) {
    return msg(await READ_TOOLS.get_attendance_today.run({}));
  }

  if (/\b(financ\w*|money|revenue|profit|debtors?|owe[ds]?|owing|receivables?|cash|income|expenses?|turnover)\b/.test(t)) {
    if (opts?.allowFinance === false) {
      return msg("I can't share financial figures in the team chat — ask me privately from the Chitsano assistant.");
    }
    return msg(await READ_TOOLS.get_finance_summary.run({}));
  }

  if (/\b(trips?|mileage|journeys?|routes?|kilomet|\bkm\b|distance|travell?ed)\b/.test(t)) {
    const plate = text.match(PLATE_RE); // a plate anywhere, e.g. "AFQ 3770"
    const byMatch = text.match(/\bby\s+(.+)$/i); // "…by <driver>"
    const forMatch = text.match(/\b(?:for|of)\s+(.+)$/i); // "…for <vehicle>"
    const params: Record<string, string> = {};
    if (plate) params.vehicle = plate[1].trim();
    else if (forMatch) params.vehicle = stripTail(clean(forMatch[1]));
    else if (byMatch) params.driver = stripTail(clean(byMatch[1]));
    return msg(await READ_TOOLS.list_recent_trips.run(params));
  }

  // Drivers vs. vehicles: if both nouns appear, go with whichever comes first.
  const drvIdx = t.search(/\bdrivers?\b/);
  const vehIdx = t.search(/\b(vehicles?|cars?|trucks?|lorr(y|ies)|bakkies?|tankers?|fleet)\b/);
  const wantsDriver = drvIdx >= 0 && (vehIdx < 0 || drvIdx < vehIdx);
  const wantsVehicle = vehIdx >= 0 && !wantsDriver;

  if (wantsDriver) {
    const unassigned = /\b(no vehicle|without.*vehicle|un ?assigned|not assigned|free|spare|available|idle)\b/.test(t);
    return msg(await READ_TOOLS.list_drivers.run(unassigned ? { unassigned_only: true } : {}));
  }

  if (wantsVehicle) {
    const pool = /\bpool\b/.test(t);
    const status = /\bavailable\b/.test(t)
      ? "available"
      : /\b(mainten|workshop|repair|service|broken)\b/.test(t)
        ? "maintenance"
        : /\b(on ?trip|out|dispatched)\b/.test(t)
          ? "on_trip"
          : undefined;
    return msg(await READ_TOOLS.list_vehicles.run({ pool_only: pool || undefined, status }));
  }

  // Nothing matched — a lingering "help" / capability ask becomes help, else nudge.
  if (/\b(help|what can (i|you)|what do you do|who are you|how do you work|commands?)\b/.test(t)) {
    return msg(CAPABILITIES);
  }
  return msg(FALLBACK);
}

/** Execute a confirmed action (or record a decline) against the write whitelist. */
export async function runAction(
  action: string,
  params: Record<string, unknown>,
  ctx: { profileId: string },
): Promise<string> {
  // Both maps: a proposal from write-tools.ts must be executable on confirm,
  // otherwise the manager taps yes and is told the action does not exist.
  const tool = WRITE_TOOLS[action] ?? EXTRA_WRITE_TOOLS[action];
  if (!tool) return "That action isn't available.";
  return tool.execute(params ?? {}, ctx);
}
