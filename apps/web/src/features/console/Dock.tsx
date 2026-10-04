// The right-hand dock in live mode: the narrator, the miners' minds, the economy and the Overseer's console.
// Each tab is another lane's work, wired to the live server here.

import { useState } from 'react';
import type { Card } from '@motherlode/narrator';
import type { LiveConnection, LiveState } from '../../net/live';
import { useLive } from '../../net/live';
import { NarratorPanel } from '../narrator/NarratorPanel';
import { AgentsTab } from '../agents/AgentsTab';
import { EconomyPanel } from '../economy/EconomyPanel';
import { OverseerPanel } from './OverseerPanel';
import './Dock.css';

type Tab = 'narrator' | 'agents' | 'economy' | 'overseer';
const TABS: { id: Tab; label: string }[] = [
  { id: 'narrator', label: 'Narrator' },
  { id: 'agents', label: 'Miners' },
  { id: 'economy', label: 'Economy' },
  { id: 'overseer', label: 'Overseer' },
];

export function Dock({ live, selectedId, onSelect, open, onToggle }: {
  live: LiveConnection; selectedId: string | null; onSelect: (id: string) => void; open: boolean; onToggle: () => void;
}) {
  const state = useLive(live);
  const [tab, setTab] = useState<Tab>('narrator');
  if (state.connection !== 'live') return <OfflineNote state={state} />;
  return <aside className={`dock glass ${open ? 'is-open' : 'is-closed'}`} aria-label="Valley console">
    <div className="dock-tabs" role="tablist">
      {TABS.map(t => <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'is-active' : ''} onClick={() => { setTab(t.id); if (!open) onToggle(); }}>
        {t.label}{t.id === 'narrator' && state.cards.length > 0 && <span className="dock-count">{state.cards.length}</span>}
      </button>)}
      <button className="dock-toggle" onClick={onToggle} aria-label={open ? 'Hide console' : 'Show console'}>{open ? '›' : '‹'}</button>
    </div>
    {open && <div className="dock-body">
      {tab === 'narrator' && <NarratorPanel cards={state.cards as unknown as Card[]} />}
      {tab === 'agents' && <AgentsTab miners={state.miners} activities={state.activities} selectedId={selectedId ?? undefined} onSelect={onSelect} />}
      {tab === 'economy' && <EconomyPanel state={state} />}
      {tab === 'overseer' && <OverseerPanel live={live} state={state} selectedId={selectedId} />}
    </div>}
    {state.error && <p className="dock-error" role="status">{state.error}</p>}
  </aside>;
}

function OfflineNote({ state }: { state: LiveState }) {
  return <aside className="dock-offline glass" role="status">
    {state.connection === 'connecting' ? 'Connecting to the valley server…' : <>Showing the local demo. Start the world with <code>pnpm dev:server</code> and it will connect.</>}
  </aside>;
}
