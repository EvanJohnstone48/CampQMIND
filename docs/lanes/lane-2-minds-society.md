# Lane 2 · Minds

You build the miners' brains. Most miners think with simple fuzzy-logic rules ("if energy is low, rest"), and some are driven by an AI model (Gemini). Every miner is trying to raise one well-being score (food, energy, shelter, health, savings, comfort), and every decision leaves a trace of *why* it was made, because that's what the narrator explains. (The social layer, meaning trust in the god, friendships, guilds and the union, has been cut.)

**Your folders:** `packages/fuzzy`, `packages/agents`, and `apps/web/src/features/agents`

**Things you'll make:**
- A tiny fuzzy-logic library (terms like "low/high", rules, and which rules fired)
- A fuzzy brain with a growing set of rules, including habits so the town doesn't stampede between jobs
- A population generator: names, personalities (diligence, boldness, thrift), skills and a look for the beans
- An LLM brain using Gemini, with a time limit, a request budget, a fuzzy fallback and a cost estimate
- An Agents tab (who's who and what they're thinking), with a fuzzy-vs-LLM head-to-head

## How it fits together

- **The menu** (`options.ts`): every option a miner has this shift, with an honest income estimate. Both brains pick from it, so they play the same game.
- **Fuzzy brain** (`fuzzyBrain.ts`): measure → fuzzify → fire `RULES` → choose. To grow it, add rules to `RULES` (they're plain data). Its trace lists the inputs, what it wanted and which rules fired.
- **LLM brain** (`llm/`): picks one option from the menu with a reason in its own words, then follows that plan for a few shifts. It re-plans sooner after big events. Calls share a per-minute budget, and anything late or malformed falls back to fuzzy. The code (not the model) keeps it solvent.
- **The town** (`agents.ts`): `createAgents({ seed, llm })` gives the population and a `decideAll()` the server calls each shift. Without a `GEMINI_API_KEY`, everyone is fuzzy.

## Commands

```
pnpm sim balance --brains fuzzy     # can a town of fuzzy miners keep the economy healthy?
pnpm dev:server                     # BRAINS=agents (default); add GEMINI_API_KEY to .env for LLM miners
curl localhost:8787/brains          # fuzzy vs LLM head-to-head, plus LLM calls and cost so far
pnpm test
```
