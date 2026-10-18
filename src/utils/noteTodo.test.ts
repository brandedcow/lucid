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
