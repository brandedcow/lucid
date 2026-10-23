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
  it('listActions follows body and selection', async () => {
    const { view, move } = await setup();
    expect(view.result.current.listActions.onList).toBe(false); // plain line 0
    await move(8);
    expect(view.result.current.listActions).toMatchObject({ onList: true, kind: 'checkbox' });
    await move(20);
    expect(view.result.current.listActions.onList).toBe(false); // heading
    await move(28);
    expect(view.result.current.listActions).toMatchObject({ onList: true, kind: 'bullet' });
    await act(() => view.result.current.indentItem());
    expect(view.result.current.listActions.canOutdent).toBe(true);
  });

  it('setListType sets the body and pending selection and reports a format edit', async () => {
    const { view, setBodySpy, onEdit, move } = await setup();
    await move(8);
    await act(() => view.result.current.setListType('bullet'));
    const next = 'plain\n- task\n# Head\n- bullet';
    expect(setBodySpy).toHaveBeenCalledWith(next);
    expect(view.result.current.inputProps.text).toBe(next);
    expect(view.result.current.inputProps.selection).toEqual(view.result.current.selection);
    expect(view.result.current.inputProps.selection).toBeDefined();
    expect(onEdit).toHaveBeenCalledWith(BODY, next, 'format');
  });

  it('drops the pending selection once the input reports its own', async () => {
    const { view, move } = await setup();
    await move(8);
    await act(() => view.result.current.setListType('bullet'));
    expect(view.result.current.inputProps.selection).toBeDefined();
    await move(3);
    expect(view.result.current.inputProps.selection).toBeUndefined();
  });

  it('a heading line is a no-op for setListType', async () => {
    const { view, setBodySpy, onEdit, move } = await setup();
    await move(20);
    await act(() => view.result.current.setListType('checkbox'));
    expect(setBodySpy).not.toHaveBeenCalled();
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('indentItem and outdentItem call the pure function and use its selection', async () => {
    const { view, setBodySpy, onEdit, move } = await setup();
    await move(20);
    await act(() => view.result.current.indentItem()); // heading line: null
    expect(setBodySpy).not.toHaveBeenCalled();
    await move(8);
    await act(() => view.result.current.indentItem());
    const indented = 'plain\n  - [ ] task\n# Head\n- bullet';
    expect(setBodySpy).toHaveBeenCalledWith(indented);
    expect(onEdit).toHaveBeenLastCalledWith(BODY, indented, 'format');
    expect(view.result.current.selection).toEqual(at(10));
    expect(view.result.current.inputProps.selection).toEqual(at(10));
    await act(() => view.result.current.outdentItem());
    expect(setBodySpy).toHaveBeenLastCalledWith(BODY);
  });

  it('moveItem moves the item and null results leave body and selection alone', async () => {
    const { view, setBodySpy, onEdit, move } = await setup('- a\n- b');
    await move(1);
    await act(() => view.result.current.moveItem('up')); // already first: null
    expect(setBodySpy).not.toHaveBeenCalled();
    expect(onEdit).not.toHaveBeenCalled();
    expect(view.result.current.selection).toEqual(at(1));
    expect(view.result.current.inputProps.selection).toBeUndefined();
    await act(() => view.result.current.moveItem('down'));
    expect(setBodySpy).toHaveBeenCalledWith('- b\n- a');
    expect(onEdit).toHaveBeenCalledWith('- a\n- b', '- b\n- a', 'format');
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

  it('select sets the selection and the pending selection handed to the input', async () => {
    const { view } = await setup();
    await act(() => view.result.current.select({ start: 3, end: 3 }));
    expect(view.result.current.selection).toEqual(at(3));
    expect(view.result.current.inputProps.selection).toEqual(at(3));
    await act(() => view.result.current.inputProps.onSelectionChange?.(at(4)));
    expect(view.result.current.inputProps.selection).toBeUndefined();
  });

  it('only ever calls setBody and onEdit', async () => {
    const setBody = jest.fn();
    const onEdit = jest.fn();
    const view = await renderHook(() => useNoteEditor({ body: '- [ ] a', setBody, onEdit }));
    await act(() => view.result.current.setListType('bullet'));
    await act(() => view.result.current.indentItem());
    await act(() => view.result.current.outdentItem());
    await act(() => view.result.current.moveItem('down'));
    await act(() => view.result.current.inputProps.onChangeText('x', 'typing'));
    expect(setBody.mock.calls.every((c) => c.length === 1 && typeof c[0] === 'string')).toBe(true);
    expect(setBody).toHaveBeenCalled();
  });

  it('toggleCheckboxAt toggles the line at the offset without touching the selection', async () => {
    const { view, onEdit, setBodySpy, move } = await setup();
    await move(2);
    const before = view.result.current.selection;
    await act(() => view.result.current.toggleCheckboxAt(10)); // inside '- [ ] task'
    expect(setBodySpy).toHaveBeenCalledWith('plain\n- [x] task\n# Head\n- bullet');
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith(BODY, 'plain\n- [x] task\n# Head\n- bullet', 'format');
    expect(view.result.current.selection).toEqual(before);
    expect(view.result.current.inputProps.selection).toBeUndefined();
  });

  it('toggleCheckboxAt does nothing on a line without a checkbox', async () => {
    const { view, onEdit, setBodySpy } = await setup();
    await act(() => view.result.current.toggleCheckboxAt(1)); // 'plain'
    await act(() => view.result.current.toggleCheckboxAt(BODY.length)); // '- bullet'
    expect(setBodySpy).not.toHaveBeenCalled();
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('markBlurred clears focused', async () => {
    const { view } = await setup();
    await act(() => view.result.current.inputProps.onFocus?.());
    expect(view.result.current.focused).toBe(true);
    await act(() => view.result.current.markBlurred());
    expect(view.result.current.focused).toBe(false);
  });
});
