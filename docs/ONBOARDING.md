# Onboarding: Start Here

This page gets your laptop ready to build Motherlode, even if you've never coded before. Go top to bottom. It takes about 45 minutes, so do it the night before if you can.

At each step we explain *what* you're doing and *why*, so it isn't just copying commands. We also explain how each piece connects to the real project we're doing with Woodgrove this year.

---

## The checklist

- [ ] Read why we're doing this (section 1)
- [ ] Install Git, Node.js, pnpm, VS Code and an AI coding assistant
- [ ] Get access to the GitHub repo and find out your lane
- [ ] Download the repo to your laptop
- [ ] Make your `.env` file and add a Gemini key (if your lane needs one)
- [ ] Read the vision, the scaffolding guide and your lane doc

---

## 1. Why we're doing this

### The real project: AWARE-NG with Woodgrove

**Woodgrove Technologies** is a Toronto company that makes control software for mining plants. Their system is called **AWARE**. It's an *Advanced Process Control* (APC) system: software that runs parts of a mineral processing plant automatically, making thousands of small adjustments to keep everything efficient and stable.

On our call, Woodgrove walked us through AWARE using the example we'll focus on: the **grinding circuit**. Rock from the mine goes into a **SAG mill**, a huge rotating drum that tumbles the rock against itself to break it down, and then into a **ball mill**, which grinds it finer using steel balls. AWARE watches things like mill power draw, feed rate and water, and adjusts them using:

- **Fuzzy logic:** rules with "how much" instead of yes/no ("IF mill load is *high* THEN reduce feed *a bit*")
- **Expert rules:** know-how from experienced engineers, written down as rules
- **PID controllers:** classic feedback loops that nudge a value back toward its target

From what we've seen, the control logic itself runs on Python-based tooling.

**The problem Woodgrove gave us:** AWARE makes good decisions, but it doesn't explain them. When something changes, say the SAG mill's power draw suddenly drops, an operator has to dig through charts, alarms and rule logs to work out why. And there's rarely just one cause: it could be harder ore, a different feed rate, less water, worn liners, or all of them at once.

**Our job this year (October → conference in March):** design a framework that turns all of that into **plain-language explanations** an operator can trust. That means explanations that:

- only say things backed by real evidence, and point to that evidence
- keep *what we saw* separate from *what we think caused it* and *what you could do*
- say how confident they are, and admit when they don't know
- only speak up when it's actually worth it, so people aren't buried in alerts
- **never take control away from the humans.** The AI explains; people decide.

### Why build a mining game first?

We don't have AWARE licenses or real plant data yet, and we won't for a while. Instead of waiting, we're building a fun proof of concept with **the same shape of problem**: Motherlode.

| In a real plant (AWARE) | In Motherlode |
|---|---|
| SAG mill power changes with ore hardness and feed | Mines with veins whose hardness and grade change as you dig deeper |
| Fuzzy logic and expert rules make control decisions | Most miners decide what to do with fuzzy-logic rules |
| A log of which rules fired and when | Every miner records *why* it made each decision |
| Events with several causes, some delayed | Gluts, crashes and panics spreading through the town |
| The operator who makes the calls | You, playing god, make the calls |
| Explanations for the operator | The narrator explaining what's happening |

**The best part:** at a real plant you can never be 100% sure what caused something. In our simulation you can. We can re-run the world with one cause removed and see if the effect disappears. That means we can actually **check whether our narrator's explanations are right**, which is the hardest thing the Woodgrove brief asks for.

### What carries over to the real project

Even though nothing here touches AWARE, almost everything you learn does:

| What you'll use here | Why it matters for AWARE-NG |
|---|---|
| **Git and GitHub** | It's how we'll work all year: branches, pull requests and reviews in the AWARE-NG repo. |
| **Fuzzy logic** | It's literally what AWARE uses to control the mills. |
| **Working with AI models (Gemini)** | The real framework uses language models to write explanations, so you'll learn how to keep them grounded and stop them from making things up. |
| **Time-series data and events** | Plant data is mostly numbers over time plus alarms. Our sim produces the same kind of data. |
| **Checking explanations against the truth** | "How do we know the explanation is right?" is the core research question for March. |
| **Building with AI coding assistants** | It's how a small team ships a real prototype in the time we have. |

⚠️ **The Woodgrove brief is confidential.** Read it, but don't share it outside the team, and never put it (or any client material or plant data) in GitHub.

---

## 2. First, what's a terminal?

A lot of this guide says "run this in a terminal". A **terminal** is a window where you type commands instead of clicking buttons. You type a line, press Enter, and the computer does it. That's all a "command" is.

- **Windows:** press the Windows key, type *PowerShell*, and open it.
- **Mac:** press Cmd + Space, type *Terminal*, and open it.
- **In VS Code** (once it's installed): menu *Terminal → New Terminal*. This is the easiest one to use day to day.

If a command says "not recognized" right after you installed something, **close the terminal and open a new one**. It only notices new programs when it starts.

---

## 3. Install the tools

Think of these as the workshop tools. You install them once, and they're used for every project.

| Tool | What it actually does | Get it | Check it worked |
|---|---|---|---|
| **Git** | A save system for code. It takes snapshots of your work, keeps the full history, and lets several people combine their changes without overwriting each other. | <https://git-scm.com/downloads> (just click Next through the defaults) | `git --version` |
| **Node.js** (22 or newer) | Lets JavaScript/TypeScript run on your computer, not just inside a browser. Our server and tools run on it. | <https://nodejs.org>, pick the **LTS** version | `node --version` should print `v22…` or higher |
| **pnpm** | A downloader for code libraries (other people's code we reuse, like the 3D engine). It also runs our project's shortcut commands. | In a terminal: `npm install -g pnpm@9` | `pnpm --version` |
| **VS Code** | The code editor, basically Word for code. It shows your files, highlights mistakes and has a terminal built in. | <https://code.visualstudio.com> | It opens |
| **A browser** | To look at the app we build. | Chrome, Edge or Firefox | — |

**What does "check it worked" mean?** Each check command asks the tool for its version number. If you get a number back, it's installed and your terminal can find it.

### Your AI coding assistant

We're all building with AI help, so you need one installed and signed in. Use whatever the team agrees on, for example **Claude Code** (<https://claude.com/claude-code>). Once you have the repo (step 5), test it by opening the folder and asking *"What is this project and which folder is mine?"*

### Optional VS Code extensions

- **GitLens** shows who changed each line and when.
- **Error Lens** shows mistakes right on the line instead of hiding them in a panel.

---

## 4. Get access

| What | Who gives it to you | Why |
|---|---|---|
| **A GitHub account + access to our repo** | A project manager (accept the email invite) | GitHub is the website where the shared copy of our code lives. Everyone uploads their work there and downloads everyone else's. |
| **Your lane** | A project manager | The project is split into 4 lanes (areas of work), one per person. See [lanes/](lanes/). |
| **A Gemini API key** (only Lanes 2 and 3, later on) | You make your own (free) | It's a password that lets our code talk to Google's Gemini AI model. See step 6. |

---

## 5. Download the repo

Run these in a terminal, one at a time:

```
git clone <the repo URL from GitHub>
cd CampQMIND
```

**What just happened:**
- `git clone` downloads the whole project, with its full history, into a new folder called `CampQMIND`. "Clone" just means "make my own linked copy".
- `cd CampQMIND` means "change directory": you're stepping *into* that folder, so the next commands run inside it.

Now open it in VS Code: *File → Open Folder…* and pick `CampQMIND`. The panel on the left shows all the folders. [SCAFFOLDING.md](../SCAFFOLDING.md) explains what each one is for.

**Heads up:** the repo is mostly empty folders on purpose. Building what goes in them is the job. There's nothing to "run" yet. Getting the project set up so it runs is part of the first hour.

---

## 6. Your private settings file (`.env`)

Some settings are secret, like API keys. They go in a file called `.env` that **only lives on your laptop**. Git is told to ignore it (that's what `.gitignore` is for), so it never gets uploaded.

1. In VS Code, right-click `.env.example` → *Copy*, then *Paste*, and rename the copy to `.env`.
2. If your lane uses the AI model (Lanes 2 and 3), get a free key at <https://aistudio.google.com/apikey> (sign in with Google, click *Create API key*). Paste it after `GEMINI_API_KEY=` in your `.env`.

**Why the example file?** `.env.example` is the template everyone can see. It lists *which* settings exist, but with the secret values left blank. You fill in your own copy.

**Never** paste your key into code, chat, Discord or GitHub. If one leaks, delete it in AI Studio and make a new one. This is the same rule we'll follow all year for anything sensitive.

The free Gemini tier has a daily limit on how many requests you can make, so test with a few AI miners, not hundreds.

---

## 7. Read (in this order)

| # | Doc | Time | What to take away |
|---|---|---|---|
| 1 | [00-vision.md](00-vision.md) | 8 min | What Motherlode is, and how it maps onto the Woodgrove problem |
| 2 | [SCAFFOLDING.md](../SCAFFOLDING.md) | 5 min | What every folder is for, and which ones are yours |
| 3 | Your lane in [lanes/](lanes/) | 3 min | What your part does and the features you'll build |

---

## 8. A few ideas you'll hear all day

- **Round / tick:** the world moves forward one work shift at a time (2 shifts = 1 day).
- **Seed:** a word like `"demo"` that decides all the "randomness". The same seed always gives the exact same world, which lets us replay things and check the narrator's answers.
- **Fuzzy logic:** rules with "how much" instead of yes/no, like "hunger is 0.8 *high* → go farm". Most miners think this way, just like AWARE's controllers.
- **The narrator:** the part that watches all the numbers and explains what's going on in plain English, without making anything up. It's our first try at what AWARE-NG is about.
- **The contract** (`packages/shared`): the data shapes everyone agrees on. It's how four people can build separate pieces that fit together.
- **Fixture:** a recording of a run. If another lane isn't ready yet, you can replay a recording and keep working.

---

## 9. Your working loop (Git and GitHub)

We use the same GitHub workflow here that we'll use in the AWARE-NG repo for the rest of the year, so this is good practice.

**The words:**
- **Repository (repo):** the shared project folder on GitHub.
- **Branch:** your own copy of the project to work in, so you don't break the main version while you're building.
- **Commit:** a saved snapshot of your changes, with a short note.
- **Pull request (PR):** a request on GitHub that says "please look at my changes and add them to the main version".
- **Merge:** adding approved changes into the main version.

**The loop:**

```
git switch main                      ← go back to the main version
git pull                             ← download everyone else's latest work
git switch -c lane-2/hunger-rules    ← make a new branch for ONE small thing
(build it with your AI assistant, and check it works)
git add .                            ← pick all your changes to be saved
git commit -m "Lane 2: hunger rules" ← save a snapshot with a short note
git push -u origin lane-2/hunger-rules   ← upload your branch to GitHub
```

Then on GitHub, click **Compare & pull request**, say what you changed and why, and ask a teammate to look at it. Once it's approved, merge it.

**In plain words:** *pull* = download, *branch* = your own workspace, *commit* = save a snapshot, *push* = upload, *PR* = "please check this and add it in". Keep each branch small so it's easy to review.

**Never work directly on `main`.** If `git pull` or a merge says there's a **conflict**, that means two people changed the same lines. Don't panic. Ask your AI assistant "help me resolve this merge conflict", or grab a teammate.

**A good first message for your AI assistant** (change the lane):

> I'm working on **Lane 2 (Minds & Society)** of the Motherlode project. Read `SCAFFOLDING.md`, `docs/00-vision.md` and `docs/lanes/lane-2-minds-society.md`. Only change files in my lane's folders. Explain what you're doing in simple terms as you go, because I'm new to coding.

---

## 10. You're ready when…

- [ ] `git --version`, `node --version` and `pnpm --version` all print a version
- [ ] The repo is open in VS Code and your AI assistant can see it
- [ ] You can explain Motherlode, and how it connects to Woodgrove, in two sentences
- [ ] You know what a branch and a pull request are
- [ ] You know your lane, your folders, and the first feature you'll build

See you at kickoff. ⛏
