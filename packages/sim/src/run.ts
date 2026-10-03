// Running, recording, replaying and forking worlds. Everything synchronous; the live server
// wraps the same step() with async brains.

import {
  hashString,
  type Brain,
  type Intent,
  type MinerSeed,
  type OverseerAction,
  type ShiftInputs,
  type ShiftMetrics,
  type ShiftRecord,
  type WorldMap,
} from "@motherlode/shared";
import { baselineBrain } from "./baselineBrain";
import type { Dials } from "./dials";
import { observeAll } from "./observe";
import { step } from "./step";
import { createWorld, type SimContext, type WorldSetup, type WorldState } from "./world";

/** Ask a synchronous brain for every miner's intent. */
export function decideAll(ctx: SimContext, state: WorldState, brain: Brain): Record<string, Intent> {
  const obs = observeAll(ctx, state);
  const out: Record<string, Intent> = {};
  for (const m of state.miners) out[m.id] = brain(obs[m.id]);
  return out;
}

export interface RunOptions {
  shifts: number;
  brain?: Brain;
  /** Overseer actions to apply at a given shift. */
  plan?: Record<number, OverseerAction[]>;
  /** Called after each shift (for progress, streaming, recording). */
  onShift?: (record: ShiftRecord, inputs: ShiftInputs, state: WorldState) => void;
  checkInvariants?: boolean;
}

/** Runs a world forward. Returns the final state and every shift's metrics. */
export function runForward(ctx: SimContext, start: WorldState, opts: RunOptions): { state: WorldState; metrics: ShiftMetrics[] } {
  const brain = opts.brain ?? baselineBrain;
  let state = start;
  const metrics: ShiftMetrics[] = [];
  for (let i = 0; i < opts.shifts; i++) {
    const inputs: ShiftInputs = { intents: decideAll(ctx, state, brain), overseer: opts.plan?.[state.shift] ?? [] };
    const res = step(ctx, state, inputs, { checkInvariants: opts.checkInvariants });
    opts.onShift?.(res.record, inputs, res.state);
    metrics.push(res.record.metrics);
    state = res.state;
  }
  return { state, metrics };
}

/**
 * The Oracle's question: from `state`, what happens over `shifts` with these actions versus without?
 * Keyed randomness means the two branches differ only because of the actions.
 */
export function forkCompare(
  ctx: SimContext,
  state: WorldState,
  shifts: number,
  actions: OverseerAction[],
  brain: Brain = baselineBrain,
): { baseline: ShiftMetrics[]; variant: ShiftMetrics[]; baselineState: WorldState; variantState: WorldState } {
  const a = runForward(ctx, state, { shifts, brain });
  const b = runForward(ctx, state, { shifts, brain, plan: { [state.shift]: actions } });
  return { baseline: a.metrics, variant: b.metrics, baselineState: a.state, variantState: b.state };
}

/** Stable fingerprint of a world state. Same seed + same inputs => same hash. */
export function hashState(state: WorldState): string {
  return hashString(JSON.stringify(state)).toString(16).padStart(8, "0");
}

// ---------------------------------------------------------------- run logs

export interface RunConfig {
  seed: string;
  population: MinerSeed[] | number;
  dials?: Partial<Dials>;
  setup?: Partial<WorldSetup>;
}

/** Everything needed to rebuild a run exactly: the config plus every shift's inputs. */
export interface RunLog {
  version: 1;
  map: WorldMap;
  config: RunConfig;
  inputs: ShiftInputs[];
  metrics: ShiftMetrics[];
  finalHash: string;
}

export function recordRun(map: WorldMap, config: RunConfig, opts: RunOptions): { log: RunLog; state: WorldState; records: ShiftRecord[] } {
  const { ctx, state } = createWorld({ ...config, map });
  const inputs: ShiftInputs[] = [];
  const records: ShiftRecord[] = [];
  const res = runForward(ctx, state, {
    ...opts,
    onShift: (record, inp, st) => {
      inputs.push(inp);
      records.push(record);
      opts.onShift?.(record, inp, st);
    },
  });
  return { log: { version: 1, map, config, inputs, metrics: res.metrics, finalHash: hashState(res.state) }, state: res.state, records };
}

/** Rebuilds a run from its recorded inputs (no brains needed, so LLM runs replay exactly). */
export function replayRun(log: RunLog, upToShift = log.inputs.length): { ctx: SimContext; state: WorldState; records: ShiftRecord[] } {
  const { ctx, state: start } = createWorld({ ...log.config, map: log.map });
  let state = start;
  const records: ShiftRecord[] = [];
  for (const inputs of log.inputs.slice(0, upToShift)) {
    const res = step(ctx, state, inputs);
    records.push(res.record);
    state = res.state;
  }
  return { ctx, state, records };
}
