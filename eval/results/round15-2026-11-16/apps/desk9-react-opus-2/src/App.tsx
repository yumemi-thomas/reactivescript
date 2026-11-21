import { useReducer, useState } from "react";
import * as api from "./api";
import { HelpPage, type HelpSeed } from "./HelpPage";
import { IssuesPage } from "./IssuesPage";
import { SettingsPage } from "./SettingsPage";
import { initialIssuesState, issuesReducer, openCount, type Field, type FieldValue, type IssueActions } from "./store";
import { errorMessage, nextSeq } from "./util";
import { css } from "./styles";

type Tab = "issues" | "help" | "settings";

export default function App() {
  const [tab, setTab] = useState<Tab>("issues");
  // Bumped on every page change, so the page that opens always starts afresh.
  const [visit, setVisit] = useState(0);
  const [helpSeed, setHelpSeed] = useState<HelpSeed | null>(null);
  const [issues, dispatch] = useReducer(issuesReducer, initialIssuesState);

  function openTab(next: Tab) {
    if (next === tab) return;
    setTab(next);
    setVisit(v => v + 1);
    setHelpSeed(null);
  }

  function openRelated(seed: HelpSeed) {
    setTab("help");
    setVisit(v => v + 1);
    setHelpSeed(seed);
  }

  async function run<R>(
    id: number,
    field: Field,
    value: FieldValue,
    call: () => Promise<R>,
    pick: (r: R) => FieldValue,
  ): Promise<string | null> {
    const op = { seq: nextSeq(), id, field, value };
    dispatch({ type: "start", op });
    try {
      const answer = await call();
      dispatch({ type: "accept", op, value: pick(answer), atSeq: nextSeq() });
      return null;
    } catch (e) {
      dispatch({ type: "decline", op });
      return errorMessage(e);
    }
  }

  const actions: IssueActions = {
    assign: (id, user) => run(id, "assignee", user, () => api.assign(id, user), r => r.assignee),
    rename: (id, title) => run(id, "title", title, () => api.renameIssue(id, title), r => r.title),
    close: id => run(id, "closed", true, () => api.closeIssue(id), () => true),
  };

  const count = openCount(issues);
  const tabs: { id: Tab; label: string }[] = [
    { id: "issues", label: count === null ? "Issues" : `Issues (${count})` },
    { id: "help", label: "Help" },
    { id: "settings", label: "Settings" },
  ];

  return (
    <div className="desk">
      <style>{css}</style>
      <nav className="tabs" role="tablist" aria-label="Pages">
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            data-testid={`tab-${t.id}`}
            onClick={() => openTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <main className="page" role="tabpanel">
        {tab === "issues" && (
          <IssuesPage key={visit} store={issues} dispatch={dispatch} actions={actions} onOpenHelp={openRelated} />
        )}
        {tab === "help" && <HelpPage key={visit} seed={helpSeed} />}
        {tab === "settings" && <SettingsPage key={visit} />}
      </main>
    </div>
  );
}
