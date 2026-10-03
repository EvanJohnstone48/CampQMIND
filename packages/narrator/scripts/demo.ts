// Prints the cards each scenario produces, shift by shift.
//   pnpm demo                    all scenarios, template wording
//   pnpm demo gold-rush          one scenario
//   pnpm demo gold-rush --llm    reword with Gemini (needs GEMINI_API_KEY in the repo's .env)

import { createGeminiClient, createNarrator, makeScenario, playScenario, SCENARIO_NAMES, type Card } from "../src/index.js";

const args = process.argv.slice(2);
const useLlm = args.includes("--llm");
const names = args.filter((a) => !a.startsWith("--"));

try {
  process.loadEnvFile(new URL("../../../.env", import.meta.url));
} catch {
  // No .env: fine for template wording.
}

const apiKey = process.env.GEMINI_API_KEY;
if (useLlm && !apiKey) {
  console.error("--llm needs GEMINI_API_KEY in .env");
  process.exit(1);
}

for (const name of names.length ? names : SCENARIO_NAMES) {
  const scenario = makeScenario(name);
  console.log(`\n━━ ${scenario.name}: ${scenario.description}`);
  const narrator = createNarrator(scenario.config, {
    llm: useLlm && apiKey ? createGeminiClient(apiKey) : undefined,
    onProblem: (m) => console.log(`   (note: ${m})`),
  });
  const cards = await playScenario(scenario, narrator);
  if (!cards.length) console.log("   Nothing notable.");
  cards.forEach(print);
}

function print(card: Card) {
  console.log(`\n   [shift ${card.round}] ${card.headline}   (cause: ${card.confidence}, ${card.writtenBy})`);
  for (const s of card.statements) console.log(`     ${s.kind.padEnd(9)} ${s.text}`);
}
