import { attribute } from "./attribute.js";
import { detect } from "./detect.js";
import { buildPackage } from "./evidence.js";
import { render } from "./format.js";
import { Gate } from "./gate.js";
import { reword, type LlmClient } from "./llm.js";
import {
  DEFAULT_SETTINGS,
  type Card,
  type EvidencePackage,
  type NarratorConfig,
  type NarratorSettings,
  type RoundSnapshot,
} from "./types.js";

/**
 * Plain code finds the truth: every watched metric → development → suspects →
 * evidence package. No model involved. Pure and deterministic.
 */
export function analyze(
  history: RoundSnapshot[],
  config: NarratorConfig,
  settings: NarratorSettings = DEFAULT_SETTINGS,
): EvidencePackage[] {
  const packages: EvidencePackage[] = [];
  for (const metric of Object.keys(config.metrics)) {
    const dev = detect(history, metric, settings);
    if (!dev) continue;
    packages.push(buildPackage(dev, attribute(dev, history, config, settings), history, config, settings));
  }
  return packages;
}

/** Template wording. Always available, used whenever the model isn't. */
export function templateCard(pkg: EvidencePackage): Card {
  return toCard(pkg, pkg.headline, pkg.statements.map((s) => s.template), "template");
}

export interface NarratorOptions {
  settings?: Partial<NarratorSettings>;
  /** Optional: reword cards with a model. Leave out for templates only. */
  llm?: LlmClient;
  llmTimeoutMs?: number;
  /** Called when something goes wrong, e.g. a rejected rewording. The narrator never throws. */
  onProblem?: (message: string) => void;
}

export interface Narrator {
  /** Call once per shift with the full history so far (oldest first). */
  step(history: RoundSnapshot[]): Promise<Card[]>;
}

export function createNarrator(config: NarratorConfig, options: NarratorOptions = {}): Narrator {
  const settings = { ...DEFAULT_SETTINGS, ...options.settings };
  const gate = new Gate(settings);
  const report = options.onProblem ?? (() => {});

  return {
    async step(history) {
      try {
        const picked = gate.select(analyze(history, config, settings));
        return await Promise.all(picked.map((pkg) => write(pkg)));
      } catch (e) {
        report(`narrator failed: ${String(e)}`);
        return [];
      }
    },
  };

  async function write(pkg: EvidencePackage): Promise<Card> {
    if (!options.llm) return templateCard(pkg);
    const result = await reword(pkg, options.llm, options.llmTimeoutMs ?? 4000);
    if (!result.ok) {
      report(`kept template wording for ${pkg.id}: ${result.problems.join("; ")}`);
      return templateCard(pkg);
    }
    return toCard(pkg, result.headline, result.statements, "llm");
  }
}

function toCard(pkg: EvidencePackage, headline: string, statements: string[], writtenBy: Card["writtenBy"]): Card {
  return {
    id: pkg.id,
    round: pkg.round,
    topic: pkg.topic,
    startRound: pkg.startRound,
    headline: render(headline, pkg.slots),
    statements: pkg.statements.map((s, i) => ({ kind: s.kind, text: render(statements[i], pkg.slots) })),
    confidence: pkg.confidence,
    priority: pkg.priority,
    evidence: pkg.evidence,
    writtenBy,
  };
}
