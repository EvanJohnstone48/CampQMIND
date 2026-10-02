# Lane 2 · Minds & Society

You build the miners' brains and their social life. Most miners think with simple fuzzy-logic rules ("if hunger is high, farm"), and some are driven by an AI model (Gemini). Every decision should leave a trace of *why* it was made, because that's what the narrator explains. On top of that, miners make friends and rivals, trust or fear the god, spread those feelings to each other, and band together into guilds and a union.

**Your folders:** `packages/fuzzy`, `packages/agents`, and `apps/web/src/features/society` + `features/agents`

**Things you'll make:**
- A tiny fuzzy-logic library (terms like "low/high", rules, and which rules fired)
- A fuzzy brain with a growing set of rules
- A population generator: names, personalities, skills
- An LLM brain using Gemini, with a time limit and a fuzzy fallback, plus a cost estimate
- Friendships, trust and fear that spread between friends
- Guilds (that name themselves) and a miners' union with strikes
- A Society tab (network graph) and an Agents tab (who's who and what they're thinking)
