import { useState } from "react";
import type { Card, EvidenceRef, StatementKind } from "@motherlode/narrator";
import "./NarratorPanel.css";

const KIND_LABEL: Record<StatementKind, string> = {
  observed: "Observed",
  rule: "Known rule",
  inferred: "Inferred",
  uncertain: "Uncertain",
  suggested: "Suggested",
};

/** The narrator's cards, newest first. Lane 4 places this in the right-hand slot and passes the cards from the store. */
export function NarratorPanel({ cards }: { cards: Card[] }) {
  const newestFirst = [...cards].sort((a, b) => b.round - a.round || b.priority - a.priority);
  return (
    <aside className="narrator">
      {newestFirst.length === 0 ? (
        <p className="narrator-empty">Nothing notable. Still watching.</p>
      ) : (
        newestFirst.map((card) => <NarratorCard key={card.id} card={card} />)
      )}
    </aside>
  );
}

function NarratorCard({ card }: { card: Card }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="narrator-card">
      <header>
        <span className="narrator-shift">Shift {card.round}</span>
        <span className={`narrator-confidence narrator-confidence--${card.confidence.replace(" ", "-")}`}>
          cause: {card.confidence}
        </span>
      </header>
      <h3>{card.headline}</h3>
      {card.statements.map((s, i) => (
        <p key={i} className={`narrator-statement narrator-statement--${s.kind}`}>
          <span className="narrator-kind">{KIND_LABEL[s.kind]}</span> {s.text}
        </p>
      ))}
      <button className="narrator-evidence-toggle" onClick={() => setOpen(!open)}>
        {open ? "Hide evidence" : "Show evidence"}
      </button>
      {open && (
        <ul className="narrator-evidence">
          {card.evidence.map((e, i) => (
            <li key={i}>{describe(e)}</li>
          ))}
        </ul>
      )}
    </article>
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
