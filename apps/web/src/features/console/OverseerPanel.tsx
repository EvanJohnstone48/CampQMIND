// The Overseer's console: acts of god, powers over the selected miner, the dials, rewinding time,
// and the Oracle ("what if?"), which forks the world on the server and runs it forward both ways.

import { useMemo, useState } from 'react';
import type { DialDef, OverseerAction, ShiftMetrics } from '@motherlode/shared';
import type { LiveConnection, LiveState } from '../../net/live';

interface ActChoice { label: string; action: OverseerAction }

function acts(state: LiveState): ActChoice[] {
  const goldVeins = state.sites.filter(s => s.kind === 'vein' && s.ore === 'gold');
  return [
    ...goldVeins.map(v => ({ label: `Gold rush at ${v.name}`, action: { type: 'actOfGod', kind: 'goldRush', siteId: v.id } as OverseerAction })),
    { label: 'Earthquake', action: { type: 'actOfGod', kind: 'earthquake' } },
    { label: 'Forest fire', action: { type: 'actOfGod', kind: 'forestFire', region: 'timber-woods' } },
    { label: 'Drought', action: { type: 'actOfGod', kind: 'drought' } },
    { label: 'Copper price crash', action: { type: 'actOfGod', kind: 'priceShock', good: 'copper', magnitude: 0.5 } },
    { label: 'Gold price boom', action: { type: 'actOfGod', kind: 'priceShock', good: 'gold', magnitude: 1.6 } },
  ];
}

export function OverseerPanel({ live, state, selectedId }: { live: LiveConnection; state: LiveState; selectedId: string | null }) {
  const choices = acts(state);
  const [oracleChoice, setOracleChoice] = useState(0);
  const [oracleShifts, setOracleShifts] = useState(20);
  const [rewindTo, setRewindTo] = useState('');
  const selected = state.miners.find(m => m.id === selectedId);

  return <div className="overseer">
    <section>
      <h4>Acts of god</h4>
      <div className="overseer-grid">
        {choices.map(c => <button key={c.label} onClick={() => live.overseer(c.action)}>{c.label}</button>)}
      </div>
    </section>

    <section>
      <h4>Powers over a miner</h4>
      {selected ? <p className="overseer-note">On <strong>{selected.name}</strong> ({selected.cash} coins)</p> : <p className="overseer-note">Pick a miner in the valley or the Miners tab.</p>}
      <div className="overseer-grid">
        <button disabled={!selected} onClick={() => selected && live.overseer({ type: 'godPower', kind: 'lightning', minerId: selected.id })}>⚡ Lightning</button>
        <button disabled={!selected} onClick={() => selected && live.overseer({ type: 'godPower', kind: 'boon', minerId: selected.id })}>✨ Boon</button>
        <button disabled={!selected} onClick={() => selected && live.overseer({ type: 'godPower', kind: 'throw', minerId: selected.id })}>🌊 Into the river</button>
      </div>
    </section>

    <section>
      <h4>The Oracle: what if?</h4>
      <div className="overseer-row">
        <select aria-label="Action to test" value={oracleChoice} onChange={e => setOracleChoice(Number(e.target.value))}>
          {choices.map((c, i) => <option key={c.label} value={i}>{c.label}</option>)}
        </select>
        <label>for <input type="number" min={5} max={200} value={oracleShifts} onChange={e => setOracleShifts(Number(e.target.value))} aria-label="Shifts to look ahead" /> shifts</label>
        <button onClick={() => live.fork(choices[oracleChoice].label, oracleShifts, [choices[oracleChoice].action])}>Ask</button>
      </div>
      {state.forks.map(f => <ForkTable key={f.requestId} label={f.label} baseline={f.baseline} variant={f.variant} />)}
    </section>

    <section>
      <h4>Rewind</h4>
      <div className="overseer-row">
        <label>Back to the end of shift <input type="number" min={0} max={Math.max(0, state.shift - 1)} value={rewindTo} onChange={e => setRewindTo(e.target.value)} aria-label="Shift to rewind to" /></label>
        <button disabled={rewindTo === ''} onClick={() => { live.send({ type: 'revert', toShift: Number(rewindTo) }); setRewindTo(''); }}>Rewind</button>
      </div>
      <ol className="overseer-timeline">
        {[...state.events].reverse().slice(0, 12).map(e => <li key={e.id}>
          <span>Shift {e.shift}</span> {e.text ?? e.kind}
          {e.shift > 0 && <button onClick={() => live.send({ type: 'revert', toShift: e.shift - 1 })} title="Rewind to just before this">undo</button>}
        </li>)}
      </ol>
    </section>

    <section>
      <h4>Dials</h4>
      <Dials defs={state.dialDefs} values={state.dials} onSet={(key, value) => live.overseer({ type: 'setDial', key, value })} />
    </section>
  </div>;
}

const FORK_ROWS: [string, (m: ShiftMetrics) => number, (x: number) => string][] = [
  ['Well-being', m => m.meanWellbeing, x => x.toFixed(2)],
  ['Hungry', m => m.hungryFrac, x => `${Math.round(x * 100)}%`],
  ['Money', m => m.money.total, x => Math.round(x).toLocaleString()],
  ['Food price', m => m.prices.food, x => String(Math.round(x))],
  ['Gold price', m => m.prices.gold, x => String(Math.round(x))],
  ['Gold dug / shift', m => m.output.gold, x => x.toFixed(1)],
  ['Inequality', m => m.gini, x => x.toFixed(2)],
];

function ForkTable({ label, baseline, variant }: { label: string; baseline: ShiftMetrics[]; variant: ShiftMetrics[] }) {
  // Average the last quarter of each branch so one noisy shift doesn't decide it.
  const tail = (ms: ShiftMetrics[], f: (m: ShiftMetrics) => number) => {
    const t = ms.slice(-Math.max(1, Math.floor(ms.length / 4)));
    return t.reduce((a, m) => a + f(m), 0) / t.length;
  };
  return <table className="overseer-fork">
    <caption>{label}, after {baseline.length} shifts</caption>
    <thead><tr><th /><th>Without</th><th>With</th></tr></thead>
    <tbody>{FORK_ROWS.map(([name, f, fmt]) => {
      const a = tail(baseline, f), b = tail(variant, f);
      return <tr key={name}><td>{name}</td><td>{fmt(a)}</td><td className={b > a ? 'up' : b < a ? 'down' : ''}>{fmt(b)}</td></tr>;
    })}</tbody>
  </table>;
}

function Dials({ defs, values, onSet }: { defs: DialDef[]; values: Record<string, number>; onSet: (key: string, value: number) => void }) {
  const groups = useMemo(() => {
    const g = new Map<string, DialDef[]>();
    for (const d of defs) g.set(d.group, [...(g.get(d.group) ?? []), d]);
    return [...g];
  }, [defs]);
  return <div className="dials">{groups.map(([group, ds]) => <details key={group}>
    <summary>{group}</summary>
    {ds.map(d => <Dial key={d.key} def={d} value={values[d.key] ?? d.default} onSet={onSet} />)}
  </details>)}</div>;
}

function Dial({ def, value, onSet }: { def: DialDef; value: number; onSet: (key: string, value: number) => void }) {
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? value;
  // Read the slider itself on release: the draft state can lag a keyboard press by a render.
  const commit = (e: { currentTarget: HTMLInputElement }) => {
    const next = Number(e.currentTarget.value);
    if (next !== value) onSet(def.key, next);
    setDraft(null);
  };
  return <label className="dial" title={def.description}>
    <span>{def.label} <em>{Number(shown.toFixed(4))} {def.unit}</em></span>
    <input type="range" min={def.min} max={def.max} step={def.step} value={shown}
      onChange={e => setDraft(Number(e.target.value))} onPointerUp={commit} onKeyUp={commit} onBlur={commit} aria-label={def.label} />
  </label>;
}
