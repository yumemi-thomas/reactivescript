// The board's data module: each source asks the backend (src/api.js) and answers exactly
// its shape. `overlay` lays the writes still out over what the board shows, so each one
// shows at once and leaves by itself when the server declines it. `errorsFor` says which
// declined writes still deserve a message: one whose kind has not started again since.
import type { Answer, Args, Overlay, Result, Sources, Write } from './app.contract.d.ts';
import * as api from './src/api.js';

export const grants = '';

type Card = Result<'cards'>[number];
type Item = Result<'checklist'>[number];
type Archived = Result<'archived'>[number];
type Column = 'todo' | 'doing' | 'done';
type Kind = 'move' | 'add' | 'rename' | 'item' | 'archive' | 'restore';

const COLUMNS: readonly string[] = ['todo', 'doing', 'done'];
const asColumn = (c: string): Column => {
  if (!COLUMNS.includes(c)) throw refusal(`unknown column ${c}`);
  return c as Column;
};

const messageOf = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : 'something went wrong';

/** An error whose message the view shows as it is (`failure(x).reason`). */
function refusal(message: string): Error {
  return Object.assign(new Error(message), { reason: message });
}

async function read<T>(ask: () => Promise<T>): Promise<T> {
  try {
    return await ask();
  } catch (e) {
    throw refusal(messageOf(e));
  }
}

// The latest start of each kind this module has heard of, and each kind's last refusal,
// stamped with the start it came after.
const heard: Record<Kind, number> = { move: 0, add: 0, rename: 0, item: 0, archive: 0, restore: 0 };
const refused: Partial<Record<Kind, { message: string; after: number; card: number }>> = {};
const hear = (kind: Kind, start: number) => {
  if (start > heard[kind]) heard[kind] = start;
};

async function write<T>(kind: Kind, start: number, card: number, ask: () => Promise<T>): Promise<T> {
  hear(kind, start);
  try {
    return await ask();
  } catch (e) {
    const message = messageOf(e);
    refused[kind] = { message, after: heard[kind], card };
    throw refusal(message);
  }
}

const shownRefusal = (kind: Kind, start: number, sel: number | null): string => {
  hear(kind, start);
  const r = refused[kind];
  if (!r || r.after < start) return '';
  if (sel !== null && r.card !== sel) return '';
  return r.message;
};

const toCard = (c: { id: number; title: string; done: number; total: number }): Card => ({
  id: c.id, title: c.title, done: c.done, total: c.total, adding: false,
});
const toItem = (i: { id: number; text: string; done: boolean }): Item => ({
  id: i.id, text: i.text, done: i.done, adding: false,
});

const sources: Sources = {
  cards: async ([column]) => (await read(() => api.fetchCards(asColumn(column)))).map(toCard),
  checklist: async ([id]) => (await read(() => api.fetchChecklist(id))).map(toItem),
  archived: async () => (await read(() => api.fetchArchived())).map((a): Archived => ({ id: a.id, title: a.title })),
  errorsFor: ([move, add, rename, item, archive, restore, sel]): Result<'errorsFor'> => ({
    move: shownRefusal('move', move, null),
    add: shownRefusal('add', add, null),
    rename: shownRefusal('rename', rename, sel),
    item: shownRefusal('item', item, sel),
    archive: shownRefusal('archive', archive, null),
    restore: shownRefusal('restore', restore, null),
  }),

  moveCard: async ([id, , , , , to, index, start]): Promise<Result<'moveCard'>> => {
    const r = await write('move', start, id, () => api.moveCard(id, asColumn(to), index));
    return { id: r.id };
  },
  addCard: async ([title, start]): Promise<Result<'addCard'>> => {
    const r = await write('add', start, 0, () => api.addCard('todo', title));
    return { id: r.id, title: r.title };
  },
  renameCard: async ([id, title, start]): Promise<Result<'renameCard'>> => {
    const r = await write('rename', start, id, () => api.renameCard(id, title));
    return { id: r.id, title: r.title };
  },
  archiveCard: async ([id, start]): Promise<Result<'archiveCard'>> => {
    const r = await write('archive', start, id, () => api.archiveCard(id));
    return { id: r.id };
  },
  toggleItem: async ([cardId, itemId, done, start]): Promise<Result<'toggleItem'>> => {
    const r = await write('item', start, cardId, () => api.toggleItem(cardId, itemId, done));
    return { id: r.id };
  },
  addItem: async ([cardId, text, start]): Promise<Result<'addItem'>> => {
    const r = await write('item', start, cardId, () => api.addItem(cardId, text));
    return toItem(r);
  },
  restoreCard: async ([id, start]): Promise<Result<'restoreCard'>> => {
    const r = await write('restore', start, 0, () => api.restoreCard(id));
    return { id: r.id };
  },
};
export const answer: Answer = (source, args, store, storage, native) =>
  sources[source](args, store, storage, native);

// ---- What the board shows while writes are out ----

/** A column's cards with the writes still out laid over them, in send order. */
function overlayColumn(column: string, answer: readonly Card[], writes: readonly Write[]): Card[] {
  let shown: Card[] = answer.map((c) => ({ ...c }));
  for (const w of writes) {
    if (w.answered) continue; // the answer was asked after its reply: it already says what the server did
    switch (w.source) {
      case 'moveCard': {
        const [id, title, done, total, , to, index] = w.args;
        shown = shown.filter((c) => c.id !== id || c.adding);
        if (to === column) {
          const at = Math.max(0, Math.min(index, shown.length));
          shown.splice(at, 0, { id, title, done, total, adding: false });
        }
        break;
      }
      case 'addCard': {
        if (column !== 'todo') break;
        const [title] = w.args;
        if (w.reply) {
          const { id } = w.reply;
          if (!shown.some((c) => c.id === id && !c.adding)) shown.push({ id, title: w.reply.title, done: 0, total: 0, adding: false });
        } else {
          shown.push({ id: -w.id - 1, title, done: 0, total: 0, adding: true });
        }
        break;
      }
      case 'renameCard': {
        const [id, title] = w.args;
        shown = shown.map((c) => (c.id === id && !c.adding ? { ...c, title } : c));
        break;
      }
      case 'archiveCard': {
        const [id] = w.args;
        shown = shown.filter((c) => c.id !== id || c.adding);
        break;
      }
      case 'toggleItem': {
        const [cardId, , done] = w.args;
        shown = shown.map((c) =>
          c.id === cardId && !c.adding
            ? { ...c, done: Math.max(0, Math.min(c.total, c.done + (done ? 1 : -1))) }
            : c);
        break;
      }
      case 'addItem': {
        const [cardId] = w.args;
        shown = shown.map((c) => (c.id === cardId && !c.adding ? { ...c, total: c.total + 1 } : c));
        break;
      }
      default:
        break;
    }
  }
  return shown;
}

/** A card's checklist with its toggles and adds still out laid over it. */
function overlayChecklist(cardId: number, answer: readonly Item[], writes: readonly Write[]): Item[] {
  let shown: Item[] = answer.map((i) => ({ ...i }));
  for (const w of writes) {
    if (w.answered) continue;
    if (w.source === 'toggleItem') {
      const [card, itemId, done] = w.args;
      if (card !== cardId) continue;
      shown = shown.map((i) => (i.id === itemId && !i.adding ? { ...i, done } : i));
    } else if (w.source === 'addItem') {
      const [card, text] = w.args;
      if (card !== cardId) continue;
      if (w.reply) {
        const r = w.reply;
        if (!shown.some((i) => i.id === r.id && !i.adding)) shown.push({ id: r.id, text: r.text, done: r.done, adding: false });
      } else {
        shown.push({ id: -w.id - 1, text, done: false, adding: true });
      }
    }
  }
  return shown;
}

function overlayArchive(answer: readonly Archived[], writes: readonly Write[]): Archived[] {
  let shown = answer.map((a) => ({ ...a }));
  for (const w of writes) {
    if (w.answered || w.source !== 'restoreCard') continue;
    const [id] = w.args;
    shown = shown.filter((a) => a.id !== id);
  }
  return shown;
}

export const overlay: Overlay = (source, args, answer, writes) => {
  if (source === 'cards') {
    const [column] = args as Args<'cards'>;
    return overlayColumn(column, answer as Result<'cards'>, writes) as never;
  }
  if (source === 'checklist') {
    const [cardId] = args as Args<'checklist'>;
    return overlayChecklist(cardId, answer as Result<'checklist'>, writes) as never;
  }
  if (source === 'archived') return overlayArchive(answer as Result<'archived'>, writes) as never;
  return undefined;
};
