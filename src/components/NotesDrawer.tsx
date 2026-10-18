import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, spacing } from '../theme';
import { viewTitle } from '../utils/noteViewLabels';
import { NoteView, TagCount } from '../utils/noteViews';

/**
 * The Notes drawer: a left-side panel over the notes list (not a Modal, so Alerts still show above
 * it). The parent owns whether it is open and hides the screen behind it from screen readers.
 *
 * Props:
 * - `open`: whether the drawer is open. It slides in over ~220 ms with a dimmed backdrop and out
 *   again before unmounting. With Reduce Motion on it appears and disappears without animation.
 * - `onClose()`: backdrop tap or Android Back (handled here while open, ahead of the app).
 * - `view`: the current view. The dropdown shows it when it is a smart view; a tag is highlighted.
 * - `onSelectView(view)`: a smart view or a tag was chosen. The parent closes the drawer.
 * - `tags`: every tag with its live-note count, alphabetical (as `tagCounts` returns).
 * - `trashedCount`: notes in Recently Deleted; the count shows when above zero.
 * - `onOpenTrash()`, `onOpenSettings()`: the rows were tapped.
 * - `unreadable`: the notes could not be read; the tag list is replaced by a message.
 */
type Props = {
  open: boolean;
  onClose: () => void;
  view: NoteView;
  onSelectView: (view: NoteView) => void;
  tags: readonly TagCount[];
  trashedCount: number;
  onOpenTrash: () => void;
  onOpenSettings: () => void;
  unreadable?: boolean;
};

type SmartView = Exclude<NoteView, { kind: 'tag' } | { kind: 'trash' }>;
const SMART_VIEWS: readonly SmartView[] = [
  { kind: 'all' },
  { kind: 'today' },
  { kind: 'todo' },
  { kind: 'untagged' },
  { kind: 'pinned' },
];

const ANIMATION_MS = 220;
const MAX_WIDTH = 360;
const WIDTH_FRACTION = 0.84;

export function NotesDrawer({
  open,
  onClose,
  view,
  onSelectView,
  tags,
  trashedCount,
  onOpenTrash,
  onOpenSettings,
  unreadable = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const width = Math.min(windowWidth * WIDTH_FRACTION, MAX_WIDTH);
  const [expanded, setExpanded] = useState(false);

  // `mounted` keeps the panel on screen while it slides out.
  const [mounted, setMounted] = useState(false);
  const [progress] = useState(() => new Animated.Value(0));
  const reduceMotion = useRef(false);
  const wasOpen = useRef(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (alive) reduceMotion.current = on;
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (on) => {
      reduceMotion.current = on;
    });
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);

  if (open && !mounted) setMounted(true);

  useEffect(() => {
    const animateTo = (to: 0 | 1, onDone?: () => void) => {
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
    };
    if (open) {
      wasOpen.current = true;
      animateTo(1);
    } else if (wasOpen.current) {
      animateTo(0, () => {
        setMounted(false);
        setExpanded(false);
      });
    }
  }, [open, progress]);

  const close = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [open, close]);

  if (!open && !mounted) return null;

  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-width, 0] });
  const smartCurrent = SMART_VIEWS.find((v) => v.kind === view.kind);
  // A tag or Recently Deleted is not one of the dropdown's options; show the default there.
  const dropdownLabel = viewTitle(smartCurrent ?? { kind: 'all' });
  return (
    <View testID="notes-drawer" accessibilityViewIsModal style={styles.layer}>
      <Animated.View style={[styles.layer, { opacity: progress }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close menu"
          onPress={close}
          style={[styles.layer, styles.backdrop]}
        />
      </Animated.View>
      <Animated.View
        testID="notes-drawer-panel"
        style={[styles.panel, { width, transform: [{ translateX }] }]}
      >
        <SafeAreaView style={styles.safe} edges={['top', 'left']}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`View, ${dropdownLabel}`}
            accessibilityState={{ expanded }}
            onPress={() => setExpanded((e) => !e)}
            style={styles.dropdown}
          >
            <Text style={styles.dropdownText}>{dropdownLabel}</Text>
            <Text style={styles.chevron} importantForAccessibility="no-hide-descendants">
              {expanded ? '⌃' : '⌄'}
            </Text>
          </Pressable>
          {expanded && (
            <View style={styles.options}>
              {SMART_VIEWS.map((v) => {
                const selected = smartCurrent?.kind === v.kind;
                return (
                  <Pressable
                    key={v.kind}
                    accessibilityRole="button"
                    accessibilityLabel={viewTitle(v)}
                    accessibilityState={{ selected }}
                    onPress={() => onSelectView(v)}
                    style={[styles.row, selected && styles.selectedRow]}
                  >
                    <Text style={styles.rowText}>{viewTitle(v)}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          <Text style={styles.heading} accessibilityRole="header">
            Tags
          </Text>
          <ScrollView
            testID="notes-drawer-tags"
            style={styles.tags}
            contentContainerStyle={styles.tagsContent}
          >
            {unreadable ? (
              <Text style={styles.message}>Your notes could not be read. Nothing was changed.</Text>
            ) : tags.length === 0 ? (
              <Text style={styles.message}>No tags yet. Write #word in a note to make one.</Text>
            ) : (
              tags.map(({ tag, count }) => {
                const selected = view.kind === 'tag' && view.tag === tag;
                return (
                  <Pressable
                    key={tag}
                    accessibilityRole="button"
                    accessibilityLabel={`#${tag}, ${count}`}
                    accessibilityState={{ selected }}
                    onPress={() => onSelectView({ kind: 'tag', tag })}
                    style={[styles.row, selected && styles.selectedRow]}
                  >
                    <Text style={styles.rowText}>{`#${tag}`}</Text>
                    <Text style={styles.count}>{count}</Text>
                  </Pressable>
                );
              })
            )}
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
            {trashedCount > 0 && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Recently Deleted, ${trashedCount}`}
                onPress={onOpenTrash}
                style={styles.row}
              >
                <Text style={styles.rowText}>Recently Deleted</Text>
                <Text style={styles.count}>{trashedCount}</Text>
              </Pressable>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Settings"
              onPress={onOpenSettings}
              style={styles.row}
            >
              <Text style={styles.rowText}>Settings</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.55)' },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRightWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  safe: { flex: 1 },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  dropdownText: { color: colors.text, fontFamily: fonts.serif, fontSize: 30 },
  chevron: { color: colors.muted, fontSize: 24 },
  options: { paddingHorizontal: spacing.sm },
  heading: {
    color: colors.muted,
    fontSize: 14,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
  },
  tags: { flex: 1 },
  tagsContent: { paddingHorizontal: spacing.sm, paddingBottom: spacing.md },
  message: { color: colors.muted, fontSize: 16, paddingHorizontal: spacing.md },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: 12,
  },
  selectedRow: { backgroundColor: colors.surface },
  rowText: { color: colors.text, fontSize: 18 },
  count: { color: colors.muted, fontSize: 16 },
});
