import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { Platform, Text, TextInput, View } from 'react-native';
import { resetKeyboardHeightMemory } from '../hooks/useKeyboardInset';
import { useNoteEditor } from '../hooks/useNoteEditor';
import { fakeKeyboard } from '../test/fakeKeyboard';
import { NoteToolbar } from '../components/NoteToolbar';
import { NoteEditorScreen, type NoteEditorScreenProps } from './NoteEditorScreen';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 34 }),
}));

// Exposes the `enabled` prop (the real component renders only a styled View).
jest.mock('react-native/Libraries/Components/Keyboard/KeyboardAvoidingView', () => {
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: ({ enabled = true, children, style }: any) => (
      <View testID="kav" style={style} accessibilityValue={{ text: enabled }}>
        {children}
      </View>
    ),
  };
});

const callbacks = {
  onBack: jest.fn(),
  onTogglePin: jest.fn(),
  onDelete: jest.fn(),
};

type Overrides = Partial<Omit<NoteEditorScreenProps, 'editor'>> & { initial?: string };

function Harness({ initial = '', ...rest }: Overrides) {
  const [body, setBody] = useState(initial);
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
      toolbar={
        <NoteToolbar
          canUndo
          canRedo
          micDisabled={false}
          onUndo={() => {}}
          onRedo={() => {}}
          onDismissKeyboard={() => {}}
          onMic={() => {}}
          onTags={() => {}}
          listPanelOpen={false}
          onListPanel={() => {}}
          disabled={rest.locked}
        />
      }
      {...callbacks}
      {...rest}
    />
  );
}

const input = () => screen.getByTestId('note-body');
let keyboard: ReturnType<typeof fakeKeyboard>;

beforeEach(() => {
  jest.clearAllMocks();
  keyboard = fakeKeyboard();
  resetKeyboardHeightMemory();
});
afterEach(() => jest.restoreAllMocks());

describe('NoteEditorScreen', () => {
  it('shows the date and the body input with its placeholder and label', async () => {
    await render(<Harness />);
    expect(screen.getByText('Sunday, October 18')).toBeTruthy();
    expect(input().props.accessibilityLabel).toBe('Note text');
    expect(screen.getByPlaceholderText('Start writing...')).toBeTruthy();
  });

  it('calls onBack from the back arrow', async () => {
    await render(<Harness />);
    await fireEvent.press(screen.getByLabelText('Back to notes'));
    expect(callbacks.onBack).toHaveBeenCalledTimes(1);
  });

  it('labels the back arrow with backLabel when given', async () => {
    await render(<Harness backLabel="Back to previous note" />);
    expect(screen.getByLabelText('Back to previous note')).toBeTruthy();
    expect(screen.queryByLabelText('Back to notes')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Back to previous note'));
    expect(callbacks.onBack).toHaveBeenCalledTimes(1);
  });

  describe('menu', () => {
    it('is absent for a note that is not stored', async () => {
      await render(<Harness stored={false} />);
      expect(screen.queryByLabelText('More options')).toBeNull();
    });

    it('offers Pin for an unpinned note and calls onTogglePin', async () => {
      await render(<Harness />);
      await fireEvent.press(screen.getByLabelText('More options'));
      expect(screen.queryByLabelText('Unpin')).toBeNull();
      await fireEvent.press(screen.getByLabelText('Pin'));
      expect(callbacks.onTogglePin).toHaveBeenCalledTimes(1);
    });

    it('offers Unpin for a pinned note', async () => {
      await render(<Harness pinned />);
      await fireEvent.press(screen.getByLabelText('More options'));
      expect(screen.getByLabelText('Unpin')).toBeTruthy();
      expect(screen.queryByLabelText('Pin')).toBeNull();
    });

    it('has a Delete note item that calls onDelete', async () => {
      await render(<Harness />);
      await fireEvent.press(screen.getByLabelText('More options'));
      await fireEvent.press(screen.getByLabelText('Delete note'));
      expect(callbacks.onDelete).toHaveBeenCalledTimes(1);
    });

    it('is disabled with menuDisabled', async () => {
      await render(<Harness menuDisabled />);
      expect(screen.getByLabelText('More options').props.accessibilityState.disabled).toBe(true);
    });
  });

  describe('banners', () => {
    it('shows nothing without a banner', async () => {
      await render(<Harness />);
      expect(screen.queryByTestId('note-banner')).toBeNull();
    });

    it('saveError shows its text and Try again calls onRetry', async () => {
      const onRetry = jest.fn();
      await render(<Harness banner={{ kind: 'saveError', onRetry }} />);
      expect(screen.getByText("Couldn't save this note. Your text is still here.")).toBeTruthy();
      expect(screen.getByTestId('note-banner').props.accessibilityLiveRegion).toBe('polite');
      await fireEvent.press(screen.getByLabelText('Try again'));
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('inTrash shows its text and Leave calls onLeave', async () => {
      const onLeave = jest.fn();
      await render(<Harness banner={{ kind: 'inTrash', onLeave }} />);
      expect(
        screen.getByText('This note is in Recently Deleted, so changes are not saved.'),
      ).toBeTruthy();
      await fireEvent.press(screen.getByLabelText('Leave'));
      expect(onLeave).toHaveBeenCalledTimes(1);
    });

    it('unreadable shows its text and no button', async () => {
      await render(<Harness banner={{ kind: 'unreadable' }} />);
      expect(
        screen.getByText(
          "Your notes could not be read, so this note can't be saved right now. Your text is still here.",
        ),
      ).toBeTruthy();
      expect(screen.queryByLabelText('Try again')).toBeNull();
      expect(screen.queryByLabelText('Leave')).toBeNull();
    });

    it('disables the banner button while locked', async () => {
      const onRetry = jest.fn();
      await render(<Harness locked banner={{ kind: 'saveError', onRetry }} />);
      await fireEvent.press(screen.getByLabelText('Try again'));
      expect(onRetry).not.toHaveBeenCalled();
    });
  });

  describe('locked', () => {
    it('makes the input read-only and disables back, menu and toolbar', async () => {
      await render(<Harness locked initial="- [ ] a" />);
      expect(input().props.editable).toBe(false);
      await fireEvent.press(screen.getByLabelText('Back to notes'));
      expect(callbacks.onBack).not.toHaveBeenCalled();
      expect(screen.getByLabelText('More options').props.accessibilityState.disabled).toBe(true);
      for (const label of ['Undo', 'Redo', 'Record voice note', 'Add tags'])
        expect(screen.getByLabelText(label).props.accessibilityState.disabled).toBe(true);
    });

    it('is editable when not locked', async () => {
      await render(<Harness />);
      expect(input().props.editable).toBe(true);
    });
  });

  describe('body focus', () => {
    it('focuses the body once on open for a new note', async () => {
      const focus = jest.spyOn(TextInput.prototype, 'focus');
      const view = await render(<Harness autoFocus stored={false} />);
      expect(focus).toHaveBeenCalledTimes(1);
      await view.rerender(<Harness autoFocus stored={false} initial="" />);
      await act(async () => {});
      expect(focus).toHaveBeenCalledTimes(1);
    });

    it('does not focus the body for a stored note', async () => {
      const focus = jest.spyOn(TextInput.prototype, 'focus');
      await render(<Harness autoFocus={false} initial="abc" />);
      expect(focus).not.toHaveBeenCalled();
    });
  });

  describe('slots and dock', () => {
    it('renders attachment, suggestions and toolbar', async () => {
      await render(<Harness attachment={<Text>card</Text>} suggestions={<Text>suggest</Text>} />);
      expect(screen.getByTestId('note-attachment')).toBeTruthy();
      expect(screen.getByText('suggest')).toBeTruthy();
      expect(screen.getByLabelText('Undo')).toBeTruthy();
    });

    it('the recording panel replaces suggestions and toolbar', async () => {
      await render(
        <Harness recordingPanel={<Text>panel</Text>} suggestions={<Text>suggest</Text>} />,
      );
      expect(screen.getByText('panel')).toBeTruthy();
      expect(screen.queryByText('suggest')).toBeNull();
      expect(screen.queryByLabelText('Undo')).toBeNull();
    });

    it('page scroller keeps taps for inputs and buttons', async () => {
      await render(<Harness />);
      expect(screen.getByTestId('note-page').props.keyboardShouldPersistTaps).toBe('handled');
    });

    it('lifts the dock by the keyboard on Android and by the inset when closed', async () => {
      const original = Platform.OS;
      Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'android' });
      try {
        await render(<Harness />);
        const padding = () => screen.getByTestId('note-bottom-dock').props.style.paddingBottom;
        expect(padding()).toBe(34);
        await keyboard.emit('keyboardDidShow', 300);
        expect(padding()).toBe(334);
      } finally {
        Object.defineProperty(Platform, 'OS', { configurable: true, get: () => original });
      }
    });

    describe('list panel', () => {
      const panel = (h: number) => <View testID="list-panel-body" style={{ height: h }} />;
      const withOS = async (os: 'ios' | 'android', fn: () => Promise<void>) => {
        const original = Platform.OS;
        Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
        try {
          await fn();
        } finally {
          Object.defineProperty(Platform, 'OS', { configurable: true, get: () => original });
        }
      };
      const padding = () => screen.getByTestId('note-bottom-dock').props.style.paddingBottom;
      // The `enabled` prop the page gives KeyboardAvoidingView (mocked below to expose it).
      const avoiding = () => screen.getByTestId('kav').props.accessibilityValue.text;
      const bodyHeight = () => screen.getByTestId('list-panel-body').props.style.height;

      it('does not render the panel unless it is active', async () => {
        await render(<Harness listPanel={panel} />);
        expect(screen.queryByTestId('list-panel-body')).toBeNull();
      });

      it('renders it below the toolbar and the recording panel hides it', async () => {
        const view = await render(<Harness listPanel={panel} panelActive />);
        expect(screen.getByTestId('list-panel-body')).toBeTruthy();
        expect(screen.getByLabelText('Undo')).toBeTruthy();
        await view.rerender(
          <Harness listPanel={panel} panelActive recordingPanel={<Text>rec</Text>} />,
        );
        expect(screen.queryByTestId('list-panel-body')).toBeNull();
      });

      it('iOS: KeyboardAvoidingView is on without the panel', async () => {
        await withOS('ios', async () => {
          await render(<Harness listPanel={panel} />);
          expect(avoiding()).toBe(true);
        });
      });

      it('iOS: turns KeyboardAvoidingView off and keeps the inset under a panel as tall as the keyboard', async () => {
        await withOS('ios', async () => {
          await render(<Harness listPanel={panel} panelActive />);
          await keyboard.emit('keyboardWillShow', 336);
          await keyboard.emit('keyboardWillHide', 0);
          expect(avoiding()).toBe(false);
          // Content height + the home-indicator inset under it = the remembered keyboard height.
          expect(bodyHeight() + padding()).toBe(336);
          expect(padding()).toBe(34);
        });
      });

      it('iOS: the panel stands even if the keyboard still reports visible', async () => {
        await withOS('ios', async () => {
          await render(<Harness listPanel={panel} panelActive />);
          await keyboard.emit('keyboardWillShow', 336);
          expect(padding()).toBe(34);
        });
      });

      it('Android: the dock padding ignores keyboard.visible and stays at the inset', async () => {
        await withOS('android', async () => {
          await render(<Harness listPanel={panel} panelActive />);
          expect(padding()).toBe(34);
          await keyboard.emit('keyboardDidShow', 300);
          expect(padding()).toBe(34);
          // Android: the panel is as tall as the remembered keyboard, the inset adds on top.
          expect(bodyHeight()).toBe(300);
        });
      });

      it('uses the fallback height when no keyboard height was seen, and panelHeight overrides', async () => {
        const view = await render(<Harness listPanel={panel} panelActive />);
        expect(bodyHeight()).toBe(260);
        await view.rerender(<Harness listPanel={panel} panelActive panelHeight={222} />);
        expect(bodyHeight()).toBe(222);
      });
    });
  });
});
