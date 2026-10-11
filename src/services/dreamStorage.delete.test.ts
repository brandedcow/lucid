import * as fakeFs from '../test/fakeFileSystem';
import { Dream } from '../types/dream';
import {
  accountedIds,
  deleteDream,
  isIndexUnreadableError,
  isSafetyCopyBlockedError,
  listDreams,
  resetCorruptCopyGuard,
  saveDream,
} from './dreamStorage';

jest.mock('expo-file-system', () => jest.requireActual('../test/fakeFileSystem'));

const { __fs } = fakeFs;
const DOC = 'file:///document';
const INDEX = `${DOC}/dreams.json`;
const BAK = `${DOC}/dreams.json.bak`;
const audioUri = (name: string) => `${DOC}/dreams/${name}`;
const isIndex = (uri: string) => uri === INDEX;
const isBak = (uri: string) => uri === BAK;

const dream = (id: string, extra: Partial<Dream> = {}): Dream => ({
  id,
  createdAt: `2026-10-0${id.slice(-1)}T08:00:00.000Z`,
  durationMs: 1000,
  title: `Title ${id}`,
  tags: [],
  ...extra,
});
const X = dream('1001', { audioFileName: '1001.m4a', transcript: 'secret "quoted" words' });
const Y = dream('1002', { audioFileName: '1002.m4a' });
const Z = dream('1003');

/** Stores the index (and, by default, a backup holding the same list) plus each dream's audio. */
function seed(dreams: Dream[], bak: Dream[] | null = dreams) {
  __fs.put(INDEX, JSON.stringify(dreams));
  if (bak) __fs.put(BAK, JSON.stringify(bak));
  for (const d of dreams) if (d.audioFileName) __fs.put(audioUri(d.audioFileName), `audio-${d.id}`);
}
const ids = async () => (await listDreams()).map((d) => d.id).sort();
const snapshot = () => Object.fromEntries(__fs.list().map((uri) => [uri, __fs.read(uri)]));

beforeEach(() => {
  __fs.reset();
  resetCorruptCopyGuard();
});

describe('deleteDream', () => {
  it('removes the dream from the index and backup, deletes its audio and a duplicate safety copy', async () => {
    seed([X, Y, Z]);
    const copy = `${DOC}/dreams.corrupt-1700000000000.json`;
    __fs.put(copy, JSON.stringify([X, Y, Z]).slice(0, 60)); // truncated, mentions X, ids all live

    await deleteDream('1001');

    expect(await ids()).toEqual(['1002', '1003']);
    expect(JSON.parse(__fs.read(BAK)!).map((d: Dream) => d.id)).toEqual(['1002', '1003']);
    expect(__fs.has(audioUri('1001.m4a'))).toBe(false);
    expect(__fs.has(copy)).toBe(false);
    expect(__fs.read(audioUri('1002.m4a'))).toBe('audio-1002');
    expect(__fs.read(INDEX)).not.toContain('secret');
  });

  it('works for a dream without audio', async () => {
    seed([Z, Y]);
    await deleteDream('1003');
    expect(await ids()).toEqual(['1002']);
    expect(__fs.has(audioUri('1002.m4a'))).toBe(true);
  });

  it('deletes a draft with audio and its audio file', async () => {
    const draft = dream('1004', { status: 'draft', title: '', audioFileName: '1004.m4a' });
    seed([X, draft]);
    await deleteDream('1004');
    expect(await ids()).toEqual(['1001']);
    expect(__fs.has(audioUri('1004.m4a'))).toBe(false);
    expect(__fs.read(audioUri('1001.m4a'))).toBe('audio-1001');
  });

  it('writes [] (never a zero-length file) to the index and backup for the last dream, and it stays gone', async () => {
    seed([X]);
    await deleteDream('1001');

    expect(__fs.read(INDEX)).toBe('[]');
    expect(__fs.read(BAK)).toBe('[]');
    expect(await listDreams()).toEqual([]);
  });

  it('is a no-op for an unknown id: nothing is written or deleted', async () => {
    seed([X]);
    __fs.put(`${DOC}/dreams.corrupt-5.json`, 'garbage');
    const before = snapshot();
    await deleteDream('nope');
    expect(snapshot()).toEqual(before);
  });

  it('deletes without a backup file and does not create one', async () => {
    seed([X, Y], null);
    await deleteDream('1001');
    expect(await ids()).toEqual(['1002']);
    expect(__fs.has(audioUri('1001.m4a'))).toBe(false);
    expect(__fs.has(BAK)).toBe(true); // written as the scrubbed backup; it never holds the dream
    expect(__fs.read(BAK)).not.toContain('1001');
  });

  it('uses the backup as the base when the index file is missing and still commits last', async () => {
    seed([X, Y], [X, Y]);
    __fs.reset();
    __fs.put(BAK, JSON.stringify([X, Y]));
    __fs.put(audioUri('1001.m4a'), 'a');
    await deleteDream('1001');
    expect(await ids()).toEqual(['1002']);
    expect(__fs.has(audioUri('1001.m4a'))).toBe(false);
  });

  it('never touches the cache directory', async () => {
    seed([X, Y]);
    __fs.put('file:///cache/recording.m4a', 'unsaved');
    __fs.put('file:///cache/dreams.corrupt-1.json', JSON.stringify([X]));
    await deleteDream('1001');
    expect(__fs.read('file:///cache/recording.m4a')).toBe('unsaved');
    expect(__fs.has('file:///cache/dreams.corrupt-1.json')).toBe(true);
  });
});

describe('deleteDream order and repair', () => {
  it('has scrubbed the backup, copies and audio before the index write; a failed write keeps the dream listed and a retry succeeds', async () => {
    seed([X, Y]);
    const copy = `${DOC}/dreams.corrupt-1.json`;
    __fs.put(copy, JSON.stringify([X, Y]));
    let atFailure: Record<string, string | undefined> = {};
    let failed = false;
    __fs.failWhen(
      'write',
      (uri) => {
        if (!isIndex(uri) || failed) return false;
        failed = true;
        atFailure = snapshot();
        return true;
      },
      new Error('disk full'),
      { leave: 'empty' },
    );

    await expect(deleteDream('1001')).rejects.toThrow('disk full');

    expect(atFailure[audioUri('1001.m4a')]).toBeUndefined();
    expect(atFailure[copy]).toBeUndefined();
    expect(atFailure[BAK]).not.toContain('1001');
    // The in-memory repair restored the index, so the dream is still listed.
    expect(await ids()).toEqual(['1001', '1002']);

    __fs.clearFailures();
    await deleteDream('1001'); // missing audio counts as success
    expect(await ids()).toEqual(['1002']);
  });

  it.each(['empty', 'partial'] as const)(
    'repairs the index after a failed write that leaves it %s, and rethrows',
    async (leave) => {
      seed([X, Y]);
      // Only the first index write (the commit) fails; the repair's rewrite then succeeds.
      let failed = false;
      __fs.failWhen(
        'write',
        (uri) => isIndex(uri) && !failed && (failed = true),
        new Error('disk full'),
        { leave },
      );
      await expect(deleteDream('1001')).rejects.toThrow('disk full');

      expect(await ids()).toEqual(['1001', '1002']);
      expect(JSON.parse(__fs.read(INDEX)!)).toHaveLength(2);
    },
  );

  it('copies the backup back when the in-memory rewrite also fails', async () => {
    seed([X, Y]);
    __fs.failWhen('write', isIndex, new Error('disk full'), { leave: 'empty' });
    await expect(deleteDream('1001')).rejects.toThrow('disk full');
    // Backup holds the scrubbed list [Y]; it is the last resort, as in saveDream.
    expect(await ids()).toEqual(['1002']);
  });

  it('leaves an untouched intact index alone when the write fails without damage', async () => {
    seed([X, Y]);
    const before = __fs.read(INDEX);
    __fs.failWhen('write', isIndex, new Error('nope'));
    await expect(deleteDream('1001')).rejects.toThrow('nope');
    expect(__fs.read(INDEX)).toBe(before);
  });
});

describe('deleteDream failure injection', () => {
  it('falls back to deleting the backup when it cannot be overwritten', async () => {
    seed([X, Y]);
    __fs.failWhen('write', isBak, new Error('bak write'));
    await deleteDream('1001');
    expect(__fs.has(BAK)).toBe(false);
    expect(await ids()).toEqual(['1002']);
  });

  it('aborts with nothing else changed when the backup can neither be written nor deleted', async () => {
    seed([X, Y]);
    const copy = `${DOC}/dreams.corrupt-1.json`;
    __fs.put(copy, JSON.stringify([X, Y]));
    const before = snapshot();
    __fs.failWhen('write', isBak, new Error('bak write'));
    __fs.failWhen('delete', isBak, new Error('bak delete'));
    await expect(deleteDream('1001')).rejects.toThrow('bak delete');
    expect(snapshot()).toEqual(before);
  });

  it('aborts when a duplicate safety copy cannot be deleted; the dream and audio stay', async () => {
    seed([X, Y]);
    const copy = `${DOC}/dreams.corrupt-1.json`;
    __fs.put(copy, JSON.stringify([X, Y]));
    __fs.failWhen('delete', (uri) => uri === copy, new Error('busy'));
    await expect(deleteDream('1001')).rejects.toThrow('busy');
    expect(await ids()).toEqual(['1001', '1002']);
    expect(__fs.has(audioUri('1001.m4a'))).toBe(true);
    expect(__fs.has(copy)).toBe(true);
  });

  it('aborts when the audio cannot be deleted; the index is unchanged', async () => {
    seed([X, Y]);
    const before = __fs.read(INDEX);
    __fs.failWhen('delete', (uri) => uri === audioUri('1001.m4a'), new Error('locked'));
    await expect(deleteDream('1001')).rejects.toThrow('locked');
    expect(__fs.read(INDEX)).toBe(before);
    expect(__fs.has(audioUri('1001.m4a'))).toBe(true);
    expect(await ids()).toEqual(['1001', '1002']);
  });

  it('aborts when the documents folder cannot be listed, changing nothing', async () => {
    seed([X, Y]);
    const before = snapshot();
    __fs.failNext('list', new Error('no list'));
    await expect(deleteDream('1001')).rejects.toThrow('no list');
    expect(snapshot()).toEqual(before);
  });
});

describe('deleteDream and safety copies', () => {
  const copy = `${DOC}/dreams.corrupt-1.json`;

  it('deletes an invalid copy that mentions the dream when every other id is live', async () => {
    seed([X, Y]);
    __fs.put(copy, `[{"id":"1002","title":"x"}, {"id": "1001", "au`);
    await deleteDream('1001');
    expect(__fs.has(copy)).toBe(false);
  });

  it('detects the dream by its audio file name or its JSON-escaped transcript', async () => {
    seed([X, Y]);
    const byAudio = `${DOC}/dreams.corrupt-2.json`;
    const byText = `${DOC}/dreams.corrupt-3.json`;
    __fs.put(byAudio, '[{"id":"1002"},{"id":"1002","audioFileName":"1001.m4a"');
    __fs.put(byText, '[{"id":"1002"},{"id":"1002","transcript":"secret \\"quoted\\" words"}');
    await deleteDream('1001');
    expect(__fs.has(byAudio)).toBe(false);
    expect(__fs.has(byText)).toBe(false);
  });

  it('refuses when a copy mentions the dream and holds an id missing from the index, changing nothing', async () => {
    seed([X, Y]);
    __fs.put(copy, JSON.stringify([X, dream('9999')]));
    const before = snapshot();

    const error = await deleteDream('1001').catch((e) => e);

    expect(isSafetyCopyBlockedError(error)).toBe(true);
    expect(snapshot()).toEqual(before);
    expect(await ids()).toEqual(['1001', '1002']);
  });

  it('refuses when a copy cannot be read, changing nothing', async () => {
    seed([X, Y]);
    __fs.put(copy, JSON.stringify([X]));
    const before = snapshot();
    __fs.failWhen('text', (uri) => uri === copy);
    const error = await deleteDream('1001').catch((e) => e);
    expect(isSafetyCopyBlockedError(error)).toBe(true);
    expect(snapshot()).toEqual(before);
  });

  it('a refusing copy leaves earlier duplicate copies in place too (nothing is scrubbed first)', async () => {
    seed([X, Y]);
    const dup = `${DOC}/dreams.corrupt-1.json`;
    const other = `${DOC}/dreams.corrupt-2.json`;
    __fs.put(dup, JSON.stringify([X]));
    __fs.put(other, JSON.stringify([X, dream('9999')]));
    const before = snapshot();
    await expect(deleteDream('1001')).rejects.toMatchObject({
      code: 'SAFETY_COPY_HOLDS_OTHER_DREAMS',
    });
    expect(snapshot()).toEqual(before);
  });

  it('leaves a copy that does not mention the dream byte for byte, even with unknown ids', async () => {
    seed([X, Y]);
    const content = JSON.stringify([Y, dream('9999')]);
    __fs.put(copy, content);
    await deleteDream('1001');
    expect(__fs.read(copy)).toBe(content);
  });

  it('only touches files named exactly dreams.corrupt-<digits>.json', async () => {
    seed([X, Y]);
    const mentioning = JSON.stringify([X]);
    const names = [
      'dreams.corrupt-abc.json',
      'dreams.corrupt-123.json.bak',
      'dreams.corrupt-.json',
      'xdreams.corrupt-1.json',
      'dreams.corrupt-1.json.old',
    ];
    for (const name of names) __fs.put(`${DOC}/${name}`, mentioning);
    // A directory with a matching name is never touched or read as a file.
    __fs.put(`${DOC}/dreams.corrupt-77.json/inner.txt`, mentioning);
    __fs.put(audioUri('stray.m4a'), 'stray');

    await deleteDream('1001');

    for (const name of names) expect(__fs.read(`${DOC}/${name}`)).toBe(mentioning);
    expect(__fs.read(`${DOC}/dreams.corrupt-77.json/inner.txt`)).toBe(mentioning);
    expect(__fs.read(audioUri('stray.m4a'))).toBe('stray');
  });
});

describe('deleteDream safety-copy accounting', () => {
  const copy = `${DOC}/dreams.corrupt-1.json`;
  const other = `${DOC}/dreams.corrupt-2.json`;
  const rec = (id: string) => `{"id":"${id}","title":"t"}`;

  /** Seeds X and Y, puts `text` in a copy, runs the delete. */
  async function run(text: string, extra: Record<string, string> = {}) {
    seed([X, Y]);
    __fs.put(copy, text);
    for (const [k, v] of Object.entries(extra)) __fs.put(k, v);
    const before = snapshot();
    const error = await deleteDream('1001').then(
      () => null,
      (e) => e,
    );
    return { before, error };
  }
  const aborts = async (text: string, extra: Record<string, string> = {}) => {
    const { before, error } = await run(text, extra);
    expect(isSafetyCopyBlockedError(error)).toBe(true);
    expect(snapshot()).toEqual(before); // index, .bak, audio and every copy untouched
    expect(await ids()).toEqual(['1001', '1002']);
  };
  const deletes = async (text: string) => {
    const { error } = await run(text);
    expect(error).toBeNull();
    expect(__fs.has(copy)).toBe(false);
    expect(await ids()).toEqual(['1002']);
    expect(__fs.has(audioUri('1001.m4a'))).toBe(false);
  };
  const untouched = async (text: string) => {
    const { error } = await run(text);
    expect(error).toBeNull();
    expect(__fs.read(copy)).toBe(text);
    expect(await ids()).toEqual(['1002']);
  };

  describe('truncation and shape', () => {
    it('aborts when truncated mid-id', () => aborts(`[${rec('1001')},{"id":"99`));
    it('aborts when truncated before the id of the last record', () =>
      aborts(`[${rec('1001')},{"ti`));
    it('aborts when cut right after the id key', () => aborts(`[${rec('1001')},{"id":`));
    it('treats a record cut after a complete live id as that record', () =>
      deletes(`[${rec('1001')},{"id":"1002","tit`));
    it('deletes when truncated inside X audio name or title with the id intact', async () => {
      await deletes(`[{"id":"1001","audioFileName":"1001.m4`);
    });
    it('aborts for a numeric id on another record', () =>
      aborts(`[${rec('1001')},{"id":9999,"title":"t"}]`));
    it('aborts for a record without an id', () => aborts(`[${rec('1001')},{"title":"t"}]`));
    it('aborts for a null id', () => aborts(`[${rec('1001')},{"id":null}]`));
    it('aborts for a non-object element', () => aborts(`[${rec('1001')},"1002"]`));
    it('aborts for a top-level object that mentions X', () =>
      aborts(`{"dreams":[${rec('1001')}]}`));
    it('aborts for a numeric id in a broken copy', () =>
      aborts(`[${rec('1001')},{"id":99,"title":"t"},{"id":"100`));
    it('aborts when a broken record has a null id', () =>
      aborts(`[${rec('1001')},{"id":null,"title":"t"},{"id":"1002","ti`));

    it('aborts a valid array with duplicate id keys (JSON.parse would keep only the last)', () =>
      aborts(`[${rec('1001')},{"id":"9999","id":"1002"}]`));
    it('aborts a broken copy with duplicate id keys (non-live first, live second)', () =>
      aborts(`[${rec('1001')},{"id":"9999","id":"1002"},{"id":"1002","ti`));
  });

  describe('nested keys and escapes', () => {
    it('ignores a nested id in an unparseable copy', async () => {
      await deletes(`[{"id":"1001","meta":{"id":"9999"},"title":"t"},{"id":"1002","ti`);
    });
    it('does not let a nested id stand in for a missing record id', () =>
      aborts(`[${rec('1001')},{"meta":{"id":"1002"}},{"id":"1002"`));
    it('does not create a fake id from escaped quotes in a title', async () => {
      await deletes(`[{"id":"1001","title":"say \\"id\\":\\"99\\""},{"id":"1002"`);
    });
    it('decodes an id with escapes and unicode and matches the live id exactly', async () => {
      const weird = dream('a"b\u00e9', {});
      seed([X, weird]);
      __fs.put(copy, `[${rec('1001')},{"id":"a\\"b\\u00e9","ti`);
      await deleteDream('1001');
      expect(__fs.has(copy)).toBe(false);
    });
    it('aborts when an escaped id decodes to a different value', () =>
      aborts(`[${rec('1001')},{"id":"1002\\u0031","ti`));
    it('deletes when the text ends in a backslash after the last id', () =>
      deletes(`[${rec('1001')},{"id":"1002","title":"abc\\`));
    it('deletes when an unterminated string follows the last id', () =>
      deletes(`[${rec('1001')},{"id":"1002","title":"abc`));
  });

  describe('layout', () => {
    it('handles id as the last key in a broken file', () =>
      deletes(`[{"title":"t","id":"1001"},{"title":"u","tags":[],"id":"1002"},`));
    it('aborts when id is last and the final record is cut before it', () =>
      aborts(`[{"title":"t","id":"1001"},{"title":"u","id"`));
    it('handles whitespace and newlines around colons and commas', () =>
      deletes(`[\n  {\n "id" :\n "1001" ,\n "t" : 1 }\n ,\n {"id"\n:\t"1002"`));
    it('handles CRLF', () => deletes(`[\r\n{"id":"1001"},\r\n{"id":"1002"\r\n`));
    it('handles a leading BOM on a valid copy', () => deletes(`\uFEFF${JSON.stringify([X, Y])}`));
    it('handles a leading BOM on a broken copy', () =>
      deletes(`\uFEFF[${rec('1001')},{"id":"1002","ti`));
    it('aborts a BOM copy holding an unknown id', () =>
      aborts(`\uFEFF[${rec('1001')},{"id":"9999","ti`));
    it('leaves an empty array alone (does not mention X)', () => untouched('[]'));
    it('leaves empty and whitespace-only copies alone', async () => {
      await untouched('');
      __fs.reset();
      await untouched(' \n\t ');
    });
  });

  describe('mention matching', () => {
    const tiny = dream('1001', { title: 'Hi', transcript: 'x' });
    it('does not abort for a 1-2 char title in an unrelated unaccounted copy', async () => {
      seed([tiny, Y]);
      const text = '[{"id":"9999","title":"Hi"},{"id":"88';
      __fs.put(copy, text);
      await deleteDream('1001');
      expect(__fs.read(copy)).toBe(text);
      expect(await ids()).toEqual(['1002']);
    });
    it('detects a short-title dream through its id, then deletes a pure duplicate', async () => {
      seed([tiny, Y]);
      __fs.put(copy, '[{"id":"1001","title":"Hi"},{"id":"1002"');
      await deleteDream('1001');
      expect(__fs.has(copy)).toBe(false);
    });
    it('does not count a whitespace-padded short title as long', async () => {
      const padded = dream('1001', { title: '   a      ' });
      seed([padded, Y]);
      const text = 'garbage   a      garbage';
      __fs.put(copy, text);
      await deleteDream('1001');
      expect(__fs.read(copy)).toBe(text);
    });
    it('detects by a long title (JSON-escaped)', () =>
      aborts(`[{"id":"9999","title":"Title 1001"}]`));
    it('deletes a copy that mentions X by audio name only when all ids are live', () =>
      deletes(`[{"id":"1002"},{"id":"1002","audioFileName":"1001.m4a"}]`));
    it('aborts when a copy mentioning X holds a non-live valid dream', () =>
      aborts(JSON.stringify([X, dream('9999')])));
    it('aborts for garbage plus X id', () => aborts('%%% "1001" %%%'));
    it('leaves a truncated/garbage copy that does not mention X, with no abort', async () => {
      await untouched('[{"id":"99');
      __fs.reset();
      await untouched('total garbage');
    });
    it('also aborts on an unaccountable second copy and keeps the duplicate one', async () => {
      const dup = JSON.stringify([X]);
      const { before, error } = await run(dup, { [other]: `[${rec('1001')},{"id":"99` });
      expect(isSafetyCopyBlockedError(error)).toBe(true);
      expect(snapshot()).toEqual(before);
      expect(__fs.read(copy)).toBe(dup);
    });
  });

  it('scans a large copy with thousands of records and a broken tail quickly', async () => {
    seed([X, Y]);
    const many = Array.from({ length: 5000 }, (_, i) => `{"id":"1002","title":"t${i}","tags":[]}`);
    __fs.put(copy, `[${many.join(',')},${rec('1001')},{"id":"1002","title":"cut \\"`);
    const started = Date.now();
    await deleteDream('1001');
    expect(Date.now() - started).toBeLessThan(5000);
    expect(__fs.has(copy)).toBe(false);
  });

  it('does not backtrack on a huge unterminated string', async () => {
    seed([X, Y]);
    __fs.put(copy, `[${rec('1001')},{"id":"1002","title":"${'\\"'.repeat(200000)}`);
    const started = Date.now();
    await deleteDream('1001');
    expect(Date.now() - started).toBeLessThan(5000);
    expect(__fs.has(copy)).toBe(false);
  });
});

describe('accountedIds (strict JSON-prefix validator)', () => {
  const rejected: [string, string][] = [
    ['unterminated string swallowing a later record', '[{"id":"A","title":"abc},{"id":"Z"}]'],
    ['nested object followed by a stray comma and record', '[{"id":"A","x":{"a":1},{"id":"Z"}'],
    ['200 nested arrays', '['.repeat(200)],
    ['200 nested arrays inside a record', `[{"id":"A","m":${'['.repeat(200)}`],
    ['101 container levels', `[{"id":"A","m":${'['.repeat(99)}`],
    ['cut before the id completes', '[{"id":"A"},{"id":"B'],
    ['cut before the id key', '[{"id":"A"},{"ti'],
    ['duplicate id, parse-valid', '[{"id":"A","id":"B"}]'],
    ['duplicate id, cut', '[{"id":"A","id":"B'],
    ['non-string id', '[{"id":5}]'],
    ['closed record without an id', '[{"title":"x"}]'],
    ['string element', '["A"]'],
    ['number element', '[1]'],
    ['unclosed nested start', '[['],
    ['array element after a record', '[{"id":"A"},[1]]'],
    ['missing comma between records', '[{"id":"A"} {"id":"B"}'],
    ['closer of the wrong kind', '[{"id":"A","a":[1,2}'],
    ['trailing comma before }', '[{"id":"A",}'],
    ['trailing comma before ]', '[{"id":"A"},]'],
    ['bad escape', '[{"id":"A","t":"\\q"}]'],
    ['bad unicode escape', '[{"id":"A","t":"\\u12x"}]'],
    ['raw control character in a string', '[{"id":"A","t":"a\nb"}]'],
    ['leading-zero number', '[{"id":"A","n":01}]'],
    ['number with a dangling dot before }', '[{"id":"A","n":1.}]'],
    ['misspelled literal', '[{"id":"A","b":trux}]'],
    ['junk after the array', '[{"id":"A"}]x'],
    ['second closing bracket', '[{"id":"A"}]]'],
    ['NUL followed by other text', '[{"id":"A"}]\u0000x'],
    ['empty text', ''],
    ['NULs only', '\u0000\u0000'],
    ['top-level object', '{"id":"A"}'],
    ['top-level object with a numeric id', '{"id":5}'],
  ];
  it.each(rejected)('rejects %s', (_name, text) => {
    expect(accountedIds(text)).toBeNull();
  });

  const accepted: [string, string, string[]][] = [
    ['a cut after the last complete id', '[{"id":"A"},{"id":"B"', ['A', 'B']],
    ['a cut inside a later string', '[{"id":"A","t":"x"},{"id":"B","t":"y', ['A', 'B']],
    ['a cut inside a unicode escape', '[{"id":"A","t":"x\\u12', ['A']],
    ['a cut after a backslash', '[{"id":"A","t":"x\\', ['A']],
    ['a number cut after a dot', '[{"id":"A","n":1.', ['A']],
    ['a number cut after a minus', '[{"id":"A","n":-', ['A']],
    ['a number cut after e', '[{"id":"A","n":1e', ['A']],
    ['a number cut after e and sign', '[{"id":"A","n":1e+', ['A']],
    ['a literal cut short', '[{"id":"A","b":tru', ['A']],
    ['a complete array followed by NULs', '[{"id":"A"}]\u0000\u0000', ['A']],
    ['a BOM-prefixed array', '﻿[{"id":"A"}]', ['A']],
    ['a nested id (ignored)', '[{"id":"A","m":{"id":"Q"}},{"id":"B"}]', ['A', 'B']],
    ['an escaped "id" key', '[{"\\u0069d":"A"}]', ['A']],
    ['an empty array', '[]', []],
    ['an open array only', '[', []],
    ['exactly 100 container levels', `[{"id":"A","m":${'['.repeat(98)}`, ['A']],
  ];
  it.each(accepted)('accepts %s', (_name, text, expected) => {
    expect(accountedIds(text)).toEqual(expected);
  });

  // Deterministic property test.
  const mulberry32 = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  it('never omits a record id it can see, over 20k seeded damaged copies', () => {
    const rand = mulberry32(20261010);
    const int = (n: number) => Math.floor(rand() * n);
    const pick = <T>(list: T[]): T => list[int(list.length)];
    const pieces = [
      'a',
      'Z',
      ' ',
      '"',
      '\\',
      'é',
      '😀',
      ' ',
      '\ud800',
      '\n',
      '\t',
      '\u0001',
      '{',
      '}',
      '[',
      ']',
      ',',
      ':',
      '{"id":"Z9"}',
      '"id":"Z9",',
    ];
    const text = () => Array.from({ length: int(6) }, () => pick(pieces)).join('');
    const MUTATION_CHARS = '"{}[],:\\ x1\u0000';

    type Rec = { id: string; start: number; idEnd: number };
    let mutatedAccepted = 0;
    let exactChecks = 0;
    const failures: string[] = []; // collected, not asserted per case, to keep 20k cases fast
    for (let n = 0; n < 20000; n++) {
      // Build the records and remember where each one and its id sit in the text.
      const recs: Rec[] = [];
      let full = '[';
      const count = int(5);
      for (let r = 0; r < count; r++) {
        const id = `R${r}${text()}`;
        const idJson = JSON.stringify(id);
        if (r > 0) full += ',';
        const start = full.length;
        full += `{"id":${idJson}`;
        recs.push({ id, start, idEnd: full.length });
        const fields: Record<string, unknown> = {
          title: text(),
          transcript: text(),
          n: pick([0, -1, 12, 1.5, -2.25e-7, 3e21, 10]),
          ok: rand() < 0.5,
          none: null,
          tags: [text(), 1, { id: `N${r}`, v: text() }],
          meta: { id: `N${r}`, deep: { id: `M${r}`, list: [{}, []] }, s: text() },
        };
        const names = Object.keys(fields).filter(() => rand() < 0.7);
        for (const name of names)
          full += `,${JSON.stringify(name)}:${JSON.stringify(fields[name])}`;
        full += '}';
      }
      full += ']';

      const kind = int(5);
      const cut = int(full.length + 1);
      let input = full;
      let limit = full.length; // how much of the original text survives
      if (kind === 1 || kind === 2 || kind === 3) {
        input = full.slice(0, cut);
        limit = cut;
      }
      if (kind === 2) {
        // Exactly ONE mutation per case. Two coordinated edits can leave the text a valid JSON
        // prefix that still lost a record, and no structural validator can detect that (known limit).
        const pos = int(input.length + 1);
        const ch = MUTATION_CHARS[int(MUTATION_CHARS.length)];
        const op = int(3);
        input =
          op === 0
            ? input.slice(0, pos) + input.slice(pos + 1)
            : op === 1
              ? input.slice(0, pos) + ch + input.slice(pos)
              : input.slice(0, pos) + ch + input.slice(pos + 1);
      } else if (kind === 3) {
        input += pick(['xx', '}', '\u0000\u0000\u0000', ']']);
      } else if (kind === 4) {
        input += '\u0000'.repeat(1 + int(4));
      }

      const result = accountedIds(input);
      const note = JSON.stringify({ n, kind, input });
      if (result !== null) {
        if (kind === 2) mutatedAccepted++;
        for (const rec of recs) {
          if (input.includes(`"id":${JSON.stringify(rec.id)},`) && !result.includes(rec.id)) {
            failures.push(`omitted ${JSON.stringify(rec.id)}: ${note}`);
          }
        }
      }

      if (kind === 0 || kind === 1 || kind === 4) {
        // Unmutated or purely truncated: exactly the records whose id completed, or null when the
        // cut lands inside a started record before its id is complete.
        const started = recs.filter((r) => r.start < limit);
        const expected = started.every((r) => r.idEnd <= limit) ? started.map((r) => r.id) : null;
        if (JSON.stringify(result) !== JSON.stringify(limit === 0 ? null : expected)) {
          failures.push(`unexpected result: ${note}`);
        }
        if (kind === 0) {
          const parsed = (JSON.parse(full) as { id: string }[]).map((r) => r.id);
          if (JSON.stringify(result) !== JSON.stringify(parsed)) failures.push(`parse: ${note}`);
        }
        exactChecks++;
      }
    }
    expect(failures.slice(0, 3)).toEqual([]);
    expect(exactChecks).toBeGreaterThan(10000);
    expect(mutatedAccepted).toBeGreaterThan(0);
  }, 30000);

  describe('NUL runs are scanned in linear time', () => {
    const NULS = '\u0000'.repeat(200000);
    const timed = (text: string) => {
      const t0 = Date.now();
      const result = accountedIds(text);
      expect(Date.now() - t0).toBeLessThan(2000);
      return result;
    };
    it('rejects a long interior NUL run followed by text', () => {
      expect(timed('[{"id":"A"}' + NULS + 'x')).toBeNull();
    });
    it('rejects a long leading NUL run', () => {
      expect(timed(NULS + '[{"id":"A"}]')).toBeNull();
    });
    it('rejects a long NUL run inside a string', () => {
      expect(timed('[{"id":"A","t":"' + NULS + '"}]')).toBeNull();
    });
    it('still accepts a long trailing NUL run after a valid array', () => {
      expect(timed('[{"id":"A"}]' + NULS)).toEqual(['A']);
    });
  });
});

describe('deleteDream and damaged safety copies that hid a record', () => {
  const copy = `${DOC}/dreams.corrupt-1.json`;
  const cases: [string, string][] = [
    [
      'an unterminated string swallowing another record',
      '[{"id":"1001","title":"abc},{"id":"9999"}]',
    ],
    ['a stray comma after a nested object', '[{"id":"1001","x":{"a":1},{"id":"9999"}'],
    ['a missing comma between records', '[{"id":"1001"} {"id":"9999"}'],
    ['a closer of the wrong kind', '[{"id":"1001","a":[1,2},{"id":"9999"}]'],
  ];
  it.each(cases)('aborts and changes nothing for %s', async (_name, text) => {
    seed([X, Y]);
    __fs.put(copy, text);
    const before = snapshot();
    const error = await deleteDream('1001').then(
      () => null,
      (e) => e,
    );
    expect(isSafetyCopyBlockedError(error)).toBe(true);
    expect(snapshot()).toEqual(before);
  });

  it('still deletes a truncated pure-duplicate copy', async () => {
    seed([X, Y]);
    __fs.put(copy, '[{"id":"1001","n":1},{"id":"1002","t":"x","n":1.');
    await deleteDream('1001');
    expect(__fs.has(copy)).toBe(false);
    expect(await ids()).toEqual(['1002']);
  });
});

describe('deleteDream and the index', () => {
  it('aborts with nothing touched, corrupt copies included, when the index is unreadable', async () => {
    __fs.put(INDEX, '{not json');
    __fs.put(BAK, JSON.stringify([X]));
    __fs.put(audioUri('1001.m4a'), 'a');
    __fs.put(`${DOC}/dreams.corrupt-1.json`, JSON.stringify([X]));
    const before = snapshot();

    const error = await deleteDream('1001').catch((e) => e);

    expect(isIndexUnreadableError(error)).toBe(true);
    expect(snapshot()).toEqual(before);
  });
});

describe('deleteDream and audio file names', () => {
  it.each([
    '../dreams.json',
    'a/b.m4a',
    'file:///document/dreams.json',
    '/etc/passwd',
    '',
    '..',
    'a\\b.m4a',
    '%2e%2e',
  ])('never deletes anything for the audio name %j, but still removes the dream', async (name) => {
    const bad = dream('1001', { audioFileName: name });
    seed([bad, Y]);
    __fs.put(`${DOC}/dreams.json.keep`, 'keep');
    __fs.put(`${DOC}/dreams/b.m4a`, 'b');
    const others = snapshot();
    delete others[INDEX];
    delete others[BAK];

    await deleteDream('1001');

    expect(await ids()).toEqual(['1002']);
    const after = snapshot();
    delete after[INDEX];
    delete after[BAK];
    expect(after).toEqual(others);
  });

  it('keeps an audio file that another dream also references', async () => {
    const shared = dream('1001', { audioFileName: 'shared.m4a' });
    const sibling = dream('1002', { audioFileName: 'shared.m4a' });
    seed([shared, sibling]);
    await deleteDream('1001');
    expect(__fs.has(audioUri('shared.m4a'))).toBe(true);
    expect(await ids()).toEqual(['1002']);
  });

  it('succeeds when the audio file is already missing', async () => {
    seed([X, Y]);
    __fs.reset();
    __fs.put(INDEX, JSON.stringify([X, Y]));
    await deleteDream('1001');
    expect(await ids()).toEqual(['1002']);
  });
});

describe('deleteDream serialization', () => {
  it('runs behind an in-flight save and sees the saved dream', async () => {
    __fs.put('file:///cache/r.m4a', 'bytes');
    const saving = saveDream({
      recordingUri: 'file:///cache/r.m4a',
      durationMs: 1,
      details: { title: 'Fresh', tags: [] },
      status: 'saved',
    });
    const created = await Promise.race([saving, Promise.resolve(null)]);
    expect(created).toBeNull(); // still in flight when the delete is queued
    const queuedId = String(Date.now());
    const deleting = deleteDream(queuedId);
    const saved = await saving;
    await deleting;

    expect(saved.id).toBe(queuedId);
    expect(await listDreams()).toEqual([]);
    expect(__fs.list().filter((u) => u.startsWith(`${DOC}/dreams/`))).toEqual([]);
  });
});
