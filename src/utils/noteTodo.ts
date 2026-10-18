const CHECKBOX_LINE = /^\s*[-*] \[[ xX]\]/;

/** True when any line of the body is a markdown checkbox (`- [ ]`, `- [x]`, also with `*`). */
export function hasTodo(body: string): boolean {
  return body.split(/\r\n|\n|\r/).some((line) => CHECKBOX_LINE.test(line));
}
