export type Kind = "assign" | "rename" | "close";

export interface Op {
  readonly seq: number;
  readonly id: number;
  readonly kind: Kind;
  readonly value: string;
}

interface Confirmed {
  seq: number;
  at: number;
  value: string;
}

/**
 * Optimistic issue changes, kept for the whole app so that a change still in
 * flight is shown over freshly loaded data, and a confirmed change is applied
 * over data whose request started before the server confirmed it.
 */
export class IssueStore {
  private tick = 0;
  private ops: Op[] = [];
  private confirmed = new Map<string, Confirmed>();
  private listeners = new Set<() => void>();

  /** A monotonically increasing stamp, used to order requests and changes. */
  now(): number {
    return ++this.tick;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of [...this.listeners]) fn();
  }

  start(id: number, kind: Kind, value: string): Op {
    const op: Op = { seq: this.now(), id, kind, value };
    this.ops.push(op);
    this.emit();
    return op;
  }

  settle(op: Op, accepted: boolean, value: string = op.value): void {
    this.ops = this.ops.filter(o => o !== op);
    if (accepted) {
      const key = `${op.id}:${op.kind}`;
      const prev = this.confirmed.get(key);
      if (!prev || op.seq > prev.seq) this.confirmed.set(key, { seq: op.seq, at: this.now(), value });
    }
    this.emit();
  }

  /** The value to show for a field whose server value `base` was requested at stamp `at`. */
  resolve(id: number, kind: Kind, base: string | null, at: number): string | null {
    let value = base;
    let floor = -1;
    const c = this.confirmed.get(`${id}:${kind}`);
    if (c) {
      floor = c.seq;
      if (c.at > at) value = c.value;
    }
    for (const op of this.ops) if (op.id === id && op.kind === kind && op.seq > floor) value = op.value;
    return value;
  }

  isClosed(id: number, at: number): boolean {
    return this.resolve(id, "close", null, at) !== null;
  }
}
