import { useEffect, useRef, useState } from "react";
import { addComment, addLabel, fetchComments, fetchIssue, fetchLabels, removeLabel, search } from "./api.js";
import type { Comment, Hit, IssueDetail } from "./api.js";
import { errorMessage } from "./util";

export type IssueActions = {
  assign: (id: number, user: string, onFail: (message: string) => void) => void;
  rename: (id: number, title: string, onOk: (title: string) => void, onFail: (message: string) => void) => void;
  close: (id: number, onFail: (message: string) => void) => void;
};

type DetailState =
  | { attempt: number; status: "ok"; issue: IssueDetail }
  | { attempt: number; status: "missing" }
  | { attempt: number; status: "error"; message: string };

type Props = {
  id: number;
  user: string;
  pendingTitle: string | null;
  actions: IssueActions;
  onOpenRelated: (query: string, hit: Hit) => void;
};

export default function Detail({ id, user, pendingTitle, actions, onOpenRelated }: Props) {
  const [attempt, setAttempt] = useState(0);
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [titleInput, setTitleInput] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchIssue(id).then(
      issue => {
        if (!alive) return;
        setDetail(issue ? { attempt, status: "ok", issue } : { attempt, status: "missing" });
      },
      e => {
        if (alive) setDetail({ attempt, status: "error", message: errorMessage(e) });
      },
    );
    return () => {
      alive = false;
    };
  }, [id, attempt]);

  const current = detail !== null && detail.attempt === attempt ? detail : null;
  const who = user.trim();

  const onAssign = () => {
    if (!who) return;
    setAssignError(null);
    actions.assign(id, who, setAssignError);
  };

  const onRename = () => {
    const title = titleInput.trim();
    if (!title) return;
    setRenameError(null);
    actions.rename(
      id,
      title,
      saved =>
        setDetail(d => (d && d.status === "ok" ? { ...d, issue: { ...d.issue, title: saved } } : d)),
      m => setRenameError(`rename error: ${m}`),
    );
  };

  const onClose = () => {
    setCloseError(null);
    actions.close(id, m => setCloseError(`close error: ${m}`));
  };

  return (
    <article>
      {current === null ? (
        <p className="muted">loading #{id}</p>
      ) : current.status === "missing" ? (
        <p className="error">detail error: issue #{id} not found</p>
      ) : current.status === "error" ? (
        <p className="error">detail error: {current.message}</p>
      ) : (
        <>
          <h2>
            #{id} {pendingTitle ?? current.issue.title}
          </h2>
          <p>{current.issue.body}</p>
        </>
      )}
      <div className="inline">
        <button type="button" data-testid="retry" onClick={() => setAttempt(a => a + 1)}>
          retry
        </button>
        <button type="button" data-testid="assign" onClick={onAssign}>
          assign to {user}
        </button>
        <button type="button" data-testid="close" onClick={onClose}>
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
        className="inline"
        onSubmit={e => {
          e.preventDefault();
          onRename();
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
      {renameError !== null && (
        <p className="error" role="alert" data-testid="rename-error">
          {renameError}
        </p>
      )}
      <Comments id={id} user={who} />
      <Labels id={id} />
      {current?.status === "ok" && (
        <Related key={current.issue.title} title={current.issue.title} onOpen={onOpenRelated} />
      )}
    </article>
  );
}

type Pending = { seq: number; author: string; text: string };

function Comments({ id, user }: { id: number; user: string }) {
  const [loaded, setLoaded] = useState<
    { status: "loading" } | { status: "ok"; comments: Comment[] } | { status: "error"; message: string }
  >({ status: "loading" });
  const [posted, setPosted] = useState<Comment[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [input, setInput] = useState("");
  const [postError, setPostError] = useState<string | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    let alive = true;
    fetchComments(id).then(
      comments => {
        if (alive) setLoaded({ status: "ok", comments });
      },
      e => {
        if (alive) setLoaded({ status: "error", message: errorMessage(e) });
      },
    );
    return () => {
      alive = false;
    };
  }, [id]);

  const onPost = () => {
    const text = input.trim();
    if (!text || !user) return;
    const seq = ++seqRef.current;
    setPostError(null);
    setInput("");
    setPending(p => [...p, { seq, author: user, text }]);
    addComment(id, user, text).then(
      saved => {
        setPending(p => p.filter(x => x.seq !== seq));
        setPosted(c => [...c, saved]);
      },
      e => {
        setPending(p => p.filter(x => x.seq !== seq));
        setPostError(`post error: ${errorMessage(e)}`);
      },
    );
  };

  const rows: { key: string; text: string }[] = [];
  if (loaded.status === "ok") loaded.comments.forEach((c, i) => rows.push({ key: `c${i}`, text: `${c.author}: ${c.text}` }));
  posted.forEach((c, i) => rows.push({ key: `p${i}`, text: `${c.author}: ${c.text}` }));
  pending.forEach(c => rows.push({ key: `s${c.seq}`, text: `${c.author}: ${c.text} (sending…)` }));

  return (
    <section>
      <h3>Comments</h3>
      <div data-testid="comments">
        {loaded.status === "loading" && <p className="muted">loading comments</p>}
        {loaded.status === "error" && <p className="error">comments error: {loaded.message}</p>}
        {rows.length > 0 && (
          <ul>
            {rows.map(r => (
              <li key={r.key} data-testid="comment">
                {r.text}
              </li>
            ))}
          </ul>
        )}
      </div>
      <form
        className="inline"
        onSubmit={e => {
          e.preventDefault();
          onPost();
        }}
      >
        <input
          data-testid="comment-input"
          aria-label="Comment"
          placeholder="Add a comment"
          value={input}
          onChange={e => setInput(e.target.value)}
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

type LabelOp = { seq: number; kind: "add" | "remove"; label: string };

function applyLabelOps(labels: string[], ops: LabelOp[]): string[] {
  let out = labels;
  for (const op of ops) {
    if (op.kind === "add") {
      if (!out.includes(op.label)) out = [...out, op.label];
    } else out = out.filter(l => l !== op.label);
  }
  return out;
}

function Labels({ id }: { id: number }) {
  const [base, setBase] = useState<
    { status: "loading" } | { status: "ok"; labels: string[] } | { status: "error"; message: string }
  >({ status: "loading" });
  const [ops, setOps] = useState<LabelOp[]>([]);
  const [input, setInput] = useState("");
  const [labelError, setLabelError] = useState<string | null>(null);
  const seqRef = useRef(0);
  const confirmedRef = useRef(0);

  useEffect(() => {
    let alive = true;
    fetchLabels(id).then(
      labels => {
        // A change the server already answered is newer than this load.
        if (alive && confirmedRef.current === 0) setBase({ status: "ok", labels });
      },
      e => {
        if (alive && confirmedRef.current === 0) setBase({ status: "error", message: errorMessage(e) });
      },
    );
    return () => {
      alive = false;
    };
  }, [id]);

  const shown = base.status === "ok" ? applyLabelOps(base.labels, ops) : null;

  const change = (kind: "add" | "remove", label: string) => {
    const seq = ++seqRef.current;
    setLabelError(null);
    setOps(o => [...o, { seq, kind, label }]);
    (kind === "add" ? addLabel(id, label) : removeLabel(id, label)).then(
      labels => {
        setOps(o => o.filter(x => x.seq !== seq));
        if (seq > confirmedRef.current) {
          confirmedRef.current = seq;
          setBase({ status: "ok", labels });
        }
      },
      e => {
        setOps(o => o.filter(x => x.seq !== seq));
        setLabelError(`label error: ${errorMessage(e)}`);
      },
    );
  };

  const onAdd = () => {
    const label = input.trim();
    if (!label) return;
    if (shown?.includes(label)) return;
    setInput("");
    change("add", label);
  };

  return (
    <section>
      <h3>Labels</h3>
      <div data-testid="labels">
        {base.status === "loading" && <p className="muted">loading labels</p>}
        {base.status === "error" && <p className="error">labels error: {base.message}</p>}
        {shown && (
          <ul className="labels">
            {shown.map(l => (
              <li key={l}>
                <span data-testid="label">{l}</span>
                <button type="button" data-testid="remove-label" onClick={() => change("remove", l)}>
                  remove {l}
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
          onAdd();
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

function Related({ title, onOpen }: { title: string; onOpen: (query: string, hit: Hit) => void }) {
  const [state, setState] = useState<
    { status: "loading" } | { status: "ok"; hits: Hit[] } | { status: "error"; message: string }
  >({ status: "loading" });

  useEffect(() => {
    let alive = true;
    search(title).then(
      hits => {
        if (alive) setState({ status: "ok", hits });
      },
      e => {
        if (alive) setState({ status: "error", message: errorMessage(e) });
      },
    );
    return () => {
      alive = false;
    };
  }, [title]);

  return (
    <section>
      <h3>Related help</h3>
      <div data-testid="related">
        {state.status === "loading" && <p className="muted">finding related help</p>}
        {state.status === "error" && <p className="error">related help failed: {state.message}</p>}
        {state.status === "ok" &&
          (state.hits.length === 0 ? (
            <p className="muted">no related help</p>
          ) : (
            <div className="inline">
              {state.hits.slice(0, 3).map(h => (
                <button key={h.id} type="button" data-testid="related-hit" onClick={() => onOpen(title, h)}>
                  {h.name}
                </button>
              ))}
            </div>
          ))}
      </div>
    </section>
  );
}
