import { View } from 'react-native';

type Props = { color: string; size?: number };

const ROWS = [6, 12, 18];

/**
 * List glyph: three rows, each a dot and a line, drawn with Views on a 24pt grid (no icon-library
 * dependency, same approach as KeyboardHideIcon). Hidden from screen readers; the button that
 * holds it carries the label.
 */
export function ListIcon({ color, size = 24 }: Props) {
  const s = size / 24;
  return (
    <View
      testID="list-icon"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}
    >
      {ROWS.map((y) => (
        <View key={y} testID="list-icon-row">
          <View
            style={{
              position: 'absolute',
              left: 2 * s,
              top: (y - 1.5) * s,
              width: 3 * s,
              height: 3 * s,
              borderRadius: 1.5 * s,
              backgroundColor: color,
            }}
          />
          <View
            style={{
              position: 'absolute',
              left: 8 * s,
              top: (y - 1) * s,
              width: 14 * s,
              height: 2 * s,
              borderRadius: s,
              backgroundColor: color,
            }}
          />
        </View>
      ))}
    </View>
  );
}
