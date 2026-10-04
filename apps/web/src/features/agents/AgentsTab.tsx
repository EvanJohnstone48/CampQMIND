// The Agents tab: who's who in the valley, and what each miner is thinking.
//
// Self-contained: give it the latest miners and activities from the shift stream
// (ShiftUpdate.miners / ShiftUpdate.activities) and it does the rest. Lane 4 owns the
// layout and styling; the class names here are hooks for that.

import { useMemo, useState } from "react";
import type { MinerActivity, MinerPublic, Needs } from "@motherlode/shared";

export interface AgentsTabProps {
  miners: MinerPublic[];
  /** This shift's activities (they carry each brain's reasoning). */
  activities?: MinerActivity[];
  /** Controlled selection (e.g. shared with the 3D view). Falls back to internal state. */
  selectedId?: string;
  onSelect?: (id: string) => void;
}

type SortKey = "name" | "wellbeing" | "cash" | "activity";

export function AgentsTab({ miners, activities = [], selectedId, onSelect }: AgentsTabProps) {
  const [ownSelection, setOwnSelection] = useState<string | undefined>();
  const [filter, setFilter] = useState("");
  const [brain, setBrain] = useState<"all" | "fuzzy" | "llm">("all");
  const [sort, setSort] = useState<SortKey>("wellbeing");
  const selected = selectedId ?? ownSelection;
  const select = (id: string) => (onSelect ? onSelect(id) : setOwnSelection(id));

  const byMiner = useMemo(() => new Map(activities.map((a) => [a.minerId, a])), [activities]);
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return miners
      .filter((m) => brain === "all" || m.brain === brain)
      .filter((m) => !q || m.name.toLowerCase().includes(q) || m.activity.includes(q) || m.id.includes(q))
      .sort((a, b) =>
        sort === "name" ? a.name.localeCompare(b.name) : sort === "activity" ? a.activity.localeCompare(b.activity) : (b[sort] as number) - (a[sort] as number),
      );
  }, [miners, filter, brain, sort]);
  const current = miners.find((m) => m.id === selected);

  return (
    <div className="agents-tab" style={{ display: "flex", gap: 12, height: "100%", minHeight: 0, fontSize: 13 }}>
      <section style={{ flex: "1 1 55%", display: "flex", flexDirection: "column", minWidth: 0 }}>
        <HeadToHead miners={miners} />
        <div className="agents-controls" style={{ display: "flex", gap: 6, margin: "8px 0", flexWrap: "wrap" }}>
          <input placeholder="Find a miner or activity…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
          <select value={brain} onChange={(e) => setBrain(e.target.value as typeof brain)}>
            <option value="all">All brains</option>
            <option value="fuzzy">Fuzzy</option>
            <option value="llm">LLM</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="wellbeing">Sort: well-being</option>
            <option value="cash">Sort: cash</option>
            <option value="name">Sort: name</option>
            <option value="activity">Sort: activity</option>
          </select>
        </div>
        <div style={{ overflow: "auto", flex: 1 }}>
          <table className="agents-table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left" }}>
                <th>Miner</th>
                <th>Doing</th>
                <th>Well-being</th>
                <th style={{ textAlign: "right" }}>Cash</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((m) => (
                <tr
                  key={m.id}
                  onClick={() => select(m.id)}
                  className={m.id === selected ? "selected" : undefined}
                  style={{ cursor: "pointer", background: m.id === selected ? "rgba(120,160,255,0.15)" : undefined }}
                >
                  <td>
                    {m.name} <BrainBadge brain={m.brain} />
                    {m.injured && <span title="injured"> 🤕</span>}
                  </td>
                  <td>{doing(m, byMiner.get(m.id))}</td>
                  <td>
                    <Bar value={(m.wellbeing + 0.5) / 1.5} label={m.wellbeing.toFixed(2)} />
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {m.cash}
                    {m.debt > 0 && <span style={{ color: "#c55" }}> (−{m.debt})</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <aside className="agents-detail" style={{ flex: "1 1 45%", overflow: "auto", minWidth: 0 }}>
        {current ? <MinerDetail miner={current} activity={byMiner.get(current.id)} /> : <p style={{ opacity: 0.7 }}>Pick a miner to see what they're thinking.</p>}
      </aside>
    </div>
  );
}

function MinerDetail({ miner, activity }: { miner: MinerPublic; activity?: MinerActivity }) {
  const trace = activity?.trace as Trace | undefined;
  return (
    <div>
      <h3 style={{ margin: "0 0 4px" }}>
        {miner.name} <BrainBadge brain={miner.brain} />
      </h3>
      <div style={{ opacity: 0.8, marginBottom: 8 }}>
        {doing(miner, activity)} · sleeps: {miner.home} · {miner.cash} coins{miner.debt ? `, owes ${miner.debt}` : ""}
        {miner.employerId ? ` · works for ${miner.employerId}` : ""}
      </div>
      <Needs needs={miner.needs} />
      {activity?.reason && (
        <blockquote style={{ margin: "10px 0", paddingLeft: 8, borderLeft: "3px solid #8ab" }}>
          {activity.valid ? "" : "⚠ couldn't do that: "}
          {activity.reason}
        </blockquote>
      )}
      {trace && <TraceView trace={trace} />}
    </div>
  );
}

// ---- traces (shapes match @motherlode/agents FuzzyTrace and LlmTrace, read defensively)

interface FuzzyTraceLike {
  brain: "fuzzy";
  inputs?: Record<string, [string, number]>;
  desire?: Record<string, number>;
  fired?: { rule: string; text: string; strength: number }[];
}
interface LlmTraceLike {
  brain: "llm";
  source: "llm" | "plan" | "fuzzy";
  thought?: string;
  choice?: string;
  planShift?: number;
  options?: { key: string; income: number }[];
  error?: string;
  fuzzy?: FuzzyTraceLike;
}
type Trace = FuzzyTraceLike | LlmTraceLike | { brain?: string };

function TraceView({ trace }: { trace: Trace }) {
  if (trace.brain === "llm") {
    const t = trace as LlmTraceLike;
    return (
      <div>
        <h4 style={{ margin: "8px 0 4px" }}>
          {t.source === "llm" ? "Asked the model this shift" : t.source === "plan" ? `Following a plan from shift ${t.planShift}` : "Fell back to fuzzy rules"}
        </h4>
        {t.thought && <p style={{ fontStyle: "italic" }}>“{t.thought}”</p>}
        {t.error && <p style={{ color: "#c55" }}>Model problem: {t.error}</p>}
        {t.options && (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {t.options.map((o) => (
              <li key={o.key} style={{ fontWeight: o.key === t.choice ? 700 : 400 }}>
                {o.key} (~{o.income} coins)
              </li>
            ))}
          </ul>
        )}
        {t.fuzzy && <TraceView trace={t.fuzzy} />}
      </div>
    );
  }
  if (trace.brain === "fuzzy") {
    const t = trace as FuzzyTraceLike;
    return (
      <div>
        <h4 style={{ margin: "8px 0 4px" }}>How it felt</h4>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {Object.entries(t.inputs ?? {}).map(([k, [term, deg]]) => (
            <span key={k} className="agents-chip" style={{ padding: "1px 6px", borderRadius: 8, background: "rgba(128,128,128,0.15)" }}>
              {k} is {term} ({deg.toFixed(2)})
            </span>
          ))}
        </div>
        <h4 style={{ margin: "10px 0 4px" }}>What it wanted</h4>
        {Object.entries(t.desire ?? {})
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => (
            <div key={k} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ width: 60 }}>{k}</span>
              <Bar value={v} label={v.toFixed(2)} />
            </div>
          ))}
        <h4 style={{ margin: "10px 0 4px" }}>Rules that fired</h4>
        <ol style={{ margin: 0, paddingLeft: 18 }}>
          {(t.fired ?? []).map((f) => (
            <li key={f.rule}>
              <code>{f.text}</code> <span style={{ opacity: 0.7 }}>({f.strength.toFixed(2)})</span>
            </li>
          ))}
        </ol>
      </div>
    );
  }
  return null;
}

// ---- small pieces

function HeadToHead({ miners }: { miners: MinerPublic[] }) {
  const groups = new Map<string, MinerPublic[]>();
  for (const m of miners) groups.set(m.brain ?? "?", [...(groups.get(m.brain ?? "?") ?? []), m]);
  if (groups.size < 2) return null;
  const mean = (ms: MinerPublic[], f: (m: MinerPublic) => number) => ms.reduce((a, m) => a + f(m), 0) / ms.length;
  return (
    <div className="agents-h2h" style={{ display: "flex", gap: 8 }}>
      {[...groups].map(([brain, ms]) => (
        <div key={brain} style={{ flex: 1, padding: 6, borderRadius: 6, background: "rgba(128,128,128,0.1)" }}>
          <BrainBadge brain={brain} /> {ms.length} miners
          <div>avg cash {Math.round(mean(ms, (m) => m.cash - m.debt))}</div>
          <div>avg well-being {mean(ms, (m) => m.wellbeing).toFixed(2)}</div>
        </div>
      ))}
    </div>
  );
}

const NEED_LABELS: Record<keyof Needs, string> = { nourishment: "food", energy: "energy", shelter: "shelter", health: "health", security: "savings", comfort: "comfort" };

function Needs({ needs }: { needs: Needs }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "70px 1fr", gap: "2px 6px", alignItems: "center" }}>
      {(Object.keys(NEED_LABELS) as (keyof Needs)[]).map((k) => [
        <span key={`${k}-l`}>{NEED_LABELS[k]}</span>,
        <Bar key={`${k}-b`} value={needs[k] ?? 0} label={`${Math.round((needs[k] ?? 0) * 100)}%`} />,
      ])}
    </div>
  );
}

function Bar({ value, label }: { value: number; label?: string }) {
  const v = Math.max(0, Math.min(1, value));
  const hue = Math.round(v * 120); // red -> green
  return (
    <div className="agents-bar" title={label} style={{ position: "relative", height: 12, flex: 1, minWidth: 60, background: "rgba(128,128,128,0.2)", borderRadius: 3 }}>
      <div style={{ width: `${v * 100}%`, height: "100%", borderRadius: 3, background: `hsl(${hue} 60% 45%)` }} />
    </div>
  );
}

function BrainBadge({ brain }: { brain?: string }) {
  if (!brain) return null;
  const llm = brain === "llm";
  return (
    <span
      className={`agents-brain agents-brain-${brain}`}
      title={llm ? "Driven by a language model (Gemini)" : "Driven by fuzzy-logic rules"}
      style={{ fontSize: 10, padding: "0 4px", borderRadius: 4, background: llm ? "#7b5cd6" : "#3a8f6b", color: "white" }}
    >
      {llm ? "LLM" : "fuzzy"}
    </span>
  );
}

function doing(m: MinerPublic, a?: MinerActivity): string {
  if (m.injured) return "recovering";
  const where = a?.siteId ?? m.destination;
  return m.activity === "rest" ? "resting" : `${m.activity} at ${where}`;
}
