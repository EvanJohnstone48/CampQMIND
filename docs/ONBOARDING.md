# Onboarding: Start Here

This page gets your laptop ready to build Motherlode, even if you've never coded before. Go top to bottom. It takes about 30–45 minutes, so do it the night before if you can.

At each step we explain *what* you're doing and *why*, so it isn't just copying commands.

---

## The checklist

- [ ] Install Git, Node.js, pnpm, VS Code and an AI coding assistant
- [ ] Get access to the GitHub repo and find out your lane
- [ ] Download the repo to your laptop
- [ ] Make your `.env` file and add a Gemini key (if your lane needs one)
- [ ] Read the vision, the scaffolding guide and your lane doc

---

## 1. First, what's a terminal?

A lot of this guide says "run this in a terminal". A **terminal** is a window where you type commands instead of clicking buttons. You type a line, press Enter, and the computer does it. That's all a "command" is.

- **Windows:** press the Windows key, type *PowerShell*, and open it.
- **Mac:** press Cmd + Space, type *Terminal*, and open it.
- **In VS Code** (once it's installed): menu *Terminal → New Terminal*. This is the easiest one to use day to day.

If a command says "not recognized" right after you installed something, **close the terminal and open a new one**. It only notices new programs when it starts.

---

## 2. Install the tools

Think of these as the workshop tools. You install them once, and they're used for every project.

| Tool | What it actually does | Get it | Check it worked |
|---|---|---|---|
| **Git** | A save system for code. It takes snapshots of your work, keeps the full history, and lets four people combine their changes without overwriting each other. | <https://git-scm.com/downloads> (just click Next through the defaults) | `git --version` |
| **Node.js** (22 or newer) | Lets JavaScript/TypeScript run on your computer, not just inside a browser. Our server and tools run on it. | <https://nodejs.org>, pick the **LTS** version | `node --version` should print `v22…` or higher |
| **pnpm** | A downloader for code libraries (other people's code we reuse, like the 3D engine). It also runs our project's shortcut commands. | In a terminal: `npm install -g pnpm@9` | `pnpm --version` |
| **VS Code** | The code editor, basically Word for code. It shows your files, highlights mistakes and has a terminal built in. | <https://code.visualstudio.com> | It opens |
| **A browser** | To look at the app we build. | Chrome, Edge or Firefox | — |

**What does "check it worked" mean?** Each check command asks the tool for its version number. If you get a number back, it's installed and your terminal can find it.

### Your AI coding assistant

We're all building with AI help, so you need one installed and signed in. Use whatever the team agrees on, for example **Claude Code** (<https://claude.com/claude-code>). Once you have the repo (step 4), test it by opening the folder and asking *"What is this project and which folder is mine?"*

### Optional VS Code extensions

- **GitLens** shows who changed each line and when.
- **Error Lens** shows mistakes right on the line instead of hiding them in a panel.

---

## 3. Get access

| What | Who gives it to you | Why |
|---|---|---|
| **A GitHub account + access to our repo** | Team lead (accept the email invite) | GitHub is the website where the shared copy of our code lives. Everyone pushes their work there and pulls everyone else's. |
| **Your lane** | Team lead | The project is split into 4 lanes (areas of work), one per person. See [lanes/](lanes/). |
| **A Gemini API key** (only Lanes 2 and 3, later on) | You make your own (free) | It's a password that lets our code talk to Google's Gemini AI model. See step 5. |

⚠️ **The Woodgrove PDF is confidential.** Read it, but don't share it outside the team, and never put it in the repo.

---

## 4. Download the repo

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

## 5. Your private settings file (`.env`)

Some settings are secret, like API keys. They go in a file called `.env` that **only lives on your laptop**. Git is told to ignore it (that's what `.gitignore` is for), so it never gets uploaded.

1. In VS Code, right-click `.env.example` → *Copy*, then *Paste*, and rename the copy to `.env`.
2. If your lane uses the AI model (Lanes 2 and 3), get a free key at <https://aistudio.google.com/apikey> (sign in with Google, click *Create API key*). Paste it after `GEMINI_API_KEY=` in your `.env`.

**Why the example file?** `.env.example` is the template everyone can see. It lists *which* settings exist, but with the secret values left blank. You fill in your own copy.

**Never** paste your key into code, chat, Discord or GitHub. If one leaks, delete it in AI Studio and make a new one.

The free Gemini tier has a daily limit on how many requests you can make, so test with a few AI miners, not hundreds.

---

## 6. Read (in this order)

| # | Doc | Time | What to take away |
|---|---|---|---|
| 1 | [00-vision.md](00-vision.md) | 8 min | What Motherlode is, and why it matters for our Woodgrove / AWARE-NG project |
| 2 | [SCAFFOLDING.md](../SCAFFOLDING.md) | 5 min | What every folder is for, and which ones are yours |
| 3 | Your lane in [lanes/](lanes/) | 3 min | What your part does and the features you'll build |

---

## 7. A few ideas you'll hear all day

- **Round / tick:** the world moves forward one work shift at a time (2 shifts = 1 day).
- **Seed:** a word like `"demo"` that decides all the "randomness". The same seed always gives the exact same world, which lets us replay things and check the narrator's answers.
- **Fuzzy logic:** rules with "how much" instead of yes/no, like "hunger is 0.8 *high* → go farm". Most miners think this way.
- **The narrator:** the part that watches all the numbers and explains what's going on in plain English, without making anything up.
- **The contract** (`packages/shared`): the data shapes everyone agrees on. It's how four people can build separate pieces that fit together.
- **Fixture:** a recording of a run. If another lane isn't ready yet, you can replay a recording and keep working.

---

## 8. Your working loop (Git for the day)

This is the loop you'll repeat all day:

```
git pull                          ← download everyone else's latest work
(build ONE small thing with your AI assistant)
(check it actually works)
git add .                         ← pick all your changes to be saved
git commit -m "Lane 2: hunger rules"   ← save a snapshot with a short note
git pull                          ← grab anything new since you started
git push                          ← upload your snapshot so the team gets it
```

**In plain words:** *pull* = download, *commit* = save a snapshot on your laptop, *push* = upload your snapshots to GitHub. Pull often, commit small, push when it works.

If `git pull` says there's a **conflict**, it means two people changed the same lines. Don't panic. Ask your AI assistant "help me resolve this merge conflict", or grab a teammate.

**A good first message for your AI assistant** (change the lane):

> I'm working on **Lane 2 (Minds & Society)** of the Motherlode project. Read `SCAFFOLDING.md`, `docs/00-vision.md` and `docs/lanes/lane-2-minds-society.md`. Only change files in my lane's folders. Explain what you're doing in simple terms as you go, because I'm new to coding.

---

## 9. You're ready when…

- [ ] `git --version`, `node --version` and `pnpm --version` all print a version
- [ ] The repo is open in VS Code and your AI assistant can see it
- [ ] You can explain Motherlode in two sentences
- [ ] You know your lane, your folders, and the first feature you'll build

See you at kickoff. ⛏
