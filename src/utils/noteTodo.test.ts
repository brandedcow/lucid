import { hasTodo } from './noteTodo';

describe('hasTodo', () => {
  it.each([
    '- [ ] a',
    '- [x] a',
    '- [X] a',
    '* [ ] a',
    '   - [ ] a',
    'T\n\n- [ ] a',
    'T\r\n- [x] a',
    '- [ ]',
  ])('is true for %j', (body) => expect(hasTodo(body)).toBe(true));

  it.each(['', 'plain', '- item', '-[ ] a', '- [] a', '- [y] a', '[ ] a', 'a - [ ] b', '1. [ ] a'])(
    'is false for %j',
    (body) => expect(hasTodo(body)).toBe(false),
  );
});

describe('hasTodo and fenced code', () => {
  it.each([
    '```\n- [ ] a\n```',
    '```\n- [ ] a',
    '```js\n- [x] a\n```\n',
    'T\n````\n- [ ] a\n```\n````',
  ])('ignores a checkbox inside a fence: %j', (body) => {
    expect(hasTodo(body)).toBe(false);
  });

  it.each([
    '```\ncode\n```\n- [ ] a',
    '- [ ] a\n```\ncode\n```',
    '`- [ ] a`\n- [ ] b',
    '```\nx\n```\n```\ny\n```\n- [x] z',
    '```\r\nx\r\n```\r\n- [ ] a',
  ])('still finds a checkbox outside a fence: %j', (body) => {
    expect(hasTodo(body)).toBe(true);
  });

  it('is false when the only checkbox is in a fence closed by a longer fence', () => {
    expect(hasTodo('```\n- [ ] a\n````')).toBe(false);
  });
});
