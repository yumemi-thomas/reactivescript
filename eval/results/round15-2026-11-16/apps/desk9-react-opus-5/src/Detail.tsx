import { useState } from "react";
import * as api from "./api.js";
import type { Hit } from "./api.js";
import { Comments } from "./Comments";
import type { IssueActions } from "./IssuesPage";
import { applyTitle, type Op } from "./issuesStore";
import { Labels } from "./Labels";
import { useFetch } from "./useFetch";

export function Detail({
  id,
  user,
  ops,
  actions,
  onOpenRelated,
}: {
  id: number;
  user: string;
  ops: Op[];
  actions: IssueActions;
  onOpenRelated: (query: string, hits: Hit[], hit: Hit) => void;
}) {
  const [nonce, setNonce] = useState(0);
  const load = useFetch(api.fetchIssue, [id], nonce);
  const [titleInput, setTitleInput] = useState("");
  const [assignError, setAssignError] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);

  const issue = load?.status === "ok" ? load.data : null;
  const heading = load?.status === "ok" && issue ? applyTitle(id, issue.title, ops, load.startedAt, true) : null;
  const relatedQuery =
    load?.status === "ok" && issue ? applyTitle(id, issue.title, ops, load.startedAt, false) : null;
  const related = useFetch(api.search, relatedQuery === null ? null : [relatedQuery]);

  const who = user.trim();

  function doAssign() {
    if (who === "") return;
    setAssignError(null);
    actions.assign(id, who, m => setAssignError(m));
  }

  function doRename() {
    const title = titleInput.trim();
    if (title === "") return;
    setRenameError(null);
    actions.rename(id, title, m => setRenameError(`rename error: ${m}`));
  }

  function doClose() {
    setCloseError(null);
    actions.close(id, m => setCloseError(`close error: ${m}`));
  }

  return (
    <div>
      {load?.status === "loading" && <p className="muted">loading #{id}</p>}
      {load?.status === "error" && <p className="error">detail error: {load.error}</p>}
      {load?.status === "ok" && issue === null && <p className="error">detail error: issue #{id} not found</p>}
      {heading !== null && issue !== null && (
        <>
          <h2>{`#${id} ${heading}`}</h2>
          <p>{issue.body}</p>
        </>
      )}
      <div className="row">
        <button data-testid="retry" onClick={() => setNonce(n => n + 1)}>
          retry
        </button>
        <button data-testid="assign" onClick={doAssign}>
          {`assign to ${user}`}
        </button>
        <button data-testid="close" onClick={doClose}>
          close
        </button>
      </div>
      <form
        className="field"
        onSubmit={e => {
          e.preventDefault();
          doRename();
        }}
      >
        <input
          data-testid="title-input"
          aria-label="New title"
          placeholder="New title"
          value={titleInput}
          onChange={e => setTitleInput(e.target.value)}
        />
        <button type="submit" data-testid="rename">
          rename
        </button>
      </form>
      {assignError !== null && <p className="error" role="alert">{assignError}</p>}
      {renameError !== null && <p className="error" role="alert">{renameError}</p>}
      {closeError !== null && <p className="error" role="alert">{closeError}</p>}
      {relatedQuery !== null && related !== null && (
        <section data-testid="related">
          <h3>Related help</h3>
          {related.status === "loading" && <p className="muted">finding related help</p>}
          {related.status === "error" && <p className="error">related help failed: {related.error}</p>}
          {related.status === "ok" &&
            (related.data.length === 0 ? (
              <p className="muted">no related help</p>
            ) : (
              <div className="row">
                {related.data.slice(0, 3).map(hit => (
                  <button
                    key={hit.id}
                    data-testid="related-hit"
                    onClick={() => onOpenRelated(relatedQuery, related.data, hit)}
                  >
                    {hit.name}
                  </button>
                ))}
              </div>
            ))}
        </section>
      )}
      <Comments id={id} user={user} />
      <Labels id={id} />
    </div>
  );
}
