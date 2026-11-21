/** The text to show for a failed request. */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
