import { useEffect, useReducer, useRef, useState } from "react";
import { addLabel, fetchLabels, removeLabel } from "./api.js";
import { messageOf } from "./errors";

type State = {
  loading: boolean;
  loadError: string | null;
  labels: string[];
  changeError: string | null;
};

type Action =
  | { type: "loaded"; labels: string[] }
  | { type: "loadFailed"; message: string }
  | { type: "addStart"; label: string }
  | { type: "addFail"; label: string; message: string }
  | { type: "removeStart"; label: string }
  | { type: "removeFail"; label: string; index: number; message: string }
  | { type: "changed"; labels: string[] };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "loaded":
      return { ...state, loading: false, loadError: null, labels: action.labels };
    case "loadFailed":
      return { ...state, loading: false, loadError: action.message };
    case "addStart":
      return { ...state, changeError: null, labels: [...state.labels, action.label] };
    case "addFail": {
      const at = state.labels.lastIndexOf(action.label);
      const labels = at >= 0 ? state.labels.filter((_, i) => i !== at) : state.labels;
      return { ...state, labels, changeError: `label error: ${action.message}` };
    }
    case "removeStart":
      return {
        ...state,
        changeError: null,
        labels: state.labels.filter((label) => label !== action.label),
      };
    case "removeFail": {
      if (state.labels.includes(action.label)) {
        return { ...state, changeError: `label error: ${action.message}` };
      }
      const labels = [...state.labels];
      if (action.index >= 0) labels.splice(Math.min(action.index, labels.length), 0, action.label);
      else labels.push(action.label);
      return { ...state, labels, changeError: `label error: ${action.message}` };
    }
    case "changed":
      return { ...state, labels: action.labels };
  }
  return state;
}

/** The labels of one issue, with the add box. Remounted for each selection. */
export default function Labels({ id }: { id: number }) {
  const [state, dispatch] = useReducer(reducer, {
    loading: true,
    loadError: null,
    labels: [],
    changeError: null,
  });
  const [draft, setDraft] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    fetchLabels(id).then(
      (labels) => dispatch({ type: "loaded", labels }),
      (e: unknown) => dispatch({ type: "loadFailed", message: messageOf(e) }),
    );
  }, [id]);

  const add = () => {
    const label = draft.trim();
    if (!label || state.labels.includes(label)) return;
    setDraft("");
    dispatch({ type: "addStart", label });
    addLabel(id, label).then(
      (labels) => dispatch({ type: "changed", labels }),
      (e: unknown) => dispatch({ type: "addFail", label, message: messageOf(e) }),
    );
  };

  const remove = (label: string) => {
    const index = state.labels.indexOf(label);
    dispatch({ type: "removeStart", label });
    removeLabel(id, label).then(
      (labels) => dispatch({ type: "changed", labels }),
      (e: unknown) => dispatch({ type: "removeFail", label, index, message: messageOf(e) }),
    );
  };

  return (
    <div>
      <div data-testid="labels">
        {state.loading && <p>loading labels</p>}
        {state.loadError && <p>{`labels error: ${state.loadError}`}</p>}
        <ul>
          {state.labels.map((label, i) => (
            <li key={`${i}-${label}`}>
              <span data-testid="label">{label}</span>{" "}
              <button type="button" data-testid="remove-label" onClick={() => remove(label)}>
                {`remove ${label}`}
              </button>
            </li>
          ))}
        </ul>
        {state.changeError && <p>{state.changeError}</p>}
      </div>
      <input
        data-testid="label-input"
        aria-label="label"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      <button type="button" data-testid="add-label" onClick={add}>
        add
      </button>
    </div>
  );
}
