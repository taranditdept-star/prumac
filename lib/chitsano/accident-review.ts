import "server-only";

/**
 * Chitsano's accident review — a RULES-BASED comparison, not a language model.
 *
 * The first version counted keywords, and on a real committee transcript it
 * produced four accusations that were the opposite of the document:
 *
 *   "committee raises Alcohol"  ← "Were you under the influence of alcohol, or
 *                                  were you sober?  Driver: Confirmed he did
 *                                  not consume any alcohol."
 *   "committee raises Fatigue"  ← a bystander's remark, "if he is sleeping
 *                                  [alive], thank God"
 *   "committee raises Phone"    ← "his phone was out of power"
 *   "committee raises Speed"    ← "he was not speeding (well below 80 km/h)"
 *
 * In a disciplinary file that is not a glitch, it is an accusation. So a factor
 * now counts as RAISED only when a sentence asserts it: questions and denials
 * are read as what they are, and a word appearing in one account but not the
 * other is reported as exactly that — not as a discrepancy.
 *
 * What it still cannot do, and must never imply: understand the narrative,
 * weigh credibility, or judge fault.
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
  verdict: string;
  confidence: "low" | "medium";
  comment: string;
  discrepancyCount: number;
}

interface Factor {
  key: string;
  label: string;
  patterns: RegExp;
  points: "vehicle" | "driver" | "third_party" | "conditions";
}

/**
 * Patterns for anything that points at the driver are deliberately narrow: they
 * must describe the conduct, not merely name it. "phone" alone matched "his
 * phone was out of power"; "sleeping" matched someone else's turn of phrase.
 */
const FACTORS: Factor[] = [
  { key: "brakes", label: "Brakes", patterns: /\bbrake(s|d|ing)?\b|\bstopping distance\b/i, points: "vehicle" },
  { key: "tyres", label: "Tyres", patterns: /\btyre(s)?\b|\btire(s)?\b|\bburst\b|\bpuncture\b|\btread\b/i, points: "vehicle" },
  { key: "steering", label: "Steering", patterns: /\bsteer(ing|ed)?\b|\bwheel align|\btie rod\b/i, points: "vehicle" },
  { key: "mechanical", label: "Other mechanical", patterns: /\bmechanical\b|\bsuspension\b|\bengine fail|\bgearbox\b/i, points: "vehicle" },
  { key: "speed", label: "Speed", patterns: /\bspeeding\b|\btoo fast\b|\bover the limit\b|\bexcessive speed\b/i, points: "driver" },
  { key: "attention", label: "Attention / phone", patterns: /\bon (the|his|her) phone\b|\btexting\b|\busing (the|his|her) phone\b|\bdistract(ed|ion)\b|\bnot paying attention\b/i, points: "driver" },
  { key: "fatigue", label: "Fatigue", patterns: /\bfatigue(d)?\b|\bdozed\b|\bfell asleep\b|\basleep at the wheel\b|\bnodding off\b/i, points: "driver" },
  { key: "alcohol", label: "Alcohol", patterns: /\balcohol\b|\bdrunk\b|\bintoxicat|\bbeer\b|\bdrinking\b/i, points: "driver" },
  { key: "reckless", label: "Reckless / negligent driving", patterns: /\breckless\b|\bnegligen(t|ce)\b|\bdangerous driving\b|\bovertak(e|ing)\b/i, points: "driver" },
  { key: "third_party", label: "Another vehicle / third party", patterns: /\boncoming\b|\banother (vehicle|car|truck)\b|\bthird party\b|\bhit (me|us)\b|\bencroach/i, points: "third_party" },
  { key: "pedestrian", label: "Pedestrian / animal", patterns: /\bpedestrian\b|\banimal\b|\bcow\b|\bdog\b|\bgoat\b/i, points: "third_party" },
  { key: "road", label: "Road condition", patterns: /\bpothole(s)?\b|\bgravel\b|\bwet road\b|\bslippery\b|\bunmarked\b|\bbad road\b/i, points: "conditions" },
  { key: "weather", label: "Weather / visibility", patterns: /\brain(ing|y)?\b|\bfog(gy)?\b|\bmist\b|\bglare\b|\bpoor visibility\b/i, points: "conditions" },
];

const norm = (s: string) => (s ?? "").replace(/\s+/g, " ").trim();

/** Sentence-ish split; committee transcripts use "Speaker:" turns as well. */
function sentences(text: string): string[] {
  return norm(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const NEGATORS =
  /\b(no|not|never|denied|denies|deny|without|neither|nor|nothing|sober|refut|dispute[sd]?|wasn'?t|weren'?t|didn'?t|hadn'?t|isn'?t|don'?t|doesn'?t)\b/i;

/** A question asks about a factor; it does not assert it. */
function isQuestion(s: string): boolean {
  return (
    s.includes("?") ||
    /^\s*(committee|chair|question|q)\s*:/i.test(s) ||
    /^\s*(were|was|did|do|does|have|has|had|is|are|any|would|could|can)\b/i.test(s)
  );
}

type Stance = "asserted" | "denied" | "asked" | "absent";

/** How an account treats one factor: asserted, denied, merely asked, or silent. */
function stanceOn(text: string, f: Factor): { stance: Stance; quote?: string } {
  const hits = sentences(text).filter((s) => f.patterns.test(s));
  if (hits.length === 0) return { stance: "absent" };

  let asked = false;
  let denied: string | undefined;
  for (const s of hits) {
    if (NEGATORS.test(s)) { denied = s; continue; }
    if (isQuestion(s)) { asked = true; continue; }
    return { stance: "asserted", quote: s };     // a plain assertion settles it
  }
  if (denied) return { stance: "denied", quote: denied };
  if (asked) return { stance: "asked" };
  return { stance: "absent" };
}

const trim = (s: string, n = 150) => (s.length > n ? `${s.slice(0, n)}…` : s);

export function reviewAccident(input: ReviewInput): ReviewOutput {
  const driver = norm(input.driverStatement);
  const committee = norm(input.committeeText);
  const images = norm(input.imageText ?? "");
  const hasCommittee = committee.length > 40;

  const assertedDriver = new Set<string>();
  const assertedCommittee = new Set<string>();

  /** Genuine conflicts only. */
  const conflicts: string[] = [];
  /** Raised by one side and simply not covered by the other. Not a conflict. */
  const oneSided: string[] = [];
  /** Asked about and denied — worth recording, and the opposite of a finding. */
  const cleared: string[] = [];
  const agreements: string[] = [];

  for (const f of FACTORS) {
    const d = stanceOn(driver, f);
    const c = hasCommittee ? stanceOn(committee, f) : { stance: "absent" as Stance };
    if (d.stance === "asserted") assertedDriver.add(f.key);
    if (c.stance === "asserted") assertedCommittee.add(f.key);

    const lower = f.label.toLowerCase();

    if (d.stance === "asserted" && c.stance === "asserted") {
      agreements.push(`Both accounts describe **${lower}**.`);
    } else if (d.stance === "asserted" && c.stance === "denied") {
      conflicts.push(`**${f.label}:** the driver describes it, the committee's report rules it out.`);
    } else if (c.stance === "asserted" && d.stance === "denied") {
      conflicts.push(`**${f.label}:** the committee's report describes it, the driver denies it.`);
    } else if (c.stance === "denied" || d.stance === "denied") {
      cleared.push(`**${lower}** was raised and explicitly ruled out — “${trim((c.quote ?? d.quote) ?? "")}”`);
    } else if (c.stance === "asked" && d.stance !== "asserted") {
      cleared.push(`**${lower}** was asked about; no one asserted it.`);
    } else if (d.stance === "asserted" && c.stance === "absent" && hasCommittee) {
      oneSided.push(`The driver describes **${lower}**; the committee's report does not cover it.`);
    } else if (c.stance === "asserted" && d.stance === "absent") {
      oneSided.push(`The committee's report describes **${lower}**; the driver's statement does not cover it.`);
    }
  }

  // Direction of blame — only from what each side actually asserts.
  const dirOf = (set: Set<string>) => {
    const pts = FACTORS.filter((f) => set.has(f.key)).map((f) => f.points);
    return {
      vehicle: pts.filter((p) => p === "vehicle").length,
      driver: pts.filter((p) => p === "driver").length,
      third: pts.filter((p) => p === "third_party").length,
    };
  };
  const dd = dirOf(assertedDriver);
  const cd = dirOf(assertedCommittee);
  if (hasCommittee && dd.vehicle + dd.third > dd.driver && cd.driver > cd.vehicle + cd.third) {
    conflicts.push(
      "**Direction of blame differs:** the driver points at the vehicle or another party, the committee's report at driver conduct.",
    );
  }

  // Speed figures, ignoring any sentence that denies speeding.
  const speedsIn = (text: string) => {
    const out: number[] = [];
    for (const s of sentences(text)) {
      if (NEGATORS.test(s)) continue;      // "well below 80 km/h" is not a claim of 80
      for (const m of s.matchAll(/(\d{2,3})\s?(?:km\/?h|kph|kmph)\b/gi)) out.push(Number(m[1]));
    }
    return out;
  };
  const ds = speedsIn(driver);
  const cs = speedsIn(committee);
  if (ds.length && cs.length) {
    const maxD = Math.max(...ds), maxC = Math.max(...cs);
    if (Math.abs(maxD - maxC) >= 15) {
      conflicts.push(`**Speed stated differs:** driver ${maxD} km/h vs committee ${maxC} km/h.`);
    } else {
      agreements.push(`Stated speeds are close (${maxD} vs ${maxC} km/h).`);
    }
  }

  // Administrative gaps. Kept apart from conflicts — a missing form is not a
  // disagreement between two accounts, and counting it as one used to push the
  // verdict on its own.
  const gaps: string[] = [];
  if (input.facts.otherParties && !assertedDriver.has("third_party") && !assertedCommittee.has("third_party")) {
    gaps.push("The report is marked as involving other parties, but neither statement describes them.");
  }
  if (input.facts.injuries && !/injur|hurt|hospital|ambulance/i.test(`${driver} ${committee}`)) {
    gaps.push("Injuries were recorded, but neither statement describes them.");
  }
  if (!input.facts.policeReport) gaps.push("No police report number is on file.");
  if (images && /\b(police|report|case)\b/i.test(images)) {
    agreements.push("Text read from the photos mentions a police or case reference.");
  }

  // Verdict, driven by real conflicts only.
  let verdict: string;
  if (!hasCommittee) verdict = "needs_more_info";
  else if (conflicts.length === 0) {
    verdict = dd.vehicle > dd.driver && cd.driver === 0 ? "not_driver_fault" : "inconclusive";
  } else if (conflicts.length >= 2) verdict = "needs_more_info";
  else verdict = "inconclusive";

  const lines: string[] = [
    "Automated review — **keyword comparison, not a judgement.** Chitsano has no language model. It reads which factors each account actually asserts, treats questions and denials as such, and flags the rest for the committee to confirm.",
    "",
    `Evidence on file: ${input.counts.photos} photo(s), ${input.counts.videos} video(s), ${input.counts.audios} audio recording(s), ${input.counts.documents} document(s).`,
  ];
  if (!hasCommittee) {
    lines.push("", "⚠️ No committee statement text was available to compare. Upload the committee's report as a .docx and press *Extract text*, then re-run this review.");
  }
  if (conflicts.length) {
    lines.push("", `🚩 **The accounts conflict (${conflicts.length})**`);
    for (const d of conflicts) lines.push(`• ${d}`);
  } else if (hasCommittee) {
    lines.push("", "🚩 **No direct conflicts found** between the two accounts.");
  }
  if (oneSided.length) {
    lines.push("", "📄 **Covered by one account only** — a gap in coverage, not a contradiction");
    for (const o of oneSided) lines.push(`• ${o}`);
  }
  if (cleared.length) {
    lines.push("", "✔️ **Asked about and ruled out**");
    for (const c of cleared) lines.push(`• ${c}`);
  }
  if (agreements.length) {
    lines.push("", "✅ **Points of agreement**");
    for (const a of agreements) lines.push(`• ${a}`);
  }
  if (gaps.length) {
    lines.push("", "🗂️ **Missing from the file**");
    for (const g of gaps) lines.push(`• ${g}`);
  }
  lines.push("", "🔇 **Not assessed:** Chitsano cannot watch the videos, listen to the recordings, or judge damage from the photos — those need a human, or a paid vision/speech service.");

  return {
    verdict,
    confidence: conflicts.length ? "low" : "medium",
    comment: lines.join("\n"),
    discrepancyCount: conflicts.length,
  };
}
