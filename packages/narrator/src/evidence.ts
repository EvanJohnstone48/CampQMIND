import type { Attribution, Reason, Suspect } from "./attribute.js";
import type { Development } from "./detect.js";
import { baselineOf } from "./signals.js";
import type {
  Confidence,
  EvidencePackage,
  EvidenceRef,
  NarratorConfig,
  NarratorSettings,
  RoundSnapshot,
  Slot,
  StatementKind,
} from "./types.js";

/**
 * Builds the one package a card is allowed to say. Every number and every
 * data-derived name goes into a slot; templates hold only fixed wording.
 *
 * A card reads, at most:
 *   headline   what is happening
 *   observed   what we measured, and whether it's outside normal ups and downs
 *   rule       (if Lane 2 says a rule moves this metric and its firings changed)
 *   inferred   the most likely cause, led by the confidence word
 *   uncertain  why we're not more sure (always present)
 *   suggested  (only if a lever is configured for this change)
 */
export function buildPackage(
  dev: Development,
  attribution: Attribution,
  history: RoundSnapshot[],
  config: NarratorConfig,
  settings: NarratorSettings,
): EvidencePackage {
  const info = config.metrics[dev.metric];
  const down = dev.direction === "down";
  const slots: Record<string, Slot> = {
    metric: { kind: "text", text: info.label },
    usual: { kind: "number", value: dev.usual, format: info.format },
    now: { kind: "number", value: dev.now, format: info.format },
    startRound: { kind: "number", value: dev.startRound, format: "round" },
    baselineRounds: { kind: "number", value: settings.baselineRounds, format: "count" },
    lookbackRounds: { kind: "number", value: settings.lookbackRounds, format: "count" },
  };
  const statements: { kind: StatementKind; template: string }[] = [];
  const evidence: EvidenceRef[] = [
    {
      type: "metric",
      metric: dev.metric,
      fromRound: dev.startRound - settings.baselineRounds,
      toRound: dev.round,
    },
  ];
  const say = (kind: StatementKind, template: string) => statements.push({ kind, template });

  // Headline: is it still moving, or has it settled at a new level?
  const headline = dev.stillMoving
    ? `{{metric}} is ${down ? "falling" : "rising"}`
    : `{{metric}} has ${down ? "dropped" : "gone up"}`;

  // Observed. Shares already read as percentages, so a relative % change on top
  // ("down 30% of 60%") would confuse; only show % change for other formats.
  if (info.format !== "share" && Math.abs(dev.usual) > 1e-9) {
    slots.change = { kind: "number", value: (dev.now - dev.usual) / dev.usual, format: "percent" };
    say("observed", `{{metric}} has gone from a usual {{usual}} to {{now}} since shift {{startRound}} (${down ? "down" : "up"} {{change}}).`);
  } else {
    say("observed", "{{metric}} has gone from a usual {{usual}} to {{now}} since shift {{startRound}}.");
  }
  say(
    "observed",
    dev.strength === "strong"
      ? "That is far outside its normal ups and downs in the {{baselineRounds}} shifts before."
      : "That is outside its normal ups and downs in the {{baselineRounds}} shifts before.",
  );

  // Known rule (Lane 2), only for rules declared to move this metric.
  const rule = changedRule(dev, history, config, settings);
  if (rule) {
    slots.rule = { kind: "text", text: rule.label };
    slots.ruleCount = { kind: "number", value: rule.now, format: "count" };
    slots.ruleUsual = { kind: "number", value: rule.usual, format: "count" };
    say("rule", `{{ruleCount}} miners acted on the rule "{{rule}}" last shift, ${rule.now > rule.usual ? "up" : "down"} from about {{ruleUsual}}.`);
    evidence.push({ type: "rule", rule: rule.name, round: dev.round });
  }

  // Inferred + uncertain.
  // When several known causes compete, none is put ahead of the others.
  const { reason, confidence, top, others } = attribution;
  const named = (s: Suspect) => `${eventName(s, config)} at shift ${s.event.round}`;
  if (reason === "known-shared" && top) {
    slots.causes = { kind: "text", text: joinNames([top, ...others].map(named), "or") };
    say("inferred", `${capitalize(confidence)} caused by {{causes}}.`);
  } else if (top) {
    slots.cause = { kind: "text", text: eventName(top, config) };
    slots.causeRound = { kind: "number", value: top.event.round, format: "round" };
    say("inferred", `${capitalize(confidence)} caused by {{cause}} at shift {{causeRound}}.`);
  }
  if (reason === "timing-shared") {
    slots.others = { kind: "text", text: joinNames(others.map(named), "and") };
  }
  say("uncertain", uncertainty(reason, others.length + 1));

  for (const s of [top, ...others]) {
    if (s) evidence.push({ type: "event", kind: s.event.kind, round: s.event.round });
  }

  // Suggested: only levers someone has configured. The narrator never makes one up.
  const lever = config.levers?.find((l) => l.metric === dev.metric && l.direction === dev.direction);
  if (lever) {
    slots.lever = { kind: "text", text: lever.text };
    say("suggested", "You could {{lever}}.");
  }

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

/** One plain-language reason per attribution outcome. Says what the evidence is and what's missing. */
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

/** Bigger changes rank higher; a better-understood cause breaks ties. Range 0 to about 1.2. */
function priority(size: number, confidence: Confidence): number {
  const bonus: Record<Confidence, number> = { "almost certainly": 0.2, likely: 0.2, possibly: 0.1, unclear: 0 };
  return Math.min(size, 6) / 6 + bonus[confidence];
}

function eventName(s: Suspect, config: NarratorConfig): string {
  const label = config.eventLabels?.[s.event.kind] ?? s.event.kind;
  return s.event.source === "overseer" ? `your ${label}` : `the ${label}`;
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
