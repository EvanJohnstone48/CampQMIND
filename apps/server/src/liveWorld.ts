// The live world the server runs: the clock-independent part, so it can be tested without sockets.
// Holds the current state, every shift's inputs (for revert and saving runs), periodic snapshots,
// and the Overseer's queued actions.

import type {
  Brain,
  ClientMessage,
  Intent,
  MinerSeed,
  NarratorCard,
  ShiftRecord,
  OverseerAction,
  ServerMessage,
  ServerStatus,
  ShiftInputs,
  WorldMap,
} from "@motherlode/shared";
import {
  DIAL_DEFS,
  baselineBrain,
  createWorld,
  forkCompare,
  hashState,
  jobViews,
  minerPublic,
  observeAll,
  siteViews,
  snapshot,
  step,
  type RunLog,
  type SimContext,
  type WorldState,
} from "@motherlode/sim";
import type { BrainProvider } from "./brains";

const SNAPSHOT_EVERY = 10;

export interface LiveWorldOptions {
  seed: string;
  map: WorldMap;
  population: number | MinerSeed[];
  roundMs: number;
  brains: BrainProvider;
  /**
   * A synchronous, repeatable brain for Oracle forks and for miners whose brain answers too late
   * (default: the sim's baseline). LLM miners are approximated by it in forks.
   */
  syncBrain?: Brain;
  /** Lane 3's narrator; cards ride along with each shift. */
  narrator?: NarratorHook;
  /** Shown to browsers, e.g. "agents (fuzzy)". */
  brainsLabel?: string;
  /** Wait for a viewer to press play before the first shift. */
  startPaused?: boolean;
  /** Max time to wait for brains each shift; late miners fall back to the baseline brain. */
  brainBudgetMs?: number;
}

export interface NarratorHook {
  push(record: ShiftRecord): Promise<NarratorCard[]>;
  cards(): NarratorCard[];
  rewind(shift: number): void;
}

export class LiveWorld {
  readonly ctx: SimContext;
  state: WorldState;
  paused = false;
  roundMs: number;
  private readonly start: WorldState;
  private readonly inputs: ShiftInputs[] = [];
  private readonly snapshots = new Map<number, WorldState>();
  private queued: OverseerAction[] = [];
  private busy = false;

  constructor(private readonly opts: LiveWorldOptions) {
    const { ctx, state } = createWorld({ seed: opts.seed, map: opts.map, population: opts.population });
    this.ctx = ctx;
    this.state = state;
    this.start = state;
    this.roundMs = opts.roundMs;
    this.paused = opts.startPaused ?? false;
    this.snapshots.set(0, state);
  }

  status(): ServerStatus {
    return { paused: this.paused, roundMs: this.roundMs, shift: this.state.shift };
  }

  hello(): ServerMessage {
    return {
      type: "hello",
      map: this.opts.map,
      dialDefs: DIAL_DEFS,
      snapshot: snapshot(this.ctx, this.state),
      status: this.status(),
      cards: this.opts.narrator?.cards() ?? [],
      brains: this.opts.brainsLabel ?? "custom",
    };
  }

  /** Resolves one shift. Returns the message to broadcast, or undefined if a shift is already running. */
  async tick(): Promise<ServerMessage | undefined> {
    if (this.busy) return undefined;
    this.busy = true;
    try {
      const obs = observeAll(this.ctx, this.state);
      const intents = await withBudget(this.opts.brains(obs, this.state), this.opts.brainBudgetMs ?? Math.max(500, this.roundMs * 0.8));
      const fallback = this.opts.syncBrain ?? baselineBrain;
      for (const m of this.state.miners) if (!intents[m.id]) intents[m.id] = fallback(obs[m.id]);
      const inputs: ShiftInputs = { intents: intents as Record<string, Intent>, overseer: this.queued };
      this.queued = [];
      const { state, record } = step(this.ctx, this.state, inputs);
      this.inputs.push(stripTraces(inputs));
      this.state = state;
      if (state.shift % SNAPSHOT_EVERY === 0) this.snapshots.set(state.shift, state);
      const cards = this.opts.narrator ? await this.opts.narrator.push(record) : [];
      return {
        type: "shift",
        update: { ...record, miners: state.miners.map((m) => minerPublic(state, m)), sites: siteViews(this.ctx, state), jobs: jobViews(state), cards },
      };
    } finally {
      this.busy = false;
    }
  }

  /** Handles a browser command. Returns messages for the sender and for everyone. */
  handle(msg: ClientMessage): { reply?: ServerMessage; broadcast?: ServerMessage } {
    switch (msg.type) {
      case "overseer":
        this.queued.push(msg.action);
        return {};
      case "pause":
        this.paused = true;
        return { broadcast: { type: "status", status: this.status() } };
      case "resume":
        this.paused = false;
        return { broadcast: { type: "status", status: this.status() } };
      case "speed":
        this.roundMs = Math.max(100, Math.min(60_000, Math.floor(msg.roundMs)));
        return { broadcast: { type: "status", status: this.status() } };
      case "revert":
        this.revert(msg.toShift);
        return { broadcast: { type: "reverted", snapshot: snapshot(this.ctx, this.state), cards: this.opts.narrator?.cards() ?? [] } };
      case "fork": {
        const shifts = Math.max(1, Math.min(500, Math.floor(msg.shifts)));
        const res = forkCompare(this.ctx, this.state, shifts, msg.actions, this.opts.syncBrain ?? baselineBrain);
        return { reply: { type: "forkResult", requestId: msg.requestId, baseline: res.baseline, variant: res.variant } };
      }
      default:
        return { reply: { type: "error", message: `unknown message type "${(msg as { type?: string }).type}"` } };
    }
  }

  /** Back to the world as it was at the END of `toShift`; everything after is discarded. */
  revert(toShift: number): void {
    const target = Math.max(0, Math.min(this.state.shift, Math.floor(toShift) + 1));
    let from = 0;
    for (const s of this.snapshots.keys()) if (s <= target && s > from) from = s;
    let state = this.snapshots.get(from) ?? this.start;
    for (let s = from; s < target; s++) state = step(this.ctx, state, this.inputs[s]).state;
    this.state = state;
    this.inputs.length = target;
    for (const s of [...this.snapshots.keys()]) if (s > target) this.snapshots.delete(s);
    this.queued = [];
    this.opts.narrator?.rewind(target - 1);
  }

  /** The run so far, replayable with `pnpm sim replay`. */
  runLog(): RunLog {
    return {
      version: 1,
      map: this.opts.map,
      config: { seed: this.opts.seed, population: this.opts.population },
      inputs: this.inputs,
      metrics: [],
      finalHash: hashState(this.state),
    };
  }
}

function stripTraces(inputs: ShiftInputs): ShiftInputs {
  const intents: Record<string, Intent> = {};
  for (const [id, it] of Object.entries(inputs.intents)) {
    const { trace: _trace, ...rest } = it;
    intents[id] = rest;
  }
  return { ...inputs, intents };
}

async function withBudget<T extends object>(p: Promise<T>, ms: number): Promise<Partial<T>> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<Partial<T>>((resolve) => {
    timer = setTimeout(() => resolve({}), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
