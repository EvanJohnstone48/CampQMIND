import { useEffect, useMemo, useRef, useState } from 'react';
import { WorldScene } from './features/world/WorldScene';
import { ValleyAudio } from './features/world/audio';
import { createDemoSource, demoSnapshot } from './net/demo';
import { createWorldStore, useWorld } from './net/store';
import type { Point, WorldSource, WorldView } from './net/world';
import { Icon } from './ui/Icons';
import { weatherAt } from './features/world/weather';
import type { WeatherMode } from './features/world/weather';
import { siteCapacities } from './net/demoMap';
import type { LiveConnection } from './net/live';
import { useLiveMaybe } from './net/live';
import { Dock } from './features/console/Dock';
import { ExploreMenu } from './features/console/ExploreMenu';
import { NarratorDock } from './features/narrator/NarratorDock';
import { Intro } from './features/intro/Intro';

/** Composition point. Pass `live` for the server (Lane 1), or `source` for any other WorldSource; neither runs the local demo. */
export function App({ source: givenSource, initialWorld, live }: { source?: WorldSource; initialWorld?: WorldView; live?: LiveConnection }) {
  const providedSource = live?.source ?? givenSource;
  const source = useMemo(() => providedSource ?? createDemoSource(), [providedSource]);
  const [dockOpen, setDockOpen] = useState(true);
  // Nothing runs until the viewer presses play on the intro.
  const [started, setStarted] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const liveState = useLiveMaybe(live);
  const store = useMemo(() => createWorldStore(initialWorld ?? demoSnapshot(0)), [initialWorld]);
  const world = useWorld(store);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ point: Point; serial: number; overview?: boolean; offset?: readonly [number, number, number] }>({ point: [0, 0], serial: 0, overview: true });
  const [paused, setPaused] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [sound, setSound] = useState(false);
  const [soundError, setSoundError] = useState('');
  const [labels, setLabels] = useState(true);
  const [help, setHelp] = useState(false);
  const [followingId, setFollowingId] = useState<string | null>(null);
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [weatherMode, setWeatherMode] = useState<WeatherMode>('auto');
  const [routes, setRoutes] = useState(false);
  const audio = useRef<ValleyAudio | null>(null);
  const selected = world.miners.find(miner => miner.id === selectedId);
  const following = world.miners.find(miner => miner.id === followingId);
  const home = world.buildings?.find(building => building.id === inspectedId);
  const place = world.places.find(p => p.id === placeId);
  const occupants = world.miners.filter(m => m.homeId === inspectedId);
  const workers = place?.kind === 'town' ? world.miners : world.miners.filter(m => m.destinationId === placeId);
  const weather = weatherAt(world.elapsed, weatherMode);
  const night = world.hour < 6 || world.hour >= 19;
  const phase = world.hour < 6 ? 'Nightfall' : world.hour < 11 ? 'Morning shift' : world.hour < 17 ? 'Afternoon shift' : world.hour < 19 ? 'Golden hour' : 'Nightfall';
  const clock = `${Math.floor(world.hour).toString().padStart(2, '0')}:${Math.floor((world.hour % 1) * 60).toString().padStart(2, '0')}`;

  useEffect(() => source.connect(store.publish), [source, store]);
  useEffect(() => { source.setPaused?.(paused); audio.current?.setPaused(paused); }, [source, paused]);
  useEffect(() => { source.setSpeed?.(speed); }, [source, speed]);
  useEffect(() => () => { audio.current?.dispose(); audio.current = null; }, []);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setSelectedId(null); setInspectedId(null); setPlaceId(null); setFollowingId(null); setHelp(false); }
      if (event.target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(event.target.tagName)) return;
      if (event.code === 'Space' && source.setPaused && started) { event.preventDefault(); setPaused(p => !p); }
    };
    window.addEventListener('keydown', handle); return () => window.removeEventListener('keydown', handle);
  }, [source, started]);
  useEffect(() => { if (followingId && !following) setFollowingId(null); }, [followingId, following]);

  async function toggleSound() {
    try {
      audio.current ??= new ValleyAudio();
      audio.current.setPaused(paused);
      await audio.current.setEnabled(!sound);
      setSound(!sound); setSoundError('');
    } catch { setSoundError('Sound is unavailable in this browser.'); setSound(false); }
  }
  function start() { setStarted(true); setPaused(false); }
  const houses = liveState ? liveState.sites.filter(x => x.kind === 'houseLot' && x.building?.complete && x.ownerId !== 'town').length : world.buildings?.length ?? 0;
  function lookAt(point: Point, overview = false, offset?: readonly [number, number, number]) { setFollowingId(null); setFocus(current => ({ point, serial: current.serial + 1, overview, offset })); }
  function selectMiner(id: string | null) { setSelectedId(id); setFollowingId(null); setInspectedId(null); setPlaceId(null); }
  function inspectHome(id: string) {
    const building = world.buildings?.find(b => b.id === id);
    if (!building) return;
    setInspectedId(id); setPlaceId(null); setSelectedId(null); lookAt(building.position);
  }
  function inspectPlace(id: string) {
    const location = world.places.find(p => p.id === id);
    if (!location) return;
    setPlaceId(id); setInspectedId(null); setSelectedId(null);
    lookAt(location.position, false, location.kind === 'gold' ? [0, 10, 6] : location.kind === 'copper' ? [0, 8, 10] : undefined);
  }

  return <main className={`app ${night ? 'night' : ''} ${live && dockOpen ? 'has-dock' : ''}`}>
    <Intro onStart={start} />
    {started && <>
    <div className="world-canvas" aria-label="Interactive 3D Alpine mining valley">
      <WorldScene world={world} selectedId={selectedId} onSelect={selectMiner} focus={focus} labels={labels} paused={paused}
        followingId={followingId} inspectedId={inspectedId} onInspect={inspectHome} onPlace={inspectPlace} weather={weather} routes={routes} intro />
    </div>
    <div className="chrome">
    <div className="stats-pill glass" aria-label="Valley population"><span><b>{world.miners.length}</b> residents</span><span className="dot" /><span><b>{houses}</b> {houses === 1 ? 'house' : 'houses'}</span></div>
    <header className="masthead">
      <span />
      <div className="header-actions">
        <span className={`live-badge ${paused ? 'is-paused' : ''}`}><i />{paused ? 'Paused' : world.sourceLabel}</span>
        <button className="icon-button" onClick={toggleSound} aria-label={sound ? 'Mute sound' : 'Enable sound'} aria-pressed={sound} title={sound ? 'Mute sound' : 'Enable quiet river and mining sounds'}><Icon name={sound ? 'sound' : 'mute'} /></button>
        <button className="help-button" onClick={() => setHelp(!help)} aria-label="View camera controls" aria-expanded={help}>?</button>
      </div>
    </header>

    {help && <aside className="help-card glass"><button className="close-button" aria-label="Close controls help" onClick={() => setHelp(false)}><Icon name="close" /></button><span className="eyebrow">FROM UP HERE</span><h3>Explore the valley</h3><p><strong>Drag</strong> to orbit · <strong>Scroll</strong> to zoom<br /><strong>Right-drag</strong> to move within the town<br /><strong>Touch:</strong> orbit, pinch or two-finger pan<br /><strong>Click</strong> a resident, chalet or workplace<br /><strong>Space</strong> to pause · <strong>Escape</strong> to close</p><p>Follow a resident while you orbit and zoom. Choose weather below, or let it change naturally.</p></aside>}

    {following && <div className="follow-chip glass" role="status">Following <strong>{following.name}</strong><button onClick={() => setFollowingId(null)}>Stop following</button></div>}

    {selected && <aside className="miner-card glass" aria-label="Selected miner">
      <button className="close-button" onClick={() => selectMiner(null)} aria-label="Close miner details"><Icon name="close" /></button>
      <span className="eyebrow">MEET A RESIDENT</span>
      <div className="miner-heading"><div className="bean-portrait" style={{ '--bean-color': selected.color } as React.CSSProperties}><span>••</span><i /></div><div><h3>{selected.name}</h3><span className="trade-tag">{selected.trade}</span></div></div>
      <div className="activity-row"><i className={paused ? 'paused-dot' : ''} /><span>{selected.activity}</span></div>
      <button className="text-button" onClick={() => lookAt(selected.position)}>Take a closer look <Icon name="arrow" size={16} /></button>
      <button className="follow-button" aria-pressed={followingId === selected.id} onClick={() => setFollowingId(followingId === selected.id ? null : selected.id)}>Follow this miner</button>
      {selected.route && <button className="text-button" aria-pressed={routes} onClick={() => setRoutes(!routes)}>{routes ? 'Hide journey' : 'Show journey'}</button>}
      {selected.homeId && world.buildings?.some(b => b.id === selected.homeId) && <button className="text-button" onClick={() => inspectHome(selected.homeId!)}>Visit their chalet <Icon name="home" size={15} /></button>}
    </aside>}

    {(home || place) && <aside className="miner-card building-card glass" aria-label="Selected building">
      <button className="close-button" onClick={() => { setInspectedId(null); setPlaceId(null); }} aria-label="Close building details"><Icon name="close" /></button>
      <span className="eyebrow">{home ? 'AT HOME IN THE VALLEY' : 'BUILT FOR THE SHIFT'}</span><h3>{home?.name ?? place?.name}</h3>
      {home ? <><p>{home.description}</p><div className="capacity-row"><strong>{occupants.length} residents</strong><span>{home.capacity} beds</span></div></> : <>
        <p>{place?.kind === 'town' ? 'The square, chapel and market link a neighborhood of family chalets.' : 'A working yard with space for crews, materials and the next shift.'}</p>
        <div className="capacity-row"><strong>{workers.length} {place?.kind === 'town' ? 'residents' : 'assigned'}</strong>{!providedSource && <span>{siteCapacities[place!.id]} {place?.kind === 'town' ? 'beds' : 'work spaces'}</span>}</div>
      </>}
      <div className="resident-list">{(home ? occupants : workers).map(m => <button key={m.id} onClick={() => selectMiner(m.id)}>{m.name}<span>{m.trade}</span></button>)}</div>
    </aside>}

    <ExploreMenu places={world.places} homes={world.buildings ?? []} onPlace={inspectPlace} onHome={inspectHome} />

    <section className={`view-controls glass ${timeOpen ? 'is-open' : 'is-closed'}`} aria-label="World viewing controls">
      <div className="time-heading">
        <button className="time-toggle" onClick={() => setTimeOpen(o => !o)} aria-expanded={timeOpen} aria-label={timeOpen ? 'Hide time and weather' : 'Show time and weather'}>
          <span className="time-icon"><Icon name={night ? 'moon' : 'sun'} size={timeOpen ? 23 : 18} /></span>
          <div><span className="eyebrow">DAY {world.day} · {clock}</span><h3>{phase}</h3></div>
          <span className="chevron" aria-hidden>{timeOpen ? '▾' : '▴'}</span>
        </button>
        {source.setPaused && <button className="icon-button" onClick={() => setPaused(!paused)} aria-label={paused ? 'Resume world' : 'Pause world'} aria-pressed={paused}><Icon name={paused ? 'play' : 'pause'} size={16} /></button>}
      </div>
      {timeOpen && <>
      <label className="weather-picker">Weather<select aria-label="Weather" value={weatherMode} onChange={e => setWeatherMode(e.target.value as WeatherMode)}><option value="auto">Changing naturally</option><option value="clear">Clear skies</option><option value="rain">Rain shower</option><option value="snow">Snow flurries</option><option value="fog">Valley mist</option></select></label>
      <span className="weather-status" role="status">{weather.label}</span>
      <div className="day-track" role="progressbar" aria-label="Time through the day" aria-valuemin={0} aria-valuemax={24} aria-valuenow={world.hour}><span style={{ left: `${world.hour / 24 * 100}%` }} /></div>
      <div className="view-buttons">{source.setSpeed && <div className="speed-switch" aria-label="Playback speed">{[1, 4, 12].map(value => <button key={value} aria-pressed={speed === value} onClick={() => setSpeed(value)}>{value}×</button>)}</div>}
        <button className="icon-button" onClick={() => { selectMiner(null); lookAt([0, 0], true); }} aria-label="Reset camera" title="Return to the valley overview"><Icon name="reset" size={16} /></button>
        <button className={`label-button ${labels ? 'active' : ''}`} onClick={() => setLabels(!labels)} aria-pressed={labels}>Labels</button>
      </div>
      </>}
    </section>

    {soundError && <p role="status" className="sound-error">{soundError}</p>}
    {live && <NarratorDock live={live} />}
    {live && <Dock live={live} selectedId={selectedId} onSelect={id => selectMiner(id)} open={dockOpen} onToggle={() => setDockOpen(o => !o)} />}
    </div>
    </>}
  </main>;
}
