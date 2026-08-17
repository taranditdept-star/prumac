import "server-only";

/**
 * Chitsano's accident review — a RULES-BASED comparison, not a language model.
 *
 * Chitsano has no LLM (deliberately: no API key, no cost). So this does what a
 * keyword engine honestly can:
 *   • spot which causal factors each account raises (brakes, tyres, speed, …)
 *   • flag where the accounts DISAGREE — one side raises a factor the other is
 *     silent on, or they blame different things
 *   • compare stated numbers (speed) and hard facts (injuries, police, third party)
 *   • suggest a verdict with a confidence level
 *
 * What it CANNOT do, and must never imply: understand the narrative, weigh
 * credibility, or judge fault. Every output is framed as "for the committee to
 * confirm", and the summary says outright that it is keyword-based.
 */

export interface ReviewInput {
  driverStatement: string;
  committeeText: string;
  /** Text OCR'd from photos, if the operator ran it. */
  imageText?: string;
  facts: {
    severity: string;
    injuries: boolean;
    otherParties: boolean;
    policeReport: string | null;
    occurredAt: string;
    speedLimitHint?: number | null;
  };
  counts: { photos: number; videos: number; audios: number; documents: number };
}

export interface ReviewOutput {
  /** One of the app's verdict values. */
  verdict: string;
  confidence: "low" | "medium";
  /** Formatted markdown-ish text stored as the verdict comment. */
  comment: string;
  discrepancyCount: number;
}

interface Factor {
  key: string;
  label: string;
  /** Words that indicate the factor is being raised. */
  patterns: RegExp;
  /** Whose responsibility the factor tends to point at. */
  points: "vehicle" | "driver" | "third_party" | "conditions";
}

const FACTORS: Factor[] = [
  { key: "brakes", label: "Brakes", patterns: /\bbrake(s|d|ing)?\b|\bstopping distance\b/i, points: "vehicle" },
  { key: "tyres", label: "Tyres", patterns: /\btyre(s)?\b|\btire(s)?\b|\bburst\b|\bpuncture\b|\btread\b/i, points: "vehicle" },
  { key: "steering", label: "Steering", patterns: /\bsteer(ing|ed)?\b|\bwheel align|\btie rod\b/i, points: "vehicle" },
  { key: "mechanical", label: "Other mechanical", patterns: /\bmechanical\b|\bsuspension\b|\bengine fail|\bgearbox\b|\bbreakdown\b/i, points: "vehicle" },
  { key: "speed", label: "Speed", patterns: /\bspeed(ing|ed)?\b|\btoo fast\b|\bover the limit\b|\bexcessive speed\b|\d{2,3}\s?km\/?h/i, points: "driver" },
  { key: "attention", label: "Attention / phone", patterns: /\bphone\b|\btexting\b|\bdistract(ed|ion)\b|\bnot paying attention\b/i, points: "driver" },
  { key: "fatigue", label: "Fatigue", patterns: /\bfatigue(d)?\b|\btired\b|\bsleep(y|ing)?\b|\bdozed\b|\bexhaust(ed|ion)\b/i, points: "driver" },
  { key: "alcohol", label: "Alcohol", patterns: /\balcohol\b|\bdrunk\b|\bintoxicat|\bbeer\b|\bdrinking\b/i, points: "driver" },
  { key: "reckless", label: "Reckless / negligent driving", patterns: /\breckless\b|\bnegligen(t|ce)\b|\bdangerous driving\b|\bovertak(e|ing)\b/i, points: "driver" },
  { key: "third_party", label: "Another vehicle / third party", patterns: /\boncoming\b|\banother (vehicle|car|truck)\b|\bthird party\b|\bhit (me|us)\b|\bencroach/i, points: "third_party" },
  { key: "pedestrian", label: "Pedestrian / animal", patterns: /\bpedestrian\b|\banimal\b|\bcow\b|\bdog\b|\bgoat\b/i, points: "third_party" },
  { key: "road", label: "Road condition", patterns: /\bpothole(s)?\b|\bgravel\b|\bwet road\b|\bslippery\b|\bunmarked\b|\bbad road\b/i, points: "conditions" },
  { key: "weather", label: "Weather / visibility", patterns: /\brain(ing|y)?\b|\bfog(gy)?\b|\bmist\b|\bdark(ness)?\b|\bglare\b|\bvisibility\b/i, points: "conditions" },
];

const norm = (s: string) => (s ?? "").replace(/\s+/g, " ").trim();

function speedsIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/(\d{2,3})\s?(?:km\/?h|kph|kmph)\b/gi)) out.push(Number(m[1]));
  return out;
}

export function reviewAccident(input: ReviewInput): ReviewOutput {
  const driver = norm(input.driverStatement);
  const committee = norm(input.committeeText);
  const images = norm(input.imageText ?? "");
  const hasCommittee = committee.length > 40;

  const inDriver = new Set<string>();
  const inCommittee = new Set<string>();
  for (const f of FACTORS) {
    if (f.patterns.test(driver)) inDriver.add(f.key);
    if (hasCommittee && f.patterns.test(committee)) inCommittee.add(f.key);
  }

  const agreements: string[] = [];
  const discrepancies: string[] = [];
  const labelOf = (k: string) => FACTORS.find((f) => f.key === k)!.label;

  for (const f of FACTORS) {
    const d = inDriver.has(f.key);
    const c = inCommittee.has(f.key);
    if (d && c) agreements.push(`Both accounts mention **${f.label.toLowerCase()}**.`);
    else if (hasCommittee && d && !c) {
      discrepancies.push(`The driver raises **${f.label.toLowerCase()}**, but the committee's report does not mention it.`);
    } else if (hasCommittee && !d && c) {
      discrepancies.push(`The committee's report raises **${f.label.toLowerCase()}**, which the driver's statement does not mention.`);
    }
  }

  // Blame direction: does each side point at the vehicle or at the driver?
  const dirOf = (set: Set<string>) => {
    const pts = FACTORS.filter((f) => set.has(f.key)).map((f) => f.points);
    return {
      vehicle: pts.filter((p) => p === "vehicle").length,
      driver: pts.filter((p) => p === "driver").length,
      third: pts.filter((p) => p === "third_party").length,
    };
  };
  const dd = dirOf(inDriver);
  const cd = dirOf(inCommittee);

  if (hasCommittee) {
    const driverBlamesVehicleOrOther = dd.vehicle + dd.third > dd.driver;
    const committeeBlamesDriver = cd.driver > cd.vehicle + cd.third;
    if (driverBlamesVehicleOrOther && committeeBlamesDriver) {
      discrepancies.push(
        "**Direction of blame differs:** the driver attributes the accident to the vehicle or another party, while the committee's report leans towards driver conduct.",
      );
    }
  }

  // Numeric claims.
  const ds = speedsIn(driver);
  const cs = speedsIn(committee);
  if (ds.length && cs.length) {
    const maxD = Math.max(...ds);
    const maxC = Math.max(...cs);
    if (Math.abs(maxD - maxC) >= 15) {
      discrepancies.push(`**Speed stated differs:** driver ${maxD} km/h vs committee ${maxC} km/h.`);
    } else {
      agreements.push(`Stated speeds are close (${maxD} vs ${maxC} km/h).`);
    }
  } else if (cs.length && !ds.length) {
    discrepancies.push(`The committee cites a speed (${Math.max(...cs)} km/h); the driver's statement gives none.`);
  }

  // Hard facts vs the narrative.
  if (input.facts.otherParties && !inDriver.has("third_party") && !inCommittee.has("third_party")) {
    discrepancies.push("The report is marked as involving other parties, but neither statement describes them.");
  }
  if (input.facts.injuries && !/injur|hurt|hospital|ambulance/i.test(driver + " " + committee)) {
    discrepancies.push("Injuries were recorded, but neither statement describes them.");
  }
  if (!input.facts.policeReport) {
    discrepancies.push("No police report number is on file for this accident.");
  }

  if (images && /\b(police|report|case)\b/i.test(images)) {
    agreements.push("Text read from the photos mentions a police/case reference.");
  }

  // Suggested verdict — intentionally cautious.
  let verdict = "needs_more_info";
  if (discrepancies.length === 0 && hasCommittee) {
    verdict = dd.vehicle > dd.driver ? "not_driver_fault" : "inconclusive";
  } else if (discrepancies.length >= 3) {
    verdict = "needs_more_info";
  } else if (hasCommittee && cd.driver > 0 && dd.vehicle > 0) {
    verdict = "inconclusive";
  }
  if (!hasCommittee) verdict = "needs_more_info";

  const lines: string[] = [];
  lines.push(
    `Automated review — **keyword comparison, not a judgement.** Chitsano has no language model, so it compares which factors each account raises and flags gaps for the committee to confirm.`,
  );
  lines.push("");
  lines.push(
    `Evidence on file: ${input.counts.photos} photo(s), ${input.counts.videos} video(s), ${input.counts.audios} audio recording(s), ${input.counts.documents} document(s).`,
  );
  if (!hasCommittee) {
    lines.push("");
    lines.push(
      "⚠️ No committee statement text was available to compare. Upload the committee's report as a .docx and press *Extract text*, then re-run this review.",
    );
  }
  if (discrepancies.length) {
    lines.push("");
    lines.push(`🚩 **Discrepancies to check (${discrepancies.length})**`);
    for (const d of discrepancies) lines.push(`• ${d}`);
  }
  if (agreements.length) {
    lines.push("");
    lines.push("✅ **Points of agreement**");
    for (const a of agreements) lines.push(`• ${a}`);
  }
  lines.push("");
  lines.push(
    "🔇 **Not assessed:** Chitsano cannot watch the videos, listen to the recordings, or judge damage from the photos — those need a human, or a paid vision/speech service.",
  );

  return {
    verdict,
    confidence: discrepancies.length ? "low" : "medium",
    comment: lines.join("\n"),
    discrepancyCount: discrepancies.length,
  };
}
