// The opening: a clear blue sky above the clouds and a single play button. Pressing it starts
// the world and the camera dives down through the clouds into the valley.

import { useState } from 'react';
import './Intro.css';

export function Intro({ onStart }: { onStart: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  if (gone) return null;
  return <div className={`intro-sky ${leaving ? 'is-leaving' : ''}`} onAnimationEnd={e => { if (e.target === e.currentTarget && leaving) setGone(true); }}>
    {Array.from({ length: 9 }, (_, i) => <span key={i} className={`intro-cloud c${i}`} aria-hidden />)}
    {!leaving && <button className="intro-play" aria-label="Enter the valley" onClick={() => { setLeaving(true); onStart(); }}>
      <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" /></svg>
    </button>}
  </div>;
}
