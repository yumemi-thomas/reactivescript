import { useSelector } from "@xstate/react";
import type { ActorRefFrom } from "xstate";
import { DetailPane } from "./DetailPane";
import { issuesMachine, shownIssues } from "./issuesMachine";

export type IssuesActor = ActorRefFrom<typeof issuesMachine>;

export function IssuesPage({ actor }: { actor: IssuesActor }) {
  const snapshot = useSelector(actor, s => s);
  const ctx = snapshot.context;
  const send = actor.send;
  const rows = shownIssues(ctx);
  const detail = snapshot.children.detail;

  return (
    <section className="issues">
      <div className="toolbar">
        <label>
          Current user{" "}
          <input data-testid="user" value={ctx.user} onChange={e => send({ type: "user.change", value: e.target.value })} />
        </label>
        <div className="filters" role="group" aria-label="Filter">
          <button
            type="button"
            data-testid="filter-open"
            aria-pressed={ctx.filter === "open"}
            onClick={() => send({ type: "filter.set", filter: "open" })}
          >
            open
          </button>
          <button
            type="button"
            data-testid="filter-closed"
            aria-pressed={ctx.filter === "closed"}
            onClick={() => send({ type: "filter.set", filter: "closed" })}
          >
            closed
          </button>
        </div>
      </div>

      <div className="columns">
        <div className="list-column">
          <div data-testid="list" className="list" aria-busy={snapshot.matches({ list: "loading" })}>
            {snapshot.matches({ list: "loading" }) && <p>{`loading ${ctx.filter} issues`}</p>}
            {snapshot.matches({ list: "failed" }) && <p className="error">{`list error: ${ctx.listError}`}</p>}
            {snapshot.matches({ list: "loaded" }) && (
              <ul>
                {rows.map(issue => (
                  <li key={issue.id} className={issue.id === ctx.selected ? "selected" : undefined}>
                    <button
                      type="button"
                      className="row"
                      data-testid="issue"
                      onClick={() => send({ type: "select", id: issue.id })}
                    >
                      {`#${issue.id} ${issue.title} (${issue.assignee ?? "unassigned"})`}
                    </button>
                    <span className="row-actions">
                      <button
                        type="button"
                        data-testid="row-assign"
                        disabled={ctx.user.trim() === ""}
                        onClick={() => send({ type: "row.assign", id: issue.id })}
                      >
                        {`assign to ${ctx.user}`}
                      </button>
                      {ctx.filter === "open" && (
                        <button
                          type="button"
                          data-testid="row-close"
                          onClick={() => send({ type: "row.close", id: issue.id })}
                        >
                          close
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {ctx.rowError !== null && (
            <p data-testid="row-error" className="error" role="alert">
              {`row error: ${ctx.rowError}`}
            </p>
          )}
        </div>

        <div data-testid="detail" className="detail">
          {ctx.selected === null || !detail ? (
            <p>select an issue</p>
          ) : (
            <DetailPane key={detail.sessionId} issuesActor={actor} detailActor={detail} />
          )}
        </div>
      </div>
    </section>
  );
}
