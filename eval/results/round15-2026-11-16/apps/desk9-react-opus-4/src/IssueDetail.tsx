import { useEffect, useState } from "react";
import { addComment, addLabel, fetchComments, fetchIssue, fetchLabels, removeLabel, search } from "./api";
import type { Comment, Hit, IssueDetail as Detail } from "./api";
import { overlay, titleWithOps } from "./issueOps";
import type { ConfirmedOp, IssueOp, RunOp } from "./issueOps";
import type { OpenHelp } from "./IssuesPage";
import { errMsg, nextSeq } from "./util";

type DetailState =
  | { attempt: number; startedAt: number; status: "ok"; data: Detail | null }
  | { attempt: number; startedAt: number; status: "error"; error: string };

type Props = {
  id: number;
  user: string;
  pending: IssueOp[];
  confirmed: ConfirmedOp[];
  runOp: RunOp;
  closing: boolean;
  onOpenHelp: OpenHelp;
};

export default function IssueDetail({ id, user, pending, confirmed, runOp, closing, onOpenHelp }: Props) {
  const [attempt, setAttempt] = useState(0);
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [titleInput, setTitleInput] = useState("");
  const [assignError, setAssignError] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const startedAt = nextSeq();
    fetchIssue(id).then(
      data => {
        if (live) setDetail({ attempt, startedAt, status: "ok", data });
      },
      (e: unknown) => {
        if (live) setDetail({ attempt, startedAt, status: "error", error: errMsg(e) });
      },
    );
    return () => {
      live = false;
    };
  }, [id, attempt]);

  const loading = detail === null || detail.attempt !== attempt;
  const issue = detail?.status === "ok" ? detail.data : null;
  const shownIssue = !loading && issue ? issue : null;
  const heading =
    shownIssue && detail ? titleWithOps(id, shownIssue.title, overlay(pending, confirmed, detail.startedAt)) : null;
  const canAct = user.trim() !== "";

  function doAssign() {
    setAssignError(null);
    runOp({ seq: nextSeq(), id, kind: "assign", user }).catch((e: unknown) => setAssignError(errMsg(e)));
  }

  function doRename() {
    const title = titleInput.trim();
    if (!title) return;
    setRenameError(null);
    runOp({ seq: nextSeq(), id, kind: "rename", title }).catch((e: unknown) =>
      setRenameError(`rename error: ${errMsg(e)}`),
    );
  }

  function doClose() {
    setCloseError(null);
    runOp({ seq: nextSeq(), id, kind: "close" }).catch((e: unknown) => setCloseError(`close error: ${errMsg(e)}`));
  }

  return (
    <article>
      {loading || detail === null ? (
        <p className="muted">{`loading #${id}`}</p>
      ) : detail.status === "error" ? (
        <p className="error" role="alert">{`detail error: ${detail.error}`}</p>
      ) : shownIssue === null ? (
        <p className="error" role="alert">{`detail error: issue #${id} not found`}</p>
      ) : (
        <>
          <h2>{`#${id} ${heading}`}</h2>
          <p className="body">{shownIssue.body}</p>
        </>
      )}
      <div className="actions">
        <button type="button" data-testid="retry" onClick={() => setAttempt(a => a + 1)}>
          retry
        </button>
        <button type="button" data-testid="assign" disabled={!canAct} onClick={doAssign}>
          {`assign to ${user}`}
        </button>
        <button type="button" data-testid="close" disabled={closing} onClick={doClose}>
          close
        </button>
      </div>
      <form
        className="inline"
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
      {assignError !== null && (
        <p className="error" role="alert" data-testid="assign-error">
          {assignError}
        </p>
      )}
      {renameError !== null && (
        <p className="error" role="alert" data-testid="rename-error">
          {renameError}
        </p>
      )}
      {closeError !== null && (
        <p className="error" role="alert" data-testid="close-error">
          {closeError}
        </p>
      )}
      <Comments id={id} user={user} />
      <Labels id={id} />
      {shownIssue && <Related title={shownIssue.title} onOpen={(hits, hit) => onOpenHelp(shownIssue.title, hits, hit)} />}
    </article>
  );
}

type CommentsState = { status: "ok"; comments: Comment[] } | { status: "error"; error: string };
type PendingComment = { seq: number; author: string; text: string };

function Comments({ id, user }: { id: number; user: string }) {
  const [loaded, setLoaded] = useState<CommentsState | null>(null);
  const [added, setAdded] = useState<{ seq: number; comment: Comment }[]>([]);
  const [sending, setSending] = useState<PendingComment[]>([]);
  const [text, setText] = useState("");
  const [postError, setPostError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchComments(id).then(
      comments => {
        if (live) setLoaded({ status: "ok", comments });
      },
      (e: unknown) => {
        if (live) setLoaded({ status: "error", error: errMsg(e) });
      },
    );
    return () => {
      live = false;
    };
  }, [id]);

  function post() {
    const body = text.trim();
    if (!body || user.trim() === "") return;
    const seq = nextSeq();
    const author = user;
    setPostError(null);
    setText("");
    setSending(s => [...s, { seq, author, text: body }]);
    addComment(id, author, body).then(
      comment => {
        setAdded(a => [...a, { seq, comment }]);
        setSending(s => s.filter(c => c.seq !== seq));
      },
      (e: unknown) => {
        setSending(s => s.filter(c => c.seq !== seq));
        setPostError(`post error: ${errMsg(e)}`);
      },
    );
  }

  return (
    <section className="comments" aria-label="Comments">
      <h3>Comments</h3>
      <div data-testid="comments">
        {loaded === null && <p className="muted">loading comments</p>}
        {loaded?.status === "error" && <p className="error" role="alert">{`comments error: ${loaded.error}`}</p>}
        <ul>
          {loaded?.status === "ok" &&
            loaded.comments.map((c, i) => <li key={`c${i}`} data-testid="comment">{`${c.author}: ${c.text}`}</li>)}
          {added.map(a => (
            <li key={`a${a.seq}`} data-testid="comment">{`${a.comment.author}: ${a.comment.text}`}</li>
          ))}
          {sending.map(c => (
            <li key={`s${c.seq}`} data-testid="comment" className="muted">{`${c.author}: ${c.text} (sending…)`}</li>
          ))}
        </ul>
      </div>
      <form
        className="inline"
        onSubmit={e => {
          e.preventDefault();
          post();
        }}
      >
        <input
          data-testid="comment-input"
          aria-label="Comment"
          placeholder="Write a comment"
          value={text}
          onChange={e => setText(e.target.value)}
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
    </section>
  );
}

type LabelsState = { status: "ok"; seq: number; labels: string[] } | { status: "error"; error: string };
type LabelOp = { seq: number; kind: "add" | "remove"; label: string };

function Labels({ id }: { id: number }) {
  const [base, setBase] = useState<LabelsState | null>(null);
  const [ops, setOps] = useState<LabelOp[]>([]);
  const [input, setInput] = useState("");
  const [labelError, setLabelError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const seq = nextSeq();
    fetchLabels(id).then(
      labels => {
        if (!live) return;
        // an answer to a label change sent after this fetch began is newer than it
        setBase(b => (b?.status === "ok" && b.seq > seq ? b : { status: "ok", seq, labels }));
      },
      (e: unknown) => {
        if (!live) return;
        setBase(b => (b?.status === "ok" ? b : { status: "error", error: errMsg(e) }));
      },
    );
    return () => {
      live = false;
    };
  }, [id]);

  let labels = base?.status === "ok" ? base.labels : [];
  for (const op of ops) {
    if (op.kind === "add") {
      if (!labels.includes(op.label)) labels = [...labels, op.label];
    } else {
      labels = labels.filter(l => l !== op.label);
    }
  }

  function change(kind: LabelOp["kind"], label: string) {
    const seq = nextSeq();
    setLabelError(null);
    setOps(o => [...o, { seq, kind, label }]);
    const call = kind === "add" ? addLabel(id, label) : removeLabel(id, label);
    call.then(
      answer => {
        setBase(b => (b?.status === "ok" && b.seq > seq ? b : { status: "ok", seq, labels: answer }));
        setOps(o => o.filter(x => x.seq !== seq));
      },
      (e: unknown) => {
        setOps(o => o.filter(x => x.seq !== seq));
        setLabelError(`label error: ${errMsg(e)}`);
      },
    );
  }

  function add() {
    const label = input.trim();
    if (!label || labels.includes(label)) return;
    setInput("");
    change("add", label);
  }

  return (
    <section className="labels" aria-label="Labels">
      <h3>Labels</h3>
      <div data-testid="labels">
        {base === null && <p className="muted">loading labels</p>}
        {base?.status === "error" && <p className="error" role="alert">{`labels error: ${base.error}`}</p>}
        {(base?.status === "ok" || labels.length > 0) && (
          <ul className="chips">
            {labels.map(l => (
              <li key={l}>
                <span data-testid="label">{l}</span>
                <button type="button" data-testid="remove-label" onClick={() => change("remove", l)}>
                  {`remove ${l}`}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <form
        className="inline"
        onSubmit={e => {
          e.preventDefault();
          add();
        }}
      >
        <input
          data-testid="label-input"
          aria-label="Label"
          placeholder="Add a label"
          value={input}
          onChange={e => setInput(e.target.value)}
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
    </section>
  );
}

type RelatedState =
  | { title: string; status: "ok"; hits: Hit[] }
  | { title: string; status: "error"; error: string };

function Related({ title, onOpen }: { title: string; onOpen: (hits: Hit[], hit: Hit) => void }) {
  const [state, setState] = useState<RelatedState | null>(null);

  useEffect(() => {
    let live = true;
    search(title).then(
      hits => {
        if (live) setState({ title, status: "ok", hits });
      },
      (e: unknown) => {
        if (live) setState({ title, status: "error", error: errMsg(e) });
      },
    );
    return () => {
      live = false;
    };
  }, [title]);

  const current = state?.title === title ? state : null;

  return (
    <section className="related" aria-label="Related help">
      <h3>Related help</h3>
      <div data-testid="related">
        {current === null ? (
          <p className="muted">finding related help</p>
        ) : current.status === "error" ? (
          <p className="error">{`related help failed: ${current.error}`}</p>
        ) : current.hits.length === 0 ? (
          <p className="muted">no related help</p>
        ) : (
          <ul>
            {current.hits.slice(0, 3).map(h => (
              <li key={h.id}>
                <button type="button" data-testid="related-hit" onClick={() => onOpen(current.hits, h)}>
                  {h.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
