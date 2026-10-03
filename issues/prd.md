# PRD · Lane 1 · World & Economy

*Motherlode, Camp QMIND build weekend, October 2026. Owner: Lane 1.*

## Problem Statement

Motherlode needs a world for everything else to stand on. Lane 2's miners need somewhere to act, Lane 3's narrator needs a flood of real, causally connected data to explain (plus a way to re-run history with one cause removed), and Lane 4's valley and console need live state to draw and dials to turn. Right now `packages/sim`, `apps/server` and `apps/cli` are empty.

The hard part isn't the plumbing. It's the economy. A simulated economy with ~100 agents tends to fail in one of two boring ways:

- **It crashes.** Everyone starves, all money ends up with one miner, prices go to zero or infinity, credit freezes for good.
- **It goes flat.** Everyone settles into the same job, prices never move, nothing happens for the narrator to explain.

Either way the demo is dead. The world also has to be **exactly repeatable**: the same seed and the same inputs must produce the same world, down to the last coin. That's what lets the narrator's explanations be checked against ground truth, which is the reason Motherlode exists (see the vision doc's AWARE-NG mapping).

## Solution

A deterministic, seeded, shift-based world engine that loads **one fixed map authored by Lane 4** (no procedural map generation). Each shift it resolves what every miner chose to do: digging, chopping, farming, smelting, building, working for someone else, resting and trading. Then it runs the market, the bank, hunger, hazards and nature.

**One idea drives every miner: well-being.** The sim defines a single well-being function built from needs (food, rest, shelter, health, financial security). Miners, through whatever brain Lane 2 gives them, choose actions to raise it. There are many ways to get there (work a vein, farm, work for wages, borrow and build a house, speculate on gold), and the best way keeps shifting as prices, veins, forests and trust change. Because well-being has diminishing returns, rich miners stop grinding and poor ones work harder. That's the engine of the dynamics, and it pulls the economy back toward stability on its own.

The economy is **open at one controlled point**: a **Trading Post** connected to the outside world. It buys copper and gold (with a downward-sloping demand curve, so a glut crashes the price) and sells imported food and timber at a markup. That gives metals a reason to be worth something and gives the Overseer a "world price" dial. Everything inside the valley conserves money and goods exactly, which the sim checks every shift.

Around that core: an auction market per good per shift, a bank with finite reserves, jobs and wages, houses, cave-ins, acts of god, god powers, ~50 dials, a live WebSocket server, and a CLI to run, record, compare and balance-test worlds without a browser.

## User Stories

### Overseer (the player)

1. As the Overseer, I want the valley to keep running shift after shift without collapsing, so that there's always something happening to watch and influence.
2. As the Overseer, I want prices for food, timber, copper ore, copper and gold to move with supply and demand, so that my actions have visible economic consequences.
3. As the Overseer, I want to see miners spread across different jobs (mining, chopping, farming, smelting, building, resting), so that the town feels like a real economy rather than a hive.
4. As the Overseer, I want to set dials such as interest rate, world copper price, cave-in risk, food spoilage, forest regrowth and poor relief, so that I can change the rules of the world.
5. As the Overseer, I want every dial to show its range, unit and current value, so that I understand what I'm changing.
6. As the Overseer, I want to trigger an earthquake, so that I can see how cave-ins and fear ripple through the town.
7. As the Overseer, I want to trigger a gold rush at a chosen vein, so that I can watch over-mining, timber demand and price swings unfold.
8. As the Overseer, I want to trigger a forest fire, so that I can stress the timber supply and everything downstream of it.
9. As the Overseer, I want to trigger a drought, so that I can see a food shortage play out.
10. As the Overseer, I want to shock the outside world's metal prices up or down, so that I can test how the town handles a boom or a bust.
11. As the Overseer, I want to strike a named miner with lightning, so that I can punish or frighten them.
12. As the Overseer, I want to grant a boon (a windfall) to a named miner, so that I can reward or rescue them.
13. As the Overseer, I want to throw a named miner into the river, so that I can interfere directly in their day.
14. As the Overseer, I want to pause, speed up and slow down the world, so that I can watch at my own pace.
15. As the Overseer, I want to rewind to an earlier shift, so that I can undo an intervention I regret.
16. As the Overseer, I want starving miners to receive minimal poor relief instead of vanishing, so that one bad famine doesn't end the demo.
17. As the Overseer, I want a miner who can't repay a loan to lose their collateral, so that debt has real stakes.

### Miner (an agent in the world)

18. As a miner, I want a clear well-being score built from my needs, so that my brain has one thing to try to improve.
19. As a miner, I want to see my own needs (hunger, energy, shelter, health, financial security), so that I can decide what matters most right now.
20. As a miner, I want to dig ore at a vein, with yield depending on my skill, my energy, how hard the rock is, how rich it is and how crowded the vein is, so that mining choices involve real trade-offs.
21. As a miner, I want veins to get harder and poorer as they get deeper, so that old veins eventually stop being worth working.
22. As a miner, I want to place timber supports as I dig deeper, so that I can cut my risk of a cave-in at the cost of timber.
23. As a miner, I want to chop timber in the forest, with yield depending on how much forest is left, so that over-chopping hurts everyone later.
24. As a miner, I want to farm a plot for food, so that I can feed myself or sell the surplus.
25. As a miner, I want to smelt copper ore into copper at the smelter, burning timber as fuel and paying the owner's fee, so that I can turn raw ore into something worth more.
26. As a miner, I want to rest, so that I can recover energy when I'm worn out.
27. As a miner, I want to post buy and sell orders on the market, so that I can trade what I have for what I need.
28. As a miner, I want my orders to be filled at one fair clearing price per good per shift, so that trading is transparent and the same rules apply to everyone.
29. As a miner, I want to sell metals to the Trading Post, so that there's always someone who'll buy copper and gold, even if at a falling price.
30. As a miner, I want to buy imported food from the Trading Post at a high price, so that I can survive a local famine if I have the money.
31. As a miner, I want to borrow from the bank, so that I can buy food, materials or a house before I can afford them.
32. As a miner, I want to know my loan's interest, term and repayment schedule, so that I can plan around my debt.
33. As a miner, I want to post a job with a wage, so that I can hire others to work my smelter or farm.
34. As a miner, I want to accept a posted job, so that I can earn a steady wage instead of taking risks myself.
35. As a miner, I want to stop working for an employer who doesn't pay, so that I'm not exploited forever.
36. As a miner, I want to build a house from timber, copper and several shifts of labour, so that my shelter need is met permanently.
37. As a miner, I want to sleep in the bunkhouse for rent if I have no house, so that I have a fallback.
38. As a miner, I want to eat automatically when I'm hungry and have food, so that I don't starve through forgetfulness.
39. As a miner, I want food I'm holding to spoil slowly, so that hoarding food has a cost.
40. As a miner, I want distance on the map to cost me working time, so that where I live and work matters.
41. As a miner, I want an injury from a cave-in or lightning to keep me off work for a while, so that danger has lasting effects.

### Lane 2 (miners' brains and society)

42. As a Lane 2 developer, I want a single brain interface (observation in, intent out), so that fuzzy, LLM and any future brains plug in the same way.
43. As a Lane 2 developer, I want the observation to include the miner's own state, last prices, job postings, nearby sites and recent events they witnessed, so that brains have what they need to decide.
44. As a Lane 2 developer, I want the well-being function exported as a pure function, so that my brains can estimate what an action is worth before choosing it.
45. As a Lane 2 developer, I want invalid intents (for example, digging a vein that doesn't exist, or selling goods you don't have) to be safely turned into "rest" and logged, so that a bad LLM answer can't break the world.
46. As a Lane 2 developer, I want a list of witnessed events per miner (who saw the lightning strike), so that I can spread fear and trust through the social network.
47. As a Lane 2 developer, I want a built-in baseline brain in the sim, so that I can compare my brains against a simple reference.
48. As a Lane 2 developer, I want the sim to accept a well-being term from the social layer (for example, guild belonging), so that society can matter to miners without the sim knowing about guilds.

### Lane 3 (narrator and Oracle)

49. As a Lane 3 developer, I want every shift to emit typed events (trade, dig, cave-in, loan, default, hunger, building, act of god, god power), so that I can detect developments.
50. As a Lane 3 developer, I want events to carry a cause reference whenever the sim knows the cause (for example, a cave-in caused partly by an earthquake modifier), so that I have ground truth to score explanations against.
51. As a Lane 3 developer, I want a metrics snapshot every shift (prices, volumes, output, money supply, Gini, hunger rate, debt, forest stock, vein reserves, mean well-being), so that I can build signals from time series.
52. As a Lane 3 developer, I want to fork the world at any shift and run it forward with and without an intervention, so that the Oracle can measure counterfactuals.
53. As a Lane 3 developer, I want removing one cause in a fork to leave every unrelated random draw unchanged, so that the difference I measure is the cause and not noise.
54. As a Lane 3 developer, I want each run to record every shift's intents, so that runs with non-deterministic LLM miners can still be replayed exactly.

### Lane 4 (world view and console)

55. As a Lane 4 developer, I want to author one map file in an agreed shape (sites, kinds, positions, trails, capacities), so that the valley I draw and the valley the sim runs are the same.
56. As a Lane 4 developer, I want the sim to reject a malformed map with a clear error, so that I find mistakes immediately.
57. As a Lane 4 developer, I want a full snapshot on connect and a compact update every shift over WebSocket, so that the 3D view and charts stay in sync.
58. As a Lane 4 developer, I want each miner's current destination and activity every shift, so that beans can walk there continuously between shifts.
59. As a Lane 4 developer, I want the dial list (name, group, range, unit, default, description) supplied by the sim, so that I can generate sliders instead of hand-coding fifty of them.
60. As a Lane 4 developer, I want recorded fixture runs, so that I can build the UI before the live server is ready.
61. As a Lane 4 developer, I want commands for set dial, act of god, god power, pause, speed and revert, so that the console can drive the world.

### Lane 1 (me, the world builder)

62. As the Lane 1 developer, I want to run 2,000 shifts across 20 seeds from the CLI in seconds, so that I can tune the economy fast.
63. As the Lane 1 developer, I want a balance report that flags crashes (starvation, runaway inequality, dead markets) and flatness (no price movement, everyone in one job), so that I know when tuning is needed.
64. As the Lane 1 developer, I want money and goods conservation checked every shift, so that accounting bugs are caught the moment they appear.
65. As the Lane 1 developer, I want to diff two runs and see the first shift where they diverge, so that I can debug determinism and measure interventions.
66. As the Lane 1 developer, I want the whole world state to be plain serialisable data, so that snapshots, forks, rewinds and fixtures are trivial.
67. As the Lane 1 developer, I want the sim to run with only the baseline brain and a placeholder map, so that I'm never blocked on Lane 2 or Lane 4.

### Researcher (AWARE-NG link)

68. As a researcher, I want the economy to produce multi-cause, delayed-effect events (gold rush → over-mining → timber shortage → smelting cost → layoffs → loans), so that the narrator is tested on the same shape of problem as a real plant.
69. As a researcher, I want hidden vein properties (grade, hardness) that miners only learn by digging, so that the sim mirrors unknown ore properties in a real circuit.

## Implementation Decisions

### Boundaries with other lanes

- **No map generation.** Lane 4 authors one fixed map. The map schema lives in the shared contract and both lanes agree on it. Lane 1 owns the loader and validator and keeps a small placeholder map until Lane 4's is ready. The map gives sites with stable ids and kinds (vein entrance, farm plot, forest patch, smelter, bank, market square, Trading Post, bunkhouse, house lot, river crossing), positions, a trail graph with travel times, and per-site capacities. Hidden vein properties (tonnage, grade and hardness curves) are generated from the seed per vein, so the map stays purely geographic.
- **Well-being belongs to the sim; choosing actions belongs to Lane 2.** The sim defines *what is good for a miner*. Brains decide *how to chase it*. The sim exports the well-being function as a pure function so brains can score candidate actions, and accepts an optional extra term from the social layer.
- **The brain interface lives in the shared contract:** `decide(observation) → intent`. The sim never imports Lane 2 code. The server and CLI wire brains to the sim. The sim includes one **baseline brain**: a greedy rule that picks the action with the best expected well-being gain using last prices. It exists so Lane 1 can run alone, and as a reference.
- **Lane 1 also owns dial definitions, act-of-god and god-power definitions, the event types, the metrics shape and the WebSocket message shapes**, all published in the shared contract.

### Core architecture

- **A step function sits at the heart of the sim.** It takes the world state, every miner's intent for this shift, and any queued Overseer actions, and returns the next world state plus this shift's events and metrics. It is synchronous and deterministic and has no I/O. Everything async (LLM brains, sockets, files) stays outside it, in the server and CLI.
- **World state is plain JSON-serialisable data.** Snapshots, forks, rewinds, fixtures and run logs are just copies of it.
- **Determinism rules:**
  - All money is stored as integer coins. All goods are integer units. This makes the conservation checks exact, with no float drift.
  - Miners and sites are always processed in sorted-id order. Nothing depends on object or Map iteration order.
  - **Randomness is keyed, not sequential.** Every random draw comes from a generator seeded by `(world seed, shift, system, entity id)`, e.g. "cave-in roll for miner 42 on shift 310". Removing one cause in a counterfactual therefore can't shift any unrelated draw. This is the single most important decision for Lane 3.
  - LLM brains aren't deterministic, so every run log records each shift's intents. **Replay** feeds recorded intents back in and is bit-exact. **Re-simulation** asks the brains again.
- **Fixed phase order within a shift.** The order is part of causality, so it's written down and tested:
  1. Apply queued Overseer actions (dials, acts of god, god powers).
  2. Validate intents. Invalid intents become rest and an `invalid-intent` event is logged.
  3. Travel. Distance from the miner's last location eats into this shift's productive time.
  4. Production: dig, chop, farm, smelt, build, wage work. Cave-in rolls happen here.
  5. Bank, first half: new loans disbursed (so borrowed cash can be spent this shift).
  6. Market: one call auction per good, in a fixed good order, with the Trading Post taking part.
  7. Wages settle. Unpaid wages become arrears events.
  8. Consumption: auto-eat, spoilage, rent and upkeep.
  9. Bank, second half (on day-end shifts): interest accrues, repayments are due, delinquency is counted, defaults and foreclosures happen.
  10. Needs and health update. Poor relief is paid.
  11. Nature: forest regrowth, farm fertility recovery, hazard modifiers decay.
  12. Metrics, events and invariant checks.

### Goods and production (v1)

- **Five goods:** food, timber, copper ore, copper, gold. The vision's crusher → flotation → smelter chain is merged into one **smelter** step: copper ore + timber (fuel) → copper. The chain can be split out later without changing the market.
- **Mining:** each vein has finite tonnage, plus grade that falls with depth and hardness that rises with depth. All three are hidden and seeded. Yield per dig = skill × energy × time on site × grade ÷ hardness × a crowding factor (more diggers on one vein means less each), plus seeded noise. Gold veins are rare and yield gold directly at low rates. A gold rush plants a rich pocket.
- **Supports and cave-ins:** every N units of depth needs one timber support. If the miner has no timber, the depth stays unsupported. Cave-in chance per dig = base dial × f(unsupported depth) × hardness × active earthquake modifier. A cave-in injures the miner for several shifts. **v1 has no deaths**, so the population stays at ~100.
- **Forest:** each patch has a timber stock that regrows logistically (slow when stripped, fastest at half capacity). Chopping yield falls as the stock falls. Over-chopping is a real tragedy of the commons.
- **Farms:** each plot has fertility that drops with use and recovers when left fallow. Drought scales yield down.
- **Smelter:** a building with an owner and a posted fee. Smelting uses ore and timber and produces copper. The owner can hire operators.
- **Houses:** need timber, copper and several shifts of labour on a house lot. A finished house fully meets the shelter need and can be used as loan collateral. Without one, a miner rents a bunkhouse bed (pays the town) or sleeps rough (poor energy recovery).

### Well-being

- **Needs**, each 0–1: nourishment, energy, shelter, health, financial security. Financial security is net worth measured in days of living costs, minus debt pressure.
- **Well-being** = weighted sum of concave (diminishing-returns) transforms of each need, plus a steep penalty when nourishment or health is near zero, plus an optional social term from Lane 2.
- **What this does to the economy:**
  - Concavity means an extra coin is worth less to a rich miner than to a poor one. Rich miners rest more and work less, so inequality is capped without hard-coding it, and labour supply depends on wages the way it does in real economies.
  - The hunger penalty means food demand barely changes with price. Food prices therefore spike hard in a shortage, which is exactly the drama we want and is realistic.
  - No single action is best for everyone at once. When everyone mines, ore prices fall and food prices rise, so some miners switch to farming. That keeps the economy from going flat.

### Market

- **One uniform-price call auction per good per shift.** Bids and asks are sorted and the price that clears the most volume is chosen. Ties go to the price nearest the last clearing price. Everyone who trades gets the same price. Equal-price orders are filled in a seeded deterministic order.
- **Orders are escrowed** when submitted. A buy order must be backed by cash and a sell order by goods. Orders that aren't backed are trimmed, never rejected outright.
- **If nothing trades, the last price carries over.** The published price per good has a last price, a volume and a best bid and ask.
- **The Trading Post (outside world)** takes part as standing orders:
  - For copper and gold, a stepped **downward-sloping demand curve** around a world price. The world price drifts on a slow, seeded, mean-reverting random walk, and the Overseer can shock it.
  - For food and timber, **supply at the import price**: world price × markup. This acts as a soft price ceiling. Famine is expensive but survivable for anyone with money.
  - The Trading Post is the **only place money and goods enter or leave the valley** apart from god actions. That's what makes conservation checkable.

### Money, bank and town

- **Money sources:** starting cash, Trading Post purchases (exports), Overseer boons.
- **Money sinks:** Trading Post sales (imports), and payments to the town (bunkhouse rent, house-lot purchase, a small levy dial).
- **The town treasury** collects rent and the levy and pays poor relief. That recycles money to the poorest instead of draining it away.
- **The bank lends only from finite reserves.** It doesn't create money and takes no deposits in v1. Loans have principal, a daily interest rate (dial), a term and an optional house as collateral. The loan limit depends on recent income and net worth.
  - When reserves run low, the bank automatically raises rates and tightens limits. Credit freezes therefore emerge naturally, which the narrator can explain.
  - After K missed payments the loan **defaults**. Collateral is seized and sold at the next auction, the remainder is written off, and the borrower is barred from credit for a while.
- **Jobs:** any owner of a smelter, farm plot or building site can post a job: site, task, wage per shift and number of openings. Workers accept intent by intent. The output goes to the employer. The wage is paid after the market (so an employer can sell first). If the employer can't pay, an arrears event is logged and the worker can quit. Lane 2 builds strikes on top of this.
- **Invariants checked every shift:**
  - All miner cash + bank reserves + treasury = starting money + exports − imports + boons − sinks.
  - Each good's stock change = produced − consumed − spoiled − exported + imported ± god actions.
  - No negative cash or inventory.
  - A violation fails loudly in development and in tests.

### Hazards, acts of god and god powers

- **Acts of god:**
  - **Earthquake:** cave-in modifier for K shifts in a region, plus some supports destroyed.
  - **Gold rush:** a rich pocket in a chosen vein and a public rumour event.
  - **Forest fire:** a fraction of the forest stock in a region destroyed.
  - **Drought:** farm yield modifier for K shifts.
  - **World price shock:** a jump in the Trading Post's world price.
- **God powers on a named miner:**
  - **Lightning:** injury, plus a fraction of their carried goods destroyed.
  - **Boon:** cash grant, logged as a money source.
  - **Throw in the river:** carried goods lost, and the miner misses the next shift.
- **Every act and power emits an event** with a list of **witnesses**: miners within sight radius on the map. Lane 2 uses this for trust and fear.
- **Dials:** about 50 typed parameters with group, range, unit, default and description, published through the shared contract. Changing one is itself an event, so the narrator can cite it.

### Server and CLI

- **Server:**
  - Holds one live world and ticks it on a timer (pause / 1× / 4× / max).
  - Gathers intents from brains with a time budget. Late brains fall back, as Lane 2 handles.
  - Sends a full snapshot on connect, then a per-shift update: miner positions, destinations and activities, prices, events, metrics.
  - Accepts commands: set dial, act of god, god power, pause, speed, revert to shift.
  - Revert restores the nearest snapshot (taken every N shifts) and replays the recorded intents forward.
  - Exposes fork-and-run for the Oracle.
- **CLI:**
  - `run` (seed, shifts, brain mix, output file)
  - `replay` (recorded intents → bit-exact rerun)
  - `diff` (two runs → first divergent shift and metric deltas)
  - `balance` (many seeds × many shifts → health report)
  - `fixture` (write a small recorded run into fixtures for Lanes 3 and 4)

### Balance targets (what "healthy" means)

These are checked by the `balance` command, using baseline brains, over 2,000 shifts and 20 seeds:

- **Hunger:** fewer than 10% of miners below the hunger threshold on average. No shift above 50% unless an act of god caused it.
- **Markets alive:** every good trades on at least 80% of days. No price pinned at its floor or ceiling for more than 20 days in a row.
- **Not flat:** no single activity takes more than 60% of miners for more than 10 days. Each good's price has non-trivial variance.
- **Inequality:** wealth Gini stays between 0.25 and 0.7.
- **Credit:** the default rate is non-zero but under 20% of loans.
- **Recovery:** after any act of god, mean well-being returns within 20% of its prior level within 30 days.

Exact numbers are starting points to tune, not fixed constants.

### Build order (milestones)

1. **Contract and foundation:** shared types (map, state, intent, observation, event, metrics, dials, messages), keyed RNG, map loader and validator with a placeholder map, empty step function, CLI `run`.
2. **Survival economy:** needs and well-being, farming, chopping, eating, spoilage, resting, baseline brain. Goal: 100 miners can feed themselves indefinitely.
3. **Market and Trading Post:** call auctions, escrow, world prices, money and goods invariants.
4. **Mining and smelting:** veins, depth, supports, cave-ins, smelter with fee.
5. **Bank, jobs and houses:** loans, defaults, collateral, job postings, wages, arrears, house building, bunkhouse, treasury and poor relief.
6. **Chaos:** acts of god, god powers, witnesses, full dial set.
7. **Live:** server with ticking, commands, snapshots, revert and fork. Fixtures for Lanes 3 and 4.
8. **Balance:** `balance` and `diff` commands, then tuning until the targets pass.

## Testing Decisions

- **Test behaviour through public interfaces, not internals.** Feed in states and orders, then check outputs and events. Don't assert on private helper calls. Tests should survive a refactor of how a module works inside.
- **Test runner:** Vitest, matching the TypeScript + pnpm stack. There's no existing test prior art in the repo yet, so these tests set the pattern for the other lanes.
- **Modules with focused unit tests:**
  - **Keyed RNG:** same key gives the same value. Different keys give independent streams. Adding a draw under one key doesn't change another.
  - **Market clearing:** hand-written order books with known answers (crossing, no crossing, ties, partial fills, unbacked orders trimmed, Trading Post curve). Clearing is a pure function, so this is the easiest high-value test target.
  - **Bank:** loan lifecycle (disburse → accrue → repay), delinquency → default → foreclosure, and tightening as reserves fall.
  - **Production:** yield goes down with depth, hardness and crowding. Forest regrowth is logistic. Supports reduce cave-in probability.
  - **Well-being:** concavity (an extra coin is worth less when richer), and the hunger penalty dominates when nourishment is near zero.
  - **Map loader:** good maps load. Each kind of malformed map gives a specific error.
- **Whole-sim tests:**
  - **Golden determinism:** the same seed and brains give the same state hash after 500 shifts, across runs.
  - **Replay:** running from recorded intents reproduces the original run exactly.
  - **Counterfactual isolation:** two forks that differ only by one god action have identical RNG draws for every unrelated entity.
  - **Invariants as property tests:** across many random seeds and random Overseer actions, money and goods conservation and non-negativity hold every shift.
  - **Balance smoke test:** a short version of the `balance` targets (fewer seeds and shifts) runs in CI. The full suite runs on demand from the CLI.
- **Not unit-tested:** the WebSocket transport details and the timer. They're covered by a single end-to-end test that connects, receives a snapshot and one update, sends a dial command and sees the dial-change event.

## Out of Scope

- **Procedural map generation.** Lane 4 authors the one map.
- **Miner decision-making beyond the baseline brain:** fuzzy and LLM brains, personalities, friendships, trust, fear spread, guilds and the union. These belong to Lane 2. The sim only provides hooks: witnesses, the social well-being term, wage arrears events.
- **The narrator, evidence engine and Oracle explanations.** These belong to Lane 3. The sim only provides events, metrics, cause references and fork-and-run.
- **The 3D view, console UI and charts.** These belong to Lane 4.
- **Death, births and immigration.** The population is fixed in v1.
- **Separate crusher and flotation stages.** They're merged into the smelter.
- **Bank deposits, money creation by the bank, and bank failure.**
- **House renting and a property market** (other than foreclosure sales). **Exclusive mine claims.** Veins are commons in v1.
- **Databases.** Runs are JSON files, as TECH.md says.

## Further Notes

- **The lane doc needs one change:** "A map generator" should become "A map loader for Lane 4's map". It's worth agreeing the map schema with Lane 4 in the first hour, because it's the one hard dependency between the lanes.
- **The keyed-RNG decision matters most for Lane 3.** Without it, every counterfactual replay would mix the effect of the removed cause with reshuffled randomness, and the narrator's accuracy scores would be meaningless.
- **The Trading Post is the main balancing lever.** If the economy deflates (money draining out), raise world metal prices or lower the import markup. If it inflates, do the reverse. Most crash and flatness problems should be fixable with Trading Post and well-being weights before touching anything else.
- **Each money and goods flow is one AWARE-NG analogue:** a measurable stream with a conservation law, like mass balance around a grinding circuit. A balance violation in the sim is the equivalent of an unexplained loss in the plant.

## Changes Made While Building

Balance testing (`pnpm sim balance`) showed the first design crashing or going flat in specific ways. Each fix is a rule of the world, not a hack in one brain:

- **Comfort is a sixth need.** Without anything to spend on, money piled up and two-thirds of the town retired rich. Miners can now buy comforts from the Trading Post. Comfort wears off each shift, so this is the town's main money sink, and it scales with how well off the town is.
- **The soup kitchen gives food, not cash.** Cash relief let poor brains starve into a death spiral. The treasury now imports rations straight to hungry, broke miners (the `reliefRations` dial).
- **The Trading Post buys raw copper ore** at a fifth of the copper price. Diggers always have a buyer, and smelting is still where the value gets added.
- **Town regulation dials:** a smelter fee cap (`maxSmelterFee`) stops the smelter owner from becoming a monopolist, and a small wealth tax (`wealthTax` above `wealthTaxExemption`) flows back to everyone through the daily dividend.
- **Slower depletion.** Shafts deepen every 150 ore (`orePerLevel`) and veins are bigger, so mining stays worthwhile for most of a long session instead of dying around shift 400.
- **Supports cost 2 timber per level** (`supportTimber`), which ties digging to the timber market.
- **The bank won't lend to miners with no income** unless they have a house to pledge.
- **The baseline brain chooses by softmax, not by always taking the best option.** When everyone takes "the best" option they all crowd the same farm (the El Farol problem). Lane 2's brains will hit the same issue.
- **Auctions settle at the midpoint** of an equally good price range, so prices don't stick to last shift's.
- The balance report's "frozen price" check became a "dead market" check: a price pegged to the Trading Post while trading is healthy. Gold checks are soft because gold is rare by design. The Gini band starts at 0.08: diminishing returns make rich miners rest and spend, so a healthy town settles around 0.1. The 0.70 ceiling still catches runaway inequality.
