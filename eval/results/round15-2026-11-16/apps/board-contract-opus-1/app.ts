// The sprint board's data module: each source asks the backend (src/api.js) and answers exactly
// its declared shape; `overlay` shows every write from the moment it is sent until an answer
// asked after its reply has it, so a declined write simply stops showing.
import type { Answer, Args, Overlay, Result, Source, Sources, Write } from './app.contract.d.ts';
import * as api from './src/api.js';

export const grants = '';

type Column = 'todo' | 'doing' | 'done';
type Card = Result<'fetchCards'>[number];
type Item = Result<'fetchChecklist'>[number];
type Archived = Result<'fetchArchived'>[number];

const COLUMNS: readonly Column[] = ['todo', 'doing', 'done'];
const asColumn = (c: string): Column => {
  if (c === 'todo' || c === 'doing' || c === 'done') return c;
  throw refusal(`unknown column ${c}`);
};

/** An error whose `reason` carries the server's message as written, for the view to show. */
function refusal(message: string): Error {
  const err = new Error(message) as Error & { reason: string };
  err.reason = message;
  return err;
}
async function ask<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw refusal(message || 'request failed');
  }
}

const toCard = (c: { id: number; title: string; done: number; total: number }): Card =>
  ({ id: c.id, title: c.title, done: c.done, total: c.total });
const toItem = (i: { id: number; text: string; done: boolean }): Item =>
  ({ id: i.id, text: i.text, done: i.done });

/** The last answer of each column, so one column's overlay can find a card moving in from another. */
const lastAnswer: Record<Column, Card[]> = { todo: [], doing: [], done: [] };

const sources: Sources = {
  fetchCards: async ([column]) => {
    const col = asColumn(column);
    const cards = (await ask(() => api.fetchCards(col))).map(toCard);
    lastAnswer[col] = cards;
    return cards;
  },
  moveCard: async ([id, column, index]) => {
    const r = await ask(() => api.moveCard(id, asColumn(column), index));
    return { id: r.id, column: r.column, index: r.index };
  },
  renameCard: async ([id, title]) => {
    const r = await ask(() => api.renameCard(id, title));
    return { id: r.id, title: r.title };
  },
  addCard: async ([column, title]) => {
    const r = await ask(() => api.addCard(asColumn(column), title));
    return { id: r.id, title: r.title };
  },
  archiveCard: async ([id]) => {
    const r = await ask(() => api.archiveCard(id));
    return { id: r.id };
  },
  fetchChecklist: async ([id]) => (await ask(() => api.fetchChecklist(id))).map(toItem),
  toggleItem: async ([cardId, itemId, done]) => {
    const r = await ask(() => api.toggleItem(cardId, itemId, done));
    return { id: r.id, done: r.done };
  },
  addItem: async ([cardId, text]) => toItem(await ask(() => api.addItem(cardId, text))),
  fetchArchived: async () =>
    (await ask(() => api.fetchArchived())).map((a): Archived => ({ id: a.id, title: a.title })),
  restoreCard: async ([id]) => {
    const r = await ask(() => api.restoreCard(id));
    return { id: r.id };
  },
};
export const answer: Answer = (source, args, store, storage, native) =>
  sources[source](args, store, storage, native);

/** The writes an answer does not have yet, in the order the person made them. */
const outstanding = (writes: readonly Write[]): Write[] =>
  writes.filter((w) => !w.answered).sort((a, b) => a.id - b.id);

/** Something still being added has no id yet: it shows under a negative key of its own. */
const placeholderId = (w: Write) => -(w.id + 1);

/** The whole board as shown, replayed from the answers and the outstanding writes; one column of it. */
function boardWith(column: Column, cards: Card[], writes: readonly Write[]): Card[] {
  const board: Record<Column, Card[]> = {
    todo: [...lastAnswer.todo], doing: [...lastAnswer.doing], done: [...lastAnswer.done],
  };
  board[column] = [...cards];
  const find = (id: number): Card | undefined => {
    for (const col of COLUMNS) {
      const c = board[col].find((x) => x.id === id);
      if (c) return c;
    }
    return undefined;
  };
  const remove = (id: number) => {
    for (const col of COLUMNS) board[col] = board[col].filter((x) => x.id !== id);
  };
  const update = (id: number, change: (c: Card) => Card) => {
    for (const col of COLUMNS) board[col] = board[col].map((x) => (x.id === id ? change(x) : x));
  };
  for (const w of outstanding(writes)) {
    switch (w.source) {
      case 'moveCard': {
        const [id, to, index, title, done, total] = w.args as Args<'moveCard'>;
        const card = find(id) ?? { id, title, done, total };
        const col = asColumn(to);
        remove(id);
        const dest = board[col];
        const at = Math.max(0, Math.min(index, dest.length));
        board[col] = [...dest.slice(0, at), card, ...dest.slice(at)];
        break;
      }
      case 'addCard': {
        const [to, title] = w.args as Args<'addCard'>;
        const reply = w.reply as Result<'addCard'> | undefined;
        if (reply && find(reply.id)) break;
        const card: Card = reply
          ? { id: reply.id, title: reply.title, done: 0, total: 0 }
          : { id: placeholderId(w), title, done: 0, total: 0 };
        const col = asColumn(to);
        board[col] = [...board[col], card];
        break;
      }
      case 'renameCard': {
        const [id, title] = w.args as Args<'renameCard'>;
        update(id, (c) => ({ ...c, title }));
        break;
      }
      case 'archiveCard': {
        const [id] = w.args as Args<'archiveCard'>;
        remove(id);
        break;
      }
      case 'toggleItem': {
        const [cardId, , done] = w.args as Args<'toggleItem'>;
        update(cardId, (c) => ({ ...c, done: Math.max(0, Math.min(c.total, c.done + (done ? 1 : -1))) }));
        break;
      }
      case 'addItem': {
        const [cardId] = w.args as Args<'addItem'>;
        update(cardId, (c) => ({ ...c, total: c.total + 1 }));
        break;
      }
      default:
        break;
    }
  }
  return board[column].map(toCard);
}

function checklistWith(cardId: number, items: Item[], writes: readonly Write[]): Item[] {
  let shown = items.map(toItem);
  for (const w of outstanding(writes)) {
    if (w.source === 'toggleItem') {
      const [card, itemId, done] = w.args as Args<'toggleItem'>;
      if (card === cardId) shown = shown.map((i) => (i.id === itemId ? { ...i, done } : i));
    } else if (w.source === 'addItem') {
      const [card, text] = w.args as Args<'addItem'>;
      if (card !== cardId) continue;
      const reply = w.reply as Result<'addItem'> | undefined;
      if (reply && shown.some((i) => i.id === reply.id)) continue;
      shown.push(reply ? toItem(reply) : { id: placeholderId(w), text, done: false });
    }
  }
  return shown;
}

function archiveWith(rows: Archived[], writes: readonly Write[]): Archived[] {
  const restoring = new Set(
    outstanding(writes)
      .filter((w) => w.source === 'restoreCard')
      .map((w) => (w.args as Args<'restoreCard'>)[0]),
  );
  return rows.filter((a) => !restoring.has(a.id)).map((a) => ({ id: a.id, title: a.title }));
}

export const overlay: Overlay = <S extends Source>(
  source: S, args: Args<S>, value: Result<S>, writes: readonly Write[],
): Result<S> | undefined => {
  if (source === 'fetchCards') {
    const [column] = args as Args<'fetchCards'>;
    return boardWith(asColumn(column), value as Result<'fetchCards'>, writes) as never;
  }
  if (source === 'fetchChecklist') {
    const [cardId] = args as Args<'fetchChecklist'>;
    return checklistWith(cardId, value as Result<'fetchChecklist'>, writes) as never;
  }
  if (source === 'fetchArchived') return archiveWith(value as Result<'fetchArchived'>, writes) as never;
  return undefined;
};
