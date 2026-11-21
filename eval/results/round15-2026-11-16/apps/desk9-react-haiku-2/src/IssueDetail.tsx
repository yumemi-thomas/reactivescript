import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchComments,
  fetchIssue,
  fetchLabels,
  search,
} from "./api";
import type { IssueDetail as IssueDetailData } from "./api";
import {
  addLabelTo,
  assignIssue,
  closeWith,
  errorMessage,
  postComment,
  removeLabelFrom,
  renameTo,
} from "./desk";
import type { CommentRow, Desk } from "./desk";

type Props = {
  id: number;
  user: string;
  desk: Desk;
  onOpenHelp: (query: string, hitId: number) => void;
};

export function IssueDetail({ id, user, desk, onOpenHelp }: Props) {
  const { qc, open } = desk;
  const canAct = user.trim() !== "";

  const detail = useQuery<IssueDetailData | null>({
    queryKey: ["issue", id],
    queryFn: () => fetchIssue(id),
  });
  const comments = useQuery<CommentRow[]>({
    queryKey: ["comments", id],
    queryFn: () => fetchComments(id),
  });
  const labels = useQuery<string[]>({
    queryKey: ["labels", id],
    queryFn: () => fetchLabels(id),
  });

  const [assignError, setAssignError] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [postError, setPostError] = useState<string | null>(null);
  const [labelError, setLabelError] = useState<string | null>(null);
  const [titleInput, setTitleInput] = useState("");
  const [commentInput, setCommentInput] = useState("");
  const [labelInput, setLabelInput] = useState("");

  const onAssign = () => {
    setAssignError(null);
    assignIssue(qc, id, user).catch((e: unknown) =>
      setAssignError(`assign error: ${errorMessage(e)}`),
    );
  };

  const onRename = () => {
    const title = titleInput.trim();
    if (title === "") return;
    setRenameError(null);
    renameTo(qc, id, title).catch((e: unknown) =>
      setRenameError(`rename error: ${errorMessage(e)}`),
    );
  };

  const onClose = () => {
    setCloseError(null);
    closeWith(qc, open, id).catch((e: unknown) =>
      setCloseError(`close error: ${errorMessage(e)}`),
    );
  };

  const onPost = () => {
    const text = commentInput.trim();
    if (text === "" || !canAct) return;
    setCommentInput("");
    setPostError(null);
    postComment(qc, id, user, text).catch((e: unknown) =>
      setPostError(`post error: ${errorMessage(e)}`),
    );
  };

  const onAddLabel = () => {
    const label = labelInput.trim();
    if (label === "") return;
    // Only a label the issue already shows is skipped; without a loaded list the server answers.
    if (labels.data?.includes(label)) return;
    setLabelInput("");
    setLabelError(null);
    addLabelTo(qc, id, label).catch((e: unknown) =>
      setLabelError(`label error: ${errorMessage(e)}`),
    );
  };

  const onRemoveLabel = (label: string) => {
    setLabelError(null);
    removeLabelFrom(qc, id, label).catch((e: unknown) =>
      setLabelError(`label error: ${errorMessage(e)}`),
    );
  };

  let detailView;
  if (detail.isPending) {
    detailView = <p>{`loading #${id}`}</p>;
  } else if (detail.isError) {
    detailView = <p>{`detail error: ${errorMessage(detail.error)}`}</p>;
  } else if (detail.data === null) {
    detailView = <p>{`detail error: issue #${id} not found`}</p>;
  } else {
    detailView = (
      <article>
        <h2 style={{ margin: "0 0 8px", fontSize: "1.2em" }}>{`#${detail.data.id} ${detail.data.title}`}</h2>
        <p>{detail.data.body}</p>
      </article>
    );
  }

  let commentsView;
  if (comments.isPending) {
    commentsView = <p>loading comments</p>;
  } else if (comments.isError) {
    commentsView = <p>{`comments error: ${errorMessage(comments.error)}`}</p>;
  } else {
    commentsView = (
      <ul style={{ listStyle: "none", padding: 0 }}>
        {comments.data.map((c, i) => (
          <li key={i} data-testid="comment">
            {`${c.author}: ${c.text}${c.sending !== undefined ? " (sending…)" : ""}`}
          </li>
        ))}
      </ul>
    );
  }

  let labelsView;
  if (labels.isPending) {
    labelsView = <p>loading labels</p>;
  } else if (labels.isError) {
    labelsView = <p>{`labels error: ${errorMessage(labels.error)}`}</p>;
  } else {
    labelsView = (
      <ul style={{ listStyle: "none", padding: 0, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {labels.data.map((label) => (
          <li key={label} style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span data-testid="label">{label}</span>
            <button type="button" data-testid="remove-label" onClick={() => onRemoveLabel(label)}>
              {`remove ${label}`}
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div>
        <button type="button" data-testid="retry" onClick={() => void detail.refetch()}>
          retry
        </button>
      </div>
      {detailView}

      <div style={{ display: "grid", gap: 4 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" data-testid="assign" disabled={!canAct} onClick={onAssign}>
            {`assign to ${user}`}
          </button>
          <button type="button" data-testid="close" onClick={onClose}>
            close
          </button>
        </div>
        {assignError && <p data-testid="assign-error" role="alert">{assignError}</p>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            data-testid="title-input"
            aria-label="New title"
            value={titleInput}
            onChange={(e) => setTitleInput(e.target.value)}
          />
          <button type="button" data-testid="rename" onClick={onRename}>
            rename
          </button>
        </div>
        {renameError && <p data-testid="rename-error" role="alert">{renameError}</p>}
        {closeError && <p data-testid="close-error" role="alert">{closeError}</p>}
      </div>

      <section data-testid="comments" aria-label="Comments">
        {commentsView}
      </section>
      <div style={{ display: "grid", gap: 4 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            data-testid="comment-input"
            aria-label="New comment"
            value={commentInput}
            onChange={(e) => setCommentInput(e.target.value)}
          />
          <button type="button" data-testid="post" disabled={!canAct} onClick={onPost}>
            post
          </button>
        </div>
        {postError && <p data-testid="post-error" role="alert">{postError}</p>}
      </div>

      <section data-testid="labels" aria-label="Labels">
        {labelsView}
      </section>
      <div style={{ display: "grid", gap: 4 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            data-testid="label-input"
            aria-label="New label"
            value={labelInput}
            onChange={(e) => setLabelInput(e.target.value)}
          />
          <button type="button" data-testid="add-label" onClick={onAddLabel}>
            add label
          </button>
        </div>
        {labelError && <p data-testid="label-error" role="alert">{labelError}</p>}
      </div>

      {detail.data && (
        <Related title={detail.data.title} onOpenHelp={onOpenHelp} />
      )}
    </div>
  );
}

type RelatedProps = {
  title: string;
  onOpenHelp: (query: string, hitId: number) => void;
};

/** The help search for the issue's title as it was when its detail first loaded. */
function Related({ title, onOpenHelp }: RelatedProps) {
  const [query] = useState(title);
  const hits = useQuery({
    queryKey: ["related", query],
    queryFn: () => search(query),
  });

  let view;
  if (hits.isPending) {
    view = <p>finding related help</p>;
  } else if (hits.isError) {
    view = <p>{`related help failed: ${errorMessage(hits.error)}`}</p>;
  } else if (hits.data.length === 0) {
    view = <p>no related help</p>;
  } else {
    view = (
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {hits.data.slice(0, 3).map((hit) => (
          <button
            key={hit.id}
            type="button"
            data-testid="related-hit"
            onClick={() => onOpenHelp(query, hit.id)}
          >
            {hit.name}
          </button>
        ))}
      </div>
    );
  }

  return (
    <section data-testid="related" aria-label="Related help">
      {view}
    </section>
  );
}
