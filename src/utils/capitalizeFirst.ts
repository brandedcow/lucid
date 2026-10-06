/** Uppercases the first character for display; the rest stays exactly as typed. */
export function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
