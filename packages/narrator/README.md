# @motherlode/narrator

Watches the world's numbers each shift and explains notable changes in plain words: what changed, what probably caused it, and how sure it is. Plain code finds the evidence. A language model (optional) only rewords it, and every rewording is checked. Full plan: [issues/prd-lane-3-narrator.md](../../issues/prd-lane-3-narrator.md).

```
pnpm install
pnpm test          # unit tests + scripted ground-truth scenarios
pnpm demo          # print the cards each scenario produces (add a name, and --llm for Gemini)
pnpm accuracy      # how often the narrator is right, across 200 seeds per scenario
```

## Three levels of detail

Every card carries all three levels. The panel's 1 · 2 · 3 switch sets how much every card shows, and "More detail" on a card goes one level deeper for that card alone.

| Level | For | Shows |
|---|---|---|
| **1 · Glance** | knowing what's going on in a second | one line: how much it changed, and the root cause with its confidence word. *"Down 18% since shift 22. Likely traced back to your gold rush (shift 20)."* |
| **2 · Why** | understanding the explanation | what was measured, the direct cause, the **chain** back to the root cause (each step with its own confidence word), what's uncertain, and any configured suggestion |
| **3 · Deep** | checking the reasoning | adds how big the change is next to normal noise, every suspect considered with its timing and whether it has a known link, which confidence rule applied, and the evidence list |

Chains only appear when the config declares a `knownLinks` entry between two metrics (e.g. more miners mining → lower gold price). The card's confidence badge is the weakest link in the chain.

## How numbers become words

**Is the change real?** Each metric is compared with its usual level over the 16 shifts before the change began. The gap is measured in "wobbles" (its normal ups and downs, a z-score):

| Wobbles out | Card says |
|---|---|
| under ~2.75, or only one shift | nothing (could be noise) |
| ~2.75 to 4 | "outside its normal ups and downs" |
| 4 or more | "far outside its normal ups and downs" |

**What caused it?** Only events in the 3 shifts before the change began are suspects. Whether a suspect is "known to affect" a metric comes from config the other lanes supply, never from guessing.

| Evidence | Word | Card also says |
|---|---|---|
| One suspect, known to affect this metric | **likely** | "Not certain: … we haven't re-run the world without it." |
| Several suspects known to affect it | **possibly** | names them all; "we can't tell which one caused it" |
| One suspect, not known to affect it | **possibly** | "the timing may be a coincidence" |
| Several suspects, none known to affect it | **unclear** | lists them |
| Nothing recorded just before | **unclear** | "nothing recorded happened in the 3 shifts before" |

"Almost certainly" is reserved for a counterfactual re-run of the world without the cause (a stretch goal that needs Lane 1). Start dates are only known to within about a shift, so a rival known cause just outside the window also blocks "likely". When in doubt, the narrator says less.

**Current accuracy** on the scripted scenarios (`pnpm accuracy`):

| Scenario | Right | Missed | Overclaimed | False alarms |
|---|---|---|---|---|
| gold-rush | 99.0% | 0% | 0% | 0.5% |
| two-suspects | 98.5% | 0% | 0% | 1.5% |
| coincidence | 96.5% | 0% | 0% | 1.0% |
| unexplained | 98.0% | 0% | 0% | 1.0% |
| chain | 94.0% | 0% | 0% | 1.0% |
| quiet | 99.0% | 0% | 0% | 1.0% |

"Wrong" cases are a start date more than one shift off, or a cause stated less confidently than it could be. These thresholds are tuned on synthetic noise. Re-check them with `pnpm accuracy` once real sim data exists.

## Plugging in the other lanes

**Lane 1 (server).** Map each round onto `RoundSnapshot` (`{ round, metrics, events }`), then once per shift:

```ts
const narrator = createNarrator(config, { llm: createGeminiClient(process.env.GEMINI_API_KEY!) });
const cards = await narrator.step(history); // never throws; broadcast the cards
```

`config` is where the other lanes say what is true about their world:
- `metrics`: which numbers to watch, with a plain label ("the gold price") and format
- `eventLabels`: plain names for event kinds
- `knownEffects`: which events the sim's rules guarantee move which metric (Lane 1). Without these, the narrator never says "likely".
- `knownLinks`: which metrics the sim's rules guarantee move other metrics (Lane 1/2). These are what let cards show chains of causes.
- `levers`: dials worth suggesting for a change (Lane 1/4). Without these, cards make no suggestions.
- `rules` (Lane 2): plain labels for decision rules and which metrics they move. Pass rule counts in `RoundSnapshot.ruleFirings`.

**Lane 4 (web).** Render `apps/web/src/features/narrator/NarratorPanel.tsx` in the right-hand slot with `cards={allCardsSoFar}` (optional `defaultLevel`, 1 by default).

## Not built yet

- The Lane 1 adapter (waiting on their round format)
- Counterfactual re-runs ("almost certainly")
- Repo-root workspace setup. This package installs on its own for now. Once a root `pnpm-workspace.yaml` exists, delete this folder's `pnpm-lock.yaml`.
