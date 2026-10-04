// The live server: ticks the world on a timer and streams each shift to every browser.
//
//   pnpm dev:server            (settings from .env: PORT, SEED, POPULATION, ROUND_MS, MAP, BRAINS)
//
// HTTP:  GET /health   GET /snapshot   GET /run (the run so far, replayable with `pnpm sim replay`)
//        GET /brains (fuzzy vs LLM head-to-head, and LLM usage and cost)
// WS:    see ServerMessage / ClientMessage in @motherlode/shared

import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { ALPINE_VALLEY, type ClientMessage, type ServerMessage, type WorldMap } from "@motherlode/shared";
import { compareBrains } from "@motherlode/agents";
import { LiveNarrator, createGeminiClient } from "@motherlode/narrator";
import { minerPublic, snapshot } from "@motherlode/sim";
import { pickTown } from "./brains";
import { LiveWorld } from "./liveWorld";

const root = resolve(import.meta.dirname, "../../..");
loadEnv(resolve(root, ".env"));

const PORT = Number(process.env.PORT ?? 8787);
const SEED = process.env.SEED || "demo";
const town = pickTown(process.env, SEED, Number(process.env.POPULATION || 50));
const world = new LiveWorld({
  seed: SEED,
  population: town.population,
  roundMs: Number(process.env.ROUND_MS ?? 3000),
  map: process.env.MAP ? (JSON.parse(readFileSync(resolve(root, process.env.MAP), "utf8")) as WorldMap) : ALPINE_VALLEY,
  brains: town.brains,
  syncBrain: town.syncBrain,
  brainsLabel: town.name,
  narrator: makeNarrator(),
  // The world waits for the viewer to press play (START_PAUSED=false starts it straight away).
  startPaused: process.env.START_PAUSED !== "false",
});

const http = createServer((req, res) => {
  const send = (code: number, body: unknown) => {
    res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*" });
    res.end(JSON.stringify(body));
  };
  if (req.url === "/health") return send(200, { ok: true, ...world.status() });
  if (req.url === "/snapshot") return send(200, snapshot(world.ctx, world.state));
  if (req.url === "/run") return send(200, world.runLog());
  if (req.url === "/brains") {
    const miners = world.state.miners.map((m) => minerPublic(world.state, m));
    return send(200, { town: town.name, headToHead: compareBrains(miners), llm: town.llmStats() ?? null });
  }
  if (req.url === "/" || req.url === "") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><title>Motherlode server</title><body style="font-family:sans-serif;max-width:560px;margin:60px auto;line-height:1.6">
<h2>The Motherlode world server is running</h2>
<p>This is the server the 3D valley talks to, not the valley itself. Open the web app at the <b>Local:</b> address Vite printed in your terminal (usually <a href="http://127.0.0.1:5173">http://127.0.0.1:5173</a>, or the next free port).</p>
<p>Shift ${world.state.shift}, ${world.state.miners.length} miners, brains: ${town.name}.</p>
<p>Data: <a href="/health">/health</a> · <a href="/snapshot">/snapshot</a> · <a href="/brains">/brains</a> · <a href="/run">/run</a></p></body>`);
    return;
  }
  send(404, { error: "not found" });
});

const wss = new WebSocketServer({ server: http });
const clients = new Set<WebSocket>();

function sendTo(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}
function broadcast(msg: ServerMessage): void {
  const text = JSON.stringify(msg);
  for (const ws of clients) if (ws.readyState === ws.OPEN) ws.send(text);
}

wss.on("connection", (ws) => {
  clients.add(ws);
  sendTo(ws, world.hello());
  ws.on("message", (data) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return sendTo(ws, { type: "error", message: "messages must be JSON" });
    }
    try {
      const { reply, broadcast: all } = world.handle(msg);
      if (reply) sendTo(ws, reply);
      if (all) broadcast(all);
    } catch (err) {
      sendTo(ws, { type: "error", message: (err as Error).message });
    }
  });
  ws.on("close", () => clients.delete(ws));
});

// The clock. Each shift waits for the previous one, so slow brains slow the world down instead of piling up.
async function loop(): Promise<void> {
  const started = Date.now();
  if (!world.paused) {
    try {
      const msg = await world.tick();
      if (msg) broadcast(msg);
    } catch (err) {
      console.error("Shift failed:", err);
      world.paused = true;
      broadcast({ type: "error", message: `The world stopped: ${(err as Error).message}` });
      broadcast({ type: "status", status: world.status() });
    }
  }
  setTimeout(loop, Math.max(0, world.roundMs - (Date.now() - started)));
}

http.listen(PORT, () => {
  console.log(`Motherlode server on http://localhost:${PORT} (ws on the same port), seed "${world.state.seed}", ${world.state.miners.length} miners, brains: ${town.name}`);
  void loop();
});

// Save the run on shutdown so it can be replayed.
function saveAndExit(): void {
  try {
    const dir = resolve(root, "runs");
    mkdirSync(dir, { recursive: true });
    const file = resolve(dir, `live-${world.state.seed}-${Date.now()}.json`);
    writeFileSync(file, JSON.stringify(world.runLog()));
    console.log(`\nSaved run to ${file}`);
  } finally {
    process.exit(0);
  }
}
process.on("SIGINT", saveAndExit);
process.on("SIGTERM", saveAndExit);

/** Lane 3's narrator. With a Gemini key it rewords cards (every rewording is checked); NARRATOR_LLM=off keeps templates. */
function makeNarrator(): LiveNarrator {
  const key = process.env.GEMINI_API_KEY?.trim();
  const useLlm = key && process.env.NARRATOR_LLM !== "off";
  return new LiveNarrator({
    llm: useLlm ? createGeminiClient(key!, process.env.NARRATOR_MODEL || process.env.GEMINI_MODEL || undefined) : undefined,
    onProblem: (m) => console.warn("[narrator]", m),
  });
}

function loadEnv(file: string): void {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
