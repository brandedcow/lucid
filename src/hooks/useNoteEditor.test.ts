import { act, renderHook } from '@testing-library/react-native';
import { useState } from 'react';
import { useNoteEditor } from './useNoteEditor';

const BODY = 'plain\n- [ ] task\n# Head\n- bullet';
const at = (n: number) => ({ start: n, end: n });

async function setup(initial = BODY) {
  const onEdit = jest.fn();
  const setBodySpy = jest.fn();
  const view = await renderHook(() => {
    const [body, setBody] = useState(initial);
    return useNoteEditor({
      body,
      setBody: (t) => {
        setBodySpy(t);
        setBody(t);
      },
      onEdit,
    });
  });
  const move = (n: number) => act(() => view.result.current.inputProps.onSelectionChange?.(at(n)));
  return { view, onEdit, setBodySpy, move };
}

describe('useNoteEditor', () => {
  it('checkboxAction follows the caret line', async () => {
    const { view, move } = await setup();
    expect(view.result.current.checkboxAction).toBe('add'); // plain line 0
    await move(8);
    expect(view.result.current.checkboxAction).toBe('check');
    await move(20);
    expect(view.result.current.checkboxAction).toBe('none'); // heading
    await move(28);
    expect(view.result.current.checkboxAction).toBe('add'); // bullet
  });

  it('toggleCheckbox sets the body and pending selection and reports a format edit', async () => {
    const { view, setBodySpy, onEdit, move } = await setup();
    await move(8);
    await act(() => view.result.current.toggleCheckbox());
    expect(setBodySpy).toHaveBeenCalledWith('plain\n- [x] task\n# Head\n- bullet');
    expect(view.result.current.inputProps.text).toBe('plain\n- [x] task\n# Head\n- bullet');
    expect(view.result.current.inputProps.selection).toEqual(
      at(view.result.current.selection.start),
    );
    expect(view.result.current.inputProps.selection).toBeDefined();
    expect(onEdit).toHaveBeenCalledWith(BODY, 'plain\n- [x] task\n# Head\n- bullet', 'format');
    expect(view.result.current.checkboxAction).toBe('uncheck');
  });

  it('drops the pending selection once the input reports its own', async () => {
    const { view, move } = await setup();
    await move(8);
    await act(() => view.result.current.toggleCheckbox());
    expect(view.result.current.inputProps.selection).toBeDefined();
    await move(3);
    expect(view.result.current.inputProps.selection).toBeUndefined();
  });

  it('a heading line is a no-op', async () => {
    const { view, setBodySpy, onEdit, move } = await setup();
    await move(20);
    await act(() => view.result.current.toggleCheckbox());
    expect(setBodySpy).not.toHaveBeenCalled();
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('indent on a non-list line does nothing; on a list line it indents', async () => {
    const { view, setBodySpy, move } = await setup();
    await move(2);
    await act(() => view.result.current.indent());
    expect(setBodySpy).not.toHaveBeenCalled();
    await move(8);
    await act(() => view.result.current.indent());
    expect(setBodySpy).toHaveBeenCalledWith('plain\n  - [ ] task\n# Head\n- bullet');
    await act(() => view.result.current.outdent());
    expect(setBodySpy).toHaveBeenLastCalledWith(BODY);
  });

  it('typing goes to setBody with its source and to onEdit', async () => {
    const { view, setBodySpy, onEdit } = await setup('a');
    await act(() => view.result.current.inputProps.onChangeText('ab', 'typing'));
    expect(setBodySpy).toHaveBeenCalledWith('ab');
    expect(onEdit).toHaveBeenCalledWith('a', 'ab', 'typing');
    await act(() => view.result.current.inputProps.onChangeText('ab\n- ', 'format'));
    expect(onEdit).toHaveBeenLastCalledWith('ab', 'ab\n- ', 'format');
  });

  it('tracks focus and bumps the focus signal', async () => {
    const { view } = await setup();
    expect(view.result.current.focused).toBe(false);
    await act(() => view.result.current.inputProps.onFocus?.());
    expect(view.result.current.focused).toBe(true);
    await act(() => view.result.current.inputProps.onBlur?.());
    expect(view.result.current.focused).toBe(false);
    const before = view.result.current.inputProps.focusSignal;
    await act(() => view.result.current.focus());
    expect(view.result.current.inputProps.focusSignal).toBe((before ?? 0) + 1);
  });

  it('only ever calls setBody and onEdit', async () => {
    const setBody = jest.fn();
    const onEdit = jest.fn();
    const view = await renderHook(() => useNoteEditor({ body: '- [ ] a', setBody, onEdit }));
    await act(() => view.result.current.toggleCheckbox());
    await act(() => view.result.current.indent());
    await act(() => view.result.current.outdent());
    await act(() => view.result.current.inputProps.onChangeText('x', 'typing'));
    expect(setBody.mock.calls.every((c) => c.length === 1 && typeof c[0] === 'string')).toBe(true);
    expect(setBody).toHaveBeenCalled();
  });
});
