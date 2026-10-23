import { View } from 'react-native';

type Props = { color: string; size?: number };

const KEYS = [
  [4, 5],
  [10, 5],
  [16, 5],
  [7, 11],
  [13, 11],
];

/**
 * Hide-keyboard glyph: a keyboard outline with a few key dots and a down chevron under it, drawn
 * with Views on a 28pt grid (no icon-library dependency). Hidden from screen readers; the button
 * that holds it carries the label.
 */
export function KeyboardHideIcon({ color, size = 28 }: Props) {
  const s = size / 28;
  return (
    <View
      testID="keyboard-hide-icon"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}
    >
      <View
        style={{
          position: 'absolute',
          left: 2 * s,
          top: 3 * s,
          width: 24 * s,
          height: 15 * s,
          borderRadius: 3 * s,
          borderWidth: 1.5 * s,
          borderColor: color,
        }}
      >
        {KEYS.map(([x, y], i) => (
          <View
            key={i}
            testID="keyboard-hide-key"
            style={{
              position: 'absolute',
              left: (x + 1) * s,
              top: (y + 1) * s,
              width: 2.5 * s,
              height: 2.5 * s,
              borderRadius: 1.25 * s,
              backgroundColor: color,
            }}
          />
        ))}
      </View>
      <View
        testID="keyboard-hide-chevron"
        style={{
          position: 'absolute',
          left: 10 * s,
          top: 17 * s,
          width: 8 * s,
          height: 8 * s,
          borderRightWidth: 2 * s,
          borderBottomWidth: 2 * s,
          borderColor: color,
          transform: [{ rotate: '45deg' }],
        }}
      />
    </View>
  );
}
