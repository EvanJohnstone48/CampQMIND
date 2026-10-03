# Lane 3 · Narrator

You build the narrator: the part that watches all the data and explains in plain language what's happening, why, and how sure it is. It's the main point of the project (it's our test version of the AWARE-NG idea). The narrator should only say things it has evidence for, and because it's a simulation we can actually check whether it was right.

Things you'll make:

Signals: smoothed history of key numbers (share mining, share starving, wellbeing…)
Words for those numbers: low/normal/high, falling/stable/rising
Rules that spot things worth mentioning ("miners are leaving the mines")
A filter so the god isn't spammed with alerts
Explanation cards written from evidence (templates first, then Gemini)
A checker that rejects any sentence with made-up numbers
Cause-finding by re-running the world without each possible cause

**Your folders:** `packages/narrator` and `apps/web/src/features/narrator`

**Full plan:** [issues/prd-lane-3-narrator.md](../../issues/prd-lane-3-narrator.md)

**Code:** [packages/narrator](../../packages/narrator) (start with its [README](../../packages/narrator/README.md)) and the panel in [apps/web/src/features/narrator](../../apps/web/src/features/narrator)
