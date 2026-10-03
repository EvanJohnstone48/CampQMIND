# Scaffolding: what each folder is for

This repo is empty on purpose. The folders are here so everyone knows where their code goes, and you (with your AI assistant) write everything inside them.

First read [docs/00-vision.md](docs/00-vision.md) for the idea, then well each pick a lane in [docs/lanes/](docs/lanes/).

## The big picture

Motherlode has three parts, like a restaurant:

- **`packages/`** is the kitchen: the logic of the world.
- **`apps/server/`** is the waiter: it runs the clock and carries updates between the world and the browser.
- **`apps/web/`** is the dining room: the website you look at and click on ;)

## The folders

| Folder | What goes in it | Who |
|---|---|---|
| `docs/` | The idea (`00-vision.md`) and one short page per lane (`lanes/`) | everyone |
| `packages/shared/` | The "contract": the shapes of data every lane agrees on (a miner, a vein, a message…) | everyone |
| `packages/fuzzy/` | A small fuzzy-logic library ("hunger is 0.8 high") | Lane 2 |
| `packages/agents/` | The miners' brains, personalities and social life | Lane 2 |
| `packages/agents/src/llm/` | Talking to the AI model (Gemini) | Lane 2 |
| `packages/sim/` | The world engine: map, rounds, mining, market, bank | Lane 1 |
| `packages/narrator/` | Watches the data and explains it in plain words | Lane 3 |
| `apps/server/` | Runs the world live and talks to the browser | Lane 1 |
| `apps/cli/` | Runs the world from the terminal, no browser needed | Lane 1 |
| `apps/web/src/net/` | The live connection to the server | Lane 4 |
| `apps/web/src/ui/` | Small shared bits of UI (buttons, boxes) | Lane 4 |
| `apps/web/src/features/world/` | The 3D valley and the beans | Lane 4 |
| `apps/web/src/features/console/` | Dials, god powers, the top bar, the timeline | Lane 4 |
| `apps/web/src/features/economy/` | Charts | Lane 4 |
| `apps/web/src/features/society/` | The friendship and guild network | Lane 2 |
| `apps/web/src/features/agents/` | The list of miners | Lane 2 |
| `apps/web/src/features/narrator/` | The explanation cards and the accuracy audit | Lane 3 |
| `fixtures/` | Recordings of a run,to test the website without the real server | Lane 1 |
| `runs/` | Logs from real runs (not saved to git) | — |
| `status/` | Each lane's quick "done / doing / blocked" notes | everyone |

The empty `.gitkeep` files only exist so git keeps the empty folders. Delete one once you've added real files to its folder.

Each `src/` folder is where that part's code goes. Every package and app will also need its own `package.json` when you set it up.

## A few rules

1. **Stay in your lane's folders.** If you need something from another lane, ask them.
2. **`packages/shared` belongs to everyone.** Talk to the team before changing it.
3. **The world must be repeatable.** The same seed should give the same world. Don't use `Math.random()` in `sim` or `agents`; use a seeded random generator instead.
4. **Secrets only go in `.env`.** Never paste an API key into code, chat or GitHub.

## The AI model

We use **Google Gemini**, which has a free tier. Get a key at <https://aistudio.google.com/apikey>, copy `.env.example` to `.env`, and put the key after `GEMINI_API_KEY=`. The free tier has daily request limits, so keep the number of AI-driven miners small while testing.
