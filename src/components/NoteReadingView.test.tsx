import { fireEvent, render, screen } from '@testing-library/react-native';
import { markdownBlocks } from '../utils/markdownBlocks';
import { NoteReadingView, type NoteReadingViewProps } from './NoteReadingView';

jest.mock('../utils/markdownBlocks', () => {
  const actual = jest.requireActual('../utils/markdownBlocks');
  return { ...actual, markdownBlocks: jest.fn(actual.markdownBlocks) };
});

function props(over: Partial<NoteReadingViewProps> = {}): NoteReadingViewProps {
  return {
    body: '',
    onEdit: jest.fn(),
    onToggleCheckbox: jest.fn(),
    onOpenWeb: jest.fn(),
    onOpenNote: jest.fn(),
    noteLinkState: () => 'exists',
    imagesEnabled: false,
    linksDisabled: false,
    placeholder: 'Start writing...',
    ...over,
  };
}

describe('NoteReadingView', () => {
  it('shows a pressable placeholder for an empty Body', async () => {
    const p = props({ body: '  \n ' });
    await render(<NoteReadingView {...p} />);
    await fireEvent.press(screen.getByText('Start writing...'));
    expect(p.onEdit).toHaveBeenCalledWith(0, 0);
  });

  it('renders every block kind', async () => {
    const body = [
      '# One',
      '## Two',
      '### Three',
      '- bullet',
      '  - nested',
      '7. seven',
      '- [ ] todo',
      '- [x] done',
      '> quoted',
      '---',
      '```',
      'code here',
      '```',
      'plain **bold** *it* `ic`',
      '',
      '- ![a](https://x.test/i.png)',
    ].join('\n');
    await render(<NoteReadingView {...props({ body })} />);
    expect(screen.getAllByRole('header')).toHaveLength(3);
    expect(screen.getByText('One')).toBeTruthy();
    expect(screen.getAllByText('•')).toHaveLength(2);
    expect(screen.getAllByText('◦').length).toBeGreaterThan(0);
    expect(screen.getByText('7.')).toBeTruthy();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    expect(screen.getByRole('checkbox', { checked: true })).toBeTruthy();
    expect(screen.getByText('quoted')).toBeTruthy();
    expect(screen.queryByText(/^>/)).toBeNull();
    expect(screen.getByText('code here')).toBeTruthy();
    expect(screen.queryByText('```')).toBeNull();
    expect(screen.getByText('bold')).toBeTruthy();
    // an image inside a bullet stays a bullet with inert alt text
    expect(screen.getByText('a')).toBeTruthy();
    expect(screen.queryByText('Tap to load')).toBeNull();
    expect(screen.queryByText(/https:\/\/x\.test/)).toBeNull();
  });

  it('groups fence and code lines into one surface and an all-fence group stays empty', async () => {
    await render(<NoteReadingView {...props({ body: '```\n```\nafter' })} />);
    expect(screen.getByText('after')).toBeTruthy();
  });

  it('calls onEdit with the end of the tapped line for LF, CRLF and emoji bodies', async () => {
    const body = 'a 😀\r\nline two\nthree';
    const p = props({ body });
    await render(<NoteReadingView {...p} />);
    await fireEvent.press(screen.getByText('a 😀'));
    expect(p.onEdit).toHaveBeenLastCalledWith(body.indexOf('\r'), 0);
    await fireEvent.press(screen.getByText('line two'));
    expect(p.onEdit).toHaveBeenLastCalledWith(body.indexOf('\nthree'), 0);
    await fireEvent.press(screen.getByText('three'));
    expect(p.onEdit).toHaveBeenLastCalledWith(body.length, 0);
  });

  it('passes the recorded layout y to onEdit', async () => {
    const p = props({ body: 'first\nsecond' });
    await render(<NoteReadingView {...p} />);
    const views = screen.getAllByTestId('reading-row');
    await views[1].props.onLayout({
      nativeEvent: { layout: { x: 0, y: 77, width: 1, height: 1 } },
    });
    await fireEvent.press(screen.getByText('second'));
    expect(p.onEdit).toHaveBeenCalledWith(12, 77);
  });

  it('presses on a blank line edit at its end offset', async () => {
    const body = 'a\n\nb';
    const p = props({ body });
    await render(<NoteReadingView {...p} />);
    await fireEvent.press(screen.getByTestId('reading-blank', { hidden: true }));
    expect(p.onEdit).toHaveBeenCalledWith(2, 0);
  });

  it('checkbox toggles with startOffset and its label edits', async () => {
    const body = 'x\n- [ ] todo';
    const p = props({ body });
    await render(<NoteReadingView {...p} />);
    await fireEvent.press(screen.getByRole('checkbox'));
    expect(p.onToggleCheckbox).toHaveBeenCalledWith(2);
    expect(p.onEdit).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('todo'));
    expect(p.onEdit).toHaveBeenCalledWith(body.length, 0);
    expect(screen.getByLabelText('todo')).toBeTruthy();
  });

  it('web links open the safe URL and do not also edit; the URL is never shown', async () => {
    const p = props({ body: 'see [site](https://example.com/a) now' });
    await render(<NoteReadingView {...p} />);
    expect(screen.queryByText(/example\.com/)).toBeNull();
    await fireEvent.press(screen.getByRole('link'));
    expect(p.onOpenWeb).toHaveBeenCalledWith('https://example.com/a');
    expect(p.onEdit).not.toHaveBeenCalled();
  });

  it('hostile links render as plain text and are not pressable', async () => {
    const long = 'https://a.test/' + 'x'.repeat(2100);
    const body = [
      '[j](javascript:alert(1))',
      '[d](data:text/html,hi)',
      '[u](https://a@b.test)',
      `[l](${long})`,
      '[n](https://a.test/ x)',
    ].join('\n');
    const p = props({ body });
    await render(<NoteReadingView {...p} />);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    await fireEvent.press(screen.getByText('j'));
    expect(p.onOpenWeb).not.toHaveBeenCalled();
    expect(p.onEdit).toHaveBeenCalled();
  });

  it('wikilinks: exists, missing, invalid and linksDisabled', async () => {
    const body = '[[Here]] [[Gone]] [[Bad]]';
    const state = (t: string) => (t === 'Here' ? 'exists' : t === 'Gone' ? 'missing' : 'invalid');
    const p = props({ body, noteLinkState: state });
    await render(<NoteReadingView {...p} />);
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(screen.getByText('Here').props.accessibilityHint).toBe('Opens the note.');
    expect(screen.getByText('Gone').props.accessibilityHint).toBe(
      'Creates a note with this title.',
    );
    await fireEvent.press(screen.getByText('Here'));
    await fireEvent.press(screen.getByText('Gone'));
    expect(p.onOpenNote).toHaveBeenNthCalledWith(1, 'Here');
    expect(p.onOpenNote).toHaveBeenNthCalledWith(2, 'Gone');
    await fireEvent.press(screen.getByText('Bad'));
    expect(p.onOpenNote).toHaveBeenCalledTimes(2);
  });

  it('linksDisabled makes web links and wikilinks inert', async () => {
    const p = props({ body: '[s](https://e.test) [[Here]]', linksDisabled: true });
    await render(<NoteReadingView {...p} />);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    await fireEvent.press(screen.getByText('Here'));
    expect(p.onOpenNote).not.toHaveBeenCalled();
  });

  it('inline images are muted alt text, empty alt shows Image', async () => {
    await render(
      <NoteReadingView
        {...props({ body: 'a ![pic](https://e.test/i.png) b ![](https://e.test/j.png)' })}
      />,
    );
    expect(screen.getByText('pic')).toBeTruthy();
    expect(screen.getByText('Image')).toBeTruthy();
    expect(screen.queryByText(/e\.test/)).toBeNull();
  });

  it('calls markdownBlocks once per Body change', async () => {
    (markdownBlocks as jest.Mock).mockClear();
    const p = props({ body: 'one' });
    const { rerender } = await render(<NoteReadingView {...p} />);
    await rerender(<NoteReadingView {...p} onEdit={jest.fn()} />);
    expect(markdownBlocks).toHaveBeenCalledTimes(1);
    await rerender(<NoteReadingView {...p} body="two" />);
    expect(markdownBlocks).toHaveBeenCalledTimes(2);
  });

  it('does not re-render rows whose inputs are unchanged', async () => {
    const state = jest.fn(() => 'exists' as const);
    const p = props({ body: '[[A]]\n[[B]]\nlast', noteLinkState: state });
    const { rerender } = await render(<NoteReadingView {...p} />);
    const before = state.mock.calls.length;
    await rerender(<NoteReadingView {...p} body={'[[A]]\n[[B]]\nlast!'} />);
    expect(state.mock.calls.length).toBe(before);
    await rerender(<NoteReadingView {...p} body={'[[A]]\n[[B]]\nlast!'} onEdit={jest.fn()} />);
    expect(state.mock.calls.length).toBe(before);
  });

  it('image rows mount Images when imagesEnabled flips on', async () => {
    const body = '![a](https://e.test/i.png)';
    const p = props({ body });
    const { rerender } = await render(<NoteReadingView {...p} />);
    expect(screen.queryByTestId('reading-image', { hidden: true })).toBeNull();
    await rerender(<NoteReadingView {...p} imagesEnabled />);
    expect(screen.getByTestId('reading-image', { hidden: true })).toBeTruthy();
  });
});
