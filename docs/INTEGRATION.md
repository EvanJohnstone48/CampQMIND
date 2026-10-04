# How the lanes connect

The `dev` branch joins all four lanes. One shift, end to end:

```
Lane 2 brains ──intents──▶ Lane 1 sim (step) ──ShiftRecord──▶ Lane 3 narrator ──cards──┐
     ▲                         │                                                        │
     └──── observations ───────┘                                                        ▼
                         apps/server ──WebSocket (ShiftUpdate + cards)──▶ Lane 4 web: 3D valley + console dock
                              ▲                                                         │
                              └──────── Overseer commands (dials, acts of god, powers, rewind, what-if) ◀┘
```

| Connection | Where it lives |
|---|---|
| The map | `packages/shared/src/maps/alpineValley.ts`: the sim runs on Lane 4's valley. Every site sits inside the footprint Lane 4 draws, and house lots are the 24 chalets. A web test (`apps/web/src/net/valley.test.ts`) keeps the two in sync. |
| Brains → world | `apps/server/src/brains.ts`: Lane 2's `createAgents` (fuzzy, plus Gemini when `GEMINI_API_KEY` is set). |
| World → narrator | `packages/narrator/src/motherlode.ts`: the Lane 1 adapter (`toRoundSnapshot`), the config of what the sim's rules guarantee (`MOTHERLODE_CONFIG`), and `LiveNarrator`. |
| Server → browser | `packages/shared/src/protocol.ts`: `hello`, then a `shift` per shift carrying narrator `cards`. |
| Browser → 3D view | `apps/web/src/net/live.ts`: maps each shift onto Lane 4's `WorldView`. Miners walk Lane 4's streets to their sites and home to their chalet. With no server it falls back to the local demo. |
| Panels | `apps/web/src/features/console/Dock.tsx`: Narrator (Lane 3's panel), Miners (Lane 2's Agents tab), Economy, Overseer. |

## What you see

- **Opening:** a clear sky with one play button. The world server starts paused (`START_PAUSED`, default on), and pressing play starts it and dives the camera down through the clouds into the valley.
- **Top left:** a small pill with the number of residents (50 by default, `POPULATION`) and houses.
- **Left:** the narrator. By default it only shows changes it can explain (`LIVE_SETTINGS.unclearMinPriority`).
- **Right:** the Miners, Economy and Overseer tabs. The ⤢ button opens a full-page dashboard with big charts and a town network graph of who is working where.
- **Bottom left:** an Explore pill listing the six places and every home.
- **Bottom right:** the time box, which opens on click.
- Miners walk their routes smoothly, frame by frame (`MinerView.motion`).

## Run it

```
pnpm install
pnpm dev              # server on :8787 and the web app; open the URL Vite prints
```

- Add `?demo` to the URL for Lane 4's self-contained demo, or `?server=ws://host:port` for another server.
- `pnpm test` runs every unit and integration test.
- `pnpm test:live` builds the web app and drives the whole loop in a real browser (Edge by default).

## What the merge changed in each lane

- **Lane 1 (sim):**
  - The default map is now the Alpine valley.
  - A gold strike stays public news until its pocket is dug out (`SiteView.richStrike`), with a bigger pocket. Before, the rush barely happened.
  - `MinerPublic` carries `homeSiteId` and `look`.
  - Shift updates carry narrator cards.
  - A bigger mine face holds proportionally more ore and deepens proportionally slower (`VeinState.faceScale` = capacity / 6). Without this, the Alpine valley's three big copper faces wore out a third faster than the placeholder's four, and the town slid into poverty.
  - Treasury defaults are sturdier (reserve 10,000; wealth tax 0.4% a day above 3,000).
  - The soup kitchen buys from the valley's own farmers at market first (a treasury buy order in the food auction) and imports only the shortfall, so relief no longer sends money out of the valley. In lean times the town borrows from the bank to keep it open (`treasuryDebt`) and repays before paying any dividend.
  - Shafts deepen every 250 ore (`orePerLevel`, was 150), so the mines stay worthwhile for longer.
- **Lane 2 (agents):**
  - Brains treat a public rich strike as a rumour.
  - Most shifts a fuzzy miner carries on with its current kind of work, and only some reconsider. This partial adjustment damps cobweb swings between farming and mining.
  - "Hungry with no food → farm" no longer fires when the farms are hopelessly crowded.
- **Lane 3 (narrator):**
  - New: the adapter (`motherlode.ts`).
  - Optional `minChange` per metric: one miner going hungry isn't news.
  - Optional `unclearMinPriority` setting: "cause unclear" cards only for big changes, to avoid alarm fatigue.
  - The live narrator smooths the noisiest per-shift flows over 4 shifts.
  - The detector treats a sudden one-shift step (4+ wobbles) as a change even on a slow drift. Before, a boon on a gently rising money supply went unreported. Accuracy moved by about a point on two scenarios (see its README).
  - Defaults are unchanged, so `pnpm narrator:accuracy` reports the same numbers.
  - Its tsconfig now extends the workspace's, and its own lockfile is gone.
- **Lane 4 (web):**
  - `main.tsx` connects live by default, and `App` takes a `live` prop that adds the dock.
  - `Trade` gains `Builder` and `Villager`.
  - `playwright.config.ts` takes `WEB_PORT`, and the live test takes `LIVE_WEB_PORT` (Vite's default ports are often taken by other projects).
  - Browser tests load `/?demo`, and the npm lockfile is gone (pnpm workspace).

## Known limits

- **Very long runs.** Past roughly 1,500 shifts (over an hour of live play) some seeds see money slowly drain from the valley once the mines run deep. Hunger and well-being stay healthy, but `pnpm sim balance` flags the shrinking money supply. This is the boom-fades arc of a mining town. The Overseer can counter it with the Trading Post dials (world prices, import markup).

- **Software rendering in headless tests.** Headless browsers render WebGL in software here, which is slow. Lane 4's four browser checks time out on this machine both before and after the merge. The live end-to-end test has generous timeouts and passes.
- **LLM paths are tested against fakes only.** The LLM miners and the narrator's rewording run only with a `GEMINI_API_KEY`, and have been tested against fake models. Try them with a real key.
- **The Oracle's forks approximate LLM miners with the fuzzy brain**, so forks stay repeatable. The narrator doesn't yet use forks to say "almost certainly".
- **The 3D day/night clock is cosmetic.** It runs on its own (a four-minute day); the header's day count is the sim's.
