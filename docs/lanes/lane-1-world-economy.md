# Lane 1 · World & Economy

You build the world itself: the miners' jobs and the economy that ties it all together, on top of the one valley map that Lane 4 draws. Each round (a "shift") the world moves forward one step: ore gets dug, goods get traded, the bank charges interest, people eat or go hungry. It has to be repeatable: the same seed should always give the same world, so we can replay things and check the narrator's answers. You also run the server that ticks the world live and sends updates to the browser. If the economy crashes or goes flat, nothing else matters, so keeping it balanced is your biggest job.

**Your folders:** `packages/shared` (with everyone), `packages/sim`, `apps/server`, `apps/cli`, `fixtures`

**Things you'll make:**
- A seeded random number generator (same seed = same world)
- A loader for Lane 4's map (no map generation: there's one valley, and Lane 4 owns it)
- One well-being score per miner (food, energy, shelter, health, savings, comfort) that every miner is trying to raise
- The round loop: mining, chopping, farming, smelting, building, resting, hunger
- A market where miners buy and sell, a Trading Post to the outside world, and a bank with loans
- Cave-ins, houses, jobs and wages
- Acts of god (earthquake, gold rush, forest fire…) and god powers (lightning, boon, throw)
- A live server that sends each round to the browser
- A command-line tool to run, record and compare worlds without a browser

The full plan is in [issues/prd.md](../../issues/prd.md).

## Using it from other lanes

- **Lane 2 (brains):** a brain is `(observation) => intent` (types in `packages/shared/src/brain.ts`). Import `wellbeing` from `@motherlode/sim` to score options, and pass extra social well-being per miner in the shift inputs. The server's plug-in point is `apps/server/src/brains.ts`. The sim's own `baselineBrain` is a reference to beat.
- **Lane 3 (narrator):** every shift gives you `events` (with `causes` and `witnesses`), `metrics` and `activities`. `forkCompare` runs the world forward with and without an action. Replays are exact.
- **Lane 4 (view):** the map shape is in `packages/shared/src/map.ts` (check yours with `pnpm sim map-check your-map.json`). The socket messages are in `protocol.ts`. `fixtures/demo.ndjson` is a recorded stream of exactly what the server sends.

## Commands

```
pnpm sim run --seed demo --shifts 500 --out runs/demo.json
pnpm sim replay runs/demo.json
pnpm sim balance --seeds 5 --shifts 2000
pnpm sim fixture --shifts 60
pnpm dev:server
pnpm test
```
