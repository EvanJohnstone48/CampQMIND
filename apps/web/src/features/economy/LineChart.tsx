// A small, dependency-free multi-series line chart with axes, a legend and a hover readout.

import { useMemo, useState, type ReactNode } from 'react';

export interface Series {
  label: string;
  values: number[];
  color: string;
}

export function LineChart({ title, series, xs, format = v => String(Math.round(v)), height = 170, stacked = false, action, children }: {
  title: string; series: Series[]; xs: number[]; format?: (v: number) => string; height?: number; stacked?: boolean;
  /** Shown at the right of the title, e.g. an "Explain this" button. */
  action?: ReactNode;
  /** Shown under the legend, e.g. the narrator's explanation. */
  children?: ReactNode;
}) {
  const W = 520, H = height, L = 46, R = 10, T = 10, B = 22;
  const [hover, setHover] = useState<number | null>(null);
  const shown = useMemo(() => {
    if (!stacked) return series;
    const acc = xs.map(() => 0);
    return series.map(s => ({ ...s, values: s.values.map((v, i) => (acc[i] += v)) }));
  }, [series, xs, stacked]);
  const all = shown.flatMap(s => s.values).filter(Number.isFinite);
  const caption = <figcaption><span>{title}</span>{action}</figcaption>;
  if (xs.length < 2 || all.length === 0) return <figure className="chart">{caption}<p className="chart-empty">Gathering data…</p>{children}</figure>;
  let min = stacked ? 0 : Math.min(...all);
  let max = Math.max(...all);
  // A flat line: open the axis a little around it (±1 would turn 50% into -50%..150%).
  if (max === min) { const d = Math.abs(max) * 0.1 || 0.01; max += d; if (!stacked) min -= d; }
  const pad = (max - min) * 0.06;
  if (!stacked) min -= pad;
  max += pad;
  const x = (i: number) => L + (i / (xs.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - min) / (max - min)) * (H - T - B);
  const ticks = [min, (min + max) / 2, max];
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(xs.length - 1, Math.round(((px - L) / (W - L - R)) * (xs.length - 1)))));
  };
  const at = hover ?? xs.length - 1;
  return <figure className="chart">
    {caption}
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={title}>
      {ticks.map((t, i) => <g key={i}>
        <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="chart-grid" />
        <text x={L - 6} y={y(t) + 4} textAnchor="end" className="chart-tick">{format(t)}</text>
      </g>)}
      <text x={L} y={H - 4} className="chart-tick">shift {xs[0]}</text>
      <text x={W - R} y={H - 4} textAnchor="end" className="chart-tick">shift {xs[xs.length - 1]}</text>
      {[...shown].reverse().map(s => stacked
        ? <path key={s.label} d={`M${x(0)},${y(0)} ` + s.values.map((v, i) => `L${x(i)},${y(v)}`).join(' ') + ` L${x(xs.length - 1)},${y(0)} Z`} fill={s.color} opacity={0.85} />
        : <polyline key={s.label} points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke={s.color} strokeWidth={2} vectorEffect="non-scaling-stroke" />)}
      {hover !== null && <line x1={x(at)} x2={x(at)} y1={T} y2={H - B} className="chart-cursor" />}
    </svg>
    <div className="chart-legend">
      {series.map(s => <span key={s.label}><i style={{ background: s.color }} />{s.label} <b>{format(s.values[at] ?? 0)}</b></span>)}
      {hover !== null && <span className="chart-at">at shift {xs[at]}</span>}
    </div>
    {children}
  </figure>;
}
