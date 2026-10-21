import { Note, NoteRecording } from '../services/notesStorage';
import { deletedRow, noteHasDeletableAudio } from './deletedRow';

const NOW = new Date(2026, 9, 18, 12, 0, 0);
const at = (h: number, d = 18) => new Date(2026, 9, d, h, 0, 0).toISOString();

function note(over: Partial<Note> = {}): Note {
  return {
    id: 'n1',
    createdAt: at(1),
    updatedAt: at(1),
    deletedAt: at(10),
    body: 'Title\nSome text',
    ...over,
  };
}
const rec = (over: Partial<NoteRecording> = {}): NoteRecording => ({
  fileName: 'a.m4a',
  durationMs: 1000,
  ...over,
});

describe('deletedRow', () => {
  it('derives id, title and preview', () => {
    const r = deletedRow(note({ id: 'x', body: 'My title\nFirst\nSecond' }), NOW);
    expect(r).toMatchObject({ id: 'x', title: 'My title', preview: 'First Second' });
  });

  it('uses Untitled for an empty body', () => {
    expect(deletedRow(note({ body: '' }), NOW).title).toBe('Untitled');
  });

  it('shows the voice note count for a voice-only note', () => {
    expect(deletedRow(note({ body: '', recordings: [rec()] }), NOW).preview).toBe('1 voice note');
    expect(
      deletedRow(note({ body: '', recordings: [rec(), rec({ fileName: 'b.m4a' })] }), NOW).preview,
    ).toBe('2 voice notes');
  });

  it('labels the deleted time for each bucket', () => {
    const d = (deletedAt: string) => deletedRow(note({ deletedAt }), NOW).deleted;
    expect(d(NOW.toISOString())).toBe('Deleted just now');
    expect(d(new Date(NOW.getTime() - 30 * 1000).toISOString())).toBe('Deleted 30 seconds ago');
    expect(d(new Date(NOW.getTime() - 5 * 60 * 1000).toISOString())).toBe('Deleted 5 minutes ago');
    expect(d(at(10))).toBe('Deleted 2 hours ago');
    expect(d(at(12, 16))).toBe('Deleted 2 days ago');
    expect(d(new Date(2026, 8, 3).toISOString())).toBe('Deleted Sep 3');
  });

  it('gives an empty deleted line for a missing or invalid deletedAt', () => {
    expect(deletedRow(note({ deletedAt: undefined }), NOW).deleted).toBe('');
    expect(deletedRow(note({ deletedAt: 'nope' }), NOW).deleted).toBe('');
  });

  it('puts title, preview and deleted time in the accessibility label', () => {
    expect(deletedRow(note(), NOW).a11yLabel).toBe('Title. Some text. Deleted 2 hours ago.');
  });

  it('hasAudio is true for a shown or held recording', () => {
    expect(deletedRow(note({ recordings: [rec()] }), NOW).hasAudio).toBe(true);
    expect(deletedRow(note({ recordings: [rec({ heldAt: at(2) })] }), NOW).hasAudio).toBe(true);
  });

  it('hasAudio is false with no recordings or only legacy-origin ones', () => {
    expect(deletedRow(note(), NOW).hasAudio).toBe(false);
    expect(deletedRow(note({ recordings: [] }), NOW).hasAudio).toBe(false);
    expect(deletedRow(note({ recordings: [rec({ origin: 'legacy' })] }), NOW).hasAudio).toBe(false);
  });

  it('hasAudio is true when a legacy recording sits beside a normal one', () => {
    const n = note({ recordings: [rec({ origin: 'legacy' }), rec({ fileName: 'b.m4a' })] });
    expect(noteHasDeletableAudio(n)).toBe(true);
  });
});
