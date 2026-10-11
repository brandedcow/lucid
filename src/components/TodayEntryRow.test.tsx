import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { colors } from '../theme';
import { Dream } from '../types/dream';
import { BUILT_IN_JOURNALS } from '../utils/journals';
import { TodayEntryRow } from './TodayEntryRow';

const dream = (over: Partial<Dream> = {}): Dream => ({
  id: 'd1',
  createdAt: '2026-10-04T06:22:00',
  durationMs: 65000,
  audioFileName: 'a.m4a',
  title: 'The endless hallway',
  transcript: 'I was back at my grandmother’s house.',
  emotion: 'uneasy, curious',
  tags: ['water', 'stairs'],
  ...over,
});
const draft = dream({ id: 'dr', status: 'draft', title: '', transcript: undefined });

const setup = async (props: Partial<React.ComponentProps<typeof TodayEntryRow>> = {}) => {
  const onOpenDream = jest.fn();
  const onOpenDraft = jest.fn();
  await render(
    <TodayEntryRow
      dream={dream()}
      journals={BUILT_IN_JOURNALS}
      untitled="Untitled dream"
      onOpenDream={onOpenDream}
      onOpenDraft={onOpenDraft}
      {...props}
    />,
  );
  return { onOpenDream, onOpenDraft };
};

describe('TodayEntryRow', () => {
  it('labels an entry of a custom journal with the journal name', async () => {
    await setup({
      dream: dream({ journalId: 'j_x' }),
      journals: [...BUILT_IN_JOURNALS, { id: 'j_x', name: 'Gratitude', kind: 'journal' }],
    });
    expect(screen.getByText('Gratitude · 6:22 AM')).toBeTruthy();
  });

  it('keeps the built-in labels (Dream, Life)', async () => {
    await setup({ dream: dream({ journalId: 'life' }) });
    expect(screen.getByText('Life · 6:22 AM')).toBeTruthy();
  });

  it('shows an uppercase label line with noun and time of day', async () => {
    await setup();
    const node = screen.getByText('Dream · 6:22 AM');
    const style = StyleSheet.flatten(node.props.style);
    expect(style.textTransform).toBe('uppercase');
    expect(style.letterSpacing).toBeGreaterThanOrEqual(1.2);
    expect(style.fontSize).toBeGreaterThanOrEqual(12);
    expect(style.fontSize).toBeLessThanOrEqual(13);
  });

  it('is flat: top hairline, opaque background, no radius or border box', async () => {
    await setup();
    const style = StyleSheet.flatten(screen.getByRole('button').props.style);
    expect(style.backgroundColor).toBe(colors.background);
    expect(style.borderTopWidth).toBe(StyleSheet.hairlineWidth);
    expect(style.borderRadius).toBeUndefined();
    expect(style.borderBottomWidth).toBeUndefined();
    expect(style.marginBottom).toBeUndefined();
  });

  it('shows the title large, the body and the chips; opens by id', async () => {
    const { onOpenDream, onOpenDraft } = await setup();
    const title = screen.getByText('The endless hallway');
    expect(StyleSheet.flatten(title.props.style).fontSize).toBe(26);
    expect(screen.getByText('I was back at my grandmother’s house.')).toBeTruthy();
    expect(screen.getByText('Uneasy')).toBeTruthy();
    expect(screen.getByText('water')).toBeTruthy();
    fireEvent.press(screen.getByRole('button'));
    expect(onOpenDream).toHaveBeenCalledWith('d1');
    expect(onOpenDraft).not.toHaveBeenCalled();
  });

  it('shows the full multi-paragraph body, one Text per paragraph, never truncated', async () => {
    const paras = Array.from({ length: 4 }, (_, i) =>
      `Paragraph ${i} ${'word '.repeat(120)}`.trim(),
    );
    await setup({ dream: dream({ transcript: paras.join('\n\n') }) });
    for (const p of paras) {
      const node = screen.getByText(p);
      expect(node.props.numberOfLines).toBeUndefined();
      const style = StyleSheet.flatten(node.props.style);
      expect(style.fontSize).toBe(17);
      expect(style.lineHeight).toBe(25);
    }
  });

  it('shows no title line for an untitled Life entry, body directly under the label', async () => {
    await setup({
      dream: dream({
        journalId: 'life',
        title: '',
        transcript: 'Made soup.',
        tags: [],
        emotion: '',
      }),
      untitled: 'Untitled entry',
    });
    expect(screen.getByText('Life · 6:22 AM')).toBeTruthy();
    expect(screen.getByText('Made soup.')).toBeTruthy();
    expect(screen.queryByText('Untitled entry')).toBeNull();
    expect(screen.queryByText('Oct 4')).toBeNull();
    expect(screen.getByRole('button').props.accessibilityLabel).toBe('Untitled. Life, 6:22 AM');
  });

  it('shows title then body for a titled Life entry', async () => {
    await setup({
      dream: dream({ journalId: 'life', title: 'A slow Sunday', transcript: 'Made soup.' }),
    });
    expect(screen.getByText('A slow Sunday')).toBeTruthy();
    expect(screen.getByText('Made soup.')).toBeTruthy();
  });

  it('shows title and chips only for a dream with no transcript', async () => {
    await setup({ dream: dream({ transcript: undefined }) });
    expect(screen.getByText('The endless hallway')).toBeTruthy();
    expect(screen.getByText('Uneasy')).toBeTruthy();
    expect(screen.queryByText('I was back at my grandmother’s house.')).toBeNull();
  });

  it('shows every chip, emotions first then tags, with no +N', async () => {
    const tags = Array.from({ length: 9 }, (_, i) => `tag${i}`);
    await setup({ dream: dream({ tags }) });
    const chips = screen.getByTestId('outlined-chips');
    const texts = within(chips)
      .getAllByText(/./)
      .map((n) => n.props.children);
    expect(texts).toEqual(['Uneasy', 'Curious', ...tags]);
    expect(screen.queryByText(/^\+\d+$/)).toBeNull();
  });

  it('builds a sentence-case accessibility label without the body', async () => {
    await setup({ journalLabel: 'Dream' });
    const label = screen.getByRole('button').props.accessibilityLabel as string;
    expect(label).toBe(
      'The endless hallway. Dream, 6:22 AM. Feelings: Uneasy, Curious. Tags: water, stairs',
    );
    expect(screen.getByRole('button').props.accessible).toBe(true);
  });

  it('renders a draft with a red DRAFT marker, no body, and opens it with the entry', async () => {
    const { onOpenDream, onOpenDraft } = await setup({
      dream: { ...draft, transcript: 'should not show', emotion: '', tags: [] },
      journalLabel: 'Dream',
    });
    const marker = screen.getByText('DRAFT ·');
    expect(StyleSheet.flatten(marker.props.style).color).toBe(colors.draft);
    expect(screen.queryByText('should not show')).toBeNull();
    const btn = screen.getByRole('button');
    expect(btn.props.accessibilityLabel).toBe('Untitled. Dream, 6:22 AM. Draft. Tap to finish');
    fireEvent.press(btn);
    expect(onOpenDraft).toHaveBeenCalledWith(expect.objectContaining({ id: 'dr' }));
    expect(onOpenDream).not.toHaveBeenCalled();
  });

  it('dims and disables a deleting row', async () => {
    const { onOpenDream } = await setup({ deleting: true });
    const btn = screen.getByRole('button');
    expect(btn.props.accessibilityState).toEqual({ disabled: true });
    expect(StyleSheet.flatten(btn.props.style).opacity).toBe(0.45);
    fireEvent.press(btn);
    expect(onOpenDream).not.toHaveBeenCalled();
  });

  it('offers the Delete accessibility action only with a handler', async () => {
    const onDelete = jest.fn();
    await setup({ onAccessibilityDelete: onDelete });
    const btn = screen.getByRole('button');
    expect(btn.props.accessibilityActions).toEqual([{ name: 'delete', label: 'Delete' }]);
    fireEvent(btn, 'accessibilityAction', { nativeEvent: { actionName: 'delete' } });
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('has no accessibility actions without a handler', async () => {
    await setup();
    expect(screen.getByRole('button').props.accessibilityActions).toBeUndefined();
  });
});
