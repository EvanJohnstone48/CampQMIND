// A small "Explore" pill (bottom left) that opens a list of the valley's places and homes to fly to.

import { useEffect, useRef, useState } from 'react';
import type { BuildingView, Place } from '../../net/world';
import { Icon } from '../../ui/Icons';

const kindIcons: Record<string, string> = { town: 'home', copper: 'pick', gold: 'pick', forest: 'tree', farm: 'wheat', smelter: 'flame' };

export function ExploreMenu({ places, homes, onPlace, onHome }: {
  places: readonly Place[]; homes: readonly BuildingView[]; onPlace: (id: string) => void; onHome: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  const pick = (fn: () => void) => { fn(); setOpen(false); };
  return <div className="explore" ref={ref}>
    {open && <div className="explore-menu glass" role="menu" aria-label="Places and homes">
      <span className="explore-heading">Places</span>
      {places.map(p => <button key={p.id} role="menuitem" onClick={() => pick(() => onPlace(p.id))}>
        <span className="place-icon" style={{ color: p.color }}><Icon name={kindIcons[p.kind]} size={14} /></span>{p.name}
      </button>)}
      {homes.length > 0 && <>
        <span className="explore-heading">Homes</span>
        <div className="explore-homes">{homes.map(h => <button key={h.id} role="menuitem" onClick={() => pick(() => onHome(h.id))} title={h.description}>{h.name}</button>)}</div>
      </>}
    </div>}
    <button className="explore-pill glass" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="menu">
      <Icon name="mountain" size={14} /> Explore <span aria-hidden>{open ? '▾' : '▴'}</span>
    </button>
  </div>;
}
