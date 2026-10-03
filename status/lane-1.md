# Lane 1 status

**Done**
- Shared contract: map, miner, brain (observation/intent), events, metrics, dials, socket protocol
- Sim: keyed RNG, map loader, well-being, market auctions, Trading Post, bank, jobs, houses, cave-ins, acts of god, god powers, ~50 dials, books that balance every shift
- Baseline brain, CLI (run / replay / diff / balance / fixture / map-check), live server with revert and fork
- `fixtures/demo.ndjson` for Lanes 3 and 4

**Doing**
- Tuning so food, timber and copper markets stay busy on every seed

**Blocked / waiting on**
- Lane 4's real map (using a placeholder until then)
- Lane 2's brain provider to plug into `apps/server/src/brains.ts`
