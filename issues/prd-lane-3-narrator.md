# PRD · Lane 3 · Narrator

*Camp QMIND build weekend, October 2026. Proof of concept, built in parallel with Lanes 1, 2 and 4.*

## Problem Statement

The Motherlode valley produces far more data than a person can follow: prices, trades, loans, digs, hunger, rule firings and acts of god, for about a hundred miners every shift. As the Overseer, I can see charts and beans moving, but I can't tell **what is actually happening, why it is probably happening, how sure anyone can be, or what I could do about it**. When copper crashes or miners stop going to the mines, I have to guess.

That is the same problem Woodgrove's operators have with AWARE: the control system acts, but nobody explains it, and any explanation that does exist could be made up. For this weekend, the problem is to show that a narrator can turn the sim's data into short explanations that are **grounded in evidence, honest about uncertainty, never invent numbers, and can be checked against ground truth**.

## Solution

A narrator panel on the right side of the screen. Each shift it may show a small number of **explanation cards**, only when something is worth saying. Each card:

- names a development in plain words ("Miners are leaving the copper mines")
- keeps its statements in separate labelled kinds: **Observed**, **Known rule**, **Inferred**, **Uncertain**, **Suggested**
- states its confidence with a word from a fixed scale (e.g. *almost certainly / likely / possibly / unclear*), never a made-up percentage
- shows only numbers that come straight from the data
- has an expandable **evidence** section listing the signals, events and rules the card relies on

Behind the panel, plain code finds the truth (signals, fuzzy words, detection, cause ranking, filtering) and builds one **evidence package** per card. A template always turns that package into text. Gemini can rephrase it on top, and a verifier rejects anything Gemini adds that isn't in the evidence. If Gemini fails, the template card is shown.

The narrator is built and tested against **scripted fake scenarios with planted causes**, so we can show it gets the cause right before the real sim is ready. It is then plugged into Lane 1's live server through a small adapter.

## User Stories

### Overseer (the person playing)

1. As the Overseer, I want a narrator panel that shows explanation cards as the world runs, so that I understand the valley without reading every chart.
2. As the Overseer, I want each card to start with a one-line headline in plain language, so that I can skim what's happening at a glance.
3. As the Overseer, I want cards to appear only when something notable changes, so that I'm not buried in alerts.
4. As the Overseer, I want the same development not to be repeated every shift, so that new information stands out.
5. As the Overseer, I want the most urgent and most confident cards shown first, so that I look at what matters most.
6. As the Overseer, I want to see what was actually observed, kept apart from what the narrator infers, so that I know which parts are facts.
7. As the Overseer, I want the narrator to name the most likely cause of a change and the event behind it, so that I understand why it happened.
8. As the Overseer, I want competing possible causes listed when there is more than one, so that I'm not misled into thinking there was a single cause.
9. As the Overseer, I want the narrator to say plainly what it doesn't know, so that I don't over-trust it.
10. As the Overseer, I want confidence shown as a consistent word from a fixed scale, so that "likely" always means the same thing.
11. As the Overseer, I want any suggested lever (e.g. "you could lower the dig quota at vein 4") clearly marked as a suggestion, so that I never confuse advice with observation.
12. As the Overseer, I want every number on a card to be a real value from the sim, so that I can trust the figures.
13. As the Overseer, I want to expand a card and see the evidence behind it (signals, events, rule firings, rounds), so that I can check the claim myself.
14. As the Overseer, I want cards to mention the shift/round they refer to, so that I can line them up with the timeline and charts.
15. As the Overseer, I want the narrator to notice when my own god actions (lightning, boon, gold rush) come before a change, so that I see the consequences of what I did.
16. As the Overseer, I want the panel to keep working even when the AI model is slow or out of quota, so that the demo never shows a blank panel.
17. As the Overseer, I want a card to read naturally rather than robotically when Gemini is available, so that the narrator feels conversational.
18. As the Overseer, I want quiet periods to show a short "nothing notable" state, so that I know the narrator is still watching.

### Demo audience / Woodgrove

19. As a Woodgrove viewer, I want to see the observed / rule / inferred / uncertain / suggested split on real cards, so that I can see how this maps onto operator explanations for APC.
20. As a Woodgrove viewer, I want proof that the narrator named the right cause in planted scenarios, so that I believe the explanations are faithful rather than plausible-sounding.
21. As a Woodgrove viewer, I want to see that the language model can't invent numbers, so that I trust the grounding approach.

### Lane 3 developer

22. As the Lane 3 developer, I want my own input type and fake-data generator, so that I can build and test without waiting for Lane 1.
23. As the Lane 3 developer, I want scenarios to come with a ground-truth record (which cause, which round, which signal), so that tests can check the narrator's answers automatically.
24. As the Lane 3 developer, I want every pipeline stage to be a plain function with a small interface, so that I can test each one on its own.
25. As the Lane 3 developer, I want the evidence package to be plain JSON, so that it can be logged to runs/ and later moved to a Python service unchanged.
26. As the Lane 3 developer, I want the Gemini call isolated behind one interface with a timeout and fallback, so that tests run offline and the free quota isn't burned.
27. As the Lane 3 developer, I want a verifier that runs on both template and Gemini output, so that the "no invented numbers" guarantee holds whoever wrote the text.
28. As the Lane 3 developer, I want a thin adapter from Lane 1's round output, so that the real integration is a small change late in the weekend.

### Other lanes

29. As the Lane 1 developer, I want the narrator to be a single function the server can call once per round, so that integrating it costs me minutes, not hours.
30. As the Lane 1 developer, I want the narrator never to crash the tick loop, so that a narrator bug doesn't stop the world.
31. As the Lane 4 developer, I want a self-contained narrator panel component that takes cards as input, so that I only have to put it in the right-hand slot.
32. As the Lane 2 developer, I want to know which rule-firing information the narrator can use, so that I can include it in the round output if I have time.

## Implementation Decisions

### Architecture

- The narrator is a **pure TypeScript package** with no I/O except an optional Gemini call. It does not import from the sim or agents packages and does not change `packages/shared`.
- **Lane 1's server** calls the narrator each round and broadcasts the resulting cards over the existing WebSocket. **Lane 3** owns the narrator panel UI component. **Lane 4** places it in the right-hand slot and gives it the cards from the shared store.
- **Code finds the truth, the AI only words it.** No stage before wording uses an LLM.

### Modules

Each module is designed as a deep module: a small, stable interface hiding most of the logic, testable on its own.

1. **Input contract.** Defines `RoundSnapshot`, owned by Lane 3: round number, a `metrics` map of named numbers (e.g. share mining, share starving, wellbeing, copper price, gold price), an `events` list (kind, round, optional detail, e.g. god actions and acts of god), and optional fired-rule counts. Everything downstream reads only this shape.
2. **Scenario generator (fake data).** Seeded and deterministic. Given a scenario name and a seed, it returns a `RoundSnapshot` history **plus a ground-truth record** (planted cause event, round, affected signal, expected direction). Scenarios: one known cause (gold rush → gold price falls), two competing known causes, a coincidence (an event with no known link just before a change), a change with no recorded cause, and noise only (should produce no cards). The generator lives in the narrator package. It is test and demo infrastructure, not a copy of the sim.
3. **Signals and fuzzification.** History in, per-metric signals out: a smoothed value, a trend over a recent window, and fuzzy terms with degrees (low/normal/high, falling/stable/rising). Use `packages/fuzzy` if Lane 2 has it ready, otherwise a few inline triangular membership functions behind the same interface.
4. **Detector.** Signals in, `Development`s out (what changed, on which metric, starting at which round, magnitude, and which fuzzy rule matched). This combines a small fuzzy rule base ("share mining is falling AND is low → miners leaving mines") with simple change detection on the trend.
5. **Attributor.** A development plus the event history in, a ranked list of `CauseCandidate`s out. The score comes from time-ordering (the event falls inside a lookback window before the change starts), proximity and the size of the change. Rule-firing counts support a candidate if they're present. The output includes a confidence word from the fixed scale and an explicit "uncertain" note when candidates are close or there are none. Confidence words are never stronger than *likely* without counterfactual evidence.
6. **Gate.** Candidate developments in, the selected few out. Ranks by relevance, urgency and confidence, caps the number of cards per round, and shows each change once. A topic speaks again only when its story changes (a new change, a reversal, or a different confidence). This is the only stateful piece. Its memory is small and held by the narrator instance.
7. **Evidence package builder.** A development plus its causes in, one `EvidencePackage` out: plain JSON with the headline facts, named numeric **slots** (value, unit, round), statements grouped by kind (observed / known rule / inferred / uncertain / suggested), the confidence word, and references to the signals, events and rules used.
8. **Writer.** An evidence package in, a `Card` out. The **template writer** is always available and deterministic. The **Gemini writer** gets only the evidence package, must write numbers as `{{slot}}` placeholders, and is limited by a timeout (a few seconds). Placeholders are filled from the package after generation. If anything goes wrong (an error, a timeout, quota, or verifier rejection), the template card is used.
9. **Verifier.** A card plus its evidence package in, pass/fail per sentence with reasons out. It rejects any digit not produced by a slot, any slot name not in the package, any confidence word not on the scale, and any suggestion that isn't in the Suggested section. Rejected Gemini sentences make the card fall back to the template.
10. **Narrator facade.** The one interface the server uses: create a narrator, then on each round give it the history and get back a promise of cards. It catches its own errors and returns an empty list, so it never throws into the tick loop.
11. **Lane 1 adapter.** Maps Lane 1's real round output onto `RoundSnapshot`. Written once Lane 1's shape is known. All Lane 1-specific knowledge stays here.
12. **Narrator panel (web).** Takes cards as props and renders a list with a headline, the statement kinds as labelled sections, a confidence badge, the round, and an expandable evidence section. It also has an empty "nothing notable" state. It has no network code of its own.

### Levels of detail

Each card carries three levels, all built from the same evidence package. **Level 1 · Glance** is one line: how much it changed, and the root cause with its confidence word. **Level 2 · Why** has the observed facts, the direct cause, the chain back to the root cause, the uncertainty and any suggestion. **Level 3 · Deep** adds the change's size next to normal noise, every suspect considered, the confidence rule that applied, and the evidence. The panel has a 1/2/3 switch for all cards, and each card has a "More detail" button for that card alone. Chains only link metrics through configured `knownLinks`. The badge shows the weakest link.

### Contracts

- **`Card`**: id, round, topic, headline, statement sections by kind, confidence word, priority, evidence references, and `writtenBy` (template | gemini).
- **Confidence scale**: a fixed, ordered list of words shared by the attributor, writer and verifier, defined in one place.
- **Statement kinds**: Observed, Known rule, Inferred, Uncertain, Suggested. Counterfactual is reserved for the stretch goal.
- **Gemini**: the API key is read from the server environment only and never reaches the browser.

### Stretch

- **Counterfactual line:** if Lane 1 exposes a headless re-run that can skip one event, the attributor re-runs the world without the top candidate and adds a Counterfactual statement ("without the gold rush, the price fell only 8%"). Only then may confidence rise above *likely*.

## Testing Decisions

- **What makes a good test:** test external behaviour through each module's public interface (inputs → outputs), not internal helpers or exact wording. Assert on structure (which development, which cause, which statement kinds, whether verification passed), not on prose.
- **Scenario tests (the main proof):** for each scripted scenario, run the full narrator on the generated history and check that:
  - the planted development is detected within a few rounds of its start
  - the top cause candidate matches the planted cause
  - the noise-only scenario produces no cards
  - every card passes the verifier
- **Unit tests for the deep modules:** detector (known signal shapes → expected developments), attributor (event timing → ranking and confidence word, uncertainty when ambiguous), gate (cap, one card per change), and verifier (catches invented digits, unknown slots, off-scale confidence words, suggestions in the wrong section).
- **Writer:** the template writer passes the verifier for every scenario. The Gemini writer is tested with a fake model client that returns good output, output with invented numbers, and a timeout. The tests check that fallback happens and that no real API is called in tests.
- **Accuracy across seeds:** each scenario runs over many seeds. Tests require at least 90% fully right, **zero overclaiming** (never sounding surer than the truth), and few false alarms. `pnpm accuracy` prints the full table.
- **Determinism:** the same scenario and seed give identical cards.
- **Not tested:** the narrator panel UI (checked by eye in the browser) and the Lane 1 adapter beyond a smoke test with one recorded round.
- **Prior art:** none yet, the repo is empty. Use the test runner the team picks for the TypeScript workspace (Vitest suggested).

## Out of Scope

- **The Oracle** (forking the world to preview a god action before it's applied). Dropped entirely.
- **The social layer:** guilds, unions, and miners' trust or fear of the Overseer. Miners don't know they're being controlled, so the narrator never explains anything as a reaction to the Overseer. God actions are just events, like any other cause.
- An **Audit tab** or accuracy dashboard UI. Accuracy is shown through the scenario tests instead.
- Counterfactual replay as a core feature (stretch only, depends on Lane 1).
- Changes to `packages/shared`, or to Lane 1, 2 or 4 code beyond the agreed call site and panel slot.
- Conversational follow-up questions to the narrator, LangGraph, Python services, databases or vector search.
- Persisting narrator history beyond optional JSON logs in runs/.

## Further Notes

**Suggested weekend order** (each step leaves something demo-able):

1. Input contract, scenario generator, signals, detector → developments show up in tests
2. Attributor, gate, evidence package, template writer, verifier → full template cards pass scenario tests
3. Narrator panel fed from scenario data → visible in the web app without the server
4. Lane 1 adapter and server call → live cards on the real sim
5. Gemini writer with fallback → richer wording
6. Stretch: counterfactual line

**Asks to other lanes (raise early Saturday):**
- **Lane 1:** call the narrator once per round from the server and broadcast the cards. Share an example of a round's output for the adapter. Stretch: a headless re-run that can skip one event.
- **Lane 2:** include per-round fired-rule counts (rule name → number of miners) if you can.
- **Lane 4:** a right-hand slot for the narrator panel, and the latest cards available from the shared store.

**AWARE-NG link:** the evidence package is the piece most likely to carry over to the real project. Keep it plain JSON, and keep the "code finds, model words, verifier checks" split strict.
