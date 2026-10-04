# Lane 2 status

**Done**
- `packages/fuzzy`: membership functions, rules, inference with readable firings
- `packages/agents`: population (personalities, skills, looks, bios), shared option menu and trade planner, fuzzy brain (~70 rules incl. habits), Gemini LLM brain (plans, budget, timeout, fuzzy fallback, memory, cost estimate), `createAgents` town
- Server runs Lane 2's town by default (`BRAINS=agents`); CLI `--brains fuzzy`
- `apps/web/src/features/agents/AgentsTab.tsx`: self-contained component for Lane 4 to place

**Cut**
- Trust/fear of the god, friendships, guilds, the union, the Society tab

**Waiting on**
- A real `GEMINI_API_KEY` to try LLM miners live (all LLM code is tested against a fake model)
- Lane 4's app shell to mount the Agents tab
