import { Fragment } from 'react';
import { View } from 'react-native';
import { colors } from '../theme';

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

/**
 * Transcript glyph (speech bubble with a tail and two quotation marks) drawn with Views on a 28pt
 * grid; no icon library. `filled` (the transcript is showing) fills the bubble with `color` and
 * draws the marks in the sheet background. Hidden from screen readers; the button names it.
 */
export function TranscriptIcon({ color, size = 28, filled = false }: Props & { filled?: boolean }) {
  const s = size / 28;
  const t = 2 * s;
  const ink = filled ? colors.background : color;
  return (
    <View testID="transcript-icon" {...HIDE} style={{ width: size, height: size }}>
      <View
        testID="transcript-bubble"
        style={{
          position: 'absolute',
          left: 3 * s,
          top: 4 * s,
          width: 22 * s,
          height: 16 * s,
          borderWidth: t,
          borderRadius: 6 * s,
          borderColor: color,
          backgroundColor: filled ? color : 'transparent',
        }}
      />
      <View
        testID="transcript-tail"
        style={{
          position: 'absolute',
          left: 6 * s,
          top: 17.5 * s,
          width: 5 * s,
          height: 5 * s,
          borderBottomWidth: t,
          borderLeftWidth: t,
          borderColor: color,
          backgroundColor: filled ? color : colors.background,
          transform: [{ rotate: '45deg' }],
        }}
      />
      {[10.5, 17.5].map((cx) => (
        <Fragment key={cx}>
          <View
            testID="transcript-mark"
            style={{
              position: 'absolute',
              left: (cx - 2) * s,
              top: 8.5 * s,
              width: 4 * s,
              height: 4 * s,
              borderRadius: 2 * s,
              backgroundColor: ink,
            }}
          />
          <View
            testID="transcript-mark-tail"
            style={{
              position: 'absolute',
              left: (cx - 2.5) * s,
              top: 11.5 * s,
              width: t,
              height: 4 * s,
              borderRadius: s,
              backgroundColor: ink,
              transform: [{ rotate: '-20deg' }],
            }}
          />
        </Fragment>
      ))}
    </View>
  );
}
