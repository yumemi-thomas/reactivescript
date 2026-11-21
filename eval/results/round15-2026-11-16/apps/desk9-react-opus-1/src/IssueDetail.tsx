import { useCallback, useState } from "react";
import {
  addComment,
  addLabel,
  fetchComments,
  fetchIssue,
  fetchLabels,
  removeLabel,
  search,
} from "./api.js";
import { errMsg, nextSeq, useRequest } from "./util";
import type { HelpSeed } from "./HelpPage";

type Props = {
  id: number;
  user: string;
  pendingTitle: string | undefined;
  onAssign: (id: number, user: string) => Promise<void>;
  onRename: (id: number, title: string) => Promise<void>;
  onClose: (id: number) => Promise<void>;
  onOpenHelp: (seed: HelpSeed) => void;
};

type Post = { seq: number; author: string; text: string; sent: boolean };
type LabelOp = { seq: number; kind: "add" | "remove"; label: string };

export default function IssueDetail({ id, user, pendingTitle, onAssign, onRename, onClose, onOpenHelp }: Props) {
  // --- the issue itself
  const [attempt, setAttempt] = useState(0);
  const loadIssue = useCallback(() => fetchIssue(id), [id]);
  const issue = useRequest(`issue:${id}:${attempt}`, loadIssue);
  const [renamed, setRenamed] = useState<{ attempt: number; title: string } | null>(null);

  const [assignError, setAssignError] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [titleInput, setTitleInput] = useState("");

  const loaded = issue.status === "ok" && issue.data !== null ? issue.data : null;
  const heading = loaded
    ? (pendingTitle ?? (renamed && renamed.attempt === attempt ? renamed.title : loaded.title))
    : null;

  function startAssign() {
    setAssignError(null);
    onAssign(id, user).catch((e: unknown) => setAssignError(errMsg(e)));
  }

  function startRename() {
    const title = titleInput.trim();
    if (title === "") return;
    setRenameError(null);
    const at = attempt;
    onRename(id, title).then(
      () => setRenamed({ attempt: at, title }),
      (e: unknown) => setRenameError(`rename error: ${errMsg(e)}`),
    );
  }

  function startClose() {
    setCloseError(null);
    onClose(id).catch((e: unknown) => setCloseError(`close error: ${errMsg(e)}`));
  }

  // --- comments
  const loadComments = useCallback(() => fetchComments(id), [id]);
  const comments = useRequest(`comments:${id}`, loadComments);
  const [posts, setPosts] = useState<Post[]>([]);
  const [commentInput, setCommentInput] = useState("");
  const [postError, setPostError] = useState<string | null>(null);

  function startPost() {
    const text = commentInput.trim();
    if (text === "") return;
    const post: Post = { seq: nextSeq(), author: user, text, sent: false };
    setPostError(null);
    setCommentInput("");
    setPosts(p => [...p, post]);
    addComment(id, post.author, post.text).then(
      () => setPosts(p => p.map(x => (x.seq === post.seq ? { ...x, sent: true } : x))),
      (e: unknown) => {
        setPosts(p => p.filter(x => x.seq !== post.seq));
        setPostError(`post error: ${errMsg(e)}`);
      },
    );
  }

  // --- labels
  const loadLabels = useCallback(() => fetchLabels(id), [id]);
  const labelsReq = useRequest(`labels:${id}`, loadLabels);
  const [serverLabels, setServerLabels] = useState<{ seq: number; labels: string[] } | null>(null);
  const [labelOps, setLabelOps] = useState<LabelOp[]>([]);
  const [labelInput, setLabelInput] = useState("");
  const [labelError, setLabelError] = useState<string | null>(null);

  let labels: string[] | null = null;
  if (labelsReq.status === "ok") {
    labels = serverLabels ? serverLabels.labels : labelsReq.data;
    for (const op of labelOps) {
      if (op.kind === "add") {
        if (!labels.includes(op.label)) labels = [...labels, op.label];
      } else {
        labels = labels.filter(l => l !== op.label);
      }
    }
  }

  function changeLabel(kind: LabelOp["kind"], label: string) {
    const op: LabelOp = { seq: nextSeq(), kind, label };
    setLabelError(null);
    setLabelOps(o => [...o, op]);
    const drop = () => setLabelOps(o => o.filter(x => x.seq !== op.seq));
    (kind === "add" ? addLabel(id, label) : removeLabel(id, label)).then(
      answer => {
        setServerLabels(s => (s === null || s.seq < op.seq ? { seq: op.seq, labels: answer } : s));
        drop();
      },
      (e: unknown) => {
        drop();
        setLabelError(`label error: ${errMsg(e)}`);
      },
    );
  }

  function startAddLabel() {
    const label = labelInput.trim();
    if (label === "" || labels === null) return;
    if (labels.includes(label)) return;
    setLabelInput("");
    changeLabel("add", label);
  }

  // --- related help
  const relatedTitle = loaded ? loaded.title : null;
  const findRelated = useCallback(() => search(relatedTitle ?? ""), [relatedTitle]);
  const related = useRequest(relatedTitle === null ? null : `related:${relatedTitle}`, findRelated);

  return (
    <article>
      {issue.status === "loading" && <p>{`loading #${id}`}</p>}
      {issue.status === "error" && <p className="error">{`detail error: ${issue.error}`}</p>}
      {issue.status === "ok" && issue.data === null && <p className="error">{`detail error: issue #${id} not found`}</p>}
      {loaded && heading !== null && (
        <>
          <h2>{`#${loaded.id} ${heading}`}</h2>
          <p className="body">{loaded.body}</p>
        </>
      )}
      <div className="actions">
        <button type="button" data-testid="retry" onClick={() => setAttempt(a => a + 1)}>
          retry
        </button>
        <button type="button" data-testid="assign" onClick={startAssign}>
          {`assign to ${user}`}
        </button>
        <button type="button" data-testid="close" onClick={startClose}>
          close
        </button>
      </div>
      {assignError !== null && (
        <p className="error" role="alert" data-testid="assign-error">
          {assignError}
        </p>
      )}
      {closeError !== null && (
        <p className="error" role="alert" data-testid="close-error">
          {closeError}
        </p>
      )}
      <form
        className="rename"
        onSubmit={e => {
          e.preventDefault();
          startRename();
        }}
      >
        <input
          data-testid="title-input"
          aria-label="New title"
          value={titleInput}
          onChange={e => setTitleInput(e.target.value)}
        />
        <button type="submit" data-testid="rename">
          rename
        </button>
      </form>
      {renameError !== null && (
        <p className="error" role="alert" data-testid="rename-error">
          {renameError}
        </p>
      )}

      {loaded && (
        <div data-testid="related" className="related">
          {related.status === "loading" && <p>finding related help</p>}
          {related.status === "error" && <p className="error">{`related help failed: ${related.error}`}</p>}
          {related.status === "ok" &&
            (related.data.length === 0 ? (
              <p>no related help</p>
            ) : (
              <ul>
                {related.data.slice(0, 3).map(h => (
                  <li key={h.id}>
                    <button
                      type="button"
                      data-testid="related-hit"
                      onClick={() => onOpenHelp({ q: loaded.title, hits: related.data, selected: h.id })}
                    >
                      {h.name}
                    </button>
                  </li>
                ))}
              </ul>
            ))}
        </div>
      )}

      <div data-testid="labels" className="labels">
        {labelsReq.status === "loading" && <p>loading labels</p>}
        {labelsReq.status === "error" && <p className="error">{`labels error: ${labelsReq.error}`}</p>}
        {labels !== null && (
          <ul>
            {labels.map(l => (
              <li key={l}>
                <span data-testid="label">{l}</span>{" "}
                <button type="button" data-testid="remove-label" onClick={() => changeLabel("remove", l)}>
                  {`remove ${l}`}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <form
        className="add-label"
        onSubmit={e => {
          e.preventDefault();
          startAddLabel();
        }}
      >
        <input
          data-testid="label-input"
          aria-label="Label"
          value={labelInput}
          onChange={e => setLabelInput(e.target.value)}
        />
        <button type="submit" data-testid="add-label">
          add label
        </button>
      </form>
      {labelError !== null && (
        <p className="error" role="alert" data-testid="label-error">
          {labelError}
        </p>
      )}

      <div data-testid="comments" className="comments">
        {comments.status === "loading" && <p>loading comments</p>}
        {comments.status === "error" && <p className="error">{`comments error: ${comments.error}`}</p>}
        <ul>
          {comments.status === "ok" &&
            comments.data.map((c, n) => <li key={`c${n}`} data-testid="comment">{`${c.author}: ${c.text}`}</li>)}
          {posts.map(p => (
            <li key={`p${p.seq}`} data-testid="comment">
              {p.sent ? `${p.author}: ${p.text}` : `${p.author}: ${p.text} (sending…)`}
            </li>
          ))}
        </ul>
      </div>
      <form
        className="post"
        onSubmit={e => {
          e.preventDefault();
          startPost();
        }}
      >
        <input
          data-testid="comment-input"
          aria-label="Comment"
          value={commentInput}
          onChange={e => setCommentInput(e.target.value)}
        />
        <button type="submit" data-testid="post">
          post
        </button>
      </form>
      {postError !== null && (
        <p className="error" role="alert" data-testid="post-error">
          {postError}
        </p>
      )}
    </article>
  );
}
