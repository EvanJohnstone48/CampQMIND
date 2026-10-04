export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    mountain: <><path d="m2 19 7-14 6 14M12 19l5-10 5 10"/><path d="m7 9 2 2 2-2"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></>,
    moon: <path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z"/>,
    sound: <><path d="M4 9h4l5-4v14l-5-4H4Z"/><path d="M16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></>,
    mute: <><path d="M4 9h4l5-4v14l-5-4H4Z"/><path d="m17 9 5 6m0-6-5 6"/></>,
    pause: <><path d="M8 5v14M16 5v14"/></>,
    play: <path d="m8 5 11 7-11 7Z"/>,
    reset: <><path d="M4 11a8 8 0 1 1 2 7M4 4v7h7"/></>,
    close: <path d="m6 6 12 12M18 6 6 18"/>,
    pick: <><path d="m5 20 12-14M9 4c5-2 10 1 12 6M8 5l3 3"/></>,
    tree: <><path d="m12 3-6 9h3l-5 6h16l-5-6h3Z"/><path d="M12 18v4"/></>,
    wheat: <><path d="M12 22V5m0 7L6 6m6 12-6-6m6 0 6-6m-6 12 6-6"/></>,
    home: <><path d="m3 11 9-8 9 8M5 9v12h14V9M10 21v-7h4v7"/></>,
    flame: <path d="M12 3c3 6 8 8 6 14a7 7 0 0 1-12 0c-2-4 0-7 3-9 0 4 2 5 3 5 2-3 1-6 0-10Z"/>,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.mountain}</svg>;
}
