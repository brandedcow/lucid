import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';
import { colors } from '../theme';
import { SwipeActionRow, SwipeRowRenderArgs } from './SwipeActionRow';

const setup = async (opts: { disabled?: boolean; two?: boolean; renderChild?: boolean } = {}) => {
  const onDelete = jest.fn();
  const onRename = jest.fn();
  const actions = [
    {
      key: 'delete',
      label: 'Delete',
      accessibilityLabel: 'Delete Gratitude',
      onPress: onDelete,
      destructive: true,
    },
    ...(opts.two
      ? [
          {
            key: 'rename',
            label: 'Rename',
            accessibilityLabel: 'Rename Gratitude',
            onPress: onRename,
          },
        ]
      : []),
  ];
  let args: SwipeRowRenderArgs | undefined;
  await render(
    <SwipeActionRow
      actions={actions}
      disabled={opts.disabled}
      onRowWillOpen={jest.fn()}
      onRowClosed={jest.fn()}
      testID="row"
    >
      {opts.renderChild ? (
        (a) => {
          args = a;
          return <Text>content</Text>;
        }
      ) : (
        <Text>content</Text>
      )}
    </SwipeActionRow>,
  );
  return { onDelete, onRename, getArgs: () => args };
};

const find = (label: string) => screen.getByLabelText(label, { includeHiddenElements: true });

describe('SwipeActionRow', () => {
  it('renders the content and one action that fires with a close function', async () => {
    const { onDelete } = await setup();
    expect(screen.getByText('content')).toBeTruthy();
    fireEvent.press(find('Delete Gratitude'));
    expect(onDelete).toHaveBeenCalledWith(expect.any(Function));
  });

  it('renders two actions; the first fires only its own handler', async () => {
    const { onDelete, onRename } = await setup({ two: true });
    fireEvent.press(find('Delete Gratitude'));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onRename).not.toHaveBeenCalled();
  });

  it('fires the second action only on its own handler', async () => {
    const { onDelete, onRename } = await setup({ two: true });
    fireEvent.press(find('Rename Gratitude'));
    expect(onRename).toHaveBeenCalledWith(expect.any(Function));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('styles destructive actions red and others with the accent', async () => {
    await setup({ two: true });
    const bg = (label: string) => StyleSheet.flatten(find(label).props.style).backgroundColor;
    expect(bg('Delete Gratitude')).toBe(colors.draft);
    expect(bg('Rename Gratitude')).toBe(colors.accent);
  });

  it('hides the actions from the screen reader while closed', async () => {
    await setup();
    expect(screen.queryByLabelText('Delete Gratitude')).toBeNull();
  });

  it('disabled blocks swiping', async () => {
    await setup({ disabled: true });
    expect(screen.getByTestId('row').props.enabled).toBe(false);
  });

  it('enabled allows swiping', async () => {
    await setup();
    expect(screen.getByTestId('row').props.enabled).toBe(true);
  });

  it('exposes one screen-reader action per action and routes them', async () => {
    const { onDelete, onRename, getArgs } = await setup({ two: true, renderChild: true });
    const a = getArgs();
    expect(a?.accessibilityActions).toEqual([
      { name: 'delete', label: 'Delete' },
      { name: 'rename', label: 'Rename' },
    ]);
    a?.onAccessibilityAction?.({ nativeEvent: { actionName: 'rename' } } as never);
    expect(onRename).toHaveBeenCalledWith(expect.any(Function));
    a?.onAccessibilityAction?.({ nativeEvent: { actionName: 'delete' } } as never);
    expect(onDelete).toHaveBeenCalledTimes(1);
    a?.onAccessibilityAction?.({ nativeEvent: { actionName: 'other' } } as never);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('withholds screen-reader actions while disabled', async () => {
    const { getArgs } = await setup({ disabled: true, renderChild: true });
    expect(getArgs()?.accessibilityActions).toBeUndefined();
    expect(getArgs()?.onAccessibilityAction).toBeUndefined();
  });

  it('disabled makes the action buttons do nothing', async () => {
    const { onDelete } = await setup({ disabled: true });
    fireEvent.press(find('Delete Gratitude'));
    expect(onDelete).not.toHaveBeenCalled();
  });
});
