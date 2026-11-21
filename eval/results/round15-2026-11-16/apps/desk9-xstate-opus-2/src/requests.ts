import { fromCallback, fromPromise, type EventObject } from "xstate";
import * as api from "./api.js";
import type { Comment, Filter, Hit, Issue, IssueDetail, Item, Settings } from "./types";
import type { Change } from "./model";
import { errorMessage, stamp } from "./clock";

/* ---------- loads: invoked promise actors, cancelled by leaving their state ---------- */

export const loadIssues = fromPromise(async ({ input }: { input: { filter: Filter } }): Promise<{ items: Issue[]; at: number }> => {
  const at = stamp();
  const items = await api.fetchIssues(input.filter);
  return { items, at };
});

export const loadIssue = fromPromise(async ({ input }: { input: { id: number } }): Promise<{ issue: IssueDetail | null; at: number }> => {
  const at = stamp();
  const issue = await api.fetchIssue(input.id);
  return { issue, at };
});

export const loadComments = fromPromise(async ({ input }: { input: { id: number } }): Promise<{ comments: Comment[]; at: number }> => {
  const at = stamp();
  const comments = await api.fetchComments(input.id);
  return { comments, at };
});

export const loadLabels = fromPromise(async ({ input }: { input: { id: number } }): Promise<{ labels: string[]; at: number }> => {
  const at = stamp();
  const labels = await api.fetchLabels(input.id);
  return { labels, at };
});

export const searchHelp = fromPromise(async ({ input }: { input: { q: string } }): Promise<{ q: string; hits: Hit[] }> => {
  const hits = await api.search(input.q);
  return { q: input.q, hits };
});

export const loadItem = fromPromise(async ({ input }: { input: { id: number } }): Promise<Item | null> => api.fetchItem(input.id));

export const loadSettings = fromPromise(async (): Promise<Settings> => api.loadSettings());

/* ---------- mutations: spawned, several may be in flight at once ---------- */

/**
 * Wraps a server mutation as a callback actor that reports back to its parent
 * with `<name>.done` (with the answer and the stamp of when it landed) or
 * `<name>.failed` (with the server's message). Once stopped, it reports nothing.
 */
function mutation<I extends { opId: number }, O>(name: string, call: (input: I) => Promise<O>) {
  return fromCallback<EventObject, I>(({ input, sendBack }) => {
    let live = true;
    call(input).then(
      (output) => {
        if (live) sendBack({ type: `${name}.done`, opId: input.opId, output, at: stamp() });
      },
      (error: unknown) => {
        if (live) sendBack({ type: `${name}.failed`, opId: input.opId, message: errorMessage(error) });
      },
    );
    return () => {
      live = false;
    };
  });
}

export const changeRequest = mutation("change", async (input: { opId: number; change: Change }): Promise<Change> => {
  const { change } = input;
  switch (change.kind) {
    case "assign": {
      const r = await api.assign(change.id, change.assignee);
      return { kind: "assign", id: change.id, assignee: r.assignee };
    }
    case "rename": {
      const r = await api.renameIssue(change.id, change.title);
      return { kind: "rename", id: change.id, title: r.title };
    }
    case "close": {
      await api.closeIssue(change.id);
      return { kind: "close", id: change.id };
    }
  }
});

export const postRequest = mutation("post", (input: { opId: number; id: number; author: string; text: string }) =>
  api.addComment(input.id, input.author, input.text),
);

export const labelRequest = mutation("label", (input: { opId: number; id: number; kind: "add" | "remove"; label: string }) =>
  input.kind === "add" ? api.addLabel(input.id, input.label) : api.removeLabel(input.id, input.label),
);

export const saveRequest = mutation("save", (input: { opId: number; settings: Settings }) => api.saveSettings(input.settings));
