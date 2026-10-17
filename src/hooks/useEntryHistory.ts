import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * One undoable step: a run of typing in the body, or one voice note card being closed. An audio
 * step names its recording (`id`); `action` is what the user did ('remove' = closed the card), so
 * undo restores it and redo closes it again.
 */
export type HistoryItem =
  { kind: 'body'; from: string; to: string } | { kind: 'audio'; id: string; action: 'remove' };

export type HistoryStacks = { undo: HistoryItem[]; redo: HistoryItem[] };

export const HISTORY_CAP = 100;
export const TYPING_DEBOUNCE_MS = 500;

export const emptyHistory: HistoryStacks = { undo: [], redo: [] };

/** A new action: goes on the undo stack (oldest dropped past the cap) and clears redo. */
export function pushHistory(stacks: HistoryStacks, item: HistoryItem): HistoryStacks {
  return { undo: [...stacks.undo, item].slice(-HISTORY_CAP), redo: [] };
}

/** Moves the latest undo step onto redo. Returns the step to reverse, or undefined if none. */
export function popUndo(stacks: HistoryStacks): { stacks: HistoryStacks; item?: HistoryItem } {
  const item = stacks.undo.at(-1);
  if (!item) return { stacks };
  return { item, stacks: { undo: stacks.undo.slice(0, -1), redo: [...stacks.redo, item] } };
}

/** Moves the latest redo step back onto undo. Returns the step to apply again. */
export function popRedo(stacks: HistoryStacks): { stacks: HistoryStacks; item?: HistoryItem } {
  const item = stacks.redo.at(-1);
  if (!item) return { stacks };
  return { item, stacks: { undo: [...stacks.undo, item], redo: stacks.redo.slice(0, -1) } };
}

type Options = {
  body: string;
  setBody: (value: string) => void;
  /** Marks the recording with this id as removed (reversible; nothing is deleted). */
  removeRecording?: (id: string) => void;
  /** Brings a removed recording back. */
  restoreRecording?: (id: string) => void;
  /**
   * The body before something was added to it on open (the entry's tags written in as `#tag`s):
   * seeds one undo step from it to `body`. Read once, when the page opens.
   */
  seedFrom?: string;
};

type State = HistoryStacks & {
  /** The body as of the last recorded step (typing since then is not yet a step). */
  committed: string;
};

/**
 * Undo / redo for one entry session: body text edits and closing a voice note card (each step names
 * its recording), on one stack so undo reverses the most recent action first. Not the title, tags or journal. Typing is
 * grouped into a step after a short pause, on blur, and before any other action. The stack is
 * capped and redo is cleared by any new action. Lives as long as the page; call `reset` on save.
 */
export function useEntryHistory({
  body,
  setBody,
  removeRecording,
  restoreRecording,
  seedFrom,
}: Options) {
  const [state, setState] = useState<State>(() => ({
    ...(seedFrom !== undefined && seedFrom !== body
      ? pushHistory(emptyHistory, { kind: 'body', from: seedFrom, to: body })
      : emptyHistory),
    committed: body,
  }));
  // The ref mirrors the state so handlers always see the latest value, not a stale render's.
  const ref = useRef(state);
  const latestBody = useRef(body);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbacks = useRef({ setBody, removeRecording, restoreRecording });
  useEffect(() => {
    callbacks.current = { setBody, removeRecording, restoreRecording };
  });

  const commit = useCallback((next: State) => {
    ref.current = next;
    setState(next);
  }, []);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  /** Turns typing since the last step into a step. */
  const flush = useCallback(() => {
    clearTimer();
    const cur = ref.current;
    if (latestBody.current === cur.committed) return;
    commit({
      ...pushHistory(cur, { kind: 'body', from: cur.committed, to: latestBody.current }),
      committed: latestBody.current,
    });
  }, [commit]);

  useEffect(() => clearTimer, []);

  const onBodyChange = useCallback(
    (text: string) => {
      latestBody.current = text;
      callbacks.current.setBody(text);
      // Typing is a new action: redo is gone at once.
      if (ref.current.redo.length > 0) commit({ ...ref.current, redo: [] });
      clearTimer();
      timer.current = setTimeout(flush, TYPING_DEBOUNCE_MS);
    },
    [commit, flush],
  );

  /** A card's close button: records the step (naming the recording), then marks it removed. */
  const onRemoveRecording = useCallback(
    (id: string) => {
      flush();
      commit({
        ...pushHistory(ref.current, { kind: 'audio', id, action: 'remove' }),
        committed: ref.current.committed,
      });
      callbacks.current.removeRecording?.(id);
    },
    [commit, flush],
  );

  /**
   * A new recording was appended. Earlier close steps still apply (each names its own recording);
   * typing is ended as a step first, as before any other action.
   */
  const onRecordingAttached = useCallback(() => {
    flush();
  }, [flush]);

  const undo = useCallback(() => {
    flush();
    const { stacks, item } = popUndo(ref.current);
    if (!item) return;
    if (item.kind === 'body') {
      latestBody.current = item.from;
      callbacks.current.setBody(item.from);
      commit({ ...stacks, committed: item.from });
    } else {
      callbacks.current.restoreRecording?.(item.id);
      commit({ ...stacks, committed: ref.current.committed });
    }
  }, [commit, flush]);

  const redo = useCallback(() => {
    flush();
    const { stacks, item } = popRedo(ref.current);
    if (!item) return;
    if (item.kind === 'body') {
      latestBody.current = item.to;
      callbacks.current.setBody(item.to);
      commit({ ...stacks, committed: item.to });
    } else {
      callbacks.current.removeRecording?.(item.id);
      commit({ ...stacks, committed: ref.current.committed });
    }
  }, [commit, flush]);

  /** Clears everything (the entry was saved or a new session began). */
  const reset = useCallback(() => {
    clearTimer();
    latestBody.current = body;
    commit({ ...emptyHistory, committed: body });
  }, [commit, body]);

  return {
    // Typing not yet turned into a step already counts: undo flushes it first.
    canUndo: state.undo.length > 0 || body !== state.committed,
    canRedo: state.redo.length > 0,
    undo,
    redo,
    onBodyChange,
    /** Call when the body loses focus: ends the current typing step. */
    onBodyBlur: flush,
    onRemoveRecording,
    onRecordingAttached,
    reset,
  };
}
