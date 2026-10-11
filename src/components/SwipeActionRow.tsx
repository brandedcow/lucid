import { memo, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityActionEvent,
  AccessibilityActionInfo,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { colors } from '../theme';

/**
 * Keeps at most one swipe row open. Pass `onRowWillOpen` / `onRowClosed` to every
 * swipe row in a list; call `closeOpenRow()` when anything else happens (scroll, opening an entry).
 */
export function useSingleOpenRow() {
  const openRow = useRef<Swipeable | null>(null);
  const onRowWillOpen = useCallback((row: Swipeable) => {
    if (openRow.current && openRow.current !== row) openRow.current.close();
    openRow.current = row;
  }, []);
  const onRowClosed = useCallback((row: Swipeable) => {
    if (openRow.current === row) openRow.current = null;
  }, []);
  const closeOpenRow = useCallback(() => {
    openRow.current?.close();
  }, []);
  return { onRowWillOpen, onRowClosed, closeOpenRow };
}

/** One button revealed by swiping the row left. */
export type SwipeAction = {
  /** Unique within the row; also the screen-reader action name. */
  key: string;
  /** Visible text. */
  label: string;
  accessibilityLabel: string;
  /** Called with a function that closes the row. */
  onPress: (closeRow: () => void) => void;
  /** Red styling (Delete). Otherwise the accent colour. */
  destructive?: boolean;
};

/** What the row hands its content so the content can expose the actions to screen readers. */
export type SwipeRowRenderArgs = {
  closeRow: () => void;
  /** Undefined while `disabled`. Spread onto the content's accessible element. */
  accessibilityActions?: AccessibilityActionInfo[];
  onAccessibilityAction?: (e: AccessibilityActionEvent) => void;
};

const ACTION_WIDTH = 96;

/**
 * Generic swipe-to-reveal row: swiping left reveals one or more action buttons. `children` is the row
 * content, or a function of `SwipeRowRenderArgs`. `onRowWillOpen` / `onRowClosed` come from
 * `useSingleOpenRow`; `disabled` blocks swiping and hides the screen-reader actions; `containerStyle`
 * styles the swipe container; `flat` squares the action corners (for flat full-width rows).
 */
export const SwipeActionRow = memo(function SwipeActionRow({
  children,
  actions,
  onRowWillOpen,
  onRowClosed,
  disabled = false,
  containerStyle,
  flat = false,
  testID,
}: {
  children: ReactNode | ((args: SwipeRowRenderArgs) => ReactNode);
  actions: readonly SwipeAction[];
  onRowWillOpen: (row: Swipeable) => void;
  onRowClosed: (row: Swipeable) => void;
  disabled?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  flat?: boolean;
  testID?: string;
}) {
  const swipeRef = useRef<Swipeable>(null);
  // While closed, the actions sit behind the content and must stay out of the screen reader.
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const row = swipeRef.current;
    return () => {
      if (row) onRowClosed(row);
    };
  }, [onRowClosed]);

  const [closeRow] = useState(() => () => swipeRef.current?.close());
  const run = (action: SwipeAction) => action.onPress(closeRow);

  const content =
    typeof children === 'function'
      ? children({
          closeRow,
          accessibilityActions: disabled
            ? undefined
            : actions.map((a) => ({ name: a.key, label: a.label })),
          onAccessibilityAction: disabled
            ? undefined
            : (e) => {
                const action = actions.find((a) => a.key === e.nativeEvent.actionName);
                if (action) run(action);
              },
        })
      : children;

  return (
    <Swipeable
      ref={swipeRef}
      enabled={!disabled}
      overshootRight={false}
      containerStyle={containerStyle}
      testID={testID}
      onSwipeableWillOpen={() => {
        setRevealed(true);
        if (swipeRef.current) onRowWillOpen(swipeRef.current);
      }}
      onSwipeableClose={() => {
        setRevealed(false);
        if (swipeRef.current) onRowClosed(swipeRef.current);
      }}
      renderRightActions={() => (
        <View
          style={[styles.actionWrap, { width: ACTION_WIDTH * actions.length }]}
          accessibilityElementsHidden={!revealed}
          importantForAccessibility={revealed ? 'auto' : 'no-hide-descendants'}
        >
          {actions.map((action) => (
            <Pressable
              key={action.key}
              accessibilityRole="button"
              accessibilityLabel={action.accessibilityLabel}
              onPress={() => run(action)}
              style={[
                styles.action,
                action.destructive ? styles.destructive : styles.neutral,
                flat && styles.flat,
              ]}
            >
              <Text style={styles.label}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    >
      {content}
    </Swipeable>
  );
});

const styles = StyleSheet.create({
  actionWrap: { flexDirection: 'row', alignItems: 'stretch' },
  action: {
    flex: 1,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  destructive: { backgroundColor: colors.draft },
  neutral: { backgroundColor: colors.accent },
  flat: { borderRadius: 0 },
  label: { color: colors.accentDark, fontSize: 16, fontWeight: '700' },
});
