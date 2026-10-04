# Motherlode — lane 4 frontend

Self-contained React / TypeScript / react-three-fiber app. All implementation lives in `apps/web`.

## Run

From the repo root, with Node 22.18+ (or Node 24):

```sh
pnpm install
pnpm dev        # the world server and this app; the app connects to it live
```

Add `?demo` to the URL for the self-contained demo below, or `?server=ws://host:port` to use another server.

Open the localhost URL printed by Vite. This package is part of the root pnpm workspace.

```sh
npm run build
npm test
```

For browser checks, build first, then run `npm run test:browser`. They use the installed Edge browser by default; set `BROWSER_CHANNEL=chrome` to use installed Chrome instead. Screenshots are saved under the ignored `test-results/` directory.

## What works

- Continuous Swiss-inspired Alpine valley extending into a hazy horizon. The active meadow has finer, smooth terrain and detailed trees; distant mountain ridges and trees use fewer polygons. Snow-capped peaks, flower meadows, a carved stream and a turquoise lake surround the town.
- Three staggered mountain ranges, distant fir woodland and drifting cloud banks surround **all sides** of the town. Coarse-ground props use the height of the actual rendered triangles, avoiding floating scenery.
- 24 spaced chalets with 120 beds, balconies, shutters, gardens and flower boxes. Street lamps, a chapel, market, fountain and flag accompany three entrances per mine, headframes and ore yards, a larger sawmill, farm and foundry. Authored work spaces fit the 100 assigned residents; these are presentation capacities, not economic outputs.
- 100 named residents move along routes, work, carry supplies and return home. Their feet follow the terrain and bridge height. Click a bean or use the accessible resident selector for name, trade and current activity.
- Drag to orbit, scroll/pinch to zoom, right-drag/two-finger drag to pan. Both camera and orbit target stay inside the active valley. Place buttons focus and inspect a workplace; Reset camera restores the overview. Click a chalet or use its selector to inspect its beds and residents; click a resident in that list to meet them.
- **Follow this miner** tracks the selected resident while preserving orbit and zoom. Stop following, select another resident/place, reset or press Escape to exit. **Show journey** draws the selected resident's route; **Visit their chalet** focuses their home. Space toggles local playback; Escape closes inspection.
- A four-minute day/night cycle at 1×, a visible glowing sun and cratered moon, gradient sky, warm evening light, stars and lit windows. 4× / 12× playback and pause are local demo controls.
- Clouds drift at different speeds, bob, billow and fade at the edge of their wind path; chimney smoke, mining dust, waterwheel rotation and moving river highlights follow demo time.
- Weather cycles through clear skies, rain, mist and Alpine flurries every 75 seconds of presentation time. The Weather selector overrides it. GPU rain/snow particles, cloud color and wind, lighting and visibility react to weather. Pausing freezes movement and precipitation.
- Full building and work-site footprints reserve level ground with a guard band and softly graded foothills. All six mine entrances have recessed timber-lined tunnels, connected tracks, gravel approaches and rock backing; the headframes stand clear of the rock. The stream stays beside the chalets. A millrace feeds the foundry wheel; pasture fencing, farm walls, a lakeside landing and two trail shelters tie decorative scenery to the working landscape.
- Optional quiet procedural river and pickaxe sound. Initially muted; no external audio assets or API keys.

## Integration boundary

**Now connected** (see [docs/INTEGRATION.md](../../docs/INTEGRATION.md)): `src/net/live.ts` is the live `WorldSource`. It maps the server's shifts onto `WorldView` and feeds the console dock (`features/console/Dock.tsx`: narrator, miners, economy charts, Overseer controls). The world runs on this valley: `ALPINE_VALLEY` in `@motherlode/shared` mirrors `demoMap.ts`, checked by `src/net/valley.test.ts`. The notes below describe the original demo-only design.

`src/net/world.ts` defines a **frontend view model**, not a team-wide contract. `WorldSource.connect(publish)` supplies full snapshots and returns a cleanup function. `App` accepts a `source` and `initialWorld`; the shared browser store publishes snapshots to the view. `src/net/demo.ts` is a replaceable presentation demo, not an economy or agent brain.

When lane 1 establishes the shared types and WebSocket protocol, implement a `WorldSource` adapter under `src/net` that maps server snapshots into `WorldView`. Supply stable miner IDs, x/z positions, display names, activities, simulation clock and places. Close its connection in the returned cleanup function. Leave optional `setPaused` / `setSpeed` undefined if unsupported; those controls then disappear. The renderer smoothly interpolates miner positions between incoming snapshots.

Optional `WorldView.buildings` supplies home details and positions. Optional `MinerView.homeId` links residents to those homes and `route` provides a journey overlay. These features disappear when that data is absent. Tracking needs only stable IDs and positions. Weather is local scenery driven by the supplied `elapsed` clock. `demoMap.ts` owns local house layout, walking routes and presentation capacities; live adapters do not inherit its industry capacities.

The current Alpine terrain, river and routes are the demo map, authored inside lane 4. `features/world/landscape.ts` provides the height function shared by the terrain, props, paths, miner feet and camera clearance. `AlpineLandscape.tsx` renders the scenery; its trees, meadow plants and scattered rocks use instancing to keep the increased detail manageable. The place models use supplied place positions. If lane 1 produces a different map, replace this renderer after agreeing its geometry contract. Do not assume the demo coordinates or terrain are the final simulation contract. A live adapter, reconnection policy and protocol validation are deferred until that agreement exists.

`features/world/camera.ts` defines the active bounds and overview. Keep these aligned with any replacement map. Continuous terrain rings extend to a radius of 432 scene units, beyond the maximum fog visibility; the camera is restricted to the inhabited valley rather than the scenery's outer edge.

`demoMap.ts` also records the complete site footprints and scenery trails. Keep their extents aligned with building models when editing the demo. `terrainSurfaceHeight` samples the shared terrain triangulation for scenery, trails and miner feet. Terrain checks cover rendered mine-mouth clearance, all site foundations, dry chalets and surrounding ridges in every direction; browser checks capture four orbit views and both mines for visual review.

Future Society, Agents and Narrator panels can use `useWorld` with the same `WorldStore`. Their implementation folders remain untouched. Layout, charts, Oracle, intervention timeline and god powers are deferred as requested.

All 3D assets are procedural. Fonts are optional Google Fonts with local system fallbacks. No Gemini access or secret configuration is needed for this frontend.
