import { StyleProp, Text, TextStyle } from 'react-native';
import { bodySegments, tagRunStyle } from './TaggedBodyInput';

/**
 * Read-only text with its `#tag` words highlighted exactly as in the add-entry body (accent colour,
 * tint, weight). Plain runs are unstyled nested Text, so the string reads as one piece of text.
 */
export function TaggedText({
  text,
  style,
  selectable,
  testID,
}: {
  text: string;
  style?: StyleProp<TextStyle>;
  selectable?: boolean;
  testID?: string;
}) {
  return (
    <Text testID={testID} selectable={selectable} style={style}>
      {bodySegments(text).map((g, i) => (
        <Text key={i} style={g.tag ? tagRunStyle : undefined}>
          {g.s}
        </Text>
      ))}
    </Text>
  );
}
