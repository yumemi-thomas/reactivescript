import { useState } from "react";
import type { Hit } from "./api.js";
import Comments from "./Comments";
import Labels from "./Labels";
import RelatedHelp from "./RelatedHelp";
import type { DetailState, Slot } from "./issuesState";

type Props = {
  id: number;
  user: string;
  detail: DetailState;
  errors: Record<Slot, string | null>;
  onRetry: () => void;
  onAssign: () => void;
  onRename: (title: string) => void;
  onClose: () => void;
  onOpenHelp: (query: string, hit: Hit) => void;
};

/** The selected issue's detail. Remounted for each selection, so its inputs start empty. */
export default function IssueDetail({
  id,
  user,
  detail,
  errors,
  onRetry,
  onAssign,
  onRename,
  onClose,
  onOpenHelp,
}: Props) {
  const [title, setTitle] = useState("");

  return (
    <section data-testid="detail" aria-label="issue detail">
      {detail.status === "loading" && <p>{`loading #${id}`}</p>}
      {detail.status === "ok" && (
        <>
          <h2>{`#${detail.issue.id} ${detail.issue.title}`}</h2>
          <p>{detail.issue.body}</p>
        </>
      )}
      {detail.status === "notFound" && <p>{`detail error: issue #${id} not found`}</p>}
      {detail.status === "error" && <p>{`detail error: ${detail.message}`}</p>}

      <div>
        <button type="button" data-testid="retry" onClick={onRetry}>
          retry
        </button>
      </div>

      <div>
        <button type="button" data-testid="assign" onClick={onAssign}>
          {`assign to ${user}`}
        </button>
        {errors.assign && <p>{errors.assign}</p>}
      </div>

      <div>
        <input
          data-testid="title-input"
          aria-label="new title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button
          type="button"
          data-testid="rename"
          onClick={() => {
            const next = title.trim();
            if (next) onRename(next);
          }}
        >
          rename
        </button>
        {errors.rename && <p>{errors.rename}</p>}
      </div>

      <div>
        <button type="button" data-testid="close" onClick={onClose}>
          close
        </button>
        {errors.close && <p>{errors.close}</p>}
      </div>

      <Comments id={id} user={user} />
      <Labels id={id} />
      {detail.status === "ok" && (
        <RelatedHelp
          title={detail.issue.title}
          onOpen={(hit) => onOpenHelp(detail.issue.title, hit)}
        />
      )}
    </section>
  );
}
