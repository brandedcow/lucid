import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, fonts, spacing } from '../theme';
import { JournalId } from '../types/entry';
import { Journal, journalCopy } from '../utils/journals';
import { PlusIcon } from './TodayIcons';

/** Diameter of the + button; screens use it to pad their lists clear of it. */
export const FAB_SIZE = 56;

/**
 * A floating "+" button (bottom right) that opens a bottom sheet of journals; picking one calls onPick.
 *
 * Render it as the LAST child of a full-screen container: it covers that container (so the backdrop
 * catches taps anywhere) but its layer is box-none, so taps beside the button reach the screen. The
 * sheet is an in-screen overlay, not a Modal, so an Alert opened right after picking still shows on iOS.
 *
 * - bottomInset: the safe-area bottom inset, supplied by the screen.
 * - disabled: the button is disabled and the sheet closes for good, at once (it does not reopen when
 *   re-enabled).
 * - footer: extra content after the journal rows, inside the sheet.
 *
 * The sheet slides up and the backdrop fades in (~220 ms); closing reverses it and unmounts at the end.
 * With Reduce Motion on, it appears and disappears without animation.
 */
type Props = {
  journals: readonly Journal[];
  onPick: (journalId: JournalId) => void;
  disabled?: boolean;
  bottomInset?: number;
  footer?: ReactNode;
};

const ANIMATION_MS = 220;
/** Slide distance used until the sheet has been measured. */
const FALLBACK_SHEET_HEIGHT = 400;

export function AddEntryMenu({
  journals,
  onPick,
  disabled = false,
  bottomInset = 0,
  footer,
}: Props) {
  // `open` is the user's intent; `mounted` keeps the sheet on screen while it animates out.
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [sheetHeight, setSheetHeight] = useState(0);
  const [progress] = useState(() => new Animated.Value(0));
  const reduceMotion = useRef(false);
  const isOpen = open && !disabled;
  const visible = mounted && !disabled;

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (alive) reduceMotion.current = on;
    });
    return () => {
      alive = false;
    };
  }, []);

  const animateTo = useCallback(
    (to: 0 | 1, onDone?: () => void) => {
      if (reduceMotion.current) {
        progress.stopAnimation();
        progress.setValue(to);
        onDone?.();
        return;
      }
      Animated.timing(progress, {
        toValue: to,
        duration: ANIMATION_MS,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) onDone?.();
      });
    },
    [progress],
  );

  const close = useCallback(() => {
    setOpen(false);
    animateTo(0, () => setMounted(false));
  }, [animateTo]);

  // Disabled closes at once, with no exit animation.
  if (disabled && (open || mounted)) {
    setOpen(false);
    setMounted(false);
  }
  useEffect(() => {
    if (!disabled) return;
    progress.stopAnimation();
    progress.setValue(0);
  }, [disabled, progress]);

  useEffect(() => {
    if (!isOpen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [isOpen, close]);

  const openMenu = () => {
    setOpen(true);
    setMounted(true);
    animateTo(1);
  };

  const pick = (journalId: JournalId) => {
    if (!isOpen) return;
    close();
    onPick(journalId);
  };

  const fabBottom = bottomInset + spacing.md;
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [sheetHeight || FALLBACK_SHEET_HEIGHT, 0],
  });

  return (
    <View pointerEvents="box-none" style={styles.layer}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add entry"
        accessibilityState={{ expanded: isOpen, disabled }}
        disabled={disabled}
        onPress={() => (isOpen ? close() : openMenu())}
        style={[styles.fab, { bottom: fabBottom }]}
      >
        <PlusIcon color={colors.accentDark} />
      </Pressable>
      {visible && (
        <View accessibilityViewIsModal style={styles.layer}>
          <Animated.View style={[styles.layer, { opacity: progress }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close menu"
              onPress={close}
              style={[styles.layer, styles.backdrop]}
            />
          </Animated.View>
          <Animated.View
            onLayout={(e) => setSheetHeight(e.nativeEvent.layout.height)}
            style={[
              styles.sheet,
              { paddingBottom: bottomInset + spacing.lg },
              { transform: [{ translateY }] },
            ]}
          >
            <View style={styles.grabber} importantForAccessibility="no" />
            <Text style={styles.title} accessibilityRole="header">
              Add entry
            </Text>
            <View style={styles.list}>
              {journals.map((journal) => {
                const hint = journalCopy(journal.kind).newButton;
                return (
                  <Pressable
                    key={journal.id}
                    accessibilityRole="menuitem"
                    accessibilityLabel={`${journal.name}, ${hint}`}
                    onPress={() => pick(journal.id)}
                    style={styles.card}
                  >
                    <View style={styles.cardMain}>
                      <Text style={styles.cardTitle}>{journal.name}</Text>
                      <Text style={styles.cardHint}>{hint}</Text>
                    </View>
                    <Text style={styles.chevron} importantForAccessibility="no-hide-descendants">
                      ›
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {footer && <View style={styles.footer}>{footer}</View>}
          </Animated.View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '70%',
    paddingTop: spacing.sm,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.faint,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.serif,
    fontSize: 22,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm + 2 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 88,
    padding: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  cardMain: { flex: 1, gap: spacing.xs },
  cardTitle: { color: colors.text, fontFamily: fonts.serif, fontSize: 26 },
  cardHint: { color: colors.muted, fontSize: 14 },
  chevron: { color: colors.muted, fontSize: 24 },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm + 2 },
});
