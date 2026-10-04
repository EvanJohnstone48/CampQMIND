import test from 'node:test';
import assert from 'node:assert/strict';
import { demoHomes, mineEntrances, millrace, siteFootprints } from '../src/net/demoMap.ts';
import { lakeDistance, peaks, riverX, terrainHeight, terrainSurfaceHeight } from '../src/features/world/landscape.ts';

test('rendered terrain clears all six mine openings and their approach tracks', () => {
  for (const site of siteFootprints.filter(s => s.id === 'copper' || s.id === 'gold')) {
    for (const entrance of mineEntrances) for (let x = -1.25; x <= 1.25; x += 0.25) for (let z = -3.05; z <= 2; z += 0.25) {
      const ground = terrainSurfaceHeight(site.position[0] + entrance + x, site.position[1] + z);
      assert.ok(ground <= site.elevation + 0.015, `${site.id}: blocked recess at ${entrance + x},${z}`);
      assert.ok(ground >= site.elevation - 0.015, `${site.id}: unsupported recess floor`);
    }
  }
});

test('full industrial, chapel and shelter foundations stay below the structures', () => {
  for (const site of siteFootprints) {
    for (let x = site.minX + 0.7; x <= site.maxX - 0.7; x += 0.4) for (let z = site.minZ + 0.7; z <= site.maxZ - 0.7; z += 0.4) {
      assert.ok(terrainSurfaceHeight(site.position[0] + x, site.position[1] + z) <= site.elevation + 0.015, `${site.id}: terrain protrudes into foundation`);
    }
  }
});

test('all chalet foundations are dry and supported after the river bends', () => {
  for (const home of demoHomes) for (let x = -1.1; x <= 1.1; x += 0.25) for (let z = -1; z <= 1; z += 0.25) {
    const wx = home.position[0] + x, wz = home.position[1] + z;
    assert.ok(Math.abs(terrainSurfaceHeight(wx, wz) - 0.94) < 0.015, `${home.id}: uneven foundation`);
    assert.ok(Math.abs(wx - riverX(wz)) > 1.05, `${home.id}: river crosses the chalet`);
  }
});

test('surrounding mountain layers cover every direction beyond town', () => {
  for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 24) {
    let ridgeHeight = 0;
    for (let radius = 70; radius <= 340; radius += 4) ridgeHeight = Math.max(ridgeHeight, terrainSurfaceHeight(Math.cos(angle) * radius, Math.sin(angle) * radius));
    assert.ok(ridgeHeight > 35, `Missing background ridge at angle ${angle}`);
  }
  assert.ok(peaks.length > 40);
});

test('the wheel channel joins the river and the lake shoreline meets the water', () => {
  assert.equal(millrace[0][0], riverX(millrace[0][1]));
  assert.equal(millrace.at(-1)![0], riverX(millrace.at(-1)![1]));
  assert.ok(terrainHeight(7.6, -1) < 0.69, 'The wheel channel needs a bed below its water');
  for (const point of [[0, 32], [-5, 29], [7, 35]]) assert.ok(lakeDistance(...point as [number, number]) < 1.1 && terrainHeight(...point as [number, number]) < 0.64);
});
