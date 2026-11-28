import type { Dispatch } from "react";
import type { Hit } from "./api.js";
import {
  addLabelTo,
  assignIssue,
  closeIssueFrom,
  displayTitle,
  labelsShown,
  loadList,
  postComment,
  removeLabelFrom,
  renameIssueTo,
  retryIssue,
  selectIssue,
  visibleRows,
  type DetailState,
  type Filter,
  type IssuesAction,
  type IssuesState,
} from "./issues";

type Send = Dispatch<IssuesAction>;

type Props = {
  state: IssuesState;
  dispatch: Send;
  onRelated: (hit: Hit, query: string) => void;
};

export function IssuesPage({ state, dispatch, onRelated }: Props) {
  const page = state.page;
  const list = state.lists[page.filter];
  const rows = visibleRows(state, page.filter);

  function changeFilter(filter: Filter) {
    if (filter === page.filter) return;
    dispatch({ type: "setFilter", filter });
    loadList(dispatch, filter);
  }

  return (
    <section aria-label="Issues">
      <div>
        <label>
          Current user{" "}
          <input
            data-testid="user"
            value={page.user}
            onChange={(e) => dispatch({ type: "setUser", user: e.target.value })}
          />
        </label>
        <button
          type="button"
          data-testid="filter-open"
          aria-pressed={page.filter === "open"}
          onClick={() => changeFilter("open")}
        >
          Open
        </button>
        <button
          type="button"
          data-testid="filter-closed"
          aria-pressed={page.filter === "closed"}
          onClick={() => changeFilter("closed")}
        >
          Closed
        </button>
      </div>

      <div>
        <div data-testid="list">
          {list.status === "error" && <p>{`list error: ${list.error ?? ""}`}</p>}
          {list.status !== "error" && list.status !== "ok" && <p>{`loading ${page.filter} issues`}</p>}
          {list.status === "ok" && (
            <ul>
              {rows.map((row) => (
                <li key={row.id}>
                  <button type="button" data-testid="issue" onClick={() => selectIssue(dispatch, row.id)}>
                    {`#${row.id} ${row.title} (${row.assignee ?? "unassigned"})`}
                  </button>
                  <button
                    type="button"
                    data-testid="row-assign"
                    onClick={() => assignIssue(dispatch, row.id, page.user, "row", page.selToken)}
                  >
                    {`assign to ${page.user}`}
                  </button>
                  {page.filter === "open" && (
                    <button
                      type="button"
                      data-testid="row-close"
                      onClick={() => closeIssueFrom(dispatch, row.id, "row", page.selToken)}
                    >
                      close
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        {page.rowError && <p data-testid="row-error">{page.rowError}</p>}
      </div>

      <div data-testid="detail">
        {page.selectedId === null || page.detail === null ? (
          "select an issue"
        ) : (
          <DetailPanel
            state={state}
            dispatch={dispatch}
            onRelated={onRelated}
            id={page.selectedId}
            detail={page.detail}
          />
        )}
      </div>
    </section>
  );
}

function DetailPanel({
  state,
  dispatch,
  onRelated,
  id,
  detail,
}: {
  state: IssuesState;
  dispatch: Send;
  onRelated: (hit: Hit, query: string) => void;
  id: number;
  detail: DetailState;
}) {
  const page = state.page;
  const user = page.user;
  const shownTitle = detail.issue ? displayTitle(state, id, detail.issue.title) : "";
  const comments = page.comments;
  const labels = page.labels;
  const shownLabels = labels ? labelsShown(labels) : [];
  const related = page.related;

  return (
    <>
      {detail.status === "loading" && <h2>{`loading #${id}`}</h2>}
      {detail.status === "ok" && detail.issue && (
        <>
          <h2>{`#${id} ${shownTitle}`}</h2>
          <p>{detail.issue.body}</p>
        </>
      )}
      {detail.status === "notfound" && <p>{`detail error: issue #${id} not found`}</p>}
      {detail.status === "error" && <p>{`detail error: ${detail.error ?? ""}`}</p>}
      <button type="button" data-testid="retry" onClick={() => retryIssue(dispatch, id)}>
        retry
      </button>

      <div>
        <button
          type="button"
          data-testid="assign"
          onClick={() => assignIssue(dispatch, id, user, "detail", page.selToken)}
        >
          {`assign to ${user}`}
        </button>
        {page.errors.assign && <p>{page.errors.assign}</p>}
      </div>

      <div>
        <input
          data-testid="title-input"
          value={page.titleInput}
          onChange={(e) => dispatch({ type: "setTitleInput", value: e.target.value })}
        />
        <button
          type="button"
          data-testid="rename"
          onClick={() => {
            const title = page.titleInput.trim();
            if (title) renameIssueTo(dispatch, id, title, page.selToken);
          }}
        >
          rename
        </button>
        {page.errors.rename && <p>{page.errors.rename}</p>}
      </div>

      <div>
        <button
          type="button"
          data-testid="close"
          onClick={() => closeIssueFrom(dispatch, id, "detail", page.selToken)}
        >
          close
        </button>
        {page.errors.close && <p>{page.errors.close}</p>}
      </div>

      {comments && (
        <div data-testid="comments">
          {comments.status === "loading" && <p>loading comments</p>}
          {comments.status === "error" && <p>{`comments error: ${comments.error ?? ""}`}</p>}
          <ul>
            {comments.entries.map((entry) => (
              <li key={entry.key} data-testid="comment">
                {`${entry.author}: ${entry.text}${entry.pending ? " (sending…)" : ""}`}
              </li>
            ))}
          </ul>
          <input
            data-testid="comment-input"
            value={page.commentInput}
            onChange={(e) => dispatch({ type: "setCommentInput", value: e.target.value })}
          />
          <button
            type="button"
            data-testid="post"
            onClick={() => {
              const text = page.commentInput.trim();
              if (text) postComment(dispatch, id, user, text);
            }}
          >
            post
          </button>
          {page.errors.post && <p>{page.errors.post}</p>}
        </div>
      )}

      {labels && (
        <div data-testid="labels">
          {labels.status === "loading" && <p>loading labels</p>}
          {labels.status === "error" && <p>{`labels error: ${labels.error ?? ""}`}</p>}
          <ul>
            {shownLabels.map((label) => (
              <li key={label}>
                <span data-testid="label">{label}</span>
                <button
                  type="button"
                  data-testid="remove-label"
                  onClick={() => removeLabelFrom(dispatch, id, label)}
                >
                  {`remove ${label}`}
                </button>
              </li>
            ))}
          </ul>
          <input
            data-testid="label-input"
            value={page.labelInput}
            onChange={(e) => dispatch({ type: "setLabelInput", value: e.target.value })}
          />
          <button
            type="button"
            data-testid="add-label"
            onClick={() => {
              const label = page.labelInput.trim();
              if (label && !shownLabels.includes(label)) addLabelTo(dispatch, id, label);
            }}
          >
            add label
          </button>
          {page.errors.label && <p>{page.errors.label}</p>}
        </div>
      )}

      {detail.status === "ok" && related && (
        <div data-testid="related">
          {related.status === "loading" && <p>finding related help</p>}
          {related.status === "error" && <p>{`related help failed: ${related.error ?? ""}`}</p>}
          {related.status === "ok" &&
            (related.hits.length === 0 ? (
              <p>no related help</p>
            ) : (
              <ul>
                {related.hits.slice(0, 3).map((hit) => (
                  <li key={hit.id}>
                    <button
                      type="button"
                      data-testid="related-hit"
                      onClick={() => onRelated(hit, related.query)}
                    >
                      {hit.name}
                    </button>
                  </li>
                ))}
              </ul>
            ))}
        </div>
      )}
    </>
  );
}
