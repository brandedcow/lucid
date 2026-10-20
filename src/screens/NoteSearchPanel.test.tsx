import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';
import { colors } from '../theme';
import { Note } from '../services/notesStorage';
import { monthSections } from '../utils/noteSearch';
import { foundText, NoteSearchPanel, SEARCH_COPY, SearchHeader } from './NoteSearchPanel';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 34 },
};
const NOW = new Date('2026-10-18T12:00:00');
const note = (i: number, updatedAt = '2026-10-10T09:00:00'): Note => ({
  id: `n${i}`,
  createdAt: updatedAt,
  updatedAt,
  body: `Note ${i}\nBody ${i} #dreams`,
});

type Props = Partial<React.ComponentProps<typeof NoteSearchPanel>>;
async function setup(over: Props = {}) {
  const notes = [note(1), note(2, '2025-03-01T09:00:00')];
  const props = {
    query: 'note',
    selectedTags: [] as string[],
    onToggleTag: jest.fn(),
    chips: [
      { tag: 'dreams', count: 2 },
      { tag: 'work', count: 1 },
    ],
    sections: monthSections(notes, NOW),
    resultCount: notes.length,
    now: NOW,
    indexStatus: 'ok' as const,
    onOpenNote: jest.fn(),
    ...over,
  };
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <NoteSearchPanel {...props} />
    </SafeAreaProvider>,
  );
  return props;
}

describe('NoteSearchPanel', () => {
  it('shows month headers and result rows', async () => {
    await setup();
    expect(screen.getByRole('header', { name: 'OCTOBER' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'MARCH 2025' })).toBeTruthy();
    expect(screen.getByLabelText(/^Note 1\./)).toBeTruthy();
    expect(screen.getByLabelText(/^Note 2\./)).toBeTruthy();
  });

  it('opens a result by id', async () => {
    const p = await setup();
    fireEvent.press(screen.getByLabelText(/^Note 2\./));
    expect(p.onOpenNote).toHaveBeenCalledWith('n2');
  });

  it('keeps taps and dismiss behaviour on the list', async () => {
    await setup();
    const list = screen.getByTestId('search-results');
    expect(list.props.keyboardShouldPersistTaps).toBe('handled');
    expect(list.props.keyboardDismissMode).toBe('on-drag');
  });

  it('toggles chips and exposes the selected state with a check glyph', async () => {
    const p = await setup({ selectedTags: ['dreams'] });
    const dreams = screen.getByRole('button', { name: '#dreams' });
    const work = screen.getByRole('button', { name: '#work' });
    expect(dreams.props.accessibilityState).toEqual({ selected: true });
    expect(work.props.accessibilityState).toEqual({ selected: false });
    expect(screen.getAllByTestId('chip-check', { includeHiddenElements: true })).toHaveLength(1);
    fireEvent.press(work);
    expect(p.onToggleTag).toHaveBeenCalledWith('work');
  });

  it('shows the hint when nothing is typed or selected', async () => {
    await setup({ query: '  ', sections: [], resultCount: 0 });
    expect(screen.getByText(SEARCH_COPY.hint)).toBeTruthy();
    expect(screen.queryByText(SEARCH_COPY.noMatch)).toBeNull();
  });

  it('shows no-match when there are no results', async () => {
    await setup({ query: 'zzz', sections: [], resultCount: 0 });
    expect(screen.getByText(SEARCH_COPY.noMatch)).toBeTruthy();
  });

  it('shows no-match (not the hint) with only a chip selected and no results', async () => {
    await setup({ query: '', selectedTags: ['work'], sections: [], resultCount: 0 });
    expect(screen.getByText(SEARCH_COPY.noMatch)).toBeTruthy();
  });

  it('shows the unreadable message and hides chips', async () => {
    await setup({ indexStatus: 'unreadable', sections: [], resultCount: 0 });
    expect(screen.getByText(SEARCH_COPY.unreadable)).toBeTruthy();
    expect(screen.queryByRole('button', { name: '#dreams' })).toBeNull();
    expect(screen.queryByRole('button', { name: SEARCH_COPY.clear })).toBeNull();
  });
});

describe('NoteSearchPanel highlighting and count', () => {
  it('highlights the query in the title, the preview and the tag line of each row', async () => {
    await setup({ query: 'dreams' });
    const marked = screen
      .getAllByText(/dreams/i)
      .filter((t) => StyleSheet.flatten(t.props.style)?.backgroundColor === colors.highlight);
    expect(marked.length).toBeGreaterThanOrEqual(2);
  });

  it('shows "N notes found" / "1 note found" as a polite live region, only with results', async () => {
    await setup();
    const line = screen.getByText('2 notes found');
    expect(line.parent?.props.accessibilityLiveRegion).toBe('polite');
  });

  it('shows "1 note found" for a single result', async () => {
    await setup({ resultCount: 1 });
    expect(screen.getByText('1 note found')).toBeTruthy();
  });

  it('shows no count line with no results, the hint or the unreadable message', async () => {
    await setup({ query: 'zzz', sections: [], resultCount: 0 });
    expect(screen.queryByText(/found$/)).toBeNull();
  });

  it('foundText', () => {
    expect(foundText(1)).toBe('1 note found');
    expect(foundText(0)).toBe('0 notes found');
    expect(foundText(12)).toBe('12 notes found');
  });
});

describe('SearchHeader', () => {
  const header = async (over: Partial<React.ComponentProps<typeof SearchHeader>> = {}) => {
    const props = { query: 'no', onChangeQuery: jest.fn(), onClose: jest.fn(), ...over };
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <SearchHeader {...props} />
      </SafeAreaProvider>,
    );
    return props;
  };

  it('has a focused, search-keyed field that passes the text through untrimmed', async () => {
    const p = await header({ query: ' no ' });
    const field = screen.getByLabelText(SEARCH_COPY.fieldLabel);
    expect(field.props.autoFocus).toBe(true);
    expect(field.props.returnKeyType).toBe('search');
    expect(field.props.value).toBe(' no ');
    fireEvent.changeText(field, 'note  x ');
    expect(p.onChangeQuery).toHaveBeenCalledWith('note  x ');
  });

  it('closes with the Close search arrow', async () => {
    const p = await header();
    fireEvent.press(screen.getByRole('button', { name: SEARCH_COPY.close }));
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the clear button only with text, and clears', async () => {
    const p = await header();
    fireEvent.press(screen.getByRole('button', { name: SEARCH_COPY.clear }));
    expect(p.onChangeQuery).toHaveBeenCalledWith('');
  });

  it('hides the clear button when the field is empty', async () => {
    await header({ query: '' });
    expect(screen.queryByRole('button', { name: SEARCH_COPY.clear })).toBeNull();
  });

  it('disables the field and hides clear when the index is unreadable', async () => {
    await header({ disabled: true });
    expect(screen.getByLabelText(SEARCH_COPY.fieldLabel).props.editable).toBe(false);
    expect(screen.queryByRole('button', { name: SEARCH_COPY.clear })).toBeNull();
  });
});
