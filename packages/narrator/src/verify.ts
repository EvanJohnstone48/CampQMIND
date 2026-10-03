import { slotNames } from "./format.js";
import { CONFIDENCE_SCALE, type EvidencePackage, type Slot } from "./types.js";

/** Words that change how sure a sentence sounds. A rewrite may keep them, never add them. */
const CERTAINTY_WORDS = [
  ...CONFIDENCE_SCALE,
  "certain", "certainly", "definitely", "proven", "proves", "proof", "guaranteed",
  "undoubtedly", "clearly", "obviously", "surely", "must", "always", "never", "probably", "maybe", "might",
];

/** Spelled-out numbers would sneak past the digit check. */
const NUMBER_WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "twenty", "thirty", "forty", "fifty", "hundred", "thousand",
  "half", "double", "twice", "triple", "quarter", "dozen", "percent",
];

/**
 * Checks a reworded template against the original. Returns the problems found
 * (empty means it passed). Runs on the template form, before slots are filled,
 * so any number in the output must have come from a slot.
 */
export function checkRewording(original: string, rewritten: string, slots: Record<string, Slot>): string[] {
  const problems: string[] = [];

  const before = slotNames(original).sort().join(",");
  const after = slotNames(rewritten).sort().join(",");
  if (before !== after) problems.push(`placeholders changed: {${before}} → {${after}}`);
  for (const name of slotNames(rewritten)) {
    if (!slots[name]) problems.push(`unknown placeholder {{${name}}}`);
  }

  const bare = rewritten.replace(/\{\{\w+\}\}/g, "");
  if (/\d/.test(bare)) problems.push("contains a number that didn't come from the data");

  for (const word of NUMBER_WORDS) {
    if (count(rewritten, word) > count(original, word)) problems.push(`adds number word "${word}"`);
  }
  for (const word of CERTAINTY_WORDS) {
    const was = count(original, word);
    const is = count(rewritten, word);
    if (is > was) problems.push(`adds certainty word "${word}"`);
    if ((CONFIDENCE_SCALE as readonly string[]).includes(word) && was > 0 && is === 0) {
      problems.push(`drops confidence word "${word}"`);
    }
  }
  return problems;
}

/** Checks a whole package's templates: no stray digits, every placeholder filled. Used on template output too. */
export function checkPackage(pkg: EvidencePackage): string[] {
  const problems: string[] = [];
  for (const template of [pkg.headline, ...pkg.statements.map((s) => s.template)]) {
    if (/\d/.test(template.replace(/\{\{\w+\}\}/g, ""))) problems.push(`template has a raw number: ${template}`);
    for (const name of slotNames(template)) {
      if (!pkg.slots[name]) problems.push(`template uses unknown placeholder {{${name}}}`);
    }
  }
  return problems;
}

function count(text: string, word: string): number {
  return text.match(new RegExp(`\\b${word}\\b`, "gi"))?.length ?? 0;
}
