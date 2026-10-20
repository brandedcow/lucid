import { View } from 'react-native';
import { TrashIcon } from './VoiceNoteIcons';

type Props = { color: string; size?: number };

const HIDE = { accessible: false, importantForAccessibility: 'no-hide-descendants' } as const;

/** Calendar page (rounded outline, filled header band, two binder rings) drawn with Views on a 28pt grid; no icon library. Hidden from screen readers; the row names it. */
export function TodayIcon({ color, size = 28 }: Props) {
  const s = size / 28;
  const t = 2 * s;
  return (
    <View testID="today-icon" {...HIDE} style={{ width: size, height: size }}>
      <View
        testID="today-page"
        style={{
          position: 'absolute',
          left: 4 * s,
          top: 6 * s,
          width: 20 * s,
          height: 19 * s,
          borderWidth: t,
          borderRadius: 4 * s,
          borderColor: color,
        }}
      />
      <View
        testID="today-header"
        style={{
          position: 'absolute',
          left: 4 * s,
          top: 6 * s,
          width: 20 * s,
          height: 6 * s,
          borderTopLeftRadius: 4 * s,
          borderTopRightRadius: 4 * s,
          backgroundColor: color,
        }}
      />
      {[8.5, 17.5].map((x) => (
        <View
          key={x}
          testID="today-ring"
          style={{
            position: 'absolute',
            left: x * s,
            top: 2.5 * s,
            width: t,
            height: 6 * s,
            borderRadius: s,
            backgroundColor: color,
          }}
        />
      ))}
    </View>
  );
}

/** Document (rounded outline with three text lines) drawn with Views on a 28pt grid; no icon library. Hidden from screen readers; the row names it. */
export function AllNotesIcon({ color, size = 28 }: Props) {
  const s = size / 28;
  const t = 2 * s;
  return (
    <View testID="all-notes-icon" {...HIDE} style={{ width: size, height: size }}>
      <View
        testID="all-notes-page"
        style={{
          position: 'absolute',
          left: 5 * s,
          top: 3 * s,
          width: 18 * s,
          height: 22 * s,
          borderWidth: t,
          borderRadius: 4 * s,
          borderColor: color,
        }}
      />
      {[
        [9, 9, 10],
        [9, 13.5, 10],
        [9, 18, 6],
      ].map(([x, y, w]) => (
        <View
          key={y}
          testID="all-notes-line"
          style={{
            position: 'absolute',
            left: x * s,
            top: y * s,
            width: w * s,
            height: t,
            borderRadius: s,
            backgroundColor: color,
          }}
        />
      ))}
    </View>
  );
}

/** Checkbox (rounded square with a check mark) drawn with Views on a 28pt grid; no icon library. Hidden from screen readers; the row names it. */
export function TodoIcon({ color, size = 28 }: Props) {
  const s = size / 28;
  const t = 2 * s;
  return (
    <View testID="todo-icon" {...HIDE} style={{ width: size, height: size }}>
      <View
        testID="todo-box"
        style={{
          position: 'absolute',
          left: 4 * s,
          top: 4 * s,
          width: 20 * s,
          height: 20 * s,
          borderWidth: t,
          borderRadius: 5 * s,
          borderColor: color,
        }}
      />
      <View
        testID="todo-check"
        style={{
          position: 'absolute',
          left: 11 * s,
          top: 7.5 * s,
          width: 6 * s,
          height: 11 * s,
          borderRightWidth: t,
          borderBottomWidth: t,
          borderColor: color,
          transform: [{ rotate: '45deg' }],
        }}
      />
    </View>
  );
}

/** Crossed-out hash (the # made of four bars, struck through diagonally) drawn with Views on a 28pt grid; no icon library. Hidden from screen readers; the row names it. */
export function UntaggedIcon({ color, size = 28 }: Props) {
  const s = size / 28;
  const t = 2 * s;
  return (
    <View testID="untagged-icon" {...HIDE} style={{ width: size, height: size }}>
      {[10, 17].map((x) => (
        <View
          key={x}
          testID="untagged-vbar"
          style={{
            position: 'absolute',
            left: x * s,
            top: 5 * s,
            width: t,
            height: 18 * s,
            borderRadius: s,
            backgroundColor: color,
          }}
        />
      ))}
      {[10.5, 16.5].map((y) => (
        <View
          key={y}
          testID="untagged-hbar"
          style={{
            position: 'absolute',
            left: 5 * s,
            top: y * s,
            width: 18 * s,
            height: t,
            borderRadius: s,
            backgroundColor: color,
          }}
        />
      ))}
      <View
        testID="untagged-strike"
        style={{
          position: 'absolute',
          left: 13 * s,
          top: 2 * s,
          width: t,
          height: 24 * s,
          borderRadius: s,
          backgroundColor: color,
          transform: [{ rotate: '-45deg' }],
        }}
      />
    </View>
  );
}

/** Push pin (cap, body, flange, needle) drawn with Views on a 28pt grid; no icon library. Hidden from screen readers; the row names it. */
export function PinnedIcon({ color, size = 28 }: Props) {
  const s = size / 28;
  const t = 2 * s;
  return (
    <View testID="pinned-icon" {...HIDE} style={{ width: size, height: size }}>
      <View
        testID="pinned-cap"
        style={{
          position: 'absolute',
          left: 8 * s,
          top: 2 * s,
          width: 12 * s,
          height: 3 * s,
          borderRadius: 1.5 * s,
          backgroundColor: color,
        }}
      />
      <View
        testID="pinned-body"
        style={{
          position: 'absolute',
          left: 10 * s,
          top: 4 * s,
          width: 8 * s,
          height: 10 * s,
          borderRadius: 2 * s,
          backgroundColor: color,
        }}
      />
      <View
        testID="pinned-flange"
        style={{
          position: 'absolute',
          left: 6 * s,
          top: 13 * s,
          width: 16 * s,
          height: 3 * s,
          borderRadius: 1.5 * s,
          backgroundColor: color,
        }}
      />
      <View
        testID="pinned-needle"
        style={{
          position: 'absolute',
          left: 14 * s - t / 2,
          top: 15 * s,
          width: t,
          height: 10 * s,
          borderRadius: s,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

/** Gear (ring with a hollow centre and eight teeth) drawn with Views on a 28pt grid; no icon library. Hidden from screen readers; the button names it. */
export function GearIcon({ color, size = 28 }: Props) {
  const s = size / 28;
  return (
    <View testID="gear-icon" {...HIDE} style={{ width: size, height: size }}>
      {Array.from({ length: 8 }, (_, i) => (
        // A full-size layer rotates about the grid centre; the tooth sits at its top edge.
        <View
          key={i}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: size,
            height: size,
            transform: [{ rotate: `${i * 45}deg` }],
          }}
        >
          <View
            testID="gear-tooth"
            style={{
              position: 'absolute',
              left: 14 * s - 1.75 * s,
              top: 2 * s,
              width: 3.5 * s,
              height: 6 * s,
              borderRadius: s,
              backgroundColor: color,
            }}
          />
        </View>
      ))}
      <View
        testID="gear-ring"
        style={{
          position: 'absolute',
          left: 6.5 * s,
          top: 6.5 * s,
          width: 15 * s,
          height: 15 * s,
          borderWidth: 3 * s,
          borderRadius: 7.5 * s,
          borderColor: color,
        }}
      />
    </View>
  );
}

/** Sort (three horizontal bars, long to short) drawn with Views on a 28pt grid; no icon library. Hidden from screen readers; the button names it. */
export function SortIcon({ color, size = 28 }: Props) {
  const s = size / 28;
  return (
    <View testID="sort-icon" {...HIDE} style={{ width: size, height: size }}>
      {[
        [7, 20],
        [12.75, 14],
        [18.5, 8],
      ].map(([y, w]) => (
        <View
          key={y}
          testID="sort-bar"
          style={{
            position: 'absolute',
            left: 4 * s,
            top: y * s,
            width: w * s,
            height: 2.5 * s,
            borderRadius: 1.25 * s,
            backgroundColor: color,
          }}
        />
      ))}
    </View>
  );
}

/** The drawer view kinds that have an icon. */
export type ViewIconKind = 'today' | 'all' | 'todo' | 'untagged' | 'pinned' | 'trash';

const VIEW_ICONS: Record<ViewIconKind, (props: Props) => React.JSX.Element> = {
  today: TodayIcon,
  all: AllNotesIcon,
  todo: TodoIcon,
  untagged: UntaggedIcon,
  pinned: PinnedIcon,
  trash: TrashIcon,
};

/** Icon for a drawer view kind (`trash` reuses the existing TrashIcon). */
export function ViewIcon({ kind, color, size }: Props & { kind: ViewIconKind }) {
  const Icon = VIEW_ICONS[kind];
  return <Icon color={color} size={size} />;
}
