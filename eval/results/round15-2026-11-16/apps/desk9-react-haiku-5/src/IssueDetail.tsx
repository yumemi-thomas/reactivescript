import { useCallback, useEffect, useRef, useState } from "react";
import { addComment, addLabel, fetchComments, fetchIssue, fetchLabels, removeLabel, search } from "./api.js";
import type { Comment, Hit, IssueDetail as IssueData } from "./api.js";
import { errorMessage, type Load } from "./load";

export type Ops = {
  assign: (id: number, user: string) => Promise<string | null>;
  rename: (id: number, title: string) => Promise<string | null>;
  close: (id: number) => Promise<string | null>;
};

type Props = {
  id: number;
  user: string;
  titleOverride: string | undefined;
  ops: Ops;
  onOpenHelp: (query: string, hitId: number) => void;
};

// Mounted with `key={id}`, so selecting another issue starts it afresh.
export default function IssueDetail({ id, user, titleOverride, ops, onOpenHelp }: Props) {
  const [load, setLoad] = useState<Load<IssueData | null>>({ status: "loading" });
  const [titleDraft, setTitleDraft] = useState("");
  const [assignError, setAssignError] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);
  const token = useRef(0);

  const request = useCallback(() => {
    const mine = ++token.current;
    fetchIssue(id).then(
      (value) => {
        if (mine === token.current) setLoad({ status: "ok", value });
      },
      (e: unknown) => {
        if (mine === token.current) setLoad({ status: "error", message: errorMessage(e) });
      },
    );
  }, [id]);

  useEffect(() => {
    request();
  }, [request]);

  function retry() {
    setLoad({ status: "loading" });
    request();
  }

  async function onAssign() {
    setAssignError(null);
    setAssignError(await ops.assign(id, user));
  }

  async function onRename() {
    const title = titleDraft.trim();
    if (title === "") return;
    setRenameError(null);
    setRenameError(await ops.rename(id, title));
  }

  async function onClose() {
    setCloseError(null);
    setCloseError(await ops.close(id));
  }

  const current = load.status === "ok" ? load.value : null;
  const shownTitle = titleOverride ?? current?.title ?? "";

  return (
    <div className="issue-detail">
      {load.status === "loading" && <p>loading #{id}</p>}
      {load.status === "error" && <p role="alert">detail error: {load.message}</p>}
      {load.status === "ok" && load.value === null && (
        <p role="alert">detail error: issue #{id} not found</p>
      )}
      {current !== null && (
        <article>
          <h2>
            #{id} {shownTitle}
          </h2>
          <p>{current.body}</p>
        </article>
      )}
      <button data-testid="retry" onClick={retry}>
        retry
      </button>

      <div className="actions">
        <div>
          <label>
            New title{" "}
            <input
              data-testid="title-input"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
            />
          </label>
          <button data-testid="rename" onClick={() => void onRename()}>
            rename
          </button>
          {renameError !== null && <p role="alert">rename error: {renameError}</p>}
        </div>

        <button data-testid="assign" onClick={() => void onAssign()}>
          assign to {user}
        </button>
        {assignError !== null && <p role="alert">assign error: {assignError}</p>}

        <button data-testid="close" onClick={() => void onClose()}>
          close
        </button>
        {closeError !== null && <p role="alert">close error: {closeError}</p>}
      </div>

      <Comments id={id} user={user} />
      <Labels id={id} />
      {current !== null && (
        <RelatedHelp
          title={current.title}
          onOpenHelp={(hitId) => onOpenHelp(current.title, hitId)}
        />
      )}
    </div>
  );
}

type Posted = { key: number; author: string; text: string; sent: boolean };

function Comments({ id, user }: { id: number; user: string }) {
  const [load, setLoad] = useState<Load<Comment[]>>({ status: "loading" });
  const [posted, setPosted] = useState<Posted[]>([]);
  const [draft, setDraft] = useState("");
  const [postError, setPostError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    let active = true;
    fetchComments(id).then(
      (value) => {
        if (active) setLoad({ status: "ok", value });
      },
      (e: unknown) => {
        if (active) setLoad({ status: "error", message: errorMessage(e) });
      },
    );
    return () => {
      active = false;
    };
  }, [id]);

  async function post() {
    const text = draft.trim();
    if (text === "" || load.status === "loading") return;
    const key = ++seq.current;
    setPostError(null);
    setDraft("");
    setPosted((list) => [...list, { key, author: user, text, sent: false }]);
    try {
      await addComment(id, user, text);
      setPosted((list) => list.map((p) => (p.key === key ? { ...p, sent: true } : p)));
    } catch (e) {
      setPosted((list) => list.filter((p) => p.key !== key));
      setPostError(errorMessage(e));
    }
  }

  return (
    <section data-testid="comments" aria-label="Comments" aria-live="polite">
      {load.status === "loading" && <p>loading comments</p>}
      {load.status === "error" && <p role="alert">comments error: {load.message}</p>}
      <ul>
        {load.status === "ok" &&
          load.value.map((c, i) => (
            <li key={`c${i}`} data-testid="comment">
              {c.author}: {c.text}
            </li>
          ))}
        {posted.map((p) => (
          <li key={p.key} data-testid="comment">
            {p.author}: {p.text}
            {p.sent ? "" : " (sending…)"}
          </li>
        ))}
      </ul>
      <div>
        <label>
          Comment{" "}
          <input data-testid="comment-input" value={draft} onChange={(e) => setDraft(e.target.value)} />
        </label>
        <button data-testid="post" disabled={load.status === "loading"} onClick={() => void post()}>
          post
        </button>
      </div>
      {postError !== null && <p role="alert">post error: {postError}</p>}
    </section>
  );
}

function Labels({ id }: { id: number }) {
  const [load, setLoad] = useState<Load<string[]>>({ status: "loading" });
  const [input, setInput] = useState("");
  const [labelError, setLabelError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchLabels(id).then(
      (value) => {
        if (active) setLoad({ status: "ok", value });
      },
      (e: unknown) => {
        if (active) setLoad({ status: "error", message: errorMessage(e) });
      },
    );
    return () => {
      active = false;
    };
  }, [id]);

  function edit(fn: (labels: string[]) => string[]) {
    setLoad((l): Load<string[]> => (l.status === "ok" ? { status: "ok", value: fn(l.value) } : l));
  }

  async function add() {
    const label = input.trim();
    if (label === "" || load.status !== "ok" || load.value.includes(label)) return;
    setLabelError(null);
    setInput("");
    edit((labels) => [...labels, label]);
    try {
      await addLabel(id, label);
    } catch (e) {
      edit((labels) => labels.filter((l) => l !== label));
      setLabelError(errorMessage(e));
    }
  }

  async function remove(label: string) {
    if (load.status !== "ok") return;
    const index = load.value.indexOf(label);
    if (index === -1) return;
    setLabelError(null);
    edit((labels) => labels.filter((l) => l !== label));
    try {
      await removeLabel(id, label);
    } catch (e) {
      edit((labels) => {
        if (labels.includes(label)) return labels;
        const next = [...labels];
        next.splice(Math.min(index, next.length), 0, label);
        return next;
      });
      setLabelError(errorMessage(e));
    }
  }

  return (
    <section data-testid="labels" aria-label="Labels">
      {load.status === "loading" && <p>loading labels</p>}
      {load.status === "error" && <p role="alert">labels error: {load.message}</p>}
      <ul>
        {load.status === "ok" &&
          load.value.map((label) => (
            <li key={label}>
              <span data-testid="label">{label}</span>{" "}
              <button data-testid="remove-label" onClick={() => void remove(label)}>
                remove {label}
              </button>
            </li>
          ))}
      </ul>
      <div>
        <label>
          Label{" "}
          <input data-testid="label-input" value={input} onChange={(e) => setInput(e.target.value)} />
        </label>
        <button data-testid="add-label" onClick={() => void add()}>
          add
        </button>
      </div>
      {labelError !== null && <p role="alert">label error: {labelError}</p>}
    </section>
  );
}

function RelatedHelp({ title, onOpenHelp }: { title: string; onOpenHelp: (hitId: number) => void }) {
  const [load, setLoad] = useState<Load<Hit[]>>({ status: "loading" });

  useEffect(() => {
    let active = true;
    search(title).then(
      (hits) => {
        if (active) setLoad({ status: "ok", value: hits });
      },
      (e: unknown) => {
        if (active) setLoad({ status: "error", message: errorMessage(e) });
      },
    );
    return () => {
      active = false;
    };
  }, [title]);

  return (
    <section data-testid="related" aria-label="Related help" aria-live="polite">
      {load.status === "loading" && <p>finding related help</p>}
      {load.status === "error" && <p role="alert">related help failed: {load.message}</p>}
      {load.status === "ok" && load.value.length === 0 && <p>no related help</p>}
      {load.status === "ok" &&
        load.value.slice(0, 3).map((hit) => (
          <button key={hit.id} data-testid="related-hit" onClick={() => onOpenHelp(hit.id)}>
            {hit.name}
          </button>
        ))}
    </section>
  );
}
