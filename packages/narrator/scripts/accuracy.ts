// How often is the narrator right? Plays every scenario across many seeds and
// scores the first card on the planted change against the ground truth.
//   pnpm accuracy          200 seeds per scenario
//   pnpm accuracy 50

import { createNarrator, makeScenario, playScenario, scoreScenario, SCENARIO_NAMES } from "../src/index.js";

const seeds = Number(process.argv[2] ?? 200);

console.log(`Scenario        right  missed  wrong  overclaimed  false alarms   (${seeds} seeds each)`);
for (const name of SCENARIO_NAMES) {
  const t = { right: 0, missed: 0, wrong: 0, overclaimed: 0, falseAlarms: 0 };
  for (let i = 0; i < seeds; i++) {
    const scenario = makeScenario(name, `seed-${i}`);
    const cards = await playScenario(scenario, createNarrator(scenario.config));
    const result = scoreScenario(scenario, cards);
    t[result.verdict]++;
    if (result.overclaimed) t.overclaimed++;
    t.falseAlarms += result.falseAlarms;
  }
  const pct = (n: number) => `${((100 * n) / seeds).toFixed(1)}%`.padStart(6);
  console.log(
    `${name.padEnd(14)} ${pct(t.right)}  ${pct(t.missed)} ${pct(t.wrong)}       ${pct(t.overclaimed)}       ${pct(t.falseAlarms)}`,
  );
}
