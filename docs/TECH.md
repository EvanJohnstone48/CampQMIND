# Tech We Use (and Why)

The research problem picks the tools, not the other way around. Before adding anything new, we ask: does it fix a real problem we have right now, and does it make the AWARE-NG idea easier to test? If not, it waits.

## The core idea the tech has to serve

The sim produces a flood of numbers, events, rule firings and miner decisions. The narrator has to work out **what happened, why it probably happened, what evidence backs that up, and what it still doesn't know**, and then say it clearly. Because the world is seeded and repeatable, we can re-run it with one cause removed and check whether the explanation was right.

The AI model never works out the truth from raw data. Plain code finds the evidence, and the model only turns that evidence into words.

```
raw sim state and events
  → signals and event detection       (plain code)
  → structured evidence               (plain code)
  → causes and counterfactual replays (plain code + re-running the sim)
  → evidence package                  (one object per explanation)
  → wording                           (Gemini)
  → explanation card + chart + timeline + sources
```

Every explanation keeps these kinds of statements separate:

| Kind | Example |
|---|---|
| **Observed** | "Copper price fell 40% over 3 shifts." |
| **Known rule** | "Miners with low savings and high fear stop borrowing." |
| **Inferred** | "The fall is most likely driven by the gold rush." |
| **Counterfactual** | "With the gold rush removed, the price fell only 8%." |
| **Uncertain** | "Not enough data to tell whether the union strike also contributed." |
| **Suggested** | "You could lower the dig quota at vein 4." |

A suggestion is never presented as something that was observed.

## What we're using now

| Tool | What it's for |
|---|---|
| **TypeScript + Node.js** | The whole project: sim, miners, narrator, server. One language keeps the four lanes in sync. |
| **pnpm workspaces** | One repo, several packages (`sim`, `agents`, `narrator`…) that import each other. |
| **Seeded random numbers** | Same seed, same world. This is what makes replays and counterfactuals possible. |
| **Fuzzy logic** (`packages/fuzzy`) | How miners decide and how the narrator turns numbers into words like *high* or *rising*. It's the same style of reasoning AWARE uses. |
| **The evidence engine** (`packages/narrator`) | The most important piece. Plain, testable code that finds events, trends, rule firings, ordering in time, competing causes and confidence. |
| **Google Gemini** (free tier) | LLM miners (Lane 2) and the narrator's final wording (Lane 3). Its job is wording, not finding causes. |
| **React + react-three-fiber** | The website and the 3D valley. |
| **WebSockets** | Live updates from the server to the browser. |
| **JSON files** (`runs/`, `fixtures/`) | Saved runs and recordings. This is enough storage for now. |

## What we're holding off on

These came up as options. They're good tools, but we'll add each one only when we hit the problem it solves.

| Tool | When it would earn its place | For now |
|---|---|---|
| **Python + FastAPI** | If we split the evidence engine into its own service, mainly to match AWARE's Python tooling for the real project. | Everything stays in TypeScript. Keep the evidence package a plain JSON shape so it could move to Python later. |
| **PostgreSQL** | When we want to search across many saved runs (e.g. "every time the narrator was wrong"). | JSON files in `runs/`. |
| **TimescaleDB** | Only if the time-series history gets too big for memory and files. | Not needed. The sim must never need a database just to run. |
| **pgvector** | If we have real documents to search, such as manuals, operator notes or miner memories. | Not needed. We don't put structured sim data into vectors. |
| **LangGraph** | If the narrator needs a real back-and-forth investigation (asking follow-up questions, choosing what to check next). | The pipeline is a fixed sequence of steps, so plain functions are simpler. |

The diagram we're aiming for later is roughly: TypeScript sim → Python evidence service (with Postgres if needed) → Gemini → the same web UI. We'll get there one step at a time, and only where it helps.
