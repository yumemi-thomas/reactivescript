import { useEffect, useReducer, useRef, useState } from "react";
import { addComment, fetchComments } from "./api.js";
import type { Comment } from "./api.js";
import { messageOf } from "./errors";

type Item = { key: string; author: string; text: string; sending: boolean };

type State = {
  loading: boolean;
  loadError: string | null;
  items: Item[];
  postError: string | null;
};

type Action =
  | { type: "loaded"; comments: Comment[] }
  | { type: "loadFailed"; message: string }
  | { type: "postStart"; key: string; author: string; text: string }
  | { type: "postOk"; key: string }
  | { type: "postFail"; key: string; message: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "loaded": {
      // Comments still being sent stay at the end; the rest is what the server says.
      const sending = state.items.filter((item) => item.sending);
      const server = action.comments.map((c, i) => ({
        key: `server-${i}`,
        author: c.author,
        text: c.text,
        sending: false,
      }));
      return { ...state, loading: false, loadError: null, items: [...server, ...sending] };
    }
    case "loadFailed":
      return { ...state, loading: false, loadError: action.message };
    case "postStart":
      return {
        ...state,
        postError: null,
        items: [...state.items, { key: action.key, author: action.author, text: action.text, sending: true }],
      };
    case "postOk":
      return {
        ...state,
        items: state.items.map((item) => (item.key === action.key ? { ...item, sending: false } : item)),
      };
    case "postFail":
      return {
        ...state,
        items: state.items.filter((item) => item.key !== action.key),
        postError: `post error: ${action.message}`,
      };
  }
  return state;
}

/** The comments of one issue, with the comment box. Remounted for each selection. */
export default function Comments({ id, user }: { id: number; user: string }) {
  const [state, dispatch] = useReducer(reducer, {
    loading: true,
    loadError: null,
    items: [],
    postError: null,
  });
  const [draft, setDraft] = useState("");
  const seq = useRef(0);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    fetchComments(id).then(
      (comments) => dispatch({ type: "loaded", comments }),
      (e: unknown) => dispatch({ type: "loadFailed", message: messageOf(e) }),
    );
  }, [id]);

  const post = () => {
    const text = draft.trim();
    const author = user.trim();
    if (!text || !author) return;
    seq.current += 1;
    const key = `post-${seq.current}`;
    setDraft("");
    dispatch({ type: "postStart", key, author, text });
    addComment(id, author, text).then(
      () => dispatch({ type: "postOk", key }),
      (e: unknown) => dispatch({ type: "postFail", key, message: messageOf(e) }),
    );
  };

  return (
    <div>
      <div data-testid="comments">
        {state.loading && <p>loading comments</p>}
        {state.loadError && <p>{`comments error: ${state.loadError}`}</p>}
        <ul>
          {state.items.map((item) => (
            <li key={item.key} data-testid="comment">
              {`${item.author}: ${item.text}${item.sending ? " (sending…)" : ""}`}
            </li>
          ))}
        </ul>
        {state.postError && <p>{state.postError}</p>}
      </div>
      <input
        data-testid="comment-input"
        aria-label="comment"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      <button type="button" data-testid="post" onClick={post}>
        post
      </button>
    </div>
  );
}
