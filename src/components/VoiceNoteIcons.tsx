import { View } from 'react-native';

type Props = { color: string; size?: number };

const HIDE = { accessible: false, importantForAccessibility: 'no-hide-descendants' } as const;

/** Share glyph (open box with an up arrow) drawn with Views on a 28pt grid; no icon library. Hidden from screen readers; the button names it. */
export function ShareIcon({ color, size = 28 }: Props) {
  const s = size / 28;
  const t = 2 * s;
  return (
    <View testID="share-icon" {...HIDE} style={{ width: size, height: size }}>
      <View
        testID="share-box"
        style={{
          position: 'absolute',
          left: 5 * s,
          top: 11 * s,
          width: 18 * s,
          height: 15 * s,
          borderWidth: t,
          borderTopWidth: 0,
          borderBottomLeftRadius: 3 * s,
          borderBottomRightRadius: 3 * s,
          borderColor: color,
        }}
      />
      <View
        testID="share-arrow-shaft"
        style={{
          position: 'absolute',
          left: 14 * s - t / 2,
          top: 3 * s,
          width: t,
          height: 16 * s,
          borderRadius: t / 2,
          backgroundColor: color,
        }}
      />
      <View
        testID="share-arrow-head"
        style={{
          position: 'absolute',
          left: 14 * s - 4 * s,
          top: 3.5 * s,
          width: 8 * s,
          height: 8 * s,
          borderTopWidth: t,
          borderLeftWidth: t,
          borderColor: color,
          transform: [{ rotate: '45deg' }],
        }}
      />
    </View>
  );
}

/** Trash glyph (bin with a lid, handle and three vertical lines) drawn with Views on a 28pt grid; no icon library. Hidden from screen readers; the button names it. */
export function TrashIcon({ color, size = 28 }: Props) {
  const s = size / 28;
  const t = 2 * s;
  return (
    <View testID="trash-icon" {...HIDE} style={{ width: size, height: size }}>
      <View
        testID="trash-handle"
        style={{
          position: 'absolute',
          left: 10.5 * s,
          top: 2 * s,
          width: 7 * s,
          height: 3 * s,
          borderWidth: t,
          borderBottomWidth: 0,
          borderTopLeftRadius: 2 * s,
          borderTopRightRadius: 2 * s,
          borderColor: color,
        }}
      />
      <View
        testID="trash-lid"
        style={{
          position: 'absolute',
          left: 4 * s,
          top: 5 * s,
          width: 20 * s,
          height: t,
          borderRadius: t / 2,
          backgroundColor: color,
        }}
      />
      <View
        testID="trash-body"
        style={{
          position: 'absolute',
          left: 7 * s,
          top: 8 * s,
          width: 14 * s,
          height: 18 * s,
          borderWidth: t,
          borderTopWidth: 0,
          borderBottomLeftRadius: 3 * s,
          borderBottomRightRadius: 3 * s,
          borderColor: color,
        }}
      />
      {[10.25, 13.25, 16.25].map((x, i) => (
        <View
          key={i}
          testID="trash-line"
          style={{
            position: 'absolute',
            left: x * s,
            top: 12 * s,
            width: 1.5 * s,
            height: 10 * s,
            borderRadius: 0.75 * s,
            backgroundColor: color,
          }}
        />
      ))}
    </View>
  );
}
