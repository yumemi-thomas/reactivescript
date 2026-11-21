import { useState } from "react";
import { useSelector } from "@xstate/react";
import type { ActorRefFrom, SnapshotFrom } from "xstate";
import type { issuesMachine } from "./issuesMachine";

type IssuesRef = ActorRefFrom<typeof issuesMachine>;
type IssuesSnap = SnapshotFrom<typeof issuesMachine>;

export function IssuesPage({ actor }: { actor: IssuesRef }) {
  const snap = useSelector(actor, (s) => s);
  const c = snap.context;
  const setFilter = (filter: "open" | "closed") => {
    if (c.filter !== filter) actor.send({ type: "FILTER", filter });
  };
  return (
    <div className="issues-page">
      <div className="toolbar">
        <label>
          Current user{" "}
          <input
            data-testid="user"
            value={c.user}
            onChange={(e) => actor.send({ type: "SET_USER", name: e.target.value })}
          />
        </label>
        <div className="filters" role="group" aria-label="Filter">
          <button
            type="button"
            data-testid="filter-open"
            aria-pressed={c.filter === "open"}
            onClick={() => setFilter("open")}
          >
            Open
          </button>
          <button
            type="button"
            data-testid="filter-closed"
            aria-pressed={c.filter === "closed"}
            onClick={() => setFilter("closed")}
          >
            Closed
          </button>
        </div>
      </div>
      <div className="columns">
        <IssueList actor={actor} snap={snap} />
        <section className="detail" data-testid="detail" aria-label="Issue detail">
          {c.selectedId === null ? (
            <p>select an issue</p>
          ) : (
            <SelectedIssue key={c.selectionSeq} actor={actor} snap={snap} issueId={c.selectedId} />
          )}
        </section>
      </div>
    </div>
  );
}

function IssueList({ actor, snap }: { actor: IssuesRef; snap: IssuesSnap }) {
  const c = snap.context;
  return (
    <section className="list" data-testid="list" aria-label="Issues">
      {c.rows === null ? (
        snap.matches({ list: "failed" }) ? (
          <p>{`list error: ${c.listError}`}</p>
        ) : (
          <p>{`loading ${c.filter} issues`}</p>
        )
      ) : (
        <ul>
          {c.rows.map((issue) => (
            <li key={issue.id} className="row">
              <button
                type="button"
                data-testid="issue"
                onClick={() => actor.send({ type: "SELECT", id: issue.id })}
              >
                {`#${issue.id} ${issue.title} (${issue.assignee ?? "unassigned"})`}
              </button>
              <button
                type="button"
                data-testid="row-assign"
                onClick={() => actor.send({ type: "ROW_ASSIGN", id: issue.id })}
              >
                {`assign to ${c.user}`}
              </button>
              {c.filter === "open" && (
                <button
                  type="button"
                  data-testid="row-close"
                  onClick={() => actor.send({ type: "ROW_CLOSE", id: issue.id })}
                >
                  close
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {c.rowError && <p data-testid="row-error">{`row error: ${c.rowError}`}</p>}
    </section>
  );
}

function SelectedIssue({
  actor,
  snap,
  issueId,
}: {
  actor: IssuesRef;
  snap: IssuesSnap;
  issueId: number;
}) {
  const c = snap.context;
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [label, setLabel] = useState("");

  const detailLoading = snap.matches({ selection: { selected: { detail: "loading" } } });
  const detailShown = snap.matches({ selection: { selected: { detail: "shown" } } });
  const detailNotFound = snap.matches({ selection: { selected: { detail: "notFound" } } });
  const detailFailed = snap.matches({ selection: { selected: { detail: "failed" } } });
  const relatedSearching = snap.matches({ selection: { selected: { detail: { shown: "searching" } } } });
  const relatedFailed = snap.matches({ selection: { selected: { detail: { shown: "failed" } } } });
  const commentsLoading = snap.matches({ selection: { selected: { comments: "loading" } } });
  const labelsLoading = snap.matches({ selection: { selected: { labels: "loading" } } });
  const labelsReady = snap.matches({ selection: { selected: { labels: "ready" } } });

  return (
    <>
      {detailLoading && <p>{`loading #${issueId}`}</p>}
      {detailShown && (
        <>
          <h2>{`#${issueId} ${c.detailTitle ?? ""}`}</h2>
          <p>{c.detailBody}</p>
        </>
      )}
      {detailNotFound && <p>{`detail error: issue #${issueId} not found`}</p>}
      {detailFailed && <p>{`detail error: ${c.detailError}`}</p>}
      <div className="actions">
        <button type="button" data-testid="retry" onClick={() => actor.send({ type: "RETRY_DETAIL" })}>
          retry
        </button>
        <button type="button" data-testid="assign" onClick={() => actor.send({ type: "ASSIGN" })}>
          {`assign to ${c.user}`}
        </button>
        {c.assignError && <p>{`assign error: ${c.assignError}`}</p>}
      </div>
      <div className="rename">
        <input
          data-testid="title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button
          type="button"
          data-testid="rename"
          onClick={() => {
            if (title.trim() === "") return;
            actor.send({ type: "RENAME", title: title.trim() });
          }}
        >
          rename
        </button>
        {c.renameError && <p>{`rename error: ${c.renameError}`}</p>}
      </div>
      <div className="close">
        <button type="button" data-testid="close" onClick={() => actor.send({ type: "CLOSE" })}>
          close
        </button>
        {c.closeError && <p>{`close error: ${c.closeError}`}</p>}
      </div>
      {detailShown && (
        <section className="related" data-testid="related" aria-label="Related help">
          {relatedSearching ? (
            <p>finding related help</p>
          ) : relatedFailed ? (
            <p>{`related help failed: ${c.relatedError}`}</p>
          ) : c.related.length === 0 ? (
            <p>no related help</p>
          ) : (
            <ul>
              {c.related.slice(0, 3).map((hit) => (
                <li key={hit.id}>
                  <button
                    type="button"
                    data-testid="related-hit"
                    onClick={() => actor.send({ type: "OPEN_RELATED", hitId: hit.id })}
                  >
                    {hit.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <section className="comments" data-testid="comments" aria-label="Comments">
        {commentsLoading && <p>loading comments</p>}
        {c.commentsError && <p>{`comments error: ${c.commentsError}`}</p>}
        <ul>
          {c.comments.map((cm, i) => (
            <li key={`loaded-${i}`} data-testid="comment">
              {`${cm.author}: ${cm.text}`}
            </li>
          ))}
          {c.own.map((cm) => (
            <li key={`own-${cm.key}`} data-testid="comment">
              {`${cm.author}: ${cm.text}${cm.pending ? " (sending…)" : ""}`}
            </li>
          ))}
        </ul>
        <input
          data-testid="comment-input"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        <button
          type="button"
          data-testid="post"
          onClick={() => {
            const text = comment.trim();
            if (text === "") return;
            actor.send({ type: "POST", text });
            setComment("");
          }}
        >
          post
        </button>
        {c.postError && <p>{`post error: ${c.postError}`}</p>}
      </section>
      <section className="labels" data-testid="labels" aria-label="Labels">
        {labelsLoading && <p>loading labels</p>}
        {c.labelsError && <p>{`labels error: ${c.labelsError}`}</p>}
        <ul>
          {c.labels.map((l) => (
            <li key={l}>
              <span data-testid="label">{l}</span>{" "}
              <button
                type="button"
                data-testid="remove-label"
                disabled={!labelsReady}
                onClick={() => actor.send({ type: "REMOVE_LABEL", label: l })}
              >
                {`remove ${l}`}
              </button>
            </li>
          ))}
        </ul>
        <input
          data-testid="label-input"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <button
          type="button"
          data-testid="add-label"
          disabled={!labelsReady}
          onClick={() => {
            const next = label.trim();
            setLabel("");
            if (next === "") return;
            actor.send({ type: "ADD_LABEL", label: next });
          }}
        >
          add label
        </button>
        {c.labelError && <p>{`label error: ${c.labelError}`}</p>}
      </section>
    </>
  );
}
