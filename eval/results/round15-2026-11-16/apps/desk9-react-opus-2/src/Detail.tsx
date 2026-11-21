import { useRef, useState } from "react";
import * as api from "./api";
import { fetchComments, fetchIssue, fetchLabels, search } from "./api";
import type { HelpSeed } from "./HelpPage";
import { resolveField, type IssueActions, type IssuesState } from "./store";
import { errorMessage, nextSeq, useAsync } from "./util";

type Props = {
  id: number;
  user: string;
  store: IssuesState;
  actions: IssueActions;
  onOpenHelp: (seed: HelpSeed) => void;
};

type Post = { seq: number; author: string; text: string; sending: boolean };
type LabelOp = { seq: number; kind: "add" | "remove"; label: string };

function applyLabelOps(labels: string[], ops: LabelOp[]): string[] {
  let out = labels;
  for (const op of ops) {
    if (op.kind === "add") {
      if (!out.includes(op.label)) out = [...out, op.label];
    } else {
      out = out.filter(l => l !== op.label);
    }
  }
  return out;
}

export function Detail({ id, user, store, actions, onOpenHelp }: Props) {
  const who = user.trim();
  const [retryNonce, setRetryNonce] = useState(0);
  const issue = useAsync(fetchIssue, id, retryNonce);
  const comments = useAsync(fetchComments, id);
  const labelsBase = useAsync(fetchLabels, id);

  const loaded = issue.status === "ok" && issue.data !== null ? issue.data : null;
  const issueSeq = issue.status === "ok" ? issue.seq : 0;
  const title = loaded ? resolveField(store, id, "title", loaded.title, issueSeq) : null;
  // Related help follows the issue's title as the server has it, not a rename still in flight.
  const serverTitle = loaded ? resolveField(store, id, "title", loaded.title, issueSeq, false) : null;
  const related = useAsync(search, serverTitle);

  // Detail errors, one per kind of action. For assign, rename and close only the latest attempt counts.
  const [assignError, setAssignError] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [postError, setPostError] = useState<string | null>(null);
  const [labelError, setLabelError] = useState<string | null>(null);
  const latest = useRef({ assign: 0, rename: 0, close: 0 });

  const [titleInput, setTitleInput] = useState("");
  const [commentInput, setCommentInput] = useState("");
  const [labelInput, setLabelInput] = useState("");

  const [posts, setPosts] = useState<Post[]>([]);
  const [labelOps, setLabelOps] = useState<LabelOp[]>([]);
  const [labelsConfirmed, setLabelsConfirmed] = useState<{ opSeq: number; labels: string[] } | null>(null);

  const labels =
    labelsBase.status === "ok" ? applyLabelOps(labelsConfirmed?.labels ?? labelsBase.data, labelOps) : null;

  async function doAssign() {
    if (!who) return;
    const t = ++latest.current.assign;
    setAssignError(null);
    const err = await actions.assign(id, who);
    if (t === latest.current.assign && err !== null) setAssignError(err);
  }

  async function doRename() {
    const next = titleInput.trim();
    if (!next) return;
    const t = ++latest.current.rename;
    setRenameError(null);
    const err = await actions.rename(id, next);
    if (t === latest.current.rename && err !== null) setRenameError(err);
  }

  async function doClose() {
    const t = ++latest.current.close;
    setCloseError(null);
    const err = await actions.close(id);
    if (t === latest.current.close && err !== null) setCloseError(err);
  }

  function doPost() {
    const text = commentInput.trim();
    if (!text || !who) return;
    const seq = nextSeq();
    setPosts(p => [...p, { seq, author: who, text, sending: true }]);
    setCommentInput("");
    setPostError(null);
    api.addComment(id, who, text).then(
      c => setPosts(p => p.map(x => (x.seq === seq ? { seq, author: c.author, text: c.text, sending: false } : x))),
      (e: unknown) => {
        setPosts(p => p.filter(x => x.seq !== seq));
        setPostError(errorMessage(e));
      },
    );
  }

  function changeLabel(kind: "add" | "remove", label: string) {
    const seq = nextSeq();
    setLabelOps(ops => [...ops, { seq, kind, label }]);
    setLabelError(null);
    const call = kind === "add" ? api.addLabel(id, label) : api.removeLabel(id, label);
    call.then(
      answer => {
        setLabelOps(ops => ops.filter(op => op.seq !== seq));
        setLabelsConfirmed(c => (c === null || seq > c.opSeq ? { opSeq: seq, labels: answer } : c));
      },
      (e: unknown) => {
        setLabelOps(ops => ops.filter(op => op.seq !== seq));
        setLabelError(errorMessage(e));
      },
    );
  }

  function doAddLabel() {
    const label = labelInput.trim();
    if (!label || labels === null || labels.includes(label)) return;
    setLabelInput("");
    changeLabel("add", label);
  }

  return (
    <div className="detail-body">
      <div className="heading" aria-live="polite">
        {issue.status === "loading" && <p className="muted">loading #{id}</p>}
        {issue.status === "error" && (
          <p className="error" role="alert">
            detail error: {issue.message}
          </p>
        )}
        {issue.status === "ok" && issue.data === null && (
          <p className="error" role="alert">{`detail error: issue #${id} not found`}</p>
        )}
        {loaded && title !== null && (
          <>
            <h2>{`#${id} ${title}`}</h2>
            <p className="body">{loaded.body}</p>
          </>
        )}
        <button type="button" data-testid="retry" onClick={() => setRetryNonce(n => n + 1)}>
          retry
        </button>
      </div>

      <div className="actions">
        <div className="action">
          <button type="button" data-testid="assign" disabled={!who} onClick={() => void doAssign()}>
            {`assign to ${user}`}
          </button>
          {assignError !== null && (
            <span className="error" role="alert">
              {assignError}
            </span>
          )}
        </div>
        <form
          className="action"
          onSubmit={e => {
            e.preventDefault();
            void doRename();
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
          {renameError !== null && (
            <span className="error" role="alert">
              rename error: {renameError}
            </span>
          )}
        </form>
        <div className="action">
          <button type="button" data-testid="close" onClick={() => void doClose()}>
            close
          </button>
          {closeError !== null && (
            <span className="error" role="alert">
              close error: {closeError}
            </span>
          )}
        </div>
      </div>

      {loaded && (
        <section className="related" data-testid="related" aria-label="Related help">
          <h3>Related help</h3>
          {related.status === "loading" && <p className="muted">finding related help</p>}
          {related.status === "error" && <p className="error">related help failed: {related.message}</p>}
          {related.status === "ok" && related.data.length === 0 && <p className="muted">no related help</p>}
          {related.status === "ok" && related.data.length > 0 && (
            <div className="chips">
              {related.data.slice(0, 3).map(hit => (
                <button
                  key={hit.id}
                  type="button"
                  data-testid="related-hit"
                  onClick={() =>
                    onOpenHelp({ query: serverTitle ?? "", hits: related.data, selectedId: hit.id })
                  }
                >
                  {hit.name}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <section aria-label="Comments">
        <h3>Comments</h3>
        <div data-testid="comments">
          {comments.status === "loading" && <p className="muted">loading comments</p>}
          {comments.status === "error" && <p className="error">comments error: {comments.message}</p>}
          <ul>
            {comments.status === "ok" &&
              comments.data.map((c, i) => <li key={`c${i}`} data-testid="comment">{`${c.author}: ${c.text}`}</li>)}
            {posts.map(p => (
              <li key={`p${p.seq}`} data-testid="comment" className={p.sending ? "muted" : undefined}>
                {`${p.author}: ${p.text}${p.sending ? " (sending…)" : ""}`}
              </li>
            ))}
          </ul>
        </div>
        <form
          className="action"
          onSubmit={e => {
            e.preventDefault();
            doPost();
          }}
        >
          <input
            data-testid="comment-input"
            aria-label="Comment"
            placeholder="Add a comment"
            value={commentInput}
            onChange={e => setCommentInput(e.target.value)}
          />
          <button type="submit" data-testid="post">
            post
          </button>
          {postError !== null && (
            <span className="error" role="alert">
              post error: {postError}
            </span>
          )}
        </form>
      </section>

      <section aria-label="Labels">
        <h3>Labels</h3>
        <div data-testid="labels">
          {labelsBase.status === "loading" && <p className="muted">loading labels</p>}
          {labelsBase.status === "error" && <p className="error">labels error: {labelsBase.message}</p>}
          {labels !== null && (
            <ul className="chips">
              {labels.map(label => (
                <li key={label} className="chip">
                  <span data-testid="label">{label}</span>
                  <button type="button" data-testid="remove-label" onClick={() => changeLabel("remove", label)}>
                    {`remove ${label}`}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <form
          className="action"
          onSubmit={e => {
            e.preventDefault();
            doAddLabel();
          }}
        >
          <input
            data-testid="label-input"
            aria-label="Label"
            placeholder="Add a label"
            value={labelInput}
            onChange={e => setLabelInput(e.target.value)}
          />
          <button type="submit" data-testid="add-label">
            add label
          </button>
          {labelError !== null && (
            <span className="error" role="alert">
              label error: {labelError}
            </span>
          )}
        </form>
      </section>
    </div>
  );
}
