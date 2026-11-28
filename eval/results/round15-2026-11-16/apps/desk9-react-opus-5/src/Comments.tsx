import { useState } from "react";
import * as api from "./api.js";
import { useFetch } from "./useFetch";
import { errorMessage, nextId, tick } from "./util";

type Post = { postId: number; author: string; text: string; doneAt: number | null };

export function Comments({ id, user }: { id: number; user: string }) {
  const load = useFetch(api.fetchComments, [id]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [input, setInput] = useState("");
  const [postError, setPostError] = useState<string | null>(null);

  const base = load?.status === "ok" ? load.data : [];
  const shownPosts = posts.filter(p => {
    if (p.doneAt === null || load?.status !== "ok") return true;
    // an answer that arrived after the post was accepted already holds it
    if (load.answeredAt > p.doneAt) return !base.some(c => c.author === p.author && c.text === p.text);
    return true;
  });

  function doPost() {
    const text = input.trim();
    const author = user.trim();
    if (text === "" || author === "") return;
    const postId = nextId();
    setPostError(null);
    setInput("");
    setPosts(ps => [...ps, { postId, author, text, doneAt: null }]);
    api.addComment(id, author, text).then(
      res => {
        const at = tick();
        setPosts(ps => ps.map(p => (p.postId === postId ? { ...p, author: res.author, text: res.text, doneAt: at } : p)));
      },
      (e: unknown) => {
        setPosts(ps => ps.filter(p => p.postId !== postId));
        setPostError(`post error: ${errorMessage(e)}`);
      },
    );
  }

  return (
    <section>
      <h3>Comments</h3>
      <div data-testid="comments">
        {load?.status === "loading" && <p className="muted">loading comments</p>}
        {load?.status === "error" && <p className="error">comments error: {load.error}</p>}
        <ul>
          {base.map((c, i) => (
            <li key={`c${i}`} data-testid="comment">{`${c.author}: ${c.text}`}</li>
          ))}
          {shownPosts.map(p => (
            <li key={`p${p.postId}`} data-testid="comment">
              {`${p.author}: ${p.text}${p.doneAt === null ? " (sending…)" : ""}`}
            </li>
          ))}
        </ul>
      </div>
      <form
        className="field"
        onSubmit={e => {
          e.preventDefault();
          doPost();
        }}
      >
        <input
          data-testid="comment-input"
          aria-label="Comment"
          placeholder="Write a comment"
          value={input}
          onChange={e => setInput(e.target.value)}
        />
        <button type="submit" data-testid="post">
          post
        </button>
      </form>
      {postError !== null && <p className="error" role="alert">{postError}</p>}
    </section>
  );
}
