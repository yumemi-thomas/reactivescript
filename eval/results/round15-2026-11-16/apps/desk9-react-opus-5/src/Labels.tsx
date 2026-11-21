import { useState } from "react";
import * as api from "./api.js";
import { useFetch } from "./useFetch";
import { errorMessage, nextId, tick } from "./util";

type Change = { changeId: number; kind: "add" | "remove"; label: string };

export function Labels({ id }: { id: number }) {
  const load = useFetch(api.fetchLabels, [id]);
  /** the newest server answer to one of our changes, with the time its request was sent */
  const [answer, setAnswer] = useState<{ labels: string[]; sentAt: number } | null>(null);
  const [changes, setChanges] = useState<Change[]>([]);
  const [input, setInput] = useState("");
  const [labelError, setLabelError] = useState<string | null>(null);

  let base: string[] | null = null;
  if (load?.status === "ok") base = load.data;
  if (answer !== null && (load?.status !== "ok" || answer.sentAt > load.startedAt)) base = answer.labels;

  let shown = base ?? [];
  for (const c of changes) {
    if (c.kind === "add") {
      if (!shown.includes(c.label)) shown = [...shown, c.label];
    } else {
      shown = shown.filter(l => l !== c.label);
    }
  }

  function run(kind: Change["kind"], label: string) {
    const changeId = nextId();
    const sentAt = tick();
    setLabelError(null);
    setChanges(cs => [...cs, { changeId, kind, label }]);
    const call = kind === "add" ? api.addLabel(id, label) : api.removeLabel(id, label);
    call.then(
      labels => {
        setAnswer(a => (a === null || a.sentAt < sentAt ? { labels, sentAt } : a));
        setChanges(cs => cs.filter(c => c.changeId !== changeId));
      },
      (e: unknown) => {
        setChanges(cs => cs.filter(c => c.changeId !== changeId));
        setLabelError(`label error: ${errorMessage(e)}`);
      },
    );
  }

  function doAdd() {
    const label = input.trim();
    if (label === "" || shown.includes(label)) return;
    setInput("");
    run("add", label);
  }

  const showList = base !== null || changes.length > 0;

  return (
    <section>
      <h3>Labels</h3>
      <div data-testid="labels">
        {base === null && load?.status === "loading" && <p className="muted">loading labels</p>}
        {base === null && load?.status === "error" && <p className="error">labels error: {load.error}</p>}
        {showList && (
          <ul className="row">
            {shown.map(label => (
              <li key={label} className="chip">
                <span data-testid="label">{label}</span>
                <button data-testid="remove-label" aria-label={`remove ${label}`} onClick={() => run("remove", label)}>
                  {`remove ${label}`}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <form
        className="field"
        onSubmit={e => {
          e.preventDefault();
          doAdd();
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
      {labelError !== null && <p className="error" role="alert">{labelError}</p>}
    </section>
  );
}
