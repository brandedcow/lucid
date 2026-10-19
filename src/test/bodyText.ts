/**
 * The text of a body input that has no `value` prop (its text is its nested <Text> children), so
 * tests read the text from the children.
 */
export function bodyText(input: { props: { children?: unknown } }): string {
  const flat = (node: unknown): string => {
    if (node === null || node === undefined || typeof node === 'boolean') return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(flat).join('');
    const el = node as { props?: { children?: unknown } };
    return flat(el.props?.children);
  };
  return flat(input.props.children);
}
