import { useEffect, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { colors, spacing } from '../theme';
import { VoiceAttachmentCard } from './VoiceAttachmentCard';

/** How much of the next card shows at the right edge when there are several notes. */
export const CAROUSEL_PEEK = 32;
/** Space between two cards. */
export const CAROUSEL_GAP = spacing.sm;

export type CarouselNote = {
  id: string;
  uri: string;
  durationMs: number;
  waveform?: number[];
};

type Props = {
  notes: readonly CarouselNote[];
  /** Play is off (a recording is in progress). */
  playDisabled?: boolean;
  /** A card's close button (by note id). Without it the cards cannot be removed. */
  onRemove?: (id: string) => void;
  /** A card was tapped (by note id). */
  onOpen?: (id: string) => void;
  /**
   * A note to bring into view (by id). The cards scroll to it whenever this changes (e.g. the
   * expanded view moved to that note); an id that is not in the list is ignored.
   */
  focusId?: string | null;
};

/** The page the scroll offset rests on (never outside 0..count-1). */
export function pageAt(offsetX: number, interval: number, count: number): number {
  if (!(interval > 0) || count <= 0) return 0;
  return Math.max(0, Math.min(count - 1, Math.round(offsetX / interval)));
}

/**
 * The entry's voice notes as a horizontal paging row: one card per note, the next card peeking at
 * the right edge, page dots below. One note is full width with no peek and no dots. It lives inside
 * the page's vertical ScrollView. Removing a card keeps the row on the nearest page; a note that
 * comes back (undo) or is added is scrolled to, and so is the note the owner focuses (`focusId`). Dots are decorative.
 */
export function VoiceNoteCarousel({
  notes,
  playDisabled = false,
  onRemove,
  onOpen,
  focusId = null,
}: Props) {
  const count = notes.length;
  const many = count > 1;
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  const scroller = useRef<ScrollView>(null);
  const known = useRef<string[]>(notes.map((n) => n.id));

  const cardWidth = many ? Math.max(0, width - CAROUSEL_PEEK) : width;
  const interval = cardWidth + CAROUSEL_GAP;
  const shownPage = Math.min(page, Math.max(0, count - 1));

  // Follow the list: a new or restored note is scrolled to; after a removal the row stays on the
  // nearest page.
  useEffect(() => {
    const before = known.current;
    const ids = notes.map((n) => n.id);
    known.current = ids;
    if (ids.length === before.length && ids.every((id, i) => id === before[i])) return;
    const added = ids.findIndex((id) => !before.includes(id));
    const target = added >= 0 ? added : Math.min(page, Math.max(0, ids.length - 1));
    setPage(target);
    scroller.current?.scrollTo({ x: target * interval, animated: added >= 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes]);

  // The owner moved focus to a note: show that page, and scroll the cards to it.
  const [seenFocus, setSeenFocus] = useState(focusId);
  if (focusId !== seenFocus) {
    setSeenFocus(focusId);
    const at = focusId === null ? -1 : notes.findIndex((n) => n.id === focusId);
    if (at >= 0) setPage(at);
  }
  useEffect(() => {
    const at = focusId === null ? -1 : notes.findIndex((n) => n.id === focusId);
    if (at >= 0) scroller.current?.scrollTo({ x: at * interval, animated: false });
    // Runs on a change of focus only; a list change is handled above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w !== width) setWidth(w);
  };
  const onSettle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPage(pageAt(e.nativeEvent.contentOffset.x, interval, count));
  };

  return (
    <View testID="voice-note-carousel" onLayout={onLayout}>
      <ScrollView
        ref={scroller}
        horizontal
        scrollEnabled={many}
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        snapToInterval={many ? interval : undefined}
        snapToAlignment="start"
        decelerationRate="fast"
        onMomentumScrollEnd={onSettle}
        contentContainerStyle={{ paddingRight: many ? CAROUSEL_PEEK : 0 }}
      >
        {notes.map((n, i) => (
          <View
            key={`${n.id}:${n.uri}`}
            testID="voice-note-page"
            style={{ width: cardWidth || undefined, marginRight: i < count - 1 ? CAROUSEL_GAP : 0 }}
          >
            <VoiceAttachmentCard
              uri={n.uri}
              durationMs={n.durationMs}
              waveform={n.waveform}
              index={i + 1}
              count={count}
              playDisabled={playDisabled}
              onRemove={onRemove ? () => onRemove(n.id) : undefined}
              onOpen={onOpen ? () => onOpen(n.id) : undefined}
            />
          </View>
        ))}
      </ScrollView>
      {many && (
        <View
          testID="voice-note-dots"
          style={styles.dots}
          importantForAccessibility="no"
          accessibilityElementsHidden
        >
          {notes.map((n, i) => (
            <View
              key={n.id}
              testID="voice-note-dot"
              style={[styles.dot, i === shownPage && styles.dotOn]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingTop: spacing.sm,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotOn: { backgroundColor: colors.accent },
});
