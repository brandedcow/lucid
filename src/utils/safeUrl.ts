/**
 * Allow-list checks for URLs found in a Note's Body before the reading view opens or loads them.
 * Pure; no regex lookbehind and no \p{} escapes (Hermes). Anything not explicitly allowed
 * (`javascript:`, `data:`, `file:`, `content:`, `intent:`, `mailto:`, `tel:`, protocol-relative
 * `//x`, relative paths...) is rejected by the scheme allow-list itself.
 */

export const MAX_URL_LENGTH = 2048;

// Whitespace (incl. Unicode spaces, U+2028/2029, BOM), C0/C1 control characters, zero-width marks.
const FORBIDDEN = /[\s\u0000-\u001f\u007f-\u009f​-‏⁠﻿]/;
const SCHEME = /^(https?):\/\//i;

/** Result of `imageUrlStatus`: usable, valid but plain http (needs https), or unusable. */
export type ImageUrlStatus = 'ok' | 'needs-https' | 'invalid';

/** The trimmed URL when it is a well-formed http(s) URL, with its lowercase scheme; else null. */
function parse(input: string): { url: string; scheme: 'http' | 'https' } | null {
  if (typeof input !== 'string') return null;
  const url = input.trim();
  if (url.length === 0 || url.length > MAX_URL_LENGTH) return null;
  if (FORBIDDEN.test(url)) return null;
  const m = url.match(SCHEME);
  if (!m) return null;
  const rest = url.slice(m[0].length);
  let end = rest.length;
  for (const ch of ['/', '?', '#']) {
    const i = rest.indexOf(ch);
    if (i !== -1 && i < end) end = i;
  }
  const authority = rest.slice(0, end);
  // No userinfo, no backslashes (browsers read them as "/"), and a non-empty host.
  if (authority === '' || authority.indexOf('@') !== -1 || authority.indexOf('\\') !== -1) {
    return null;
  }
  if (authority[0] === ':') return null;
  return { url, scheme: m[1].toLowerCase() as 'http' | 'https' };
}

/** The trimmed URL if it is a safe link target (`http://` or `https://`), else null. */
export function safeWebUrl(input: string): string | null {
  return parse(input)?.url ?? null;
}

/** The trimmed URL if it is a safe image source (`https://` only), else null. */
export function safeImageUrl(input: string): string | null {
  const p = parse(input);
  return p && p.scheme === 'https' ? p.url : null;
}

/** 'ok' for a valid https URL, 'needs-https' for an otherwise valid http URL, else 'invalid'. */
export function imageUrlStatus(input: string): ImageUrlStatus {
  const p = parse(input);
  if (!p) return 'invalid';
  return p.scheme === 'https' ? 'ok' : 'needs-https';
}
