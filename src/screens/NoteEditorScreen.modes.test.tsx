import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useNoteEditor } from '../hooks/useNoteEditor';
import { fakeKeyboard } from '../test/fakeKeyboard';
import { NoteEditorScreen, type NoteEditorScreenProps } from './NoteEditorScreen';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 34 }),
}));

type Overrides = Partial<Omit<NoteEditorScreenProps, 'editor'>>;

function Harness(rest: Overrides) {
  const [body, setBody] = useState('');
  const editor = useNoteEditor({ body, setBody });
  return (
    <NoteEditorScreen
      date="Sunday, October 18"
      stored
      pinned={false}
      menuDisabled={false}
      locked={false}
      autoFocus={false}
      editor={editor}
      onBack={() => {}}
      onTogglePin={() => {}}
      onDelete={() => {}}
      {...rest}
    />
  );
}

let keyboard: ReturnType<typeof fakeKeyboard>;
beforeEach(() => {
  keyboard = fakeKeyboard();
});
afterEach(() => jest.restoreAllMocks());

describe('NoteEditorScreen modes', () => {
  it('has no mode button and shows the input by default', async () => {
    await render(<Harness />);
    expect(screen.queryByLabelText('Edit note')).toBeNull();
    expect(screen.queryByLabelText('Done editing')).toBeNull();
    expect(screen.getByTestId('note-body')).toBeTruthy();
  });

  it('shows the reading view instead of the input in reading mode', async () => {
    await render(<Harness mode="reading" readingView={<Text>rendered</Text>} />);
    expect(screen.getByText('rendered')).toBeTruthy();
    expect(screen.queryByTestId('note-body')).toBeNull();
  });

  it('shows the input in reading mode when no readingView is given', async () => {
    await render(<Harness mode="reading" />);
    expect(screen.getByTestId('note-body')).toBeTruthy();
  });

  it('labels the button by mode and calls onToggleMode', async () => {
    const onToggleMode = jest.fn();
    const view = await render(<Harness mode="reading" onToggleMode={onToggleMode} />);
    expect(screen.getByText('Edit')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Edit note'));
    expect(onToggleMode).toHaveBeenCalledTimes(1);
    await view.rerender(<Harness mode="editing" onToggleMode={onToggleMode} />);
    expect(screen.getByText('Done')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Done editing'));
    expect(onToggleMode).toHaveBeenCalledTimes(2);
  });

  it('disables the button when locked or modeToggleDisabled', async () => {
    const onToggleMode = jest.fn();
    const view = await render(<Harness locked onToggleMode={onToggleMode} />);
    expect(screen.getByLabelText('Done editing').props.accessibilityState.disabled).toBe(true);
    await view.rerender(<Harness modeToggleDisabled onToggleMode={onToggleMode} />);
    expect(screen.getByLabelText('Done editing').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByLabelText('Done editing'));
    expect(onToggleMode).not.toHaveBeenCalled();
  });

  describe('revealRequest', () => {
    const layout = async () => {
      await fireEvent(screen.getByTestId('note-page'), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 600 } },
      });
      await fireEvent(screen.getByTestId('note-body-wrap'), 'layout', {
        nativeEvent: { layout: { x: 0, y: 100, width: 300, height: 400 } },
      });
    };

    it('scrolls once the keyboard height is known, a third of the viewport above the row', async () => {
      const view = await render(<Harness />);
      await layout();
      const scrollTo = jest.spyOn(ScrollView.prototype as never, 'scrollTo');
      await view.rerender(<Harness revealRequest={{ y: 500, token: 1 }} />);
      expect(scrollTo).not.toHaveBeenCalled();
      await keyboard.emit('keyboardWillShow', 300);
      expect(scrollTo).toHaveBeenCalledWith({ y: 100 + 500 - 200, animated: false });
      // The same token is not handled twice.
      await keyboard.emit('keyboardWillShow', 310);
      expect(scrollTo).toHaveBeenCalledTimes(1);
      await view.rerender(<Harness revealRequest={{ y: 0, token: 2 }} />);
      expect(scrollTo).toHaveBeenLastCalledWith({ y: 0, animated: false });
      scrollTo.mockRestore();
    });

    it('waits while reading', async () => {
      const view = await render(<Harness mode="reading" readingView={<Text>r</Text>} />);
      await layout();
      const scrollTo = jest.spyOn(ScrollView.prototype as never, 'scrollTo');
      await keyboard.emit('keyboardWillShow', 300);
      await view.rerender(
        <Harness
          mode="reading"
          readingView={<Text>r</Text>}
          revealRequest={{ y: 500, token: 1 }}
        />,
      );
      expect(scrollTo).not.toHaveBeenCalled();
      scrollTo.mockRestore();
      await act(async () => {});
    });
  });
});
