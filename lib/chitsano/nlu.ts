/**
 * Working out what was actually asked.
 *
 * The engine used to test a long regex per topic, so a question only worked if
 * it was phrased the way the pattern happened to expect: "who isn't logging in"
 * matched, "who logs in the most" did not — the pattern listed "logging in" and
 * "logged in" but not "logs in". Every new phrasing meant another regex, and a
 * manager who is told "I didn't quite catch that" twice stops asking.
 *
 * This scores the words in the question against each topic instead. "logs",
 * "logged", "logging" and "login" all stem to the same root, so all four work
 * without anyone predicting them. It also reads the SHAPE of the question —
 * "the most", "which", "how many" — because "who logs in the most" and "who
 * isn't logging in" are the same topic and opposite answers.
 *
 * No model, no key, no cost. Just less brittle.
 */

export type Shape = "rank_top" | "rank_bottom" | "count" | "list";

export type Subject = "drivers" | "vehicles" | "customers" | null;

export interface Understanding {
  /** What is being measured: trips, km, fuel, faults, money… */
  topic: string | null;
  /**
   * What it is being measured PER. "Which driver does the most trips" and
   * "which vehicle does the most km" ask about the same metric and want
   * completely different answers; the metric alone cannot tell them apart.
   */
  subject: Subject;
  score: number;
  shape: Shape;
  /** Words left after topic words are removed — a plate, a name, a place. */
  rest: string;
}

/** Crude but effective: strips the endings that make one word look like four. */
function stem(w: string): string {
  return w
    .replace(/(ies)$/, "y")
    .replace(/(ing|ged|ded|s)$/, "")
    .replace(/(g)$/, "g");
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(stem);
}

/**
 * Words that point at a topic. Weight 2 means "this word alone is a strong
 * signal"; weight 1 is supporting evidence.
 */
const TOPICS: Record<string, { w: number; words: string[] }[]> = {
  logins: [
    { w: 2, words: ["login", "log", "signin", "sign", "signed", "logon"] },
    { w: 1, words: ["in", "app", "use", "using", "online", "active", "dormant", "inactive", "open"] },
  ],
  vehicles: [
    { w: 2, words: ["vehicle", "car", "truck", "fleet", "lorry", "bakkie", "tanker", "van"] },
    { w: 1, words: ["available", "pool", "plate", "workshop"] },
  ],
  drivers: [
    { w: 2, words: ["driver", "drove", "drive"] },
    { w: 1, words: ["staff", "employee", "who"] },
  ],
  trips: [
    { w: 2, words: ["trip", "journey", "run", "mileage", "km", "kilometre", "kilometer", "distance", "travel"] },
    { w: 1, words: ["route", "far", "drove"] },
  ],
  faults: [
    { w: 2, words: ["fault", "defect", "breakdown", "break", "broken", "snag", "repair", "problem"] },
    { w: 1, words: ["fix", "issue"] },
  ],
  accidents: [
    { w: 2, words: ["accident", "crash", "collision", "incident", "bump"] },
    { w: 1, words: ["damage"] },
  ],
  attendance: [
    { w: 2, words: ["attendance", "checkin", "checked", "present"] },
    { w: 1, words: ["today", "here", "work"] },
  ],
  finance: [
    { w: 2, words: ["money", "revenue", "profit", "finance", "financial", "invoice", "owe", "owed", "debtor", "paid", "payment", "cash", "billing", "outstanding", "overdue"] },
    { w: 1, words: ["much", "cost", "earn", "income"] },
  ],
  fuel: [
    { w: 2, words: ["fuel", "diesel", "petrol", "litre", "liter", "consumption"] },
    { w: 1, words: ["spend", "spent", "tank"] },
  ],
  jobs: [
    { w: 2, words: ["job", "dispatch", "quote", "quoted", "booking"] },
    { w: 1, words: ["customer", "request"] },
  ],
};

const TOP_WORDS = [
  "most", "top", "highest", "best", "biggest", "largest", "busiest", "greatest",
  "maximum", "max", "furthest", "farthest", "longest", "heaviest",
];

/**
 * When two topics score the same, the more specific one wins. "Which vehicle
 * burns the most fuel" hits both "vehicle" and "fuel" equally, and the useful
 * answer is about fuel — the vehicle is just how it is grouped.
 */
const SPECIFICITY = [
  "fuel", "faults", "accidents", "finance", "jobs",
  "attendance", "logins", "trips", "drivers", "vehicles",
];
const BOTTOM_WORDS = ["least", "fewest", "lowest", "worst", "smallest", "bottom", "minimum", "min", "never", "not", "isn't", "isnt", "hasn't", "hasnt", "no"];
const COUNT_WORDS = ["how many", "how much", "count", "number of", "total"];

export function understand(raw: string): Understanding {
  const text = (raw ?? "").toLowerCase().trim();
  const toks = tokens(text);
  const set = new Set(toks);

  let best: { topic: string; score: number } | null = null;
  for (const [topic, groups] of Object.entries(TOPICS)) {
    let score = 0;
    for (const g of groups) {
      for (const word of g.words) {
        if (set.has(stem(word))) score += g.w;
      }
    }
    if (score === 0) continue;
    if (!best || score > best.score) { best = { topic, score }; continue; }
    if (score === best.score) {
      const here = SPECIFICITY.indexOf(topic);
      const there = SPECIFICITY.indexOf(best.topic);
      if (here !== -1 && (there === -1 || here < there)) best = { topic, score };
    }
  }

  // Shape. Negation counts as "bottom": "who ISN'T logging in" wants the
  // dormant end of the same list "who logs in the most" ranks from the top.
  let shape: Shape = "list";
  if (COUNT_WORDS.some((p) => text.includes(p))) shape = "count";
  if (BOTTOM_WORDS.some((w) => set.has(stem(w)) || text.includes(` ${w} `))) shape = "rank_bottom";
  if (TOP_WORDS.some((w) => set.has(stem(w)))) shape = "rank_top";

  const topicWords = new Set(
    Object.values(TOPICS).flatMap((gs) => gs.flatMap((g) => g.words.map(stem))),
  );
  const rest = toks
    .filter((w) => !topicWords.has(w) && !TOP_WORDS.includes(w) && !BOTTOM_WORDS.includes(w))
    .join(" ")
    .trim();

  // The subject is whichever noun the question is grouping by, read straight
  // from the words rather than inferred from the score.
  const has = (...words: string[]) => words.some((w) => set.has(stem(w)));
  const subject: Subject =
    has("driver", "drove", "drive") ? "drivers"
      : has("vehicle", "car", "truck", "lorry", "bakkie", "tanker", "van", "fleet") ? "vehicles"
        : has("customer", "subsidiary", "client", "debtor") ? "customers"
          : null;

  return { topic: best?.topic ?? null, subject, score: best?.score ?? 0, shape, rest };
}
