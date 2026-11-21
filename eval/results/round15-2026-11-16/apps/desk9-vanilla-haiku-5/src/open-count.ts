/**
 * The open-issues count shown on the issues tab.
 *
 * It counts the open issues the issues page shows: the last loaded open list, minus the issues whose close has
 * started or was accepted. A declined close puts its issue back. The count is published only while the issues page
 * is on screen; while another page is open it keeps the number it last showed.
 */
export class OpenIssues {
  private ids: number[] | null = null;
  private readonly closing = new Set<number>();
  private active = false;
  private readonly show: (count: number | null) => void;

  constructor(show: (count: number | null) => void) {
    this.show = show;
  }

  /** true while the issues page is on screen */
  activate(on: boolean): void {
    this.active = on;
  }

  /** the open list answered with these ids; ignored while the issues page is not on screen */
  loaded(ids: number[]): void {
    if (!this.active) return;
    this.ids = ids;
    this.publish();
  }

  /** a close of `id` started (or was accepted): its row is hidden and not counted */
  hide(id: number): void {
    this.closing.add(id);
    this.publish();
  }

  /** a close of `id` was declined: its row is shown and counted again */
  restore(id: number): void {
    this.closing.delete(id);
    this.publish();
  }

  isHidden(id: number): boolean {
    return this.closing.has(id);
  }

  private publish(): void {
    if (!this.active) return;
    const ids = this.ids;
    this.show(ids === null ? null : ids.filter((id) => !this.closing.has(id)).length);
  }
}
