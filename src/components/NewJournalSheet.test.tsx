import { BackHandler, Keyboard, PanResponder, Platform, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { fakeKeyboard } from '../test/fakeKeyboard';
import { JournalError } from '../services/journalStorage';
import { BUILT_IN_JOURNALS } from '../utils/journals';
import { NewJournalSheet } from './NewJournalSheet';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 34 },
};
const EXISTING = [...BUILT_IN_JOURNALS, { id: 'j_a', name: 'Gratitude', kind: 'journal' as const }];

let backHandler: (() => boolean | null | undefined) | null = null;
const removeListener = jest.fn();
let addSpy: jest.SpyInstance;
beforeEach(() => {
  backHandler = null;
  removeListener.mockClear();
  addSpy = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, handler) => {
    backHandler = handler as typeof backHandler;
    return { remove: removeListener };
  });
});
afterEach(() => addSpy.mockRestore());

type Props = Partial<React.ComponentProps<typeof NewJournalSheet>>;
const ui = (props: Props, onSubmit: jest.Mock, onClose: jest.Mock) => (
  <SafeAreaProvider initialMetrics={METRICS}>
    <NewJournalSheet visible onClose={onClose} onSubmit={onSubmit} existing={EXISTING} {...props} />
  </SafeAreaProvider>
);
async function setup(props: Props = {}, onSubmit = jest.fn().mockResolvedValue(undefined)) {
  const onClose = jest.fn();
  const view = await render(ui(props, onSubmit, onClose));
  return {
    onSubmit,
    onClose,
    view,
    rerender: (p: Props) => view.rerender(ui(p, onSubmit, onClose)),
  };
}
const input = () => screen.getByLabelText('Journal name');
const create = () => screen.getByRole('button', { name: 'Create' });
const type = (text: string) => fireEvent.changeText(input(), text);
const disabled = (el: { props: any }) => !!el.props.accessibilityState?.disabled;

describe('NewJournalSheet', () => {
  it('renders nothing when not visible', async () => {
    await setup({ visible: false });
    expect(screen.queryByText('New journal')).toBeNull();
    expect(addSpy).not.toHaveBeenCalled();
  });

  it('shows the title, an autofocused input with a placeholder, and Create and Cancel', async () => {
    await setup();
    expect(screen.getByRole('header', { name: 'New journal' })).toBeTruthy();
    expect(input().props.autoFocus).toBe(true);
    expect(input().props.placeholder).toBe('Journal name');
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  it('Create is disabled while empty, with no message until a submit attempt', async () => {
    const { onSubmit } = await setup();
    expect(disabled(create())).toBe(true);
    expect(screen.queryByText('Give the journal a name.')).toBeNull();
    await type('   ');
    expect(disabled(create())).toBe(true);
    await fireEvent(input(), 'submitEditing');
    expect(screen.getByText('Give the journal a name.')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
    await type('Work');
    expect(screen.queryByText('Give the journal a name.')).toBeNull();
    expect(disabled(create())).toBe(false);
  });

  it('shows too-long at once and disables Create; 24 characters is fine', async () => {
    await setup();
    await type('a'.repeat(24));
    expect(disabled(create())).toBe(false);
    await type('a'.repeat(25));
    expect(screen.getByText('Use 24 characters or fewer.')).toBeTruthy();
    expect(disabled(create())).toBe(true);
  });

  it('shows duplicate (case-insensitive, built-ins included) and disables Create', async () => {
    const { onSubmit } = await setup();
    await type('  gratitude ');
    expect(screen.getByText('A journal named "gratitude" already exists.')).toBeTruthy();
    expect(disabled(create())).toBe(true);
    await type('LIFE');
    expect(screen.getByText('A journal named "LIFE" already exists.')).toBeTruthy();
    await fireEvent(input(), 'submitEditing');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('Create submits the normalized name, then closes', async () => {
    const { onSubmit, onClose } = await setup();
    await type('  Night   walks ');
    await fireEvent.press(create());
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith('Night walks');
    await act(async () => {});
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('the keyboard return key submits too', async () => {
    const { onSubmit } = await setup();
    await type('Work');
    await fireEvent(input(), 'submitEditing');
    expect(onSubmit).toHaveBeenCalledWith('Work');
  });

  it('while saving everything is locked and a second submit is ignored', async () => {
    let resolve!: () => void;
    const onSubmit = jest.fn(() => new Promise<void>((r) => (resolve = r)));
    const { onClose } = await setup({}, onSubmit);
    await type('Work');
    await fireEvent.press(create());
    expect(disabled(create())).toBe(true);
    expect(disabled(screen.getByRole('button', { name: 'Cancel' }))).toBe(true);
    expect(input().props.editable).toBe(false);
    await fireEvent(input(), 'submitEditing');
    await fireEvent.press(screen.getByLabelText('Close'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    let handled: boolean | null | undefined;
    await act(async () => {
      handled = backHandler?.();
    });
    expect(handled).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => resolve());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a write failure keeps the sheet open and the name, shows an error and allows a retry', async () => {
    const onSubmit = jest.fn().mockRejectedValueOnce(new Error('disk full'));
    const { onClose } = await setup({}, onSubmit);
    await type('Work');
    await fireEvent.press(create());
    await act(async () => {});
    expect(screen.getByText("Couldn't save the journal. Please try again.")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(input().props.value).toBe('Work');
    expect(input().props.editable).toBe(true);
    expect(disabled(create())).toBe(false);
    onSubmit.mockResolvedValueOnce(undefined);
    await fireEvent.press(create());
    await act(async () => {});
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('typing clears a save error; a storage "duplicate" rejection shows the duplicate message', async () => {
    const onSubmit = jest.fn().mockRejectedValue(new JournalError('invalid-name', 'duplicate'));
    await setup({}, onSubmit);
    await type('Work');
    await fireEvent.press(create());
    await act(async () => {});
    expect(screen.getByText('A journal named "Work" already exists.')).toBeTruthy();
    await type('Works');
    expect(screen.queryByText('A journal named "Work" already exists.')).toBeNull();
  });

  it('Cancel, the backdrop and Android back close without submitting', async () => {
    const { onSubmit, onClose } = await setup();
    await type('Work');
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    await fireEvent.press(screen.getByLabelText('Close'));
    let handled: boolean | null | undefined;
    await act(async () => {
      handled = backHandler?.();
    });
    expect(handled).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('removes the back listener when hidden', async () => {
    const { rerender } = await setup();
    await rerender({ visible: false });
    expect(removeListener).toHaveBeenCalled();
  });

  it('forgets the typed name when hidden and shown again', async () => {
    const { rerender } = await setup();
    await type('Work');
    await rerender({ visible: false });
    await rerender({ visible: true });
    expect(input().props.value).toBe('');
  });

  it('can be reused: initialName, title, submitLabel and excludeId', async () => {
    const { onSubmit } = await setup({
      initialName: 'Gratitude',
      title: 'Rename journal',
      submitLabel: 'Save',
      excludeId: 'j_a',
    });
    expect(screen.getByRole('header', { name: 'Rename journal' })).toBeTruthy();
    expect(input().props.value).toBe('Gratitude');
    // Its own name is not a duplicate of itself.
    expect(screen.queryByText(/already exists/)).toBeNull();
    const save = screen.getByRole('button', { name: 'Save' });
    expect(disabled(save)).toBe(false);
    await type('life');
    expect(screen.getByText('A journal named "life" already exists.')).toBeTruthy();
    await type('Thanks');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith('Thanks');
    expect(screen.queryByRole('button', { name: 'Create' })).toBeNull();
  });

  it('without excludeId the initial name counts as taken', async () => {
    await setup({ initialName: 'Gratitude' });
    expect(screen.getByText('A journal named "Gratitude" already exists.')).toBeTruthy();
  });

  describe('with the keyboard up', () => {
    const originalOS = Platform.OS;
    const setOS = (os: string) =>
      Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
    const sheetStyle = () =>
      StyleSheet.flatten(screen.getByRole('header', { name: 'New journal' }).parent!.props.style);
    const avoiderStyle = () =>
      StyleSheet.flatten(
        screen.getByRole('header', { name: 'New journal' }).parent!.parent!.props.style,
      );
    let emit: ReturnType<typeof fakeKeyboard>['emit'];
    beforeEach(() => {
      ({ emit } = fakeKeyboard());
    });
    afterEach(() => {
      Object.defineProperty(Platform, 'OS', { configurable: true, get: () => originalOS });
      jest.restoreAllMocks();
    });

    it('Android: the sheet lifts by the keyboard height and drops back when it closes', async () => {
      setOS('android');
      await setup();
      expect(avoiderStyle().paddingBottom).toBeUndefined();
      expect(sheetStyle()).toMatchObject({ paddingBottom: 34 + 24 });
      await emit('keyboardDidShow', 300);
      expect(avoiderStyle()).toMatchObject({ paddingBottom: 334 });
      expect(sheetStyle()).toMatchObject({ paddingBottom: 24 });
      await emit('keyboardDidHide');
      expect(avoiderStyle().paddingBottom).toBeUndefined();
      expect(sheetStyle()).toMatchObject({ paddingBottom: 34 + 24 });
    });

    it('Android: the rename use lifts the same way', async () => {
      setOS('android');
      await setup({ initialName: 'Gratitude', title: 'Rename journal', submitLabel: 'Save' });
      await emit('keyboardDidShow', 300);
      const header = screen.getByRole('header', { name: 'Rename journal' });
      expect(StyleSheet.flatten(header.parent!.parent!.props.style)).toMatchObject({
        paddingBottom: 334,
      });
    });

    it('iOS: unchanged by the keyboard', async () => {
      setOS('ios');
      await setup();
      await emit('keyboardWillShow', 336);
      // KeyboardAvoidingView (iOS) owns the lift; our own style adds nothing (0 or unset).
      expect(avoiderStyle().paddingBottom ?? 0).toBe(0);
      expect(sheetStyle()).toMatchObject({ paddingBottom: 34 + 24 });
    });
  });
});

describe('NewJournalSheet swipe down to dismiss', () => {
  type Config = Parameters<typeof PanResponder.create>[0];
  let config: Config;
  beforeEach(() => {
    jest.useFakeTimers();
    const create = PanResponder.create.bind(PanResponder);
    jest.spyOn(PanResponder, 'create').mockImplementation((c) => {
      config = c;
      return create(c);
    });
  });
  afterEach(() => {
    (PanResponder.create as jest.Mock).mockRestore();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  const g = (dy: number, vy = 0) => ({ dx: 0, dy, vy }) as never;
  const swipe = async (dy: number, vy = 0) => {
    await act(async () => {
      config.onPanResponderGrant?.({} as never, g(0));
      config.onPanResponderMove?.({} as never, g(dy));
      config.onPanResponderRelease?.({} as never, g(dy, vy));
    });
    await act(() => jest.advanceTimersByTime(600));
  };

  it('a long swipe closes the sheet like Cancel and dismisses the keyboard', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    const { onClose, onSubmit } = await setup();
    await swipe(120);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('a short slow drag does nothing', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    const { onClose } = await setup();
    await swipe(30);
    expect(onClose).not.toHaveBeenCalled();
    expect(dismiss).not.toHaveBeenCalled();
  });

  it('works for the rename wording too', async () => {
    const { onClose } = await setup({
      title: 'Rename journal',
      submitLabel: 'Save',
      initialName: 'Gratitude',
      excludeId: 'j_a',
    });
    await swipe(120);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('is wired to the grabber and title only, not the text input or buttons', async () => {
    await setup();
    expect(screen.getByTestId('sheet-grabber')).toHaveProp('onResponderRelease');
    expect(screen.getByRole('header', { name: 'New journal' })).toHaveProp('onResponderRelease');
    expect(input().props.onResponderRelease).toBeUndefined();
    expect(screen.getByRole('button', { name: 'Cancel' }).props.onResponderRelease).not.toBe(
      screen.getByTestId('sheet-grabber').props.onResponderRelease,
    );
  });

  it('is inert while saving', async () => {
    let finish: () => void = () => {};
    const onSubmit = jest.fn(() => new Promise<void>((r) => (finish = r)));
    const { onClose } = await setup({}, onSubmit);
    await type('Dreams 2');
    await fireEvent.press(create());
    expect(config.onMoveShouldSetPanResponder?.({} as never, g(200))).toBe(false);
    await swipe(120);
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => finish());
  });
});
