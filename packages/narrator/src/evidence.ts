import { chainOf, weakest, type Attribution, type ChainStep, type Reason, type Suspect } from "./attribute.js";
import type { Development } from "./detect.js";
import { baselineOf, NOISE_LIMIT } from "./signals.js";
import type {
  Confidence,
  EvidencePackage,
  EvidenceRef,
  Level,
  NarratorConfig,
  NarratorSettings,
  RoundSnapshot,
  Slot,
  Statement,
  StatementKind,
} from "./types.js";

/** Most suspects listed at level 3. */
const MAX_LISTED_SUSPECTS = 4;

/**
 * Builds the one package a card is allowed to say. Every number and every
 * data-derived name goes into a slot; templates hold only fixed wording.
 *
 * Level 1 (glance)  one line: how much it changed, and the root cause with its confidence word
 * Level 2 (why)     observed · rule · inferred · chain · uncertain · suggested
 * Level 3 (deep)    adds measure (size next to normal noise) · suspects (all considered,
 *                   and what's known about each) · reasoning (which confidence rule applied)
 */
export function buildPackage(
  dev: Development,
  attribution: Attribution,
  history: RoundSnapshot[],
  config: NarratorConfig,
  settings: NarratorSettings,
): EvidencePackage {
  const info = config.metrics[dev.metric];
  const label = (metric: string) => config.metrics[metric]?.label ?? metric;
  const down = dev.direction === "down";
  const slots: Record<string, Slot> = {
    metric: { kind: "text", text: info.label },
    usual: { kind: "number", value: dev.usual, format: info.format },
    now: { kind: "number", value: dev.now, format: info.format },
    startRound: { kind: "number", value: dev.startRound, format: "round" },
    baselineRounds: { kind: "number", value: settings.baselineRounds, format: "count" },
    lookbackRounds: { kind: "number", value: settings.lookbackRounds, format: "count" },
  };
  const statements: Statement[] = [];
  const say = (level: Level, kind: StatementKind, text: string) => statements.push({ kind, level, text });
  const evidence: EvidenceRef[] = [
    { type: "metric", metric: dev.metric, fromRound: dev.startRound - settings.baselineRounds, toRound: dev.round },
  ];

  const names = namer(config, label);
  const steps = chainOf(attribution);
  // The card's confidence is about the cause named in the glance line: the weakest link of the chain.
  const confidence = steps.length ? weakest(steps.map((s) => s.attribution.confidence)) : attribution.confidence;

  const headline = dev.stillMoving
    ? `{{metric}} is ${down ? "falling" : "rising"}`
    : `{{metric}} has ${down ? "dropped" : "gone up"}`;

  // Shares already read as percentages, so a relative % change on top
  // ("down 30% of 60%") would confuse; only show % change for other formats.
  const showChange = info.format !== "share" && Math.abs(dev.usual) > 1e-9;
  if (showChange) slots.change = { kind: "number", value: (dev.now - dev.usual) / dev.usual, format: "percent" };

  // ── Level 1: glance ───────────────────────────────────────────────────────
  const howMuch = showChange
    ? `${down ? "Down" : "Up"} {{change}} since shift {{startRound}}.`
    : "From {{usual}} to {{now}} since shift {{startRound}}.";
  say(1, "glance", `${howMuch} ${glanceCause(steps, confidence, slots, names)}`);

  // ── Level 2: why ──────────────────────────────────────────────────────────
  say(
    2,
    "observed",
    showChange
      ? `{{metric}} has gone from a usual {{usual}} to {{now}} since shift {{startRound}} (${down ? "down" : "up"} {{change}}).`
      : "{{metric}} has gone from a usual {{usual}} to {{now}} since shift {{startRound}}.",
  );
  say(
    2,
    "observed",
    dev.strength === "strong"
      ? "That is far outside its normal ups and downs in the {{baselineRounds}} shifts before."
      : "That is outside its normal ups and downs in the {{baselineRounds}} shifts before.",
  );

  const rule = changedRule(dev, history, config, settings);
  if (rule) {
    slots.rule = { kind: "text", text: rule.label };
    slots.ruleCount = { kind: "number", value: rule.now, format: "count" };
    slots.ruleUsual = { kind: "number", value: rule.usual, format: "count" };
    say(2, "rule", `{{ruleCount}} miners acted on the rule "{{rule}}" last shift, ${rule.now > rule.usual ? "up" : "down"} from about {{ruleUsual}}.`);
    evidence.push({ type: "rule", rule: rule.name, round: dev.round });
  }

  // Each step of the chain gets its own confidence word. When several known causes
  // compete, none is put ahead of the others.
  steps.forEach((step, i) => {
    const slot = i === 0 ? "cause" : `cause${i}`;
    const { attribution: a } = step;
    slots[slot] = { kind: "text", text: a.reason === "known-shared" ? names.all(a, "or") : names.full(step.suspect) };
    if (i === 0) {
      say(2, "inferred", `${capitalize(a.confidence)} caused by {{${slot}}}.`);
    } else {
      const prev = steps[i - 1].suspect;
      say(2, "chain", `That ${prev.type === "change" && prev.dev.direction === "up" ? "rise" : "fall"} was ${a.confidence} caused by {{${slot}}}.`);
    }
  });
  const last = steps[steps.length - 1]?.suspect;
  if (last?.type === "change" && !last.cause.top) {
    say(2, "chain", `What caused that ${last.dev.direction === "up" ? "rise" : "fall"} is unclear.`);
  }
  if (attribution.reason === "timing-shared") {
    slots.others = { kind: "text", text: names.all(attribution, "and") };
  }
  say(2, "uncertain", uncertainty(attribution.reason, attribution.others.length + 1));

  const lever = config.levers?.find((l) => l.metric === dev.metric && l.direction === dev.direction);
  if (lever) {
    slots.lever = { kind: "text", text: lever.text };
    say(2, "suggested", "You could {{lever}}.");
  }

  // ── Level 3: how the narrator decided ─────────────────────────────────────
  slots.spread = { kind: "number", value: dev.spread, format: info.format };
  slots.size = { kind: "number", value: dev.size, format: "times" };
  slots.noiseLimit = { kind: "number", value: NOISE_LIMIT, format: "times" };
  say(3, "measure", "Before the change it typically varied by about ±{{spread}}. This change is {{size}} times that; under {{noiseLimit}} times is treated as noise.");

  slots.windowFrom = { kind: "number", value: attribution.window.from, format: "round" };
  slots.windowTo = { kind: "number", value: attribution.window.to, format: "round" };
  const considered = attribution.considered.slice(0, MAX_LISTED_SUSPECTS);
  say(3, "suspect", considered.length
    ? "Looked for causes from shift {{windowFrom}} to shift {{windowTo}}:"
    : "Looked for causes from shift {{windowFrom}} to shift {{windowTo}}. Nothing was recorded.");
  considered.forEach((s, i) => {
    slots[`suspect${i}`] = { kind: "text", text: names.full(s) };
    slots[`suspect${i}Facts`] = { kind: "text", text: `${lagText(s)}; ${names.link(s, dev)}` };
    say(3, "suspect", `{{suspect${i}}}: {{suspect${i}Facts}}.`);
  });

  say(3, "reasoning", reasoning(attribution.reason));
  if (steps.length > 1) {
    say(3, "reasoning", `A chain is only as sure as its weakest link, so the whole chain is ${confidence}.`);
  }

  // Evidence: everything the explanation relies on.
  for (const step of steps) {
    for (const s of step.attribution.reason === "known-shared" ? [step.attribution.top!, ...step.attribution.others] : [step.suspect]) {
      evidence.push(ref(s, settings));
    }
  }
  if (attribution.reason === "timing-shared") attribution.others.forEach((s) => evidence.push(ref(s, settings)));

  return {
    id: `${dev.metric}-${dev.round}`,
    round: dev.round,
    topic: dev.metric,
    direction: dev.direction,
    startRound: dev.startRound,
    confidence,
    priority: priority(dev.size, confidence),
    headline,
    statements,
    slots,
    evidence,
  };
}

/** The "why" half of the glance line, naming the root of the chain. */
function glanceCause(steps: ChainStep[], confidence: Confidence, slots: Record<string, Slot>, names: Namer): string {
  const root = steps[steps.length - 1];
  if (!root) return "Cause unclear.";
  const a = root.attribution;
  if (a.reason === "known-shared") {
    slots.root = { kind: "text", text: names.all(a, "or", false) };
    return `${capitalize(confidence)} ${steps.length > 1 ? "traced back to" : "due to"} {{root}}.`;
  }
  slots.root = { kind: "text", text: names.short(root.suspect) };
  slots.rootWhen = { kind: "text", text: names.when(root.suspect, false) };
  const line = `${capitalize(confidence)} ${steps.length > 1 ? "traced back to" : "due to"} {{root}} ({{rootWhen}}).`;
  return a.reason === "timing-only" ? `${line} May be a coincidence.` : line;
}

/** Level 2: what's missing, in plain words. */
function uncertainty(reason: Reason, causeCount: number): string {
  switch (reason) {
    case "known-sole":
      return "Not certain: it came just before the change and is known to affect {{metric}}, but we haven't re-run the world without it.";
    case "known-shared":
      return causeCount === 2
        ? "Both are known to affect {{metric}}, so we can't tell which one caused it, or whether both did."
        : "All of them are known to affect {{metric}}, so we can't tell which one caused it.";
    case "timing-only":
      return "It came just before the change, but it isn't known to affect {{metric}}, so the timing may be a coincidence.";
    case "timing-shared":
      return "Cause unclear: {{others}} happened just before, but none of them is known to affect {{metric}}.";
    case "none":
      return "Cause unclear: nothing recorded happened in the {{lookbackRounds}} shifts before the change.";
  }
}

/** Level 3: the confidence rule that applied. */
function reasoning(reason: Reason): string {
  switch (reason) {
    case "known-sole":
      return "Why likely: one suspect has a known link and nothing competes with it. Only re-running the world without it could make this 'almost certainly'.";
    case "known-shared":
      return "Why possibly: more than one suspect has a known link, and timing alone can't separate them.";
    case "timing-only":
      return "Why possibly: the timing fits, but nothing in the sim's rules links it to {{metric}}.";
    case "timing-shared":
      return "Why unclear: several things happened at the right time, but none has a known link.";
    case "none":
      return "Why unclear: nothing happened at the right time to point to.";
  }
}

type Namer = ReturnType<typeof namer>;

/** Plain names for suspects. These become text slots, so they may contain shift numbers from the data. */
function namer(config: NarratorConfig, label: (metric: string) => string) {
  const short = (s: Suspect) => {
    if (s.type === "change") return `the ${s.dev.direction === "up" ? "rise" : "fall"} in ${label(s.dev.metric)}`;
    const name = config.eventLabels?.[s.event.kind] ?? s.event.kind;
    return s.event.source === "overseer" ? `your ${name}` : `the ${name}`;
  };
  const when = (s: Suspect, long = true) =>
    s.type === "change" ? `from shift ${s.dev.startRound}` : `${long ? "at " : ""}shift ${s.event.round}`;
  const full = (s: Suspect) => `${short(s)} ${when(s)}`;
  return {
    short,
    when,
    full,
    /** Every suspect an attribution names, joined. */
    all: (a: Attribution, conjunction: "and" | "or", withWhen = true) =>
      joinNames((a.top ? [a.top, ...a.others] : a.others).map(withWhen ? full : short), conjunction),
    /** What the sim's rules say about a suspect and this metric. */
    link: (s: Suspect, dev: Development) => {
      if (!s.known) return `not known to affect ${label(dev.metric)}`;
      const direction =
        s.type === "event"
          ? config.knownEffects?.find((k) => k.event === s.event.kind && k.metric === dev.metric)?.direction
          : config.knownLinks?.find((l) => l.from === s.dev.metric && l.to === dev.metric)?.direction;
      const verb = direction === "down" ? "lower" : direction === "up" ? "raise" : "affect";
      return `known to ${verb} ${label(dev.metric)}`;
    },
  };
}

function lagText(s: Suspect): string {
  const verb = s.type === "change" ? "began" : "came";
  if (s.lag === 0) return `${verb} in the same shift the change began`;
  if (s.lag < 0) return `${verb} ${-s.lag} shift${s.lag === -1 ? "" : "s"} after the change began (start dates can be a shift off)`;
  return `${verb} ${s.lag} shift${s.lag === 1 ? "" : "s"} before the change`;
}

function ref(s: Suspect, settings: NarratorSettings): EvidenceRef {
  return s.type === "event"
    ? { type: "event", kind: s.event.kind, round: s.event.round }
    : { type: "metric", metric: s.dev.metric, fromRound: s.dev.startRound - settings.baselineRounds, toRound: s.dev.round };
}

/** Bigger changes rank higher; a better-understood cause breaks ties. Range 0 to about 1.2. */
function priority(size: number, confidence: Confidence): number {
  const bonus: Record<Confidence, number> = { "almost certainly": 0.2, likely: 0.2, possibly: 0.1, unclear: 0 };
  return Math.min(size, 6) / 6 + bonus[confidence];
}

function joinNames(names: string[], conjunction: "and" | "or"): string {
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} ${conjunction} ${names[names.length - 1]}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * The declared rule for this metric whose firings moved the most since the change
 * began, if it moved clearly (2+ wobbles from its own usual level before the change).
 */
function changedRule(dev: Development, history: RoundSnapshot[], config: NarratorConfig, settings: NarratorSettings) {
  const start = history.findIndex((s) => s.round === dev.startRound);
  const before = history.slice(Math.max(0, start - settings.baselineRounds), start);
  const latest = history[history.length - 1];
  let best: { name: string; label: string; now: number; usual: number; size: number } | null = null;

  for (const [name, info] of Object.entries(config.rules ?? {})) {
    if (!info.metrics.includes(dev.metric)) continue;
    const counts = before.map((s) => s.ruleFirings?.[name]);
    const now = latest.ruleFirings?.[name];
    if (now === undefined || counts.length < 2 || counts.some((c) => c === undefined)) continue;
    const { usual, spread } = baselineOf(counts as number[]);
    const size = Math.abs(now - usual) / spread;
    if (size >= 2 && (!best || size > best.size)) best = { name, label: info.label, now, usual, size };
  }
  return best;
}
