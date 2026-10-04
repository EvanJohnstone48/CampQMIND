// The narrator's own panel, on the left: Lane 3's cards as they arrive, collapsible to a slim tab.

import { useState } from 'react';
import type { Card } from '@motherlode/narrator';
import type { LiveConnection } from '../../net/live';
import { useLive } from '../../net/live';
import { NarratorPanel } from './NarratorPanel';

/** The narrator compares each change with the ~16 shifts before it, so it needs that much history first. */
const LEARNING_SHIFTS = 18;

export function NarratorDock({ live }: { live: LiveConnection }) {
  const state = useLive(live);
  const [open, setOpen] = useState(true);
  if (state.connection !== 'live') return null;
  return <aside className={`narrator-dock glass ${open ? 'is-open' : 'is-closed'}`} aria-label="Narrator">
    <button className="narrator-dock-head" onClick={() => setOpen(o => !o)} aria-expanded={open}>
      <span>Narrator</span>
      {state.cards.length > 0 && <span className="dock-count">{state.cards.length}</span>}
      <span className="chevron" aria-hidden>{open ? '▾' : '▸'}</span>
    </button>
    {open && <div className="narrator-dock-body">
      {state.cards.length === 0 && state.shift < LEARNING_SHIFTS && <p className="narrator-learning">Learning what normal looks like. Explanations start around shift {LEARNING_SHIFTS}.</p>}
      <NarratorPanel cards={state.cards as unknown as Card[]} />
    </div>}
  </aside>;
}
