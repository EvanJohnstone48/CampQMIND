export type WeatherMode = 'auto' | 'clear' | 'rain' | 'snow' | 'fog';
export interface WeatherView { kind: Exclude<WeatherMode, 'auto'>; label: string; overcast: number; fogFar: number; wind: number }
export function weatherAt(elapsed: number, mode: WeatherMode): WeatherView {
  const kind = mode === 'auto' ? (['clear', 'rain', 'fog', 'snow'] as const)[Math.floor(elapsed / 75) % 4] : mode;
  const profiles = {
    clear: { label: 'Clear skies', overcast: 0, fogFar: 330, wind: 1 },
    rain: { label: 'Passing shower', overcast: 0.72, fogFar: 180, wind: 1.8 },
    snow: { label: 'Alpine flurries', overcast: 0.5, fogFar: 210, wind: 0.8 },
    fog: { label: 'Valley mist', overcast: 0.32, fogFar: 90, wind: 0.5 },
  };
  return { kind, ...profiles[kind] };
}
