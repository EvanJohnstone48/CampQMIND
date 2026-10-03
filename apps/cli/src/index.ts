// Motherlode from the terminal: run, record, replay, compare and balance-test worlds without a browser.
//
//   pnpm sim run --seed demo --shifts 500 [--out runs/demo.json] [--traces]
//   pnpm sim replay runs/demo.json
//   pnpm sim diff runs/a.json runs/b.json
//   pnpm sim balance [--seeds 5] [--shifts 2000]
//   pnpm sim fixture [--seed demo] [--shifts 80] [--out fixtures/demo.ndjson]
//   pnpm sim map-check path/to/map.json
// Every command takes --map path/to/map.json to use Lane 4's map instead of the placeholder.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { OverseerAction, ServerMessage, ShiftMetrics, WorldMap } from "@motherlode/shared";
import {
  DIAL_DEFS,
  PLACEHOLDER_MAP,
  balanceReport,
  createWorld,
  hashState,
  minerPublic,
  jobViews,
  recordRun,
  replayRun,
  siteViews,
  snapshot,
  validateMap,
  type RunLog,
} from "@motherlode/sim";

// pnpm runs scripts from the package folder; resolve user paths against where they ran the command.
const cwd = process.env.INIT_CWD ?? process.cwd();
const [command, ...rest] = process.argv.slice(2);
const { flags, positional } = parseArgs(rest);

function main(): number {
  switch (command) {
    case "run":
      return cmdRun();
    case "replay":
      return cmdReplay();
    case "diff":
      return cmdDiff();
    case "balance":
      return cmdBalance();
    case "fixture":
      return cmdFixture();
    case "map-check":
      return cmdMapCheck();
    default:
      console.log(readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(0, 10).join("\n"));
      return command ? 1 : 0;
  }
}

function cmdRun(): number {
  const seed = str("seed", "demo");
  const shifts = num("shifts", 500);
  const population = num("pop", 100);
  const t0 = Date.now();
  const { log } = recordRun(loadMapFlag(), { seed, population }, {
    shifts,
    onShift: (r) => {
      if (r.shift % 100 === 0) process.stderr.write(`  shift ${r.shift}\r`);
    },
  });
  if (!flags.traces) for (const inp of log.inputs) for (const it of Object.values(inp.intents)) delete it.trace;
  printSummary(log.metrics);
  console.log(`\n${shifts} shifts in ${((Date.now() - t0) / 1000).toFixed(1)}s, final hash ${log.finalHash}`);
  const out = flags.out as string | undefined;
  if (out) {
    writeJson(out, log);
    console.log(`Saved run to ${out}`);
  }
  return 0;
}

function cmdReplay(): number {
  const file = positional[0];
  if (!file) return usage("replay <run.json>");
  const log = readJson<RunLog>(file);
  const { state } = replayRun(log);
  const hash = hashState(state);
  const ok = hash === log.finalHash;
  console.log(ok ? `Replay matches (hash ${hash}).` : `Replay DIVERGED: got ${hash}, recorded ${log.finalHash}.`);
  return ok ? 0 : 1;
}

function cmdDiff(): number {
  const [a, b] = positional;
  if (!a || !b) return usage("diff <a.json> <b.json>");
  const la = readJson<RunLog>(a);
  const lb = readJson<RunLog>(b);
  const n = Math.min(la.metrics.length, lb.metrics.length);
  let first = -1;
  for (let i = 0; i < n; i++) {
    if (JSON.stringify(la.metrics[i]) !== JSON.stringify(lb.metrics[i])) {
      first = i;
      break;
    }
  }
  if (first === -1) {
    console.log(`No differences in the first ${n} shifts.`);
    return 0;
  }
  console.log(`First divergence at shift ${la.metrics[first].shift}.`);
  const end = n - 1;
  const rows: [string, number, number][] = [
    ["mean well-being", la.metrics[end].meanWellbeing, lb.metrics[end].meanWellbeing],
    ["hungry share", la.metrics[end].hungryFrac, lb.metrics[end].hungryFrac],
    ["gini", la.metrics[end].gini, lb.metrics[end].gini],
    ["money total", la.metrics[end].money.total, lb.metrics[end].money.total],
    ["debt total", la.metrics[end].debt.total, lb.metrics[end].debt.total],
    ["food price", la.metrics[end].prices.food, lb.metrics[end].prices.food],
    ["copper price", la.metrics[end].prices.copper, lb.metrics[end].prices.copper],
    ["forest", la.metrics[end].forestFraction, lb.metrics[end].forestFraction],
  ];
  console.log(`At shift ${la.metrics[end].shift}:`);
  for (const [k, x, y] of rows) console.log(`  ${k.padEnd(16)} ${String(x).padStart(10)} ${String(y).padStart(10)}  (${fmtDelta(y - x)})`);
  return 0;
}

function cmdBalance(): number {
  const seeds = num("seeds", 5);
  const shifts = num("shifts", 2000);
  const map = loadMapFlag();
  let allPass = true;
  const failures = new Map<string, number>();
  for (let i = 0; i < seeds; i++) {
    const seed = `balance-${i}`;
    const t0 = Date.now();
    const { log } = recordRun(map, { seed, population: num("pop", 100) }, { shifts });
    const report = balanceReport(log.metrics);
    allPass &&= report.pass;
    const failed = report.checks.filter((c) => !c.pass && !c.soft);
    for (const c of failed) failures.set(c.name, (failures.get(c.name) ?? 0) + 1);
    console.log(`${seed.padEnd(12)} ${report.pass ? "PASS" : "FAIL"}  (${((Date.now() - t0) / 1000).toFixed(0)}s)${failed.length ? "  " + failed.map((c) => `${c.name}=${c.value} [${c.target}]`).join("; ") : ""}`);
  }
  console.log(allPass ? `\nAll ${seeds} seeds healthy.` : `\nFailing checks: ${[...failures].map(([k, v]) => `${k} (${v}/${seeds})`).join(", ")}`);
  return allPass ? 0 : 1;
}

/**
 * A recorded stream of exactly what the server would send, so Lanes 3 and 4 can build
 * against real data before the live server is up. A few acts of god are scripted in.
 */
function cmdFixture(): number {
  const seed = str("seed", "demo");
  const shifts = num("shifts", 80);
  const out = str("out", "fixtures/demo.ndjson");
  const map = loadMapFlag();
  const { ctx, state: start } = createWorld({ seed, map });
  const plan: Record<number, OverseerAction[]> = {
    [Math.floor(shifts * 0.25)]: [{ type: "actOfGod", kind: "goldRush" }],
    [Math.floor(shifts * 0.5)]: [{ type: "godPower", kind: "lightning", minerId: start.miners[0].id }],
    [Math.floor(shifts * 0.75)]: [{ type: "actOfGod", kind: "earthquake" }],
  };
  const lines: ServerMessage[] = [{ type: "hello", map, dialDefs: DIAL_DEFS, snapshot: snapshot(ctx, start), status: { paused: false, roundMs: 3000, shift: 0 } }];
  recordRun(map, { seed, population: 100 }, {
    shifts,
    plan,
    onShift: (record, _inputs, state) => {
      lines.push({
        type: "shift",
        update: { ...record, miners: state.miners.map((m) => minerPublic(state, m)), sites: siteViews(ctx, state), jobs: jobViews(state) },
      });
    },
  });
  const path = resolve(cwd, out);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  console.log(`Wrote ${lines.length} messages (${shifts} shifts) to ${out}`);
  return 0;
}

function cmdMapCheck(): number {
  const file = positional[0];
  if (!file) return usage("map-check <map.json>");
  const problems = validateMap(readJson(file));
  if (problems.length) {
    console.log(`Map has ${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
    return 1;
  }
  console.log("Map is valid.");
  return 0;
}

// ---------------------------------------------------------------- helpers

function printSummary(metrics: ShiftMetrics[]): void {
  const step = Math.max(1, Math.floor(metrics.length / 10));
  console.log("shift   food  timb   ore  copp  gold   hungry  well-being  gini   money   debt  housed");
  for (let i = 0; i < metrics.length; i += step) row(metrics[i]);
  row(metrics[metrics.length - 1]);
  function row(m: ShiftMetrics) {
    const p = m.prices;
    console.log(
      `${String(m.shift).padStart(5)} ${[p.food, p.timber, p.copperOre, p.copper, p.gold].map((x) => String(x).padStart(5)).join(" ")}` +
        `   ${m.hungryFrac.toFixed(2).padStart(6)}  ${m.meanWellbeing.toFixed(3).padStart(10)}  ${m.gini.toFixed(2)} ${String(m.money.total).padStart(7)} ${String(m.debt.total).padStart(6)}  ${m.housedFrac.toFixed(2)}`,
    );
  }
}

function loadMapFlag(): WorldMap {
  const file = flags.map as string | undefined;
  return file ? readJson<WorldMap>(file) : PLACEHOLDER_MAP;
}

function parseArgs(args: string[]): { flags: Record<string, string | boolean>; positional: string[] } {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else flags[key] = true;
    } else positional.push(a);
  }
  return { flags, positional };
}

function str(key: string, fallback: string): string {
  return typeof flags[key] === "string" ? (flags[key] as string) : fallback;
}

function num(key: string, fallback: number): number {
  const v = Number(flags[key]);
  return Number.isFinite(v) && flags[key] !== undefined ? v : fallback;
}

function readJson<T = unknown>(file: string): T {
  return JSON.parse(readFileSync(resolve(cwd, file), "utf8")) as T;
}

function writeJson(file: string, data: unknown): void {
  const path = resolve(cwd, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data));
}

function fmtDelta(d: number): string {
  return `${d >= 0 ? "+" : ""}${Math.round(d * 1000) / 1000}`;
}

function usage(text: string): number {
  console.log(`usage: pnpm sim ${text}`);
  return 1;
}

process.exitCode = main();
