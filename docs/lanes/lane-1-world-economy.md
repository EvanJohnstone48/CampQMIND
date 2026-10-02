# Lane 1 · World & Economy

You build the world itself: the valley map, the miners' jobs, and the economy that ties it all together. Each round (a "shift") the world moves forward one step: ore gets dug, goods get traded, the bank charges interest, people eat or go hungry. It has to be repeatable: the same seed should always give the same world, so we can replay things and check the narrator's answers. You also run the server that ticks the world live and sends updates to the browser. If the economy crashes or goes flat, nothing else matters, so keeping it balanced is your biggest job.

**Your folders:** `packages/shared` (with everyone), `packages/sim`, `apps/server`, `apps/cli`, `fixtures`

**Things you'll make:**
- A seeded random number generator (same seed = same world)
- A map generator: mountains, a river, the village, farms, a forest, mines and trails
- The round loop: mining, chopping, farming, resting, hunger
- A market where miners buy and sell, plus a bank with loans
- Cave-ins, buildings, jobs and wages
- Acts of god (earthquake, gold rush, forest fire…) and god powers (lightning, boon, throw)
- A live server that sends each round to the browser
- A command-line tool to run, record and compare worlds without a browser
