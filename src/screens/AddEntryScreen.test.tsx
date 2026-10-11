import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Text } from 'react-native';
import { useEntrySession } from '../hooks/useEntrySession';
import { saveDream } from '../services/dreamStorage';
import { Dream } from '../types/dream';
import { BUILT_IN_JOURNALS, Journal } from '../utils/journals';
import { AddEntryScreen } from './AddEntryScreen';

jest.mock('../services/dreamStorage', () => ({
  listTags: jest.fn().mockResolvedValue(['water']),
  saveDream: jest.fn(),
  isIndexUnreadableError: () => false,
}));

const save = saveDream as jest.Mock;
const [DREAMS, LIFE] = BUILT_IN_JOURNALS;

const stored: Dream = {
  id: '7',
  createdAt: '2026-10-01T08:00:00.000Z',
  durationMs: 12_000,
  audioFileName: '7.m4a',
  title: 'Old title',
  emotion: 'uneasy',
  tags: ['water'],
  transcript: 'old text',
};

const callbacks = { onBack: jest.fn(), onSaved: jest.fn() };

type Start = { journal?: Journal; open?: { dream: Dream; as: 'draft' | 'edit' } };

/** Wires the page to the real session hook the way App does: the check saves a finished entry. */
function Harness({ journal = DREAMS, open }: Start) {
  const entry = useEntrySession();
  const { session } = entry;
  useEffect(() => {
    if (open?.as === 'edit') entry.openEntry(open.dream);
    else if (open) entry.openDraft(open.dream);
    else entry.startNew(journal.id);
    // Starts the session once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!session) return null;
  return (
    <AddEntryScreen
      journal={journal}
      title={session.title}
      onTitleChange={entry.setTitle}
      body={session.body}
      onBodyChange={entry.setBody}
      tags={session.tags}
      onTagsChange={entry.setTags}
      tagDraft={session.tagDraft}
      onTagDraftChange={entry.setTagDraft}
      date="Sunday, October 6"
      saving={entry.saving}
      autoFocus={session.origin === 'new'}
      onSave={() => {
        // Not awaited, like App: a pending save must not hold the press.
        void entry.save('saved').then((ok) => ok && callbacks.onSaved());
      }}
      onBack={callbacks.onBack}
    />
  );
}

const renderPage = async (props: Start = {}) => {
  await render(<Harness {...props} />);
  await act(async () => {});
};
const check = (label = 'Save dream') => screen.getByLabelText(label);

beforeEach(() => {
  jest.clearAllMocks();
  save.mockResolvedValue({ id: '1', createdAt: 'c' });
});

describe('AddEntryScreen', () => {
  it('renders the date, journal, placeholders and the check', async () => {
    await renderPage();
    expect(screen.getByText('Sunday, October 6')).toBeTruthy();
    expect(screen.getByLabelText('Journal: Dreams')).toBeTruthy();
    expect(screen.getByPlaceholderText('Title...')).toBeTruthy();
    expect(screen.getByPlaceholderText('Start writing...')).toBeTruthy();
    expect(screen.getByPlaceholderText('Add a tag...')).toBeTruthy();
    expect(screen.getByLabelText('Back')).toBeTruthy();
    expect(check()).toBeTruthy();
  });

  it('focuses the title of a new entry but not a reopened one', async () => {
    await renderPage();
    expect(screen.getByLabelText('Title').props.autoFocus).toBe(true);
    await screen.unmount();
    await renderPage({ open: { dream: stored, as: 'edit' } });
    expect(screen.getByLabelText('Title').props.autoFocus).toBe(false);
  });

  it('takes a typed title and body', async () => {
    await renderPage();
    await fireEvent.changeText(screen.getByLabelText('Title'), 'Flooded hall');
    await fireEvent.changeText(screen.getByLabelText('Entry text'), 'it filled up');
    expect(screen.getByLabelText('Title').props.value).toBe('Flooded hall');
    expect(screen.getByLabelText('Entry text').props.value).toBe('it filled up');
  });

  it('adds a tag with a comma, offers known tags, and removes a tag', async () => {
    await renderPage();
    await fireEvent.changeText(screen.getByPlaceholderText('Add a tag...'), 'hallway,');
    expect(screen.getByLabelText('Remove tag hallway')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Add tag water'));
    expect(screen.getByLabelText('Remove tag water')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Remove tag hallway'));
    expect(screen.queryByLabelText('Remove tag hallway')).toBeNull();
  });

  it('saves a finished entry with the body as the transcript and a pending tag', async () => {
    await renderPage();
    await fireEvent.changeText(screen.getByLabelText('Title'), 'Flooded hall');
    await fireEvent.changeText(screen.getByLabelText('Entry text'), 'it filled up');
    await fireEvent.changeText(screen.getByPlaceholderText('Add a tag...'), 'Water');
    await fireEvent.press(check());
    await act(async () => {});
    expect(save).toHaveBeenCalledWith({
      durationMs: 0,
      details: { title: 'Flooded hall', emotion: '', tags: ['water'], transcript: 'it filled up' },
      status: 'saved',
      journalId: 'dreams',
      requireTitle: true,
    });
    expect(callbacks.onSaved).toHaveBeenCalled();
  });

  it('disables the check until a Dreams entry has a title', async () => {
    await renderPage();
    expect(check().props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByLabelText('Entry text'), 'words only');
    await fireEvent.press(check());
    expect(save).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Title'), '   ');
    expect(check().props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByLabelText('Title'), 'A title');
    expect(check().props.accessibilityState.disabled).toBe(false);
  });

  it('lets an entry in a Life journal save with no title', async () => {
    await renderPage({ journal: LIFE });
    expect(screen.getByLabelText('Journal: Life')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Entry text'), 'a walk');
    expect(check('Save entry').props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(check('Save entry'));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ journalId: 'life', requireTitle: false, status: 'saved' }),
    );
  });

  it('calls onBack from the back arrow', async () => {
    await renderPage();
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(callbacks.onBack).toHaveBeenCalledTimes(1);
  });

  it('locks the fields, the check and Back while a save is in flight', async () => {
    let resolve: (d: unknown) => void = () => {};
    save.mockReturnValue(new Promise((r) => (resolve = r)));
    await renderPage();
    await fireEvent.changeText(screen.getByLabelText('Title'), 'Flooded hall');
    await fireEvent.press(check());
    expect(screen.getByLabelText('Title').props.editable).toBe(false);
    expect(screen.getByLabelText('Entry text').props.editable).toBe(false);
    expect(check().props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(callbacks.onBack).not.toHaveBeenCalled();
    await act(async () => resolve({ id: '1', createdAt: 'c' }));
    expect(screen.getByLabelText('Title').props.editable).toBe(true);
  });

  it('prefills a finished entry for editing and keeps its emotion on save', async () => {
    await renderPage({ open: { dream: stored, as: 'edit' } });
    expect(screen.getByLabelText('Title').props.value).toBe('Old title');
    expect(screen.getByLabelText('Entry text').props.value).toBe('old text');
    expect(screen.getByLabelText('Remove tag water')).toBeTruthy();
    // There is no emotion field on the page.
    expect(screen.queryByText(/feel/i)).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Entry text'), 'new text');
    await fireEvent.press(check());
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '7',
        durationMs: 12_000,
        status: 'saved',
        details: { title: 'Old title', emotion: 'uneasy', tags: ['water'], transcript: 'new text' },
      }),
    );
    expect(save.mock.calls[0][0]).not.toHaveProperty('recordingUri');
  });

  it('prefills a reopened draft', async () => {
    const draft: Dream = { ...stored, status: 'draft', audioFileName: undefined, durationMs: 0 };
    await renderPage({ open: { dream: draft, as: 'draft' } });
    expect(screen.getByLabelText('Title').props.value).toBe('Old title');
    expect(screen.getByLabelText('Entry text').props.value).toBe('old text');
    await fireEvent.press(check());
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ id: '7', status: 'saved', durationMs: 0 }),
    );
  });

  it('renders an attachment and a toolbar passed into its slots', async () => {
    await render(
      <AddEntryScreen
        title=""
        onTitleChange={jest.fn()}
        body=""
        onBodyChange={jest.fn()}
        tags={[]}
        onTagsChange={jest.fn()}
        tagDraft=""
        onTagDraftChange={jest.fn()}
        date="Sunday, October 6"
        onSave={jest.fn()}
        onBack={jest.fn()}
        attachment={<Text>slot-attachment</Text>}
        toolbar={<Text>slot-toolbar</Text>}
      />,
    );
    expect(screen.getByText('slot-attachment')).toBeTruthy();
    expect(screen.getByText('slot-toolbar')).toBeTruthy();
  });
});
