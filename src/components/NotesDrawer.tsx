import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  findNodeHandle,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, spacing } from '../theme';
import type { TagSortOrder } from '../services/settingsStorage';
import { sortTags, viewTitle } from '../utils/noteViewLabels';
import { NoteView, TagCount } from '../utils/noteViews';
import { GearIcon, SortIcon, ViewIcon } from './DrawerIcons';
import { TagSortMenu } from './TagSortMenu';

/**
 * The Notes drawer: a left-side panel that sits behind the page. `NotesRoute` slides the page to
 * the right to uncover it (not a Modal, so Alerts still show above it). The panel stays mounted for
 * the life of the route; closed, it is invisible, ignores touches and is hidden from screen readers.
 * The parent owns whether it is open and the dimmed close layer over the page.
 *
 * Props:
 * - `open`: whether the drawer is open. Opening moves screen-reader focus to the view dropdown. It is
 *   not marked as an iOS modal view: that would also hide the page's "Close menu" layer, which sits
 *   beside it; the parent hides the rest of the page from screen readers instead.
 * - `progress`: the shared 0..1 value (`useDrawerProgress`). The content fades in over the first
 *   60 percent and slides in from 30 percent of the width to the left (a light parallax).
 * - `width`: the drawer width, the same distance the page moves (`drawerWidthFor`).
 * - `onClose()`: Android Back (handled here while open, ahead of the app).
 * - `view`: the current view. The dropdown shows it when it is a smart view; a tag is highlighted.
 * - `onSelectView(view)`: a smart view or a tag was chosen. The parent closes the drawer.
 * - `tags`: every tag with its live-note count (as `tagCounts` returns). The drawer only orders them
 *   (`tagSort`); it never recounts.
 * - `tagSort` (default `alpha`), `onChangeTagSort(order)`: the tag order and the sort menu's choice.
 * - `trashedCount`: notes in Recently Deleted. The count shows when above zero.
 * - `onOpenTrash()`: Recently Deleted was chosen, from the last dropdown row (after a separator; it is a
 *   place, not a view, so it is never selected and never changes the dropdown label). It is the only entry.
 * - `onOpenSettings()`: the gear (footer, bottom left) was tapped. The sort button is at the bottom right.
 * - `unreadable`: the notes could not be read; the tag list is replaced by a message.
 */
type Props = {
  open: boolean;
  progress: Animated.Value;
  width: number;
  onClose: () => void;
  view: NoteView;
  onSelectView: (view: NoteView) => void;
  tags: readonly TagCount[];
  trashedCount: number;
  onOpenTrash: () => void;
  onOpenSettings: () => void;
  tagSort?: TagSortOrder;
  onChangeTagSort?: (order: TagSortOrder) => void;
  unreadable?: boolean;
};

type SmartView = Exclude<NoteView, { kind: 'tag' } | { kind: 'trash' }>;
const SMART_VIEWS: readonly SmartView[] = [
  { kind: 'today' },
  { kind: 'all' },
  { kind: 'todo' },
  { kind: 'untagged' },
  { kind: 'pinned' },
];

const ICON_BUTTON = 44;
const noop = () => {};

/** Moves screen-reader focus to a node; best effort, never throws. */
export function focusNode(node: unknown) {
  try {
    const handle = node ? findNodeHandle(node as never) : null;
    if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
  } catch {
    // The node may be gone; focus is a nicety.
  }
}

export function NotesDrawer({
  open,
  progress,
  width,
  onClose,
  view,
  onSelectView,
  tags,
  trashedCount,
  onOpenTrash,
  onOpenSettings,
  tagSort = 'alpha',
  onChangeTagSort = noop,
  unreadable = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // The dropdown starts collapsed each time the drawer opens.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setExpanded(false);
    // The sort menu closes with the drawer.
    if (!open) setMenuOpen(false);
  }

  const dropdownRef = useRef<View>(null);
  useEffect(() => {
    if (open) focusNode(dropdownRef.current);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [open, onClose]);

  const sortedTags = useMemo(() => sortTags(tags, tagSort), [tags, tagSort]);
  const sortDisabled = unreadable || tags.length < 2;

  const opacity = progress.interpolate({
    inputRange: [0, 0.6],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-0.3 * width, 0],
    extrapolate: 'clamp',
  });
  const smartCurrent = SMART_VIEWS.find((v) => v.kind === view.kind);
  // A tag or Recently Deleted is not one of the dropdown's options; the label falls back to All Notes
  // there (the neutral broadest name), not to the default view, which is Today.
  const trashLabel = trashedCount > 0 ? `Recently Deleted, ${trashedCount}` : 'Recently Deleted';
  const dropdownLabel = viewTitle(smartCurrent ?? { kind: 'all' });
  return (
    <View
      testID="notes-drawer"
      pointerEvents={open ? 'auto' : 'none'}
      accessibilityElementsHidden={!open}
      importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
      // The VoiceOver escape gesture (two-finger Z) closes it; iOS only.
      onAccessibilityEscape={onClose}
      style={[styles.drawer, { width }]}
    >
      <Animated.View
        testID="notes-drawer-panel"
        style={[styles.panel, { width, opacity, transform: [{ translateX }] }]}
      >
        <SafeAreaView style={styles.safe} edges={['top', 'left']}>
          <Pressable
            ref={dropdownRef}
            accessibilityRole="button"
            accessibilityLabel={`View, ${dropdownLabel}`}
            accessibilityState={{ expanded }}
            onPress={() => setExpanded((e) => !e)}
            style={styles.dropdown}
          >
            <View style={styles.dropdownLabel}>
              <ViewIcon kind={smartCurrent?.kind ?? 'all'} color={colors.text} size={26} />
              <Text style={styles.dropdownText}>{dropdownLabel}</Text>
            </View>
            <Text style={styles.chevron} importantForAccessibility="no-hide-descendants">
              {expanded ? '⌃' : '⌄'}
            </Text>
          </Pressable>
          {expanded && (
            <View testID="notes-drawer-options" style={styles.options}>
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
                    <View style={styles.rowLabel}>
                      <ViewIcon kind={v.kind} color={colors.text} size={22} />
                      <Text style={styles.rowText}>{viewTitle(v)}</Text>
                    </View>
                  </Pressable>
                );
              })}
              <View style={styles.separator} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={trashLabel}
                onPress={onOpenTrash}
                style={styles.row}
              >
                <View style={styles.rowLabel}>
                  <ViewIcon kind="trash" color={colors.text} size={22} />
                  <Text style={styles.rowText}>Recently Deleted</Text>
                </View>
                {trashedCount > 0 && <Text style={styles.count}>{trashedCount}</Text>}
              </Pressable>
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
              sortedTags.map(({ tag, count }) => {
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

          <View
            testID="notes-drawer-footer"
            style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}
          >
            <View style={styles.iconRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Settings"
                onPress={onOpenSettings}
                style={styles.iconButton}
              >
                <GearIcon color={colors.text} size={24} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sort tags"
                accessibilityState={{ expanded: menuOpen && !sortDisabled, disabled: sortDisabled }}
                disabled={sortDisabled}
                onPress={() => setMenuOpen((m) => !m)}
                style={[styles.iconButton, sortDisabled && styles.dimmed]}
              >
                <SortIcon color={colors.text} size={24} />
              </Pressable>
            </View>
          </View>
          <TagSortMenu
            open={menuOpen}
            onOpenChange={setMenuOpen}
            value={tagSort}
            onChange={onChangeTagSort}
            disabled={sortDisabled}
            bottom={insets.bottom + spacing.sm + ICON_BUTTON + spacing.xs}
            right={spacing.sm + spacing.md}
          />
        </SafeAreaView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  drawer: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  panel: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1 },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  dropdownLabel: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
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
  rowLabel: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
    marginHorizontal: spacing.md,
  },
  iconRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
  },
  iconButton: {
    width: ICON_BUTTON,
    height: ICON_BUTTON,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dimmed: { opacity: 0.4 },
  rowText: { color: colors.text, fontSize: 18 },
  count: { color: colors.muted, fontSize: 16 },
});
