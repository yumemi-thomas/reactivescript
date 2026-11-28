import { useState } from "react";
import { useMachine, useSelector } from "@xstate/react";
import type { ActorRefFrom } from "xstate";
import { deskMachine } from "./deskMachine.js";
import { issuesMachine } from "./issuesMachine.js";
import { helpMachine } from "./helpMachine.js";
import { settingsMachine, NAME_MAX, nameProblem } from "./settingsMachine.js";

type IssuesRef = ActorRefFrom<typeof issuesMachine>;
type HelpRef = ActorRefFrom<typeof helpMachine>;
type SettingsRef = ActorRefFrom<typeof settingsMachine>;

export default function App() {
  const [snap, send] = useMachine(deskMachine);
  const { openCount } = snap.context;
  const issues = snap.children.issues as unknown as IssuesRef | undefined;
  const help = snap.children.help as unknown as HelpRef | undefined;
  const settings = snap.children.settings as unknown as SettingsRef | undefined;

  return (
    <div className="desk">
      <nav className="tabs">
        <button
          data-testid="tab-issues"
          aria-pressed={snap.matches("issues")}
          onClick={() => !snap.matches("issues") && send({ type: "GO_ISSUES" })}
        >
          {openCount === null ? "Issues" : `Issues (${openCount})`}
        </button>
        <button
          data-testid="tab-help"
          aria-pressed={snap.matches("help")}
          onClick={() => !snap.matches("help") && send({ type: "GO_HELP" })}
        >
          Help
        </button>
        <button
          data-testid="tab-settings"
          aria-pressed={snap.matches("settings")}
          onClick={() => !snap.matches("settings") && send({ type: "GO_SETTINGS" })}
        >
          Settings
        </button>
      </nav>
      <main>
        {snap.matches("issues") && issues && <IssuesPage actor={issues} />}
        {snap.matches("help") && help && <HelpPage actor={help} />}
        {snap.matches("settings") && settings && <SettingsPage actor={settings} />}
      </main>
    </div>
  );
}

function IssuesPage({ actor }: { actor: IssuesRef }) {
  const snap = useSelector(actor, (s) => s);
  const send = actor.send.bind(actor);
  const ctx = snap.context;
  return (
    <div className="issues">
      <label>
        Current user{" "}
        <input
          data-testid="user"
          value={ctx.user}
          onChange={(e) => send({ type: "SET_USER", user: e.target.value })}
        />
      </label>
      <div className="filters">
        <button
          data-testid="filter-open"
          aria-pressed={ctx.filter === "open"}
          onClick={() => send({ type: "FILTER", filter: "open" })}
        >
          open
        </button>
        <button
          data-testid="filter-closed"
          aria-pressed={ctx.filter === "closed"}
          onClick={() => send({ type: "FILTER", filter: "closed" })}
        >
          closed
        </button>
      </div>
      <section data-testid="list">
        {ctx.listStatus === "loading" && `loading ${ctx.filter} issues`}
        {ctx.listStatus === "failed" && `list error: ${ctx.listError}`}
        <ul>
          {ctx.rows.map((row) => (
            <li key={row.id} className="row">
              <button
                data-testid="issue"
                onClick={() => send({ type: "SELECT", id: row.id })}
              >
                {`#${row.id} ${row.title} (${row.assignee ?? "unassigned"})`}
              </button>
              <button
                data-testid="row-assign"
                onClick={() => send({ type: "ASSIGN", id: row.id, scope: "row" })}
              >
                {`assign to ${ctx.user}`}
              </button>
              {ctx.filter === "open" && (
                <button
                  data-testid="row-close"
                  onClick={() => send({ type: "CLOSE", id: row.id, scope: "row" })}
                >
                  close
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
      {ctx.rowError !== null && <p data-testid="row-error">{`row error: ${ctx.rowError}`}</p>}
      <Detail key={ctx.selectedId ?? "none"} actor={actor} />
    </div>
  );
}

function Detail({ actor }: { actor: IssuesRef }) {
  const snap = useSelector(actor, (s) => s);
  const send = actor.send.bind(actor);
  const ctx = snap.context;
  const [titleDraft, setTitleDraft] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [labelDraft, setLabelDraft] = useState("");

  const id = ctx.selectedId;
  if (id === null) {
    return <section data-testid="detail">select an issue</section>;
  }

  const issueLoading = snap.matches({ detail: { selected: { issue: "loading" } } });
  const issueLoaded = snap.matches({ detail: { selected: { issue: "loaded" } } });
  const issueNotFound = snap.matches({ detail: { selected: { issue: "notFound" } } });
  const issueFailed = snap.matches({ detail: { selected: { issue: "failed" } } });
  const commentsLoading = snap.matches({ detail: { selected: { comments: "loading" } } });
  const commentsLoaded = snap.matches({ detail: { selected: { comments: "loaded" } } });
  const commentsFailed = snap.matches({ detail: { selected: { comments: "failed" } } });
  const labelsLoading = snap.matches({ detail: { selected: { labels: "loading" } } });
  const labelsLoaded = snap.matches({ detail: { selected: { labels: "loaded" } } });
  const labelsFailed = snap.matches({ detail: { selected: { labels: "failed" } } });
  const relatedSearching = snap.matches({ detail: { selected: { related: "searching" } } });
  const relatedDone = snap.matches({ detail: { selected: { related: "done" } } });
  const relatedFailed = snap.matches({ detail: { selected: { related: "failed" } } });

  return (
    <div className="detail-wrap">
      <section data-testid="detail">
        {issueLoading && <p>{`loading #${id}`}</p>}
        {issueLoaded && ctx.issue && (
          <>
            <h2>{`#${ctx.issue.id} ${ctx.issue.title}`}</h2>
            <p>{ctx.issue.body}</p>
          </>
        )}
        {issueNotFound && <p>{`detail error: issue #${id} not found`}</p>}
        {issueFailed && <p>{`detail error: ${ctx.issueError}`}</p>}
        <button data-testid="retry" onClick={() => send({ type: "RETRY" })}>
          retry
        </button>
        <div>
          <button
            data-testid="assign"
            onClick={() => send({ type: "ASSIGN", id, scope: "detail" })}
          >
            {`assign to ${ctx.user}`}
          </button>
          {ctx.errors.assign !== null && <p data-testid="assign-error">{ctx.errors.assign}</p>}
        </div>
        <div>
          <input
            data-testid="title-input"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
          />
          <button
            data-testid="rename"
            onClick={() => {
              if (titleDraft.trim() !== "") send({ type: "RENAME", title: titleDraft.trim() });
            }}
          >
            rename
          </button>
          {ctx.errors.rename !== null && <p data-testid="rename-error">{`rename error: ${ctx.errors.rename}`}</p>}
        </div>
        <div>
          <button data-testid="close" onClick={() => send({ type: "CLOSE", id, scope: "detail" })}>
            close
          </button>
          {ctx.errors.close !== null && <p data-testid="close-error">{`close error: ${ctx.errors.close}`}</p>}
        </div>
      </section>

      <section data-testid="comments">
        {commentsLoading && "loading comments"}
        {commentsFailed && `comments error: ${ctx.commentsError}`}
        {commentsLoaded && (
          <ul>
            {ctx.comments.map((c) => (
              <li key={c.key} data-testid="comment">
                {`${c.author}: ${c.text}${c.pending ? " (sending…)" : ""}`}
              </li>
            ))}
          </ul>
        )}
      </section>
      <div>
        <input
          data-testid="comment-input"
          value={commentDraft}
          onChange={(e) => setCommentDraft(e.target.value)}
        />
        <button
          data-testid="post"
          onClick={() => {
            if (commentDraft !== "") {
              send({ type: "POST", text: commentDraft });
              setCommentDraft("");
            }
          }}
        >
          post
        </button>
        {ctx.errors.post !== null && <p data-testid="post-error">{`post error: ${ctx.errors.post}`}</p>}
      </div>

      <section data-testid="labels">
        {labelsLoading && "loading labels"}
        {labelsFailed && `labels error: ${ctx.labelsError}`}
        {labelsLoaded && (
          <ul>
            {ctx.labels.map((l) => (
              <li key={l}>
                <span data-testid="label">{l}</span>{" "}
                <button data-testid="remove-label" onClick={() => send({ type: "REMOVE_LABEL", label: l })}>
                  {`remove ${l}`}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <div>
        <input
          data-testid="label-input"
          value={labelDraft}
          onChange={(e) => setLabelDraft(e.target.value)}
        />
        <button
          data-testid="add-label"
          onClick={() => {
            if (labelDraft.trim() !== "") {
              send({ type: "ADD_LABEL", label: labelDraft.trim() });
              setLabelDraft("");
            }
          }}
        >
          add label
        </button>
        {ctx.errors.label !== null && <p data-testid="label-error">{`label error: ${ctx.errors.label}`}</p>}
      </div>

      {issueLoaded && (
        <section data-testid="related">
          {relatedSearching && "finding related help"}
          {relatedFailed && `related help failed: ${ctx.relatedError}`}
          {relatedDone &&
            (ctx.hits.length > 0 ? (
              <ul>
                {ctx.hits.map((h) => (
                  <li key={h.id}>
                    <button data-testid="related-hit" onClick={() => send({ type: "OPEN_RELATED", id: h.id })}>
                      {h.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              "no related help"
            ))}
        </section>
      )}
    </div>
  );
}

function HelpPage({ actor }: { actor: HelpRef }) {
  const snap = useSelector(actor, (s) => s);
  const send = actor.send.bind(actor);
  const ctx = snap.context;
  const tooShort = snap.matches({ search: "tooShort" });
  const searching = snap.matches({ search: "searching" });
  const results = snap.matches({ search: "results" });
  const searchFailed = snap.matches({ search: "failed" });
  const itemNone = snap.matches({ item: "none" });
  const itemLoading = snap.matches({ item: "loading" });
  const itemLoaded = snap.matches({ item: "loaded" });
  const itemNotFound = snap.matches({ item: "notFound" });
  const itemFailed = snap.matches({ item: "failed" });
  const showHits = searching || results;

  return (
    <div className="help">
      <label>
        Search{" "}
        <input data-testid="query" value={ctx.query} onChange={(e) => send({ type: "QUERY", q: e.target.value })} />
      </label>
      <section data-testid="results">
        {tooShort && `too short: ${ctx.query}`}
        {searching && <p>searching…</p>}
        {results && <p>{`${ctx.hits.length} results for ${ctx.query}`}</p>}
        {searchFailed && `search failed: ${ctx.searchError}`}
        {showHits && (
          <ul>
            {ctx.hits.map((h) => (
              <li
                key={h.id}
                data-testid="hit"
                onClick={() => send({ type: "SELECT", id: h.id })}
              >
                {`${ctx.selectedId === h.id ? "> " : ""}${h.name}`}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section data-testid="item">
        {itemNone && "pick a result"}
        {itemLoading && "loading…"}
        {itemLoaded && ctx.item && (
          <>
            <h3>{ctx.item.name}</h3>
            <p>{ctx.item.blurb}</p>
          </>
        )}
        {itemNotFound && `item ${ctx.selectedId} not found`}
        {itemFailed && (
          <>
            <p>{`failed: ${ctx.itemError}`}</p>
            <button data-testid="retry-item" onClick={() => send({ type: "RETRY" })}>
              retry
            </button>
          </>
        )}
      </section>
    </div>
  );
}

function SettingsPage({ actor }: { actor: SettingsRef }) {
  const snap = useSelector(actor, (s) => s);
  const send = actor.send.bind(actor);
  const { draft, saved, pendingSave, loadError, saveError } = snap.context;
  const loading = snap.matches("loading");
  const loadFailed = snap.matches("loadFailed");
  const loaded = snap.matches("loaded");
  const saving = snap.matches({ loaded: "saving" });
  const problem = nameProblem(draft.name);
  const shown = saving && pendingSave ? pendingSave : saved;

  return (
    <div className="settings">
      <div data-testid="load">
        {loading && "Loading settings…"}
        {loadFailed && `Could not load settings: ${loadError}`}
      </div>
      {loadFailed && (
        <button data-testid="retry-load" onClick={() => send({ type: "RETRY" })}>
          retry
        </button>
      )}
      {shown && (
        <p data-testid="saved">{`Saved: ${shown.name} · ${shown.theme} · ${shown.density}${saving ? " (saving…)" : ""}`}</p>
      )}
      {loaded && (
        <form onSubmit={(e) => e.preventDefault()}>
          <label>
            Display name{" "}
            <input data-testid="name" value={draft.name} onChange={(e) => send({ type: "SET_NAME", name: e.target.value })} />
          </label>
          <span data-testid="name-count">{`${draft.name.length}/${NAME_MAX}`}</span>
          {problem !== null && <p data-testid="name-error">{problem}</p>}
          <div>
            <button
              type="button"
              data-testid="theme-light"
              aria-pressed={draft.theme === "light"}
              onClick={() => send({ type: "SET_THEME", theme: "light" })}
            >
              light
            </button>
            <button
              type="button"
              data-testid="theme-dark"
              aria-pressed={draft.theme === "dark"}
              onClick={() => send({ type: "SET_THEME", theme: "dark" })}
            >
              dark
            </button>
            <button type="button" data-testid="density-toggle" onClick={() => send({ type: "TOGGLE_DENSITY" })}>
              {`density: ${draft.density}`}
            </button>
          </div>
          <p data-testid="preview">{`Preview: ${draft.theme} / ${draft.density}`}</p>
          <button type="button" data-testid="save" onClick={() => send({ type: "SAVE" })}>
            save
          </button>
          {saveError !== null && <p data-testid="save-error">{`Save failed: ${saveError}`}</p>}
        </form>
      )}
    </div>
  );
}
