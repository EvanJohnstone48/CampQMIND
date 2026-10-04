// The town as a network: the valley's places are hubs (laid out where they sit on the map), every
// miner is a node linked to the place they're working at this shift, and hired hands are also
// linked to their employer. Node size is cash; colour is what they're doing.

import { useMemo, useState } from 'react';
import type { MinerActivity, MinerPublic, WorldMap } from '@motherlode/shared';

const ACTIVITY_COLORS: Record<string, string> = { rest: '#9aa59a', dig: '#b0753f', chop: '#5f8a4c', farm: '#b8a843', smelt: '#b85a3a', build: '#6f7fa8', work: '#7d6aa8' };
const ACTIVITY_LABELS: Record<string, string> = { rest: 'Resting', dig: 'Digging', chop: 'Chopping', farm: 'Farming', smelt: 'Smelting', build: 'Building', work: 'Hired work' };
const PLACE_NAMES: Record<string, string> = { town: 'Village', copper: 'Copper ridge', gold: 'Goldpeak', forest: 'Timber woods', farm: 'Sunfield farm', smelter: 'Riverside works' };

export function TownGraph({ map, miners, activities, selectedId, onSelect }: {
  map?: WorldMap; miners: MinerPublic[]; activities: MinerActivity[]; selectedId?: string | null; onSelect?: (id: string) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const W = 900, H = 560;
  const layout = useMemo(() => {
    // Hubs at their map positions, scaled into the canvas.
    const sitePlace = new Map<string, string>();
    const hubPts: Record<string, { x: number; z: number; n: number }> = {};
    for (const s of map?.sites ?? []) {
      const pid = String((s.extras as { placeId?: string } | undefined)?.placeId ?? 'town');
      sitePlace.set(s.id, pid);
      const h = (hubPts[pid] ??= { x: 0, z: 0, n: 0 });
      h.x += s.position.x; h.z += s.position.z; h.n++;
    }
    const pts = Object.entries(hubPts).map(([id, h]) => ({ id, x: h.x / h.n, z: h.z / h.n }));
    const minX = Math.min(...pts.map(p => p.x)), maxX = Math.max(...pts.map(p => p.x));
    const minZ = Math.min(...pts.map(p => p.z)), maxZ = Math.max(...pts.map(p => p.z));
    const hubs = Object.fromEntries(pts.map(p => [p.id, {
      x: 110 + ((p.x - minX) / Math.max(1, maxX - minX)) * (W - 220),
      y: 90 + ((p.z - minZ) / Math.max(1, maxZ - minZ)) * (H - 180),
    }]));
    return { hubs, sitePlace };
  }, [map]);

  const act = new Map(activities.map(a => [a.minerId, a]));
  // Group miners by the hub they're linked to, then ring them around it.
  const groups: Record<string, MinerPublic[]> = {};
  const hubOf = (m: MinerPublic) => {
    const a = act.get(m.id);
    return a && a.action !== 'rest' && a.siteId ? layout.sitePlace.get(a.siteId) ?? 'town' : 'town';
  };
  for (const m of miners) (groups[hubOf(m)] ??= []).push(m);
  const pos = new Map<string, { x: number; y: number }>();
  for (const [hub, ms] of Object.entries(groups)) {
    const c = layout.hubs[hub] ?? { x: W / 2, y: H / 2 };
    ms.forEach((m, i) => {
      const ring = Math.floor(i / 14);
      const k = i % 14;
      const angle = (k / Math.min(14, ms.length - ring * 14)) * Math.PI * 2 + ring * 0.4;
      const r = 46 + ring * 20;
      pos.set(m.id, { x: c.x + Math.cos(angle) * r, y: c.y + Math.sin(angle) * r });
    });
  }
  const maxCash = Math.max(1, ...miners.map(m => m.cash));
  const shown = hover ?? selectedId ?? null;
  const focus = miners.find(m => m.id === shown);
  const counts = Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length]));

  return <figure className="town-graph">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Who is working where in the valley">
      {/* links: miner -> place, and hired hand -> employer */}
      {miners.map(m => {
        const p = pos.get(m.id)!;
        const hub = layout.hubs[hubOf(m)];
        const a = act.get(m.id);
        const color = ACTIVITY_COLORS[a?.action ?? 'rest'] ?? '#999';
        const boss = m.employerId ? pos.get(m.employerId) : undefined;
        return <g key={`l-${m.id}`} className="tg-links">
          {hub && <line x1={hub.x} y1={hub.y} x2={p.x} y2={p.y} stroke={color} strokeOpacity={shown && shown !== m.id ? 0.12 : 0.45} />}
          {boss && <line x1={boss.x} y1={boss.y} x2={p.x} y2={p.y} stroke="#7d6aa8" strokeDasharray="4 3" strokeOpacity={0.7} />}
        </g>;
      })}
      {/* hubs */}
      {Object.entries(layout.hubs).map(([id, h]) => <g key={id} className="tg-hub" transform={`translate(${h.x},${h.y})`}>
        <circle r={24} />
        <text y={4} textAnchor="middle">{counts[id] ?? 0}</text>
        <text y={40} textAnchor="middle" className="tg-hub-label">{PLACE_NAMES[id] ?? id}</text>
      </g>)}
      {/* miners */}
      {miners.map(m => {
        const p = pos.get(m.id)!;
        const a = act.get(m.id);
        const r = 4 + Math.sqrt(Math.max(0, m.cash) / maxCash) * 7;
        return <g key={m.id} className={`tg-node ${m.id === shown ? 'is-focus' : ''}`} style={{ transform: `translate(${p.x}px, ${p.y}px)` }}
          onPointerEnter={() => setHover(m.id)} onPointerLeave={() => setHover(null)} onClick={() => onSelect?.(m.id)}>
          <circle r={r} fill={ACTIVITY_COLORS[a?.action ?? 'rest'] ?? '#999'} stroke={m.brain === 'llm' ? '#4b2fa8' : '#fff'} strokeWidth={m.brain === 'llm' ? 2 : 1} />
          {m.injured && <circle r={r + 3} fill="none" stroke="#c55" strokeWidth={1.5} />}
        </g>;
      })}
    </svg>
    <div className="tg-side">
      <div className="tg-legend">{Object.entries(ACTIVITY_LABELS).map(([k, l]) => <span key={k}><i style={{ background: ACTIVITY_COLORS[k] }} />{l}</span>)}
        <span><i className="tg-dash" />Works for</span><span><i className="tg-ring" />Injured</span><span><i className="tg-llm" />LLM brain</span></div>
      {focus ? <div className="tg-focus">
        <strong>{focus.name}</strong>
        <span>{ACTIVITY_LABELS[act.get(focus.id)?.action ?? 'rest']}{act.get(focus.id)?.siteId ? ` at ${map?.sites.find(s => s.id === act.get(focus.id)!.siteId)?.name ?? ''}` : ''}</span>
        <span>{focus.cash} coins{focus.debt ? ` · owes ${focus.debt}` : ''} · well-being {focus.wellbeing.toFixed(2)}</span>
        {focus.employerId && <span>Works for {miners.find(m => m.id === focus.employerId)?.name ?? focus.employerId}</span>}
        {act.get(focus.id)?.reason && <em>“{act.get(focus.id)!.reason}”</em>}
      </div> : <p className="tg-hint">Hover a miner to see who they are and why they're there. Node size is cash.</p>}
    </div>
  </figure>;
}
