// The right-hand console in live mode: the miners, the economy and the Overseer's controls.
// The expand button opens the full-page dashboard. (The narrator has its own panel on the left.)

import { useState } from 'react';
import type { LiveConnection, LiveState } from '../../net/live';
import { useLive } from '../../net/live';
import { AgentsTab } from '../agents/AgentsTab';
import { EconomyPanel } from '../economy/EconomyPanel';
import { Dashboard } from '../economy/Dashboard';
import { OverseerPanel } from './OverseerPanel';
import './Dock.css';

type Tab = 'agents' | 'economy' | 'overseer';
const TABS: { id: Tab; label: string }[] = [
  { id: 'agents', label: 'Miners' },
  { id: 'economy', label: 'Economy' },
  { id: 'overseer', label: 'Overseer' },
];

export function Dock({ live, selectedId, onSelect, open, onToggle }: {
  live: LiveConnection; selectedId: string | null; onSelect: (id: string) => void; open: boolean; onToggle: () => void;
}) {
  const state = useLive(live);
  const [tab, setTab] = useState<Tab>('agents');
  const [full, setFull] = useState(false);
  if (state.connection !== 'live') return <OfflineNote state={state} />;
  return <>
    <aside className={`dock glass ${open ? 'is-open' : 'is-closed'}`} aria-label="Valley console">
      <div className="dock-tabs" role="tablist">
        {TABS.map(t => <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'is-active' : ''} onClick={() => { setTab(t.id); if (!open) onToggle(); }}>{t.label}</button>)}
        <button className="dock-expand" onClick={() => setFull(true)} aria-label="Open the full dashboard" title="Open the full dashboard">⤢</button>
        <button className="dock-toggle" onClick={onToggle} aria-label={open ? 'Hide console' : 'Show console'}>{open ? '›' : '‹'}</button>
      </div>
      {open && <div className="dock-body">
        {tab === 'agents' && <AgentsTab miners={state.miners} activities={state.activities} selectedId={selectedId ?? undefined} onSelect={onSelect} />}
        {tab === 'economy' && <><EconomyPanel state={state} /><button className="dock-more" onClick={() => setFull(true)}>Open the full dashboard ⤢</button></>}
        {tab === 'overseer' && <OverseerPanel live={live} state={state} selectedId={selectedId} />}
      </div>}
      {state.error && <p className="dock-error" role="status">{state.error}</p>}
    </aside>
    {full && <Dashboard state={state} selectedId={selectedId} onSelect={onSelect} onClose={() => setFull(false)} />}
  </>;
}

function OfflineNote({ state }: { state: LiveState }) {
  return <aside className="dock-offline glass" role="status">
    {state.connection === 'connecting' ? 'Connecting to the valley server…' : <>Showing the local demo. Start the world with <code>pnpm dev:server</code> and it will connect.</>}
  </aside>;
}
