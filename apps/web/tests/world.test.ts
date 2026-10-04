import test from 'node:test';
import assert from 'node:assert/strict';
import { demoSnapshot } from '../src/net/demo.ts';
import { pointOnRoute } from '../src/net/world.ts';
import { createWorldStore } from '../src/net/store.ts';
import { ACTIVE_BOUNDS, boundedPoint } from '../src/features/world/camera.ts';
import { weatherAt } from '../src/features/world/weather.ts';
import { siteCapacities } from '../src/net/demoMap.ts';

test('route interpolation follows each segment and handles stationary routes', () => {
  assert.deepEqual(pointOnRoute([[0, 0], [3, 0], [3, 4]], 0.5), [3, 0.5]);
  assert.deepEqual(pointOnRoute([[0, 0], [0, 0]], 0.5), [0, 0]);
  assert.deepEqual(pointOnRoute([[2, 4]], 0.8), [2, 4]);
  assert.deepEqual(pointOnRoute([], 0.8), [0, 0]);
  assert.deepEqual(pointOnRoute([[0, 0], [3, 4]], 2), [3, 4]);
});

test('demo has 100 unique residents and stays repeatable within the playable valley', () => {
  assert.deepEqual(demoSnapshot(123), demoSnapshot(123));
  assert.equal(demoSnapshot(0).miners.length, 100);
  assert.equal(new Set(demoSnapshot(0).miners.map(m => m.name)).size, 100);
  for (let elapsed = 0; elapsed < 1000; elapsed += 3.7) {
    const world = demoSnapshot(elapsed);
    assert.equal(new Set(world.miners.map(m => m.id)).size, world.miners.length);
    assert.ok(world.hour >= 0 && world.hour < 24);
    for (const miner of world.miners) {
      assert.ok(miner.position[0] >= ACTIVE_BOUNDS.minX && miner.position[0] <= ACTIVE_BOUNDS.maxX);
      assert.ok(miner.position[1] >= ACTIVE_BOUNDS.minZ && miner.position[1] <= ACTIVE_BOUNDS.maxZ);
      assert.ok(world.places.some(p => p.id === miner.destinationId));
      assert.ok(miner.activity.length > 0);
    }
  }
  assert.notDeepEqual(demoSnapshot(0).miners[0].position, demoSnapshot(5).miners[0].position);
});

test('expanded village houses every resident and industry fits assigned crews', () => {
  const world = demoSnapshot(0);
  assert.ok(world.buildings!.length >= 20);
  assert.ok(world.buildings!.reduce((total, b) => total + b.capacity, 0) >= world.miners.length);
  for (const home of world.buildings!) assert.ok(world.miners.filter(m => m.homeId === home.id).length <= home.capacity);
  for (const miner of world.miners) {
    assert.ok(world.buildings!.some(b => b.id === miner.homeId));
    assert.ok(miner.route && miner.route.length > 1);
    assert.ok(miner.route.every(p => Number.isFinite(p[0]) && Number.isFinite(p[1])));
  }
  for (const place of world.places) assert.ok(world.miners.filter(m => m.destinationId === place.id).length <= siteCapacities[place.id]);
});

test('camera bounds preserve interior positions and contain extreme panning', () => {
  assert.deepEqual(boundedPoint(-9, 12), { x: -9, z: 12 });
  assert.deepEqual(boundedPoint(-1000, 1000), { x: ACTIVE_BOUNDS.minX, z: ACTIVE_BOUNDS.maxZ });
  assert.deepEqual(boundedPoint(1000, -1000), { x: ACTIVE_BOUNDS.maxX, z: ACTIVE_BOUNDS.minZ });
});

test('weather overrides persist and automatic weather cycles deterministically', () => {
  assert.equal(weatherAt(0, 'auto').kind, 'clear');
  assert.equal(weatherAt(76, 'auto').kind, 'rain');
  assert.equal(weatherAt(151, 'auto').kind, 'fog');
  assert.equal(weatherAt(226, 'auto').kind, 'snow');
  assert.equal(weatherAt(301, 'auto').kind, 'clear');
  assert.equal(weatherAt(226, 'rain').kind, 'rain');
});

test('day wraps at midnight and advances the day count', () => {
  assert.equal(demoSnapshot(160).hour, 0);
  assert.equal(demoSnapshot(160).day, 2);
});

test('store accepts a replacement source snapshot and cleans up subscribers', () => {
  const store = createWorldStore(demoSnapshot(0));
  let notifications = 0;
  const unsubscribe = store.subscribe(() => notifications++);
  const external = { ...demoSnapshot(5), sourceLabel: 'Live server', miners: [] };
  store.publish(external);
  assert.equal(store.getSnapshot(), external);
  assert.equal(notifications, 1);
  unsubscribe();
  store.publish(demoSnapshot(10));
  assert.equal(notifications, 1);
});
