// The world runs on ALPINE_VALLEY; Lane 4 draws demoMap. They must describe the same valley.
import { describe, expect, it } from 'vitest';
import { ALPINE_VALLEY, VALLEY_PLACES } from '@motherlode/shared';
import { demoPlaces } from './demo';
import { demoHomes, footprintDistance, siteFootprints } from './demoMap';

describe('the sim map matches the drawn valley', () => {
  it('puts every place where Lane 4 draws it', () => {
    for (const p of demoPlaces) expect(VALLEY_PLACES[p.id as keyof typeof VALLEY_PLACES]).toEqual(p.position);
  });

  it('keeps every work site inside its place footprint', () => {
    for (const s of ALPINE_VALLEY.sites) {
      if (s.kind === 'houseLot' || s.kind === 'tradingPost') continue;
      const placeId = (s.extras as { placeId: string }).placeId;
      const fp = siteFootprints.find(f => f.id === placeId)!;
      expect(footprintDistance(s.position.x, s.position.z, fp), `${s.id} in ${placeId}`).toBe(0);
    }
  });

  it('uses the chalets as house lots', () => {
    const lots = ALPINE_VALLEY.sites.filter(s => s.kind === 'houseLot');
    expect(lots.map(l => l.id)).toEqual(demoHomes.map(h => h.id));
    for (const l of lots) expect([l.position.x, l.position.z]).toEqual(demoHomes.find(h => h.id === l.id)!.position);
  });
});
