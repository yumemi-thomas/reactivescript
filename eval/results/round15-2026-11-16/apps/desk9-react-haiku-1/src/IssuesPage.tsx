import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  addComment,
  addLabel,
  assign,
  closeIssue,
  fetchComments,
  fetchIssue,
  fetchIssues,
  fetchLabels,
  removeLabel,
  renameIssue,
  search,
} from "./api";
import { errorMessage, useLoad } from "./useLoad";

type Filter = "open" | "closed";
type ErrKind = "assign" | "rename" | "close" | "post" | "label";
/** what the page has changed on an issue on the user's side: shown at once, undone if the server declines */
type Edit = { assignee?: string | null; title?: string; closed?: boolean };
type Post = { key: number; issue: number; author: string; text: string; sending: boolean };

type Props = {
  setOpenCount: Dispatch<SetStateAction<number | null>>;
  onOpenHelp: (query: string, hitId: number) => void;
};

export default function IssuesPage({ setOpenCount, onOpenHelp }: Props) {
  const [user, setUser] = useState("guest");
  const [filter, setFilter] = useState<Filter>("open");
  const [sel, setSel] = useState<number | null>(null);
  const [selGen, setSelGen] = useState(0);
  const [detailGen, setDetailGen] = useState(0);
  const [edits, setEdits] = useState<Record<number, Edit>>({});
  const [rowError, setRowError] = useState<string | null>(null);
  const [errs, setErrs] = useState<Partial<Record<ErrKind, string>>>({});
  const [titleDraft, setTitleDraft] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [labelDraft, setLabelDraft] = useState("");
  const [posts, setPosts] = useState<Post[]>([]);
  const [labelOverride, setLabelOverride] = useState<Record<number, string[]>>({});
  /** changes on each selection: a detail error only lands while its selection is still the current one */
  const selToken = useRef(0);
  const postSeq = useRef(0);

  const listLoader = useCallback(
    () =>
      fetchIssues(filter).then(rows => {
        if (filter === "open") setOpenCount(rows.length);
        return rows;
      }),
    [filter, setOpenCount],
  );
  const list = useLoad(filter, listLoader);

  const detailLoader = useCallback(() => fetchIssue(sel ?? 0), [sel]);
  const detail = useLoad(sel === null ? null : `${sel}/${selGen}/${detailGen}`, detailLoader);
  const dv = detail.status === "ok" ? detail.value : undefined;
  const baseTitle: string | null = dv ? dv.title : null;

  const commentsLoader = useCallback(() => fetchComments(sel ?? 0), [sel]);
  const comments = useLoad(sel === null ? null : `${sel}/${selGen}`, commentsLoader);
  const labelsLoader = useCallback(() => fetchLabels(sel ?? 0), [sel]);
  const labels = useLoad(sel === null ? null : `${sel}/${selGen}`, labelsLoader);
  const relatedLoader = useCallback(() => search(baseTitle ?? ""), [baseTitle]);
  const related = useLoad(sel !== null && baseTitle !== null ? `${sel}/${selGen}/${baseTitle}` : null, relatedLoader);

  // Derived views: server answers with this page's edits on top.
  const listRows = list.status === "ok" ? (list.value ?? []) : [];
  const rows = listRows
    .filter(r => filter === "closed" || edits[r.id]?.closed !== true)
    .map(r => {
      const e = edits[r.id];
      const a = e?.assignee;
      return { id: r.id, title: e?.title ?? r.title, assignee: a !== undefined ? a : r.assignee };
    });
  const detailTitle: string | undefined = (sel !== null ? edits[sel]?.title : undefined) ?? dv?.title;

  const labelsReady = labels.status === "ok";
  const labelsBase: string[] = labelsReady ? (labels.value ?? []) : [];
  const labelOv = sel === null ? undefined : labelOverride[sel];
  const shownLabels: string[] = labelOv ?? labelsBase;

  const commentsBase = comments.status === "ok" ? (comments.value ?? []) : [];
  const shownComments = [
    ...commentsBase.map(c => ({ author: c.author, text: c.text, sending: false })),
    ...posts
      .filter(p => p.issue === sel)
      .map(p => ({ author: p.author, text: p.text, sending: p.sending })),
  ];

  const clearErr = (kind: ErrKind) => setErrs(prev => ({ ...prev, [kind]: undefined }));
  const detailErr = (token: number, kind: ErrKind, message: string) => {
    if (selToken.current === token) setErrs(prev => ({ ...prev, [kind]: message }));
  };
  const patch = (id: number, change: Edit) => setEdits(prev => ({ ...prev, [id]: { ...prev[id], ...change } }));
  const shownAssignee = (id: number): string | null | undefined => {
    const a = edits[id]?.assignee;
    return a !== undefined ? a : list.value?.find(r => r.id === id)?.assignee;
  };

  const runAssign = (id: number, onError: (message: string) => void) => {
    const who = user;
    const prior = shownAssignee(id);
    patch(id, { assignee: who });
    assign(id, who).then(
      r => patch(id, { assignee: r.assignee }),
      e => {
        patch(id, { assignee: prior });
        onError(errorMessage(e));
      },
    );
  };

  const runRename = (id: number, title: string, prior: string | undefined, onError: (message: string) => void) => {
    patch(id, { title });
    renameIssue(id, title).then(
      r => patch(id, { title: r.title }),
      e => {
        patch(id, { title: prior });
        onError(errorMessage(e));
      },
    );
  };

  const runClose = (id: number, onError: (message: string) => void) => {
    const counted = filter === "open" && rows.some(r => r.id === id);
    patch(id, { closed: true });
    if (counted) setOpenCount(c => (c === null ? c : c - 1));
    closeIssue(id).then(
      () => undefined,
      e => {
        patch(id, { closed: false });
        if (counted) setOpenCount(c => (c === null ? c : c + 1));
        onError(errorMessage(e));
      },
    );
  };

  const select = (id: number) => {
    selToken.current += 1;
    setSel(id);
    setSelGen(g => g + 1);
    setErrs({});
    setTitleDraft("");
    setCommentDraft("");
    setLabelDraft("");
    setLabelOverride({});
  };

  const onAssignDetail = () => {
    if (sel === null) return;
    const t = selToken.current;
    clearErr("assign");
    runAssign(sel, m => detailErr(t, "assign", `assign error: ${m}`));
  };

  const onRename = () => {
    if (sel === null || titleDraft.trim() === "") return;
    const t = selToken.current;
    clearErr("rename");
    runRename(sel, titleDraft.trim(), detailTitle, m => detailErr(t, "rename", `rename error: ${m}`));
  };

  const onCloseDetail = () => {
    if (sel === null) return;
    const t = selToken.current;
    clearErr("close");
    runClose(sel, m => detailErr(t, "close", `close error: ${m}`));
  };

  const onRowAssign = (id: number) => {
    setRowError(null);
    runAssign(id, m => setRowError(`row error: ${m}`));
  };

  const onRowClose = (id: number) => {
    setRowError(null);
    runClose(id, m => setRowError(`row error: ${m}`));
  };

  const onPost = () => {
    if (sel === null || comments.status !== "ok" || commentDraft.trim() === "") return;
    const id = sel;
    const text = commentDraft;
    const author = user;
    const t = selToken.current;
    postSeq.current += 1;
    const key = postSeq.current;
    clearErr("post");
    setCommentDraft("");
    setPosts(prev => [...prev, { key, issue: id, author, text, sending: true }]);
    addComment(id, author, text).then(
      () => setPosts(prev => prev.map(p => (p.key === key ? { ...p, sending: false } : p))),
      e => {
        setPosts(prev => prev.filter(p => p.key !== key));
        detailErr(t, "post", `post error: ${errorMessage(e)}`);
      },
    );
  };

  const onAddLabel = () => {
    const label = labelDraft.trim();
    if (sel === null || !labelsReady || label === "" || shownLabels.includes(label)) return;
    const id = sel;
    const before = shownLabels;
    const t = selToken.current;
    clearErr("label");
    setLabelDraft("");
    setLabelOverride(o => ({ ...o, [id]: [...before, label] }));
    addLabel(id, label).then(
      next => setLabelOverride(o => ({ ...o, [id]: next })),
      e => {
        setLabelOverride(o => ({ ...o, [id]: before }));
        detailErr(t, "label", `label error: ${errorMessage(e)}`);
      },
    );
  };

  const onRemoveLabel = (label: string) => {
    if (sel === null || !labelsReady) return;
    const id = sel;
    const before = shownLabels;
    const t = selToken.current;
    clearErr("label");
    setLabelOverride(o => ({ ...o, [id]: before.filter(l => l !== label) }));
    removeLabel(id, label).then(
      next => setLabelOverride(o => ({ ...o, [id]: next })),
      e => {
        setLabelOverride(o => ({ ...o, [id]: before }));
        detailErr(t, "label", `label error: ${errorMessage(e)}`);
      },
    );
  };

  return (
    <div className="issues">
      <label>
        Current user <input data-testid="user" value={user} onChange={e => setUser(e.target.value)} />
      </label>
      <div role="group" aria-label="Filter">
        <button type="button" data-testid="filter-open" aria-pressed={filter === "open"} onClick={() => setFilter("open")}>
          Open
        </button>
        <button
          type="button"
          data-testid="filter-closed"
          aria-pressed={filter === "closed"}
          onClick={() => setFilter("closed")}
        >
          Closed
        </button>
      </div>

      <div className="split">
        <div>
          <section data-testid="list" aria-live="polite">
            {list.status === "loading" ? <p>{`loading ${filter} issues`}</p> : null}
            {list.status === "error" ? <p>{`list error: ${list.error}`}</p> : null}
            {list.status === "ok" ? (
              <ul>
                {rows.map(r => (
                  <li key={r.id} className="row">
                    <button
                      type="button"
                      data-testid="issue"
                      aria-pressed={sel === r.id}
                      onClick={() => select(r.id)}
                    >
                      {`#${r.id} ${r.title} (${r.assignee ?? "unassigned"})`}
                    </button>
                    <button type="button" data-testid="row-assign" onClick={() => onRowAssign(r.id)}>
                      {`assign to ${user}`}
                    </button>
                    {filter === "open" ? (
                      <button type="button" data-testid="row-close" onClick={() => onRowClose(r.id)}>
                        close
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
          {rowError !== null ? <p data-testid="row-error" role="alert">{rowError}</p> : null}
        </div>

        <section data-testid="detail" aria-live="polite">
          {sel === null ? (
            <p>select an issue</p>
          ) : (
            <>
              <button type="button" data-testid="retry" onClick={() => setDetailGen(g => g + 1)}>
                retry
              </button>
              {detail.status === "loading" ? <p>{`loading #${sel}`}</p> : null}
              {detail.status === "error" ? <p>{`detail error: ${detail.error}`}</p> : null}
              {detail.status === "ok" && dv === null ? <p>{`detail error: issue #${sel} not found`}</p> : null}
              {detail.status === "ok" && dv ? (
                <>
                  <h2>{`#${dv.id} ${detailTitle ?? dv.title}`}</h2>
                  <p>{dv.body}</p>
                </>
              ) : null}

              <div className="actions">
                <button type="button" data-testid="assign" onClick={onAssignDetail}>
                  {`assign to ${user}`}
                </button>
                {errs.assign ? <p role="alert">{errs.assign}</p> : null}
              </div>

              <div className="actions">
                <input
                  data-testid="title-input"
                  aria-label="New title"
                  value={titleDraft}
                  onChange={e => setTitleDraft(e.target.value)}
                />
                <button type="button" data-testid="rename" onClick={onRename}>
                  rename
                </button>
                {errs.rename ? <p role="alert">{errs.rename}</p> : null}
              </div>

              <div className="actions">
                <button type="button" data-testid="close" onClick={onCloseDetail}>
                  close
                </button>
                {errs.close ? <p role="alert">{errs.close}</p> : null}
              </div>

              {baseTitle !== null ? (
                <section data-testid="related" aria-label="Related help">
                  {related.status === "loading" ? <p>finding related help</p> : null}
                  {related.status === "error" ? <p>{`related help failed: ${related.error}`}</p> : null}
                  {related.status === "ok" && related.value && related.value.length === 0 ? (
                    <p>no related help</p>
                  ) : null}
                  {related.status === "ok" && related.value
                    ? related.value.slice(0, 3).map(h => (
                        <button
                          type="button"
                          key={h.id}
                          data-testid="related-hit"
                          onClick={() => onOpenHelp(baseTitle, h.id)}
                        >
                          {h.name}
                        </button>
                      ))
                    : null}
                </section>
              ) : null}

              <section data-testid="comments" aria-label="Comments">
                {comments.status === "loading" ? <p>loading comments</p> : null}
                {comments.status === "error" ? <p>{`comments error: ${comments.error}`}</p> : null}
                {comments.status === "ok"
                  ? shownComments.map((c, i) => (
                      <p key={i} data-testid="comment">
                        {`${c.author}: ${c.text}${c.sending ? " (sending…)" : ""}`}
                      </p>
                    ))
                  : null}
              </section>
              <div className="actions">
                <input
                  data-testid="comment-input"
                  aria-label="Comment"
                  value={commentDraft}
                  onChange={e => setCommentDraft(e.target.value)}
                />
                <button type="button" data-testid="post" onClick={onPost}>
                  post
                </button>
                {errs.post ? <p role="alert">{errs.post}</p> : null}
              </div>

              <section data-testid="labels" aria-label="Labels">
                {labels.status === "loading" ? <p>loading labels</p> : null}
                {labels.status === "error" ? <p>{`labels error: ${labels.error}`}</p> : null}
                {labelsReady
                  ? shownLabels.map(l => (
                      <span key={l} className="label">
                        <span data-testid="label">{l}</span>
                        <button type="button" data-testid="remove-label" onClick={() => onRemoveLabel(l)}>
                          {`remove ${l}`}
                        </button>
                      </span>
                    ))
                  : null}
              </section>
              <div className="actions">
                <input
                  data-testid="label-input"
                  aria-label="Label"
                  value={labelDraft}
                  onChange={e => setLabelDraft(e.target.value)}
                />
                <button type="button" data-testid="add-label" onClick={onAddLabel}>
                  add label
                </button>
                {errs.label ? <p role="alert">{errs.label}</p> : null}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
