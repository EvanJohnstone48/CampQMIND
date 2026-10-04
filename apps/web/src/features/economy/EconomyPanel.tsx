// Charts of the economy over time: small sparklines from the live metrics stream.

import type { ShiftMetrics } from '@motherlode/shared';
import type { LiveState } from '../../net/live';

const SERIES: { label: string; value: (m: ShiftMetrics) => number; format: (x: number) => string }[] = [
  { label: 'Food price', value: m => m.prices.food, format: x => `${Math.round(x)}` },
  { label: 'Timber price', value: m => m.prices.timber, format: x => `${Math.round(x)}` },
  { label: 'Copper price', value: m => m.prices.copper, format: x => `${Math.round(x)}` },
  { label: 'Gold price', value: m => m.prices.gold, format: x => `${Math.round(x)}` },
  { label: 'Average well-being', value: m => m.meanWellbeing, format: x => x.toFixed(2) },
  { label: 'Hungry', value: m => m.hungryFrac, format: x => `${Math.round(x * 100)}%` },
  { label: 'Money in the valley', value: m => m.money.total, format: x => Math.round(x).toLocaleString() },
  { label: 'Total debt', value: m => m.debt.total, format: x => Math.round(x).toLocaleString() },
  { label: 'Inequality (Gini)', value: m => m.gini, format: x => x.toFixed(2) },
  { label: 'Forest left', value: m => m.forestFraction, format: x => `${Math.round(x * 100)}%` },
  { label: 'Houses', value: m => m.housedFrac * m.population, format: x => `${Math.round(x)}` },
];

const ACTIVITY_LABELS: Record<string, string> = { rest: 'Resting', dig: 'Digging', chop: 'Chopping', farm: 'Farming', smelt: 'Smelting', build: 'Building', work: 'Hired work' };

export function EconomyPanel({ state }: { state: LiveState }) {
  const ms = state.metrics;
  const last = ms[ms.length - 1];
  if (!last) return <p className="economy-empty">Waiting for the first shift…</p>;
  return <div className="economy">
    <div className="economy-activity" aria-label="What the town is doing">
      {Object.entries(last.activity).filter(([, n]) => n > 0).map(([k, n]) =>
        <span key={k} style={{ flex: n }} className={`act-${k}`} title={`${ACTIVITY_LABELS[k] ?? k}: ${n}`}>{n >= 6 ? `${ACTIVITY_LABELS[k] ?? k} ${n}` : ''}</span>)}
    </div>
    {SERIES.map(s => <Spark key={s.label} label={s.label} values={ms.map(s.value)} format={s.format} />)}
  </div>;
}

function Spark({ label, values, format }: { label: string; values: number[]; format: (x: number) => string }) {
  const w = 160, h = 28;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * w},${h - ((v - min) / span) * (h - 2) - 1}`).join(' ');
  return <div className="spark">
    <span className="spark-label">{label}</span>
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${label} over the last ${values.length} shifts`}>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
    <span className="spark-value">{format(values[values.length - 1])}</span>
  </div>;
}
