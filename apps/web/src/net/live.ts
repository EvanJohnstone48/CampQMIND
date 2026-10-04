// The live connection to the server (Lane 1's WebSocket protocol), and the adapter that turns
// each shift into Lane 4's WorldView. Panels read the rest (cards, metrics, dials...) from the
// same LiveStore. If the server can't be reached, the 3D view falls back to the local demo.

import { useSyncExternalStore } from 'react';
import type {
  ClientMessage,
  DialDef,
  MinerActivity,
  MinerPublic,
  NarratorCard,
  OverseerAction,
  ServerMessage,
  ServerStatus,
  ShiftMetrics,
  SiteView,
  WorldEvent,
  WorldMap,
} from '@motherlode/shared';
import { demoPlaces, demoSnapshot } from './demo.ts';
import { demoHomes, residentRoute } from './demoMap.ts';
import { pointOnRoute } from './world.ts';
import type { BuildingView, MinerView, Point, Trade, WorldSource, WorldView } from './world.ts';

export type Connection = 'connecting' | 'live' | 'offline';

export interface ForkResult {
  requestId: string;
  label: string;
  baseline: ShiftMetrics[];
  variant: ShiftMetrics[];
}

export interface LiveState {
  connection: Connection;
  status?: ServerStatus;
  brains: string;
  map?: WorldMap;
  dialDefs: DialDef[];
  dials: Record<string, number>;
  shift: number;
  day: number;
  miners: MinerPublic[];
  activities: MinerActivity[];
  sites: SiteView[];
  /** Recent metrics, oldest first. */
  metrics: ShiftMetrics[];
  /** Recent notable events, newest last. */
  events: WorldEvent[];
  cards: NarratorCard[];
  forks: ForkResult[];
  error?: string;
}

/** Events worth showing on the timeline (routine ones like each trade stay out). */
const NOTABLE = new Set(['act-of-god', 'god-power', 'dial-changed', 'rumour', 'credit-freeze', 'credit-thaw', 'vein-exhausted', 'forest-depleted', 'house-complete', 'loan-default', 'collapse']);

const SPEEDS: Record<number, number> = { 1: 3000, 4: 750, 12: 250 };
/** Share of a shift spent walking to the next job; the rest is spent working there. */
const WALK_SHARE = 0.75;

export interface LiveConnection {
  /** Feeds Lane 4's 3D view. */
  source: WorldSource;
  getState(): LiveState;
  subscribe(listener: () => void): () => void;
  send(msg: ClientMessage): void;
  overseer(action: OverseerAction): void;
  fork(label: string, shifts: number, actions: OverseerAction[]): void;
  close(): void;
}

export function useLive(live: LiveConnection): LiveState {
  return useSyncExternalStore(live.subscribe, live.getState, live.getState);
}

export function connectLive(url: string, WS: typeof WebSocket = WebSocket): LiveConnection {
  let state: LiveState = { connection: 'connecting', brains: '', dialDefs: [], dials: {}, shift: 0, day: 0, miners: [], activities: [], sites: [], metrics: [], events: [], cards: [], forks: [] };
  const listeners = new Set<() => void>();
  const set = (patch: Partial<LiveState>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  };
  const motion = new Motion();
  const forkLabels = new Map<string, string>();
  let ws: WebSocket | undefined;
  let closed = false;
  let retry: ReturnType<typeof setTimeout> | undefined;

  function open() {
    try {
      ws = new WS(url);
    } catch {
      set({ connection: 'offline' });
      return;
    }
    ws.onmessage = (e) => handle(JSON.parse(String(e.data)) as ServerMessage);
    ws.onclose = () => {
      if (closed) return;
      set({ connection: 'offline' });
      retry = setTimeout(open, 3000);
    };
    ws.onerror = () => ws?.close();
  }

  function handle(msg: ServerMessage) {
    switch (msg.type) {
      case 'hello':
        motion.reset(msg.snapshot.miners, msg.map);
        set({
          connection: 'live', status: msg.status, brains: msg.brains, map: msg.map, dialDefs: msg.dialDefs, dials: msg.snapshot.dials,
          shift: msg.snapshot.shift, day: msg.snapshot.day, miners: msg.snapshot.miners, sites: msg.snapshot.sites, activities: [],
          metrics: msg.snapshot.metrics ? [msg.snapshot.metrics] : [], events: [], cards: msg.cards, error: undefined,
        });
        return;
      case 'shift': {
        const u = msg.update;
        motion.shift(u.miners, u.activities, state.status?.roundMs ?? 3000);
        const dials = { ...state.dials };
        for (const e of u.events) if (e.kind === 'dial-changed' && typeof e.data?.key === 'string') dials[e.data.key] = Number(e.data.to);
        set({
          shift: u.shift + 1, day: u.day, miners: u.miners, activities: u.activities, sites: u.sites, dials,
          metrics: [...state.metrics, u.metrics].slice(-300),
          events: [...state.events, ...u.events.filter((e) => NOTABLE.has(e.kind))].slice(-150),
          cards: [...state.cards, ...u.cards].slice(-100),
        });
        return;
      }
      case 'status':
        set({ status: msg.status });
        return;
      case 'reverted':
        motion.reset(msg.snapshot.miners, state.map);
        set({
          shift: msg.snapshot.shift, day: msg.snapshot.day, miners: msg.snapshot.miners, sites: msg.snapshot.sites, dials: msg.snapshot.dials, activities: [],
          metrics: state.metrics.filter((m) => m.shift < msg.snapshot.shift), events: state.events.filter((e) => e.shift < msg.snapshot.shift), cards: msg.cards,
        });
        return;
      case 'forkResult':
        set({ forks: [{ requestId: msg.requestId, label: forkLabels.get(msg.requestId) ?? 'What if', baseline: msg.baseline, variant: msg.variant }, ...state.forks].slice(0, 5) });
        return;
      case 'error':
        set({ error: msg.message });
        return;
    }
  }

  const send = (msg: ClientMessage) => {
    if (ws?.readyState === WS.OPEN) ws.send(JSON.stringify(msg));
  };

  open();

  // Pause and speed also drive the fallback demo while the server is unreachable.
  let localPaused = false;
  let localSpeed = 1;
  const source: WorldSource = {
    connect(publish) {
      const started = performance.now();
      let demoClock = 0;
      let last = started;
      const tick = () => {
        const now = performance.now();
        const dt = Math.min((now - last) / 1000, 0.5);
        last = now;
        if (state.connection !== 'live' || !state.map) {
          // No server: keep the valley alive with Lane 4's local demo.
          if (!localPaused) demoClock += dt * localSpeed;
          const demo = demoSnapshot(demoClock);
          publish({ ...demo, sourceLabel: state.connection === 'connecting' ? 'Connecting…' : 'Offline demo' });
          return;
        }
        if (!state.status?.paused) demoClock += dt * (3000 / (state.status?.roundMs ?? 3000));
        publish(toWorldView(state, motion, now, demoClock));
      };
      tick();
      const timer = setInterval(tick, 100);
      return () => clearInterval(timer);
    },
    setPaused(paused) {
      localPaused = paused;
      send({ type: paused ? 'pause' : 'resume' });
    },
    setSpeed(speed) {
      localSpeed = speed;
      send({ type: 'speed', roundMs: SPEEDS[speed] ?? Math.round(3000 / speed) });
    },
  };

  return {
    source,
    getState: () => state,
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    send,
    overseer: (action) => send({ type: 'overseer', action }),
    fork(label, shifts, actions) {
      const requestId = `q${Date.now().toString(36)}`;
      forkLabels.set(requestId, label);
      send({ type: 'fork', requestId, shifts, actions });
    },
    close() {
      closed = true;
      clearTimeout(retry);
      ws?.close();
    },
  };
}

// ---------------------------------------------------------------- the 3D view

/** Remembers where each miner was heading, so beans walk Lane 4's streets between shifts. */
class Motion {
  private from = new Map<string, Point>();
  private to = new Map<string, { route: readonly Point[]; outbound: boolean }>();
  private shiftAt = 0;
  private roundMs = 3000;
  private sitePos = new Map<string, Point>();
  private sitePlace = new Map<string, string>();

  reset(miners: MinerPublic[], map?: WorldMap) {
    if (map) {
      for (const s of map.sites) {
        this.sitePos.set(s.id, [s.position.x, s.position.z]);
        this.sitePlace.set(s.id, String((s.extras as { placeId?: string } | undefined)?.placeId ?? 'town'));
      }
    }
    this.from.clear();
    this.to.clear();
    for (const m of miners) {
      const home = homeDoor(m);
      this.from.set(m.id, home);
      this.to.set(m.id, { route: [home], outbound: false });
    }
    this.shiftAt = performance.now();
  }

  shift(miners: MinerPublic[], activities: MinerActivity[], roundMs: number) {
    const now = performance.now();
    // Where each bean is now becomes the start of its next walk.
    for (const m of miners) this.from.set(m.id, this.position(m.id, now) ?? homeDoor(m));
    const act = new Map(activities.map((a) => [a.minerId, a]));
    for (const m of miners) {
      const a = act.get(m.id);
      const working = !!a && a.action !== 'rest';
      const start = this.from.get(m.id)!;
      if (!working) {
        this.to.set(m.id, { route: [start, homeDoor(m)], outbound: false });
        continue;
      }
      const siteId = a!.siteId ?? m.destination;
      const place = this.sitePlace.get(siteId) ?? 'town';
      const station = jitter(this.sitePos.get(siteId) ?? homeDoor(m), m.id);
      const route = place === 'town' ? [start, station] : [start, ...residentRoute(homeIndex(m), place).slice(1, -1), station];
      this.to.set(m.id, { route, outbound: true });
    }
    this.shiftAt = now;
    this.roundMs = roundMs;
  }

  /** Walk during the first ~75% of a shift, then stay put (working or resting). */
  private walkMs() {
    return this.roundMs * WALK_SHARE;
  }

  position(id: string, now: number): Point | undefined {
    const leg = this.to.get(id);
    if (!leg) return undefined;
    return pointOnRoute(leg.route, Math.min(1, (now - this.shiftAt) / this.walkMs()));
  }

  motion(id: string): MinerView['motion'] {
    const leg = this.to.get(id);
    return leg ? { route: leg.route, start: this.shiftAt, duration: this.walkMs() } : undefined;
  }

  arrived(now: number): boolean {
    return now - this.shiftAt >= this.walkMs();
  }

  siteName(id: string, map?: WorldMap) {
    return map?.sites.find((s) => s.id === id)?.name ?? id;
  }

  placeOf(siteId: string) {
    return this.sitePlace.get(siteId) ?? 'town';
  }
}

const TRADES: Record<string, Trade> = { dig: 'Miner', chop: 'Woodcutter', farm: 'Farmer', smelt: 'Smelter', build: 'Builder', work: 'Hauler' };

function toWorldView(s: LiveState, motion: Motion, now: number, clock: number): WorldView {
  const act = new Map(s.activities.map((a) => [a.minerId, a]));
  const owners = new Map(s.miners.map((m) => [m.id, m.name]));
  const walking = !motion.arrived(now);
  const miners: MinerView[] = s.miners.map((m) => {
    const a = act.get(m.id);
    const action = a?.action ?? 'rest';
    const site = a?.siteId ?? m.destination;
    const place = action === 'rest' ? 'town' : motion.placeOf(site);
    const home = homeIndex(m);
    return {
      id: m.id,
      name: m.name,
      trade: m.injured ? 'Villager' : action === 'rest' ? 'Villager' : TRADES[action] ?? 'Villager',
      activity: describe(m, a, s.map, walking),
      position: motion.position(m.id, now) ?? homeDoor(m),
      motion: motion.motion(m.id),
      destinationId: place,
      working: action !== 'rest' && !walking,
      color: m.look ? `hsl(${m.look.hue} 42% 62%)` : '#cf9c68',
      homeId: demoHomes[home].id,
      route: action === 'rest' ? undefined : place === 'town' ? undefined : residentRoute(home, place),
    };
  });
  return {
    sourceLabel: `Live · shift ${s.shift}`,
    elapsed: clock,
    hour: (8 + clock / 10) % 24,
    day: s.day + 1,
    places: demoPlaces,
    buildings: buildings(s, owners),
    miners,
  };
}

function buildings(s: LiveState, owners: Map<string, string>): BuildingView[] {
  const lots = new Map(s.sites.filter((x) => x.kind === 'houseLot').map((x) => [x.id, x]));
  return demoHomes.map((h) => {
    const lot = lots.get(h.id);
    const owner = lot?.ownerId ? owners.get(lot.ownerId) : undefined;
    const b = lot?.building;
    const description = !lot?.ownerId
      ? 'An empty lot. Lodgers sleep here on bunkhouse beds rented from the town; anyone with timber, copper and the lot price can build a house.'
      : lot.ownerId === 'town'
        ? 'Foreclosed by the bank. The town will sell it to whoever can pay.'
        : b && !b.complete
          ? `${owner ?? 'A miner'} is building a house here (${Math.round((b.progress / b.required) * 100)}% done).`
          : `${owner ?? 'A miner'}'s own house.`;
    return { ...h, description };
  });
}

function describe(m: MinerPublic, a: MinerActivity | undefined, map: WorldMap | undefined, walking: boolean): string {
  if (m.injured) return 'Recovering from an injury';
  if (!a || a.action === 'rest') return m.home === 'house' ? 'Resting at home' : m.home === 'bunkhouse' ? 'Resting in the bunkhouse' : 'Sleeping rough';
  const where = map?.sites.find((x) => x.id === a.siteId)?.name ?? a.siteId ?? '';
  if (walking) return `Walking to ${where}`;
  const verbs: Record<string, string> = { dig: 'Digging at', chop: 'Chopping in', farm: 'Farming', smelt: 'Smelting at', build: 'Building on' };
  const verb = verbs[a.action] ?? 'Working at';
  return `${verb} ${where}${m.employerId ? ` (for ${m.employerId})` : ''}`;
}

/** House owners live in their own chalet; lodgers are spread across the chalets' rented beds. */
function homeIndex(m: MinerPublic): number {
  const own = /^home-(\d+)$/.exec(m.homeSiteId ?? '');
  if (own) return Number(own[1]) % demoHomes.length;
  const n = Number(m.id.replace(/\D/g, '')) || 0;
  return n % demoHomes.length;
}

function homeDoor(m: MinerPublic): Point {
  const h = demoHomes[homeIndex(m)].position;
  return [h[0], h[1] + 1.9];
}

function jitter(p: Point, id: string): Point {
  const n = Number(id.replace(/\D/g, '')) || 0;
  return [p[0] + ((n % 5) - 2) * 0.45, p[1] + 1.6 + (Math.floor(n / 5) % 3) * 0.45];
}

export const DEFAULT_SERVER_URL = 'ws://127.0.0.1:8787';

const noLive = () => () => {};
const nothing = () => undefined;
/** Like useLive, but for components that also run without a server (the demo). */
export function useLiveMaybe(live?: LiveConnection): LiveState | undefined {
  return useSyncExternalStore(live?.subscribe ?? noLive, live?.getState ?? nothing, live?.getState ?? nothing);
}
