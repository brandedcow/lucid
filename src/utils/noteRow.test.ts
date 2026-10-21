import { Note, NoteRecording } from '../services/notesStorage';
import { MAX_ROW_TAGS, noteRow, tagLineOf } from './noteRow';
import { parseQuery } from './noteSearch';

const NOW = new Date(2026, 9, 18, 12, 0, 0);
const TWO_HOURS_AGO = new Date(2026, 9, 18, 10, 0, 0).toISOString();

function note(over: Partial<Note> = {}): Note {
  return {
    id: 'n1',
    createdAt: TWO_HOURS_AGO,
    updatedAt: TWO_HOURS_AGO,
    body: 'Title\nSome text',
    ...over,
  };
}

const rec = (fileName: string, heldAt?: string): NoteRecording => ({
  fileName,
  durationMs: 1000,
  ...(heldAt ? { heldAt } : {}),
});

describe('noteRow', () => {
  it('derives id, title and preview from the body', () => {
    const r = noteRow(note({ id: 'abc', body: 'My title\nFirst line\nSecond line' }), NOW);
    expect(r.id).toBe('abc');
    expect(r.title).toBe('My title');
    expect(r.preview).toBe('First line Second line');
  });

  it('uses Untitled for an empty body', () => {
    const r = noteRow(note({ body: '' }), NOW);
    expect(r.title).toBe('Untitled');
    expect(r.preview).toBe('');
  });

  it('shows at most 3 tags then +N', () => {
    expect(MAX_ROW_TAGS).toBe(3);
    const r = noteRow(note({ body: 'T\n#a #b #c #d #e' }), NOW);
    expect(r.tags).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(r.tagLine).toBe('#a #b #c +2');
  });

  it('shows exactly 3 tags without +N, and fewer as they are', () => {
    expect(noteRow(note({ body: 'T\n#a #b #c' }), NOW).tagLine).toBe('#a #b #c');
    expect(noteRow(note({ body: 'T\n#a #b' }), NOW).tagLine).toBe('#a #b');
    expect(noteRow(note({ body: 'T\n#a #b #c #d' }), NOW).tagLine).toBe('#a #b #c +1');
    expect(noteRow(note({ body: 'T\nno tags' }), NOW).tagLine).toBe('');
  });

  it('tagLineOf handles an empty list', () => {
    expect(tagLineOf([])).toBe('');
    expect(tagLineOf(['x', 'y', 'z', 'w'])).toBe('#x #y #z +1');
  });

  it('shows "1 voice note" as the preview when there is no text', () => {
    const r = noteRow(note({ body: 'Title', recordings: [rec('1.m4a')] }), NOW);
    expect(r.voiceCount).toBe(1);
    expect(r.preview).toBe('1 voice note');
  });

  it('shows "N voice notes" as the preview when there is no text', () => {
    const r = noteRow(
      note({ body: '', recordings: [rec('1.m4a'), rec('2.m4a'), rec('3.m4a')] }),
      NOW,
    );
    expect(r.voiceCount).toBe(3);
    expect(r.preview).toBe('3 voice notes');
  });

  it('keeps the text preview when there is text and voice notes', () => {
    const r = noteRow(note({ body: 'T\nreal text', recordings: [rec('1.m4a')] }), NOW);
    expect(r.preview).toBe('real text');
    expect(r.voiceCount).toBe(1);
  });

  it('does not count held recordings', () => {
    const r = noteRow(
      note({
        body: 'T\ntext',
        recordings: [rec('1.m4a', '2026-10-18T09:00:00.000Z'), rec('2.m4a')],
      }),
      NOW,
    );
    expect(r.voiceCount).toBe(1);
  });

  it('shows no voice preview when every recording is held', () => {
    const r = noteRow(
      note({ body: 'Title', recordings: [rec('1.m4a', '2026-10-18T09:00:00.000Z')] }),
      NOW,
    );
    expect(r.voiceCount).toBe(0);
    expect(r.preview).toBe('');
  });

  it('handles a note without recordings', () => {
    expect(noteRow(note(), NOW).voiceCount).toBe(0);
  });

  it('sets the pinned flag only for true', () => {
    expect(noteRow(note({ pinned: true }), NOW).pinned).toBe(true);
    expect(noteRow(note({ pinned: false }), NOW).pinned).toBe(false);
    expect(noteRow(note(), NOW).pinned).toBe(false);
  });

  it('gives the relative time of updatedAt', () => {
    expect(noteRow(note(), NOW).time).toBe('2 hours ago');
    expect(noteRow(note({ updatedAt: NOW.toISOString() }), NOW).time).toBe('Just now');
    expect(noteRow(note(), NOW.getTime()).time).toBe('2 hours ago');
  });

  it('builds the accessibility label', () => {
    const r = noteRow(note({ body: 'Title\nPreview\n#a #b', pinned: true }), NOW);
    expect(r.a11yLabel).toBe('Title. Preview #a #b. Tags: a, b. 2 hours ago. Pinned.');
  });

  it('leaves out empty parts of the label', () => {
    expect(noteRow(note({ body: 'Title' }), NOW).a11yLabel).toBe('Title. 2 hours ago.');
    const voice = noteRow(note({ body: 'Title', recordings: [rec('1.m4a')], pinned: true }), NOW);
    expect(voice.a11yLabel).toBe('Title. 1 voice note. 2 hours ago. Pinned.');
  });

  it('lists all tags in the label, not just the first 3', () => {
    const r = noteRow(note({ body: 'T\n#a #b #c #d' }), NOW);
    expect(r.a11yLabel).toContain('Tags: a, b, c, d.');
  });
});

describe('noteRow with a search query', () => {
  const join = (parts?: { text: string }[]) => (parts ?? []).map((p) => p.text).join('');
  const matched = (parts?: { text: string; match: boolean }[]) =>
    (parts ?? []).filter((p) => p.match).map((p) => p.text);

  it('is identical to the plain row without a query, or with an empty one', () => {
    const n = note({ body: 'Flying\nOver #sea' });
    expect(noteRow(n, NOW, parseQuery(''))).toEqual(noteRow(n, NOW));
    expect(noteRow(n, NOW)).not.toHaveProperty('titleParts');
  });

  it('adds highlight parts for title, preview and tag line', () => {
    const r = noteRow(note({ body: 'Flying Sea\nOver the sea #sea' }), NOW, parseQuery('sea'));
    expect(matched(r.titleParts)).toEqual(['Sea']);
    expect(matched(r.previewParts)).toEqual(['sea', 'sea']);
    expect(matched(r.tagParts)).toEqual(['sea']);
    expect(join(r.titleParts)).toBe(r.title);
    expect(join(r.tagParts)).toBe(r.tagLine);
  });

  it('keeps preview and a11y label plain', () => {
    const n = note({ body: `Flying\n${'word '.repeat(40)}needle #sea` });
    const plain = noteRow(n, NOW);
    const r = noteRow(n, NOW, parseQuery('needle'));
    expect(r.a11yLabel).toBe(plain.a11yLabel);
    expect(r.preview).toBe(plain.preview);
    expect(r.tags).toEqual(plain.tags);
  });

  it('shows a snippet in previewParts when the match is beyond the preview', () => {
    const n = note({ body: `Flying\n${'word '.repeat(60)}needle more` });
    const r = noteRow(n, NOW, parseQuery('needle'));
    expect(join(r.previewParts)).toContain('needle');
    expect(join(r.previewParts).startsWith('…')).toBe(true);
    expect(r.preview).not.toContain('needle');
  });

  it('moves matched tags to the front of the tag line', () => {
    const n = note({ body: 'T\n#a #b #c #d #e night' });
    const r = noteRow(n, NOW, parseQuery('#e'));
    expect(r.tagLine).toBe('#e #a #b +2');
    expect(join(r.tagParts)).toBe('#e #a #b +2');
    expect(matched(r.tagParts)).toEqual(['#e']);
    expect(r.tags).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('highlights a tag-term prefix only', () => {
    const r = noteRow(note({ body: 'T\n#seaside' }), NOW, parseQuery('#sea'));
    expect(r.tagParts).toEqual([
      { text: '#sea', match: true },
      { text: 'side', match: false },
    ]);
  });

  it('never highlights the +N, and keeps the voice-note preview plain', () => {
    const r = noteRow(
      note({ body: 'T\n#a1 #a2 #a3 #a4', recordings: [rec('r.m4a')] }),
      NOW,
      parseQuery('1'),
    );
    expect(r.tagLine).toBe('#a1 #a2 #a3 +1');
    expect(matched(r.tagParts)).toEqual(['1']);
    const v = noteRow(note({ body: 'T', recordings: [rec('r.m4a')] }), NOW, parseQuery('voice'));
    expect(v.preview).toBe('1 voice note');
    expect(join(v.previewParts)).toBe('1 voice note');
  });
});
