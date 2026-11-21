import { useSelector } from "@xstate/react";
import type { ActorRefFrom } from "xstate";
import type { appMachine } from "../machines/app";
import type { issuesPageMachine } from "../machines/issuesPage";
import { viewIssues } from "../model";
import { DetailPane } from "./DetailPane";

type Props = {
  appRef: ActorRefFrom<typeof appMachine>;
  pageRef: ActorRefFrom<typeof issuesPageMachine>;
};

export function IssuesPage({ appRef, pageRef }: Props) {
  const user = useSelector(pageRef, (s) => s.context.user);
  const filter = useSelector(pageRef, (s) => s.context.filter);
  const list = useSelector(pageRef, (s) => s.context.list);
  const listError = useSelector(pageRef, (s) => s.context.listError);
  const listState = useSelector(pageRef, (s) =>
    s.matches({ list: "loading" }) ? "loading" : s.matches({ list: "failed" }) ? "failed" : "ready",
  );
  const selectedId = useSelector(pageRef, (s) => s.context.selectedId);
  const detailRef = useSelector(pageRef, (s) => s.children.detail);
  const confirmed = useSelector(appRef, (s) => s.context.confirmed);
  const pending = useSelector(appRef, (s) => s.context.pending);
  const rowError = useSelector(appRef, (s) => s.context.rowError);

  const rows = list ? viewIssues(list.items, list.at, filter, confirmed, pending) : [];
  const assignee = user.trim();

  return (
    <div className="issues">
      <section className="toolbar">
        <label className="field">
          <span>Current user</span>
          <input
            data-testid="user"
            value={user}
            onChange={(e) => pageRef.send({ type: "user.change", value: e.target.value })}
          />
        </label>
        <div className="segmented" role="group" aria-label="Filter">
          <button
            type="button"
            data-testid="filter-open"
            aria-pressed={filter === "open"}
            onClick={() => pageRef.send({ type: "filter.set", filter: "open" })}
          >
            Open
          </button>
          <button
            type="button"
            data-testid="filter-closed"
            aria-pressed={filter === "closed"}
            onClick={() => pageRef.send({ type: "filter.set", filter: "closed" })}
          >
            Closed
          </button>
        </div>
      </section>

      {rowError !== null && (
        <p className="error" role="alert" data-testid="row-error">
          row error: {rowError}
        </p>
      )}

      <div className="columns">
        <section className="list" data-testid="list" aria-busy={listState === "loading"}>
          {listState === "loading" && <p className="muted">loading {filter} issues</p>}
          {listState === "failed" && (
            <p className="error" role="alert">
              list error: {listError}
            </p>
          )}
          {listState === "ready" && (
            <ul>
              {rows.map((issue) => (
                <li key={issue.id} className={issue.id === selectedId ? "row selected" : "row"}>
                  <button
                    type="button"
                    className="issue"
                    data-testid="issue"
                    aria-current={issue.id === selectedId}
                    onClick={() => pageRef.send({ type: "issue.select", id: issue.id })}
                  >
                    #{issue.id} {issue.title} ({issue.assignee ?? "unassigned"})
                  </button>
                  <span className="row-actions">
                    <button
                      type="button"
                      data-testid="row-assign"
                      disabled={assignee === ""}
                      onClick={() =>
                        appRef.send({
                          type: "change.start",
                          source: "row",
                          change: { kind: "assign", id: issue.id, assignee },
                        })
                      }
                    >
                      assign to {user}
                    </button>
                    {filter === "open" && (
                      <button
                        type="button"
                        data-testid="row-close"
                        onClick={() =>
                          appRef.send({ type: "change.start", source: "row", change: { kind: "close", id: issue.id } })
                        }
                      >
                        close
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="detail" data-testid="detail">
          {selectedId === null || !detailRef ? (
            <p className="muted">select an issue</p>
          ) : (
            <DetailPane key={detailRef.sessionId} appRef={appRef} detailRef={detailRef} user={user} />
          )}
        </section>
      </div>
    </div>
  );
}
