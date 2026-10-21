/**
 * The note body with a voice note's transcript added at the end, after one blank line (or on its
 * own when the body is empty). Trailing whitespace of the body and surrounding whitespace of the
 * transcript are dropped. A blank transcript returns the body unchanged.
 */
export function appendTranscript(body: string, text: string): string {
  const add = text.trim();
  if (add === '') return body;
  const base = body.trimEnd();
  return base === '' ? add : `${base}\n\n${add}`;
}
