// The live adapter against a fake server: Lane 1's messages in, Lane 4's WorldView and panel state out.
import { describe, expect, it, vi } from 'vitest';
import type { ClientMessage, ServerMessage } from '@motherlode/shared';
import { ALPINE_VALLEY } from '@motherlode/shared';
import { PLACEHOLDER_MAP, createWorld, decideAll, minerPublic, siteViews, jobViews, snapshot, step, DIAL_DEFS } from '@motherlode/sim';
import { fuzzyBrain, generatePopulation } from '@motherlode/agents';
import { connectLive } from './live';
import type { WorldView } from './world';

class FakeSocket {
  static OPEN = 1;
  static last: FakeSocket;
  readyState = 1;
  sent: ClientMessage[] = [];
  onmessage?: (e: { data: string }) => void;
  onclose?: () => void;
  onerror?: () => void;
  constructor(public url: string) { FakeSocket.last = this; }
  send(text: string) { this.sent.push(JSON.parse(text)); }
  close() { this.onclose?.(); }
  push(msg: ServerMessage) { this.onmessage?.({ data: JSON.stringify(msg) }); }
}

function world() {
  const population = generatePopulation('web', 20, 0);
  return createWorld({ seed: 'web', map: ALPINE_VALLEY, population });
}

describe('live connection', () => {
  it('shows the demo until the server says hello, then the server\'s world', () => {
    vi.useFakeTimers();
    const live = connectLive('ws://test', FakeSocket as unknown as typeof WebSocket);
    const views: WorldView[] = [];
    const stop = live.source.connect(v => views.push(v));
    expect(views.at(-1)!.sourceLabel).toBe('Connecting…');
    expect(views.at(-1)!.miners).toHaveLength(100); // Lane 4's demo

    const { ctx, state } = world();
    FakeSocket.last.push({ type: 'hello', map: ALPINE_VALLEY, dialDefs: DIAL_DEFS, snapshot: snapshot(ctx, state), status: { paused: false, roundMs: 3000, shift: 0 }, cards: [], brains: 'agents (fuzzy)' });
    vi.advanceTimersByTime(150);
    const v = views.at(-1)!;
    expect(v.sourceLabel).toBe('Live · shift 0');
    expect(v.miners).toHaveLength(20);
    expect(v.miners[0].name).toBe(state.miners[0].name);
    expect(live.getState().connection).toBe('live');
    stop();
    vi.useRealTimers();
  });

  it('turns a shift into walking miners, panel data and narrator cards', () => {
    vi.useFakeTimers();
    const live = connectLive('ws://test', FakeSocket as unknown as typeof WebSocket);
    const views: WorldView[] = [];
    live.source.connect(v => views.push(v));
    const { ctx, state } = world();
    FakeSocket.last.push({ type: 'hello', map: ALPINE_VALLEY, dialDefs: DIAL_DEFS, snapshot: snapshot(ctx, state), status: { paused: false, roundMs: 3000, shift: 0 }, cards: [], brains: 'agents (fuzzy)' });
    const res = step(ctx, state, { intents: decideAll(ctx, state, fuzzyBrain), overseer: [{ type: 'setDial', key: 'interestRate', value: 0.02 }] });
    const card = { id: 'c1', round: 0, topic: 'gold', startRound: 0, headline: 'Gold is up', statements: [], confidence: 'likely', priority: 1, evidence: [], writtenBy: 'template' as const };
    FakeSocket.last.push({ type: 'shift', update: { ...res.record, miners: res.state.miners.map(m => minerPublic(res.state, m)), sites: siteViews(ctx, res.state), jobs: jobViews(res.state), cards: [card] } });
    vi.advanceTimersByTime(1500); // past the walking part of the shift
    const s = live.getState();
    expect(s.shift).toBe(1);
    expect(s.cards).toHaveLength(1);
    expect(s.dials.interestRate).toBe(0.02);
    expect(s.events.some(e => e.kind === 'dial-changed')).toBe(true);
    const v = views.at(-1)!;
    const worker = v.miners.find(m => m.working);
    expect(worker).toBeDefined();
    expect(worker!.activity).toMatch(/^(Digging|Chopping|Farming|Smelting|Building|Working)/);
    vi.useRealTimers();
  });

  it('sends the Overseer\'s commands to the server', () => {
    const live = connectLive('ws://test', FakeSocket as unknown as typeof WebSocket);
    live.overseer({ type: 'actOfGod', kind: 'drought' });
    live.source.setPaused?.(true);
    live.source.setSpeed?.(4);
    live.fork('Drought', 10, [{ type: 'actOfGod', kind: 'drought' }]);
    expect(FakeSocket.last.sent.map(m => m.type)).toEqual(['overseer', 'pause', 'speed', 'fork']);
    expect(FakeSocket.last.sent[2]).toEqual({ type: 'speed', roundMs: 750 });
  });

  it('keeps the placeholder map working too', () => {
    expect(PLACEHOLDER_MAP.sites.length).toBeGreaterThan(0);
  });
});
