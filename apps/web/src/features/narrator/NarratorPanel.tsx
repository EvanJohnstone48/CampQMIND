import { useState } from "react";
import type { Card, EvidenceRef, Level, Statement, StatementKind } from "@motherlode/narrator";
import "./NarratorPanel.css";

const LEVEL_NAME: Record<Level, string> = { 1: "Glance", 2: "Why", 3: "Deep" };

const KIND_LABEL: Record<StatementKind, string> = {
  glance: "",
  observed: "Observed",
  rule: "Known rule",
  inferred: "Cause",
  chain: "Chain",
  uncertain: "Unsure",
  suggested: "Suggested",
  measure: "How big",
  suspect: "Suspects",
  reasoning: "Confidence",
};

/**
 * The narrator's cards, newest first. Lane 4 places this in the right-hand slot
 * and passes every card so far. The switch sets how much every card says; each
 * card's "More detail" button goes one level deeper for that card alone.
 */
export function NarratorPanel({ cards, defaultLevel = 1 }: { cards: Card[]; defaultLevel?: Level }) {
  const [level, setLevel] = useState<Level>(defaultLevel);
  const newestFirst = [...cards].sort((a, b) => b.round - a.round || b.priority - a.priority);
  return (
    <aside className="narrator">
      <div className="narrator-levels" role="radiogroup" aria-label="Detail">
        {([1, 2, 3] as const).map((l) => (
          <button key={l} role="radio" aria-checked={level === l} className={level === l ? "is-active" : ""} onClick={() => setLevel(l)}>
            {l} · {LEVEL_NAME[l]}
          </button>
        ))}
      </div>
      {newestFirst.length === 0 ? (
        <p className="narrator-empty">Nothing notable. Still watching.</p>
      ) : (
        newestFirst.map((card) => <NarratorCard key={card.id} card={card} panelLevel={level} />)
      )}
    </aside>
  );
}

function NarratorCard({ card, panelLevel }: { card: Card; panelLevel: Level }) {
  const [own, setOwn] = useState<Level | null>(null);
  const level = Math.max(panelLevel, own ?? panelLevel) as Level;
  // Level 1 is the glance line alone; levels 2 and 3 build on each other.
  const shown = card.statements.filter((s) => (level === 1 ? s.level === 1 : s.level >= 2 && s.level <= level));

  return (
    <article className={`narrator-card narrator-card--level-${level}`}>
      <header>
        <span className="narrator-shift">Shift {card.round}</span>
        <span className={`narrator-confidence narrator-confidence--${card.confidence.replace(" ", "-")}`}>
          cause: {card.confidence}
        </span>
      </header>
      <h3>{card.headline}</h3>
      {shown.map((s, i) => (
        <StatementLine key={i} statement={s} showLabel={i === 0 || shown[i - 1].kind !== s.kind} />
      ))}
      {level === 3 && (
        <ul className="narrator-evidence">
          {card.evidence.map((e, i) => (
            <li key={i}>{describe(e)}</li>
          ))}
        </ul>
      )}
      <button className="narrator-more" onClick={() => setOwn(level < 3 ? ((level + 1) as Level) : null)}>
        {level < 3 ? "More detail ▾" : "Less ▴"}
      </button>
    </article>
  );
}

function StatementLine({ statement: s, showLabel }: { statement: Statement; showLabel: boolean }) {
  return (
    <p className={`narrator-statement narrator-statement--${s.kind}`}>
      {s.kind !== "glance" && <span className="narrator-kind">{showLabel ? KIND_LABEL[s.kind] : ""}</span>}
      {s.text}
    </p>
  );
}

function describe(e: EvidenceRef): string {
  switch (e.type) {
    case "metric":
      return `${e.metric}, shifts ${e.fromRound}–${e.toRound}`;
    case "event":
      return `${e.kind} at shift ${e.round}`;
    case "rule":
      return `rule "${e.rule}" at shift ${e.round}`;
  }
}
