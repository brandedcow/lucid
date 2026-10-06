/** Trim, lowercase, drop a leading "#", and collapse inner whitespace. */
export function normalizeTag(raw: string): string {
  return raw.trim().replace(/^#+/, '').replace(/\s+/g, ' ').toLowerCase();
}

/** Adds `raw` to `tags` if it normalizes to something new. */
export function addTag(tags: string[], raw: string): string[] {
  const tag = normalizeTag(raw);
  return tag && !tags.includes(tag) ? [...tags, tag] : tags;
}
