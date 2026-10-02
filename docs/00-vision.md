# Motherlode — The Idea

*Working title. Camp QMIND build weekend, October 2026.*

## What it is

Motherlode is a simulated mining town that explains itself to you.

A valley sits between several mountains. Around a hundred small bean-shaped miners live there. They dig copper and gold out of the mountains, chop timber, farm food, process ore through crushers, flotation cells and smelters, trade everything on an open market, borrow from a bank, hire each other, go broke, build houses and guild halls, and form friendships, rivalries, guilds and a union. Nobody has a fixed job and no good has a fixed price. Supply and demand among agents who disagree with each other decides everything.

You are not one of the miners. You are the Overseer: the god of the valley. You can move about fifty dials that change the rules of the world, cause earthquakes and gold rushes, pick up a single miner by name and throw them into the river, or hand a windfall to the one who has been unlucky. The miners can see you doing it, and they react. Some come to trust you and some don't. The loyal ones band together into guilds and build guild halls, while the distrustful ones unionise.

A world like this produces far more data than a person can read: every price, trade, loan, dig, conversation and rule firing, for every miner, every round. So Motherlode includes a narrator that watches all of it and tells you, in plain language, what is going on, why it is probably happening, how confident it is, what it doesn't know, and which levers you could pull. Before you pull one, it can run the world forward on a copy and tell you what is likely to happen if you do.

## Why we are building it

Our six-month QMIND project with Woodgrove Technologies (AWARE-NG) is about conversational intelligence for advanced process control (APC) in mineral processing. APC systems run crushing, grinding, flotation and smelting circuits using fuzzy logic, expert rules, PID loops and process models. They work, but they are opaque. When mill power drops or recovery falls, operators and engineers have to dig through trends, rule activations, alarms and controller states to work out why. The brief asks how to design a framework that turns all of that into explanations that are grounded in evidence, traceable, honest about uncertainty, and that keep the human in charge of decisions.

There is no APC software for us to work with yet, so we are not trying to fake a concentrator for this weekend. Instead we built a system that has the same *shape* as the problem:

| AWARE-NG (real plant) | Motherlode (simulation) |
|---|---|
| Messy multivariate process data | Hundreds of economic and social time series |
| Fuzzy logic controllers and expert rules | Miners whose decisions come from fuzzy rule bases |
| Rule activation histories | Every miner's logged rule firings and reasoning |
| Ore hardness, grade and feed changes | Veins with hidden grade and hardness that deplete with depth |
| Events with multiple, delayed causes | Gluts, credit freezes and fear spreading through a social network |
| Operator who makes the decisions | You, the Overseer, who make the decisions |
| Operator trust in the APC (and the risk of over-reliance) | Miners' trust in the Overseer, which rises and falls with how you act |
| Proactive alerts without alarm fatigue | A narrator that ranks developments by relevance, urgency, confidence and actionability |
| Recommendations kept separate from observations | Explanation cards that separate *observed*, *inferred*, *uncertain* and *suggested* |

The most important difference is in our favour. **At a real plant you never fully know the true cause of an event. In a simulation you do.** The world is deterministic and seeded, so we can rerun any moment with one cause removed and measure what actually changed. That lets us score the narrator's explanations against ground truth, which is the hardest thing the AWARE-NG brief asks for ("validating that the framework faithfully represents the logic and evidence"). Motherlode is a test bench for the explanation framework we will spend the next six months designing.

## How it works, in one pass

**The world** advances in rounds called shifts, two per day. In each round every miner chooses what to do. The world then resolves: ore gets dug, goods get processed, the market clears one auction per good, the bank charges interest and forecloses on defaults, people eat or go hungry, veins get thinner, shafts without timber supports sometimes collapse, and beliefs spread between friends. The 3D view never waits for a round. Miners are always walking trails, swinging picks, queueing at the smelter or wandering the square, and each round only changes where they are headed.

**The miners** each have a name, a face, a personality, skills, a risk appetite, savings, debts, friends, and a level of trust in the Overseer. They are driven by one of three interchangeable "brains": a fuzzy-logic rule base (free, fast, fully traceable), a large language model with tool calls (richer, with memory and reasoning in its own words), or optionally a cheap decision model. A single dial sets the mix. By default a quarter of the town is LLM-driven, which also gives us a head-to-head experiment: do the LLM miners or the fuzzy miners end up richer?

**The narrator** reads the world through the same pipeline we expect to propose for AWARE-NG:

1. It turns raw data into filtered **signals**.
2. It **fuzzifies** those signals into words like *high*, *rising* and *depleting*, each with a degree.
3. It **detects** developments with a fuzzy rule base and change-point detection.
4. It **attributes** each development to competing causes using real counterfactual replays.
5. It **gates** what reaches you, so you aren't buried in alerts.
6. It **writes** the explanation with a language model that is only allowed to use the evidence it was given.
7. It **verifies** every sentence against that evidence before you see it.

The model never writes a number itself: numbers are filled in from the data. Confidence words always come from a fixed scale. Each claim links to the chart, the miners, or the rule that supports it.

**The Overseer** has dials, one-shot acts of god, individual powers over named miners, a timeline where any intervention can be reverted, and the Oracle, which forks the world, runs it forward with and without your change, and explains the difference before you commit.

## What makes it interesting to watch

The economy is complex enough to surprise us. A gold rush causes over-mining, which drives up demand for timber supports, which strips the forest, which raises the price of smelting, which bankrupts a smelter owner, which puts twelve miners out of work, and they all take loans for food. Every one of those links is a decision by some miner, and the narrator has to untangle them.

The social layer makes the Overseer's actions matter. Strike a hoarder with lightning and the miners who saw it get scared. They stop borrowing, and the fear spreads to their friends, so the credit market in that part of the valley freezes. Grant a windfall to a miner at the fourth vein and a guild might form around that vein. The guild names itself and writes a charter from what actually happened, then rushes the vein until it is exhausted. When the vein runs dry and the rumour turns out to be wrong, the guild splits. Independents, meanwhile, form a union, refuse to pay dues, and strike against an employer who underpays them.

None of this is scripted. That is exactly why it needs a narrator.

## What it is not

It is not a model of a real concentrator, and it doesn't claim to predict real economies. It doesn't use a blockchain: the project that inspired us (Settlers of Solana) used one for a sponsor track, and we have no reason to. It is not a game with goals or win conditions, although it is fun to play. It is an interactive test bench for explaining complex, multi-cause system behaviour to a human who has to make decisions, built quickly and seriously enough to show at a demo.

## What we want people to leave with

Three things. First, a world like this is unreadable without help, and the right kind of help (grounded, traceable, calibrated) makes it readable. Second, explanations can be checked when you control the ground truth, and we did check them. Third, the same structure carries over to a mine site: signals, fuzzy rules, attribution, gating, constrained language and verification, with the operator in charge throughout. That is the next six months.
