import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { Dream } from '../types/dream';
import { EntryRow } from './EntryRow';

const dream = (over: Partial<Dream> = {}): Dream => ({
  id: 'd1',
  createdAt: '2026-10-04T06:42:00',
  durationMs: 65000,
  audioFileName: 'a.m4a',
  title: 'The endless hallway',
  transcript: 'I was back at my grandmother’s house.',
  emotion: 'uneasy, curious',
  tags: ['water', 'stairs'],
  ...over,
});

const draft = dream({ id: 'dr', status: 'draft', title: '', transcript: undefined });

const setup = async (props: Partial<React.ComponentProps<typeof EntryRow>> = {}) => {
  const onOpenDream = jest.fn();
  const onOpenDraft = jest.fn();
  const utils = await render(
    <EntryRow
      dream={dream()}
      untitled="Untitled dream"
      onOpenDream={onOpenDream}
      onOpenDraft={onOpenDraft}
      {...props}
    />,
  );
  return { onOpenDream, onOpenDraft, ...utils };
};

describe('EntryRow', () => {
  it('renders a finished card and opens it by id', async () => {
    const { onOpenDream, onOpenDraft } = await setup();
    expect(screen.getByText('The endless hallway')).toBeTruthy();
    expect(screen.getByText('SUN')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('Uneasy')).toBeTruthy();
    expect(screen.getByText('water')).toBeTruthy();
    const label = screen.getByRole('button').props.accessibilityLabel as string;
    expect(label).toMatch(/^The endless hallway\. /);
    expect(label).toContain('Feelings: Uneasy, Curious');
    expect(label).toContain('Tags: water, stairs');
    fireEvent.press(screen.getByRole('button'));
    expect(onOpenDream).toHaveBeenCalledWith('d1');
    expect(onOpenDraft).not.toHaveBeenCalled();
  });

  it('renders a draft card and opens it with the entry', async () => {
    const { onOpenDream, onOpenDraft } = await setup({ dream: draft });
    expect(screen.getByText('Draft')).toBeTruthy();
    const btn = screen.getByRole('button');
    expect(btn.props.accessibilityLabel).toMatch(/^Draft: Untitled dream\. .*\. Tap to finish$/);
    fireEvent.press(btn);
    expect(onOpenDraft).toHaveBeenCalledWith(draft);
    expect(onOpenDream).not.toHaveBeenCalled();
  });

  it('dims and disables a deleting card', async () => {
    const { onOpenDream } = await setup({ deleting: true });
    const btn = screen.getByRole('button');
    expect(btn.props.accessibilityState).toEqual({ disabled: true });
    expect(StyleSheet.flatten(btn.props.style).opacity).toBe(0.45);
    fireEvent.press(btn);
    expect(onOpenDream).not.toHaveBeenCalled();
  });

  it('offers the Delete accessibility action when given a handler', async () => {
    const onDelete = jest.fn();
    await setup({ onAccessibilityDelete: onDelete });
    const btn = screen.getByRole('button');
    expect(btn.props.accessibilityActions).toEqual([{ name: 'delete', label: 'Delete' }]);
    fireEvent(btn, 'accessibilityAction', { nativeEvent: { actionName: 'delete' } });
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('has no accessibility actions without a delete handler', async () => {
    await setup();
    expect(screen.getByRole('button').props.accessibilityActions).toBeUndefined();
  });

  it('adds the journal label to the meta line and accessibility label', async () => {
    await setup({ journalLabel: 'Life' });
    expect(screen.getByText('Life')).toBeTruthy();
    expect(screen.getByRole('button').props.accessibilityLabel).toMatch(/\. Life$/);
  });

  it('adds the journal label to a draft hint and label', async () => {
    await setup({ dream: draft, journalLabel: 'Dreams' });
    expect(screen.getByRole('button').props.accessibilityLabel).toMatch(/Tap to finish\. Dreams$/);
    expect(screen.getByText(/· Dreams$/)).toBeTruthy();
  });

  it('is identical without a journal label', async () => {
    await setup();
    expect(screen.queryByText('Dreams')).toBeNull();
    expect(screen.getByRole('button').props.accessibilityLabel).not.toMatch(/Dreams|Life/);
  });

  it('shows the date as the title of an untitled Life row', async () => {
    await setup({
      dream: dream({ title: '', journalId: 'life', tags: [], emotion: '' }),
      untitled: 'Untitled entry',
      journalLabel: 'Life',
    });
    expect(screen.getAllByText(/Oct 4/).length).toBeGreaterThan(0);
    expect(screen.queryByText('Untitled entry')).toBeNull();
  });
});
