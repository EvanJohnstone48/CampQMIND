// The full-page view of the valley: headline numbers, the town network, big charts of everything
// in the economy, and every miner. Opened from the console's expand button.

import { useEffect, useState } from 'react';
import type { ShiftMetrics } from '@motherlode/shared';
import type { ChartAnswer, LiveState } from '../../net/live';
import { AgentsTab } from '../agents/AgentsTab';
import { LineChart, type Series } from './LineChart';
import { TownGraph } from './TownGraph';
import './Dashboard.css';

const C = { food: '#b8a843', timber: '#5f8a4c', ore: '#b0753f', copper: '#c46b3c', gold: '#d6a92c', blue: '#4f86b8', red: '#b8553f', violet: '#7d6aa8', grey: '#8a968a', green: '#3f8f62' };
const ACTIVITY: [string, string, string][] = [
  ['dig', 'Digging', '#b0753f'], ['farm', 'Farming', '#b8a843'], ['chop', 'Chopping', '#5f8a4c'], ['smelt', 'Smelting', '#b85a3a'],
  ['build', 'Building', '#6f7fa8'], ['work', 'Hired work', '#7d6aa8'], ['rest', 'Resting', '#9aa59a'],
];

const coins = (v: number) => Math.abs(v) >= 10000 ? `${(v / 1000).toFixed(0)}k` : Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const dec = (v: number) => v.toFixed(2);

export function Dashboard({ state, selectedId, onSelect, onClose, onExplain }: {
  state: LiveState; selectedId: string | null; onSelect: (id: string) => void; onClose: () => void;
  /** Ask the narrator to explain a chart (Gemini on the server). Only called when someone clicks. */
  onExplain?: (chart: string) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) => {
    const next = new Set(open);
    if (next.has(id)) next.delete(id);
    else {
      next.add(id);
      const a = state.explanations[id];
      if (a?.status !== 'loading' && !(a?.status === 'done' && a.explanation.toShift === state.metrics.at(-1)?.shift)) onExplain?.(id);
    }
    setOpen(next);
  };
  /** The "Explain this" button and the narrator's answer, for one chart. */
  const why = (id: string) => onExplain ? {
    action: <button className="chart-explain" aria-expanded={open.has(id)} onClick={() => toggle(id)}>{open.has(id) ? 'Hide' : 'Explain this'}</button>,
    children: open.has(id) ? <Why answer={state.explanations[id]} shift={state.metrics.at(-1)?.shift ?? 0} onRefresh={() => onExplain(id)} /> : null,
  } : {};
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  const ms = state.metrics;
  const xs = ms.map(m => m.shift);
  const s = (label: string, color: string, f: (m: ShiftMetrics) => number): Series => ({ label, color, values: ms.map(f) });
  const last = ms[ms.length - 1];
  const houses = state.sites.filter(x => x.kind === 'houseLot' && x.building?.complete && x.ownerId !== 'town').length;

  return <div className="dashboard" role="dialog" aria-label="Valley dashboard">
    <header className="dash-head">
      <div><span className="eyebrow">THE VALLEY AT A GLANCE</span><h2>Shift {state.shift} · Day {state.day + 1}</h2></div>
      <span className="dash-brains">{state.brains}</span>
      <button className="dash-close" onClick={onClose} aria-label="Close dashboard">✕</button>
    </header>

    {last && <section className="dash-kpis">
      <Kpi label="Miners" value={String(last.population)} />
      <Kpi label="Average well-being" value={dec(last.meanWellbeing)} />
      <Kpi label="Hungry" value={pct(last.hungryFrac)} warn={last.hungryFrac > 0.1} />
      <Kpi label="Houses" value={String(houses)} />
      <Kpi label="Sleeping rough" value={pct(last.roughSleepersFrac)} warn={last.roughSleepersFrac > 0.2} />
      <Kpi label="Money in the valley" value={coins(last.money.total)} />
      <Kpi label="Debt" value={coins(last.debt.total)} />
      <Kpi label="Bank rate / day" value={`${(last.debt.ratePerDay * 100).toFixed(1)}%`} />
      <Kpi label="Inequality (Gini)" value={dec(last.gini)} />
      <Kpi label="Forest left" value={pct(last.forestFraction)} />
    </section>}

    <section className="dash-section">
      <h3>Who's working where</h3>
      <TownGraph map={state.map} miners={state.miners} activities={state.activities} selectedId={selectedId} onSelect={onSelect} />
    </section>

    <section className="dash-section">
      <h3>Markets</h3>
      <div className="dash-grid">
        <LineChart {...why('food-price')} title="Food price" xs={xs} series={[s('Food', C.food, m => m.prices.food), s('Outside world', C.grey, m => m.worldPrices.food)]} />
        <LineChart {...why('timber-price')} title="Timber price" xs={xs} series={[s('Timber', C.timber, m => m.prices.timber), s('Outside world', C.grey, m => m.worldPrices.timber)]} />
        <LineChart {...why('copper-price')} title="Copper and ore prices" xs={xs} series={[s('Copper', C.copper, m => m.prices.copper), s('Ore', C.ore, m => m.prices.copperOre)]} />
        <LineChart {...why('gold-price')} title="Gold price" xs={xs} series={[s('Gold', C.gold, m => m.prices.gold), s('Outside world', C.grey, m => m.worldPrices.gold)]} />
        <LineChart {...why('volume')} title="Units traded per shift" xs={xs} series={[s('Food', C.food, m => m.volume.food), s('Timber', C.timber, m => m.volume.timber), s('Ore', C.ore, m => m.volume.copperOre), s('Copper', C.copper, m => m.volume.copper), s('Gold', C.gold, m => m.volume.gold)]} />
      </div>
    </section>

    <section className="dash-section">
      <h3>People</h3>
      <div className="dash-grid">
        <LineChart {...why('wellbeing')} title="Average well-being" xs={xs} format={dec} series={[s('Well-being', C.green, m => m.meanWellbeing)]} />
        <LineChart {...why('hardship')} title="Hardship" xs={xs} format={pct} series={[s('Hungry', C.red, m => m.hungryFrac), s('Sleeping rough', C.violet, m => m.roughSleepersFrac), s('Injured', C.grey, m => m.injuredFrac)]} />
        <LineChart {...why('homes')} title="Homes" xs={xs} format={pct} series={[s('In their own house', C.blue, m => m.housedFrac)]} />
        <LineChart {...why('gini')} title="Inequality (Gini)" xs={xs} format={dec} series={[s('Gini', C.violet, m => m.gini)]} />
      </div>
    </section>

    <section className="dash-section">
      <h3>Money</h3>
      <div className="dash-grid">
        <LineChart {...why('money')} title="Where the money is" xs={xs} format={coins} stacked series={[s('Miners', C.green, m => m.money.miners), s('Bank', C.blue, m => m.money.bank), s('Treasury', C.gold, m => m.money.treasury)]} />
        <LineChart {...why('debt')} title="Debt" xs={xs} format={coins} series={[s('Owed to the bank', C.red, m => m.debt.total)]} />
        <LineChart {...why('flows')} title="Money in and out of the valley" xs={xs} format={coins} series={[s('Exports earned', C.green, m => m.money.exportRevenue), s('Imports paid', C.red, m => m.money.importSpend), s('Comforts bought', C.violet, m => m.money.comfortSpend)]} />
      </div>
    </section>

    <section className="dash-section">
      <h3>Work and output</h3>
      <div className="dash-grid">
        <LineChart {...why('activity')} title="What the town is doing" xs={xs} format={v => String(Math.round(v))} stacked series={ACTIVITY.map(([k, l, c]) => s(l, c, m => m.activity[k as keyof ShiftMetrics['activity']]))} />
        <LineChart {...why('output')} title="Produced per shift" xs={xs} series={[s('Food', C.food, m => m.output.food), s('Timber', C.timber, m => m.output.timber), s('Ore', C.ore, m => m.output.copperOre), s('Copper', C.copper, m => m.output.copper)]} />
        <LineChart {...why('gold-output')} title="Gold dug per shift" xs={xs} format={v => v.toFixed(1)} series={[s('Gold', C.gold, m => m.output.gold)]} />
        <LineChart {...why('forest')} title="Forest left" xs={xs} format={pct} series={[s('Forest', C.timber, m => m.forestFraction)]} />
      </div>
    </section>

    <section className="dash-section">
      <h3>Every miner</h3>
      <div className="dash-agents"><AgentsTab miners={state.miners} activities={state.activities} selectedId={selectedId ?? undefined} onSelect={onSelect} /></div>
    </section>
  </div>;
}

/** The narrator's plain-language answer: what the chart is, what happened, and why. */
function Why({ answer, shift, onRefresh }: { answer?: ChartAnswer; shift: number; onRefresh: () => void }) {
  if (!answer || answer.status === 'loading') {
    return <div className="chart-why is-loading" aria-live="polite"><span className="why-dots"><i /><i /><i /></span>The narrator is reading this chart…</div>;
  }
  if (answer.status === 'error') {
    return <div className="chart-why is-error" role="alert">{answer.error} <button className="chart-explain" onClick={onRefresh}>Try again</button></div>;
  }
  const e = answer.explanation;
  const behind = shift - e.toShift;
  return <div className="chart-why" aria-live="polite">
    <h4>What is this?</h4>
    <p>{e.whatItShows}</p>
    <h4>What happened</h4>
    <p>{e.whatHappened}</p>
    {e.why.length > 0 && <>
      <h4>Why</h4>
      <ul>{e.why.map((w, i) => <li key={i}>{w}</li>)}</ul>
    </>}
    <div className="chart-why-foot">
      <span>Shifts {e.fromShift}–{e.toShift} · {e.writtenBy === 'llm' ? 'worded by Gemini, every number checked against the data' : 'written from the data (no AI wording)'}</span>
      {behind >= 5 && <button onClick={onRefresh}>Update to shift {shift}</button>}
    </div>
  </div>;
}

function Kpi({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return <div className={`kpi ${warn ? 'is-warn' : ''}`}><span>{label}</span><strong>{value}</strong></div>;
}
