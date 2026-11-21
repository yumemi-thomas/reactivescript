import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchIssues } from "./api";
import type { Issue } from "./api";
import { assignIssue, closeWith, errorMessage } from "./desk";
import type { Desk, Filter } from "./desk";
import { IssueDetail } from "./IssueDetail";

type Props = {
  desk: Desk;
  onOpenHelp: (query: string, hitId: number) => void;
};

export function IssuesPage({ desk, onOpenHelp }: Props) {
  const { qc, open } = desk;
  const [user, setUser] = useState("guest");
  const [filter, setFilter] = useState<Filter>("open");
  const [selected, setSelected] = useState<number | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const canAct = user.trim() !== "";

  const list = useQuery<Issue[]>({
    queryKey: ["issues", filter],
    queryFn: async () => {
      const issues = await fetchIssues(filter);
      if (filter === "open") open.set(issues.map((i) => i.id));
      return issues;
    },
  });

  const rowAssign = (issue: Issue) => {
    setRowError(null);
    assignIssue(qc, issue.id, user).catch((e: unknown) =>
      setRowError(`row error: ${errorMessage(e)}`),
    );
  };

  const rowClose = (issue: Issue) => {
    setRowError(null);
    closeWith(qc, open, issue.id).catch((e: unknown) =>
      setRowError(`row error: ${errorMessage(e)}`),
    );
  };

  let body;
  if (list.isPending) {
    body = <p>{`loading ${filter} issues`}</p>;
  } else if (list.isError) {
    body = <p>{`list error: ${errorMessage(list.error)}`}</p>;
  } else {
    body = (
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {list.data.map((issue) => (
          <li key={issue.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              type="button"
              data-testid="issue"
              aria-pressed={selected === issue.id}
              onClick={() => setSelected(issue.id)}
            >
              {`#${issue.id} ${issue.title} (${issue.assignee ?? "unassigned"})`}
            </button>
            <button
              type="button"
              data-testid="row-assign"
              disabled={!canAct}
              onClick={() => rowAssign(issue)}
            >
              {`assign to ${user}`}
            </button>
            {filter === "open" && (
              <button type="button" data-testid="row-close" onClick={() => rowClose(issue)}>
                close
              </button>
            )}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <label>
          Current user{" "}
          <input
            data-testid="user"
            value={user}
            onChange={(e) => setUser(e.target.value)}
          />
        </label>
        <div role="group" aria-label="Filter" style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            data-testid="filter-open"
            aria-pressed={filter === "open"}
            onClick={() => setFilter("open")}
          >
            open
          </button>
          <button
            type="button"
            data-testid="filter-closed"
            aria-pressed={filter === "closed"}
            onClick={() => setFilter("closed")}
          >
            closed
          </button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 16 }}>
        <section data-testid="list" aria-label="Issues">
          {body}
          {rowError && <p data-testid="row-error" role="alert">{rowError}</p>}
        </section>
        <section data-testid="detail" aria-label="Issue detail">
          {selected === null ? (
            <p>select an issue</p>
          ) : (
            <IssueDetail
              key={selected}
              id={selected}
              user={user}
              desk={desk}
              onOpenHelp={onOpenHelp}
            />
          )}
        </section>
      </div>
    </div>
  );
}
