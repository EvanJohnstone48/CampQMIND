import { pointOnRoute } from './world.ts';
import type { Place, Point, Trade, WorldSource, WorldView } from './world.ts';
import { demoHomes, residentRoute } from './demoMap.ts';

export const demoPlaces: readonly Place[] = [
  { id: 'town', name: 'Hearth village', kind: 'town', position: [-9, 0], color: '#c07856' },
  { id: 'copper', name: 'Copper ridge', kind: 'copper', position: [-12, -12], color: '#82bfb0' },
  { id: 'gold', name: 'Goldpeak mine', kind: 'gold', position: [15, -12], color: '#dbb357' },
  { id: 'forest', name: 'Timber & sawmill', kind: 'forest', position: [-27, 23], color: '#668b55' },
  { id: 'farm', name: 'Sunfield farm', kind: 'farm', position: [17, 13], color: '#aeac5a' },
  { id: 'smelter', name: 'Riverside works', kind: 'smelter', position: [12, -1], color: '#af806e' },
];
export const demoRoutes: Record<string, readonly Point[]> = {
  copper: [[-9, -0.9], [-13, -7], [-12, -12]],
  gold: [[-9, -0.9], [-2.5, -0.9], [-2.5, 4], [8, 4], [12, -6], [15, -12]],
  forest: [[-28, 18.6], [-28, 22], [-27, 23]],
  farm: [[-2.5, 4], [8, 4], [12, 9], [17, 13]],
  smelter: [[8, 4], [10, 4], [12, -1]],
};
const names = ['Ada', 'Milo', 'Jun', 'Cleo', 'Otis', 'Fern', 'Pip', 'Nell', 'Arlo', 'Bea', 'Ivo', 'Wren', 'Luca', 'Tess', 'Remy', 'Sol', 'Kit', 'Alma', 'Leo', 'Faye', 'Emil', 'Rose', 'Finn', 'Opal', 'Jude', 'Iris', 'Theo', 'Moss', 'Etta', 'Rory', 'Nico', 'Hazel', 'Ash', 'Mae', 'Hugo', 'Lark'];
const workplaces = ['copper', 'gold', 'forest', 'farm', 'smelter', 'copper'];
const trades: Record<string, Trade> = { copper: 'Miner', gold: 'Miner', forest: 'Woodcutter', farm: 'Farmer', smelter: 'Smelter' };
const activities: Record<string, string> = { copper: 'Chipping copper ore', gold: 'Digging for gold', forest: 'Gathering timber', farm: 'Tending the crops', smelter: 'Processing ore' };
const routes = Array.from({ length: 100 }, (_, i) => residentRoute(i, workplaces[i % workplaces.length]));

/** Presentation-only activity. This makes no economic or social decisions. */
export function demoSnapshot(elapsed: number): WorldView {
  const hours = 8 + elapsed / 10; // 4-minute full day at 1×
  return {
    sourceLabel: 'Local demo', elapsed, hour: hours % 24, day: Math.floor(hours / 24) + 1,
    places: demoPlaces, buildings: demoHomes,
    miners: Array.from({ length: 100 }, (_, i) => {
      const name = i < names.length ? names[i] : `${names[i % names.length]} ${['Keller', 'Frei'][Math.floor(i / names.length) - 1]}`;
      const destinationId = workplaces[i % workplaces.length];
      const cycle = ((elapsed / (55 + (i % 5) * 4)) + i * 0.137) % 1;
      const outbound = cycle < 0.36;
      const working = cycle >= 0.36 && cycle < 0.62;
      const atHome = cycle >= 0.98;
      const fraction = outbound ? cycle / 0.36 : working ? 1 : atHome ? 0 : 1 - (cycle - 0.62) / 0.36;
      const position = pointOnRoute(routes[i], fraction);
      const hauler = i % 6 === 5;
      const place = demoPlaces.find(p => p.id === destinationId)!;
      return {
        id: `demo-${i}`, name, trade: hauler ? 'Hauler' : trades[destinationId], destinationId, working,
        homeId: demoHomes[i % demoHomes.length].id, route: routes[i],
        position: [position[0] + ((i % 3) - 1) * 0.16, position[1] + ((i % 3) - 1) * 0.1],
        activity: atHome ? 'Resting in the village' : working ? (hauler ? 'Loading copper ore' : activities[destinationId])
          : outbound ? `Walking to ${place.name}` : 'Bringing supplies to the village',
        color: ['#cf9c68', '#89a9a0', '#d9b856', '#ad8fba', '#cd8272', '#8aa66b'][i % 6],
      };
    }),
  };
}

export function createDemoSource(): WorldSource {
  let paused = false;
  let speed = 1;
  let elapsed = 0;
  return {
    connect(publish) {
      publish(demoSnapshot(elapsed));
      let last = performance.now();
      const timer = window.setInterval(() => {
        const now = performance.now();
        const delta = Math.min((now - last) / 1000, 0.5);
        last = now;
        if (!paused) { elapsed += delta * speed; publish(demoSnapshot(elapsed)); }
      }, 250);
      return () => window.clearInterval(timer);
    },
    setPaused(value) { paused = value; },
    setSpeed(value) { speed = value; },
  };
}
