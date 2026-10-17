/** Trim, lowercase, drop a leading "#", and collapse inner whitespace. */
export function normalizeTag(raw: string): string {
  return raw.trim().replace(/^#+/, '').replace(/\s+/g, ' ').toLowerCase();
}

/** Every tag in use across `records`, most used first (ties alphabetical), for suggestions. */
export function tagsByUse(records: readonly { tags?: readonly string[] }[] | null): string[] {
  const counts = new Map<string, number>();
  for (const r of records ?? []) {
    for (const tag of Array.isArray(r.tags) ? r.tags : [])
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag]) => tag);
}
